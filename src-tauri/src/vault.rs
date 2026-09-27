//! Vault file and folder commands.
//!
//! Responsibilities:
//! - List, read, write, create, rename, move, and delete vault files/folders.
//! - Maintain special vault behaviors such as directory shadow notes,
//!   Excalidraw files, and the markdown filename index for wikilinks.
//!
//! Contracts:
//! - Every filesystem operation must go through `paths` helpers before touching
//!   the OS.
//! - Commands return vault-relative paths so the frontend never needs absolute
//!   paths for editor state.
//! - Folder operations must preserve user notes and reject root/self moves.
//! - This module stores raw markdown/text files only; WYSIWYG transformations
//!   remain frontend/editor responsibilities.
use super::*;

const DROPPED_TEXT_EXTENSIONS: &[&str] = &[
    "css", "csv", "html", "js", "json", "log", "md", "markdown", "py", "rs", "sql", "toml", "ts",
    "tsx", "txt", "xml", "yaml", "yml",
];

pub(crate) fn walk_note_files(
    root: &Path,
    dir: &Path,
    files: &mut Vec<PathBuf>,
) -> Result<(), String> {
    for entry in fs::read_dir(dir).map_err(|err| format!("Could not list directory: {err}"))? {
        let entry = entry.map_err(|err| format!("Could not read directory entry: {err}"))?;
        let file_type = entry
            .file_type()
            .map_err(|err| format!("Could not read file type: {err}"))?;
        let path = entry.path();

        // The vault index is for user notes. Application state under
        // `.glyphary/` should never appear in wikilink suggestions.
        if path.file_name().and_then(|name| name.to_str()) == Some(SETTINGS_DIRECTORY_NAME) {
            continue;
        }

        if file_type.is_dir() {
            walk_note_files(root, &path, files)?;
        } else if file_type.is_file()
            && path.starts_with(root)
            && path
                .extension()
                .map(|extension| extension.to_string_lossy().eq_ignore_ascii_case("md"))
                .unwrap_or(false)
        {
            files.push(path);
        }
    }

    Ok(())
}

#[tauri::command]
pub(crate) fn list_vault_dir(root: String, relative: String) -> Result<Vec<VaultEntry>, String> {
    let (root, dir) = resolve_existing(&root, &relative)?;

    if !dir.is_dir() {
        return Err("Vault path is not a directory".into());
    }

    let show_dotfiles = read_vault_settings(root.to_string_lossy().into_owned())?
        .files
        .show_dotfiles;
    let mut entries = fs::read_dir(&dir)
        .map_err(|err| format!("Could not list directory: {err}"))?
        .filter_map(|entry| match entry {
            Ok(entry) => {
                let name = entry.file_name().to_string_lossy().into_owned();

                // .glyphary is vault-local application state, not a user note.
                if name == SETTINGS_DIRECTORY_NAME || (!show_dotfiles && name.starts_with('.')) {
                    None
                } else {
                    Some(Ok(entry))
                }
            }
            other => Some(other),
        })
        .map(|entry| {
            let entry = entry.map_err(|err| format!("Could not read directory entry: {err}"))?;
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().into_owned();
            let is_dir = entry
                .file_type()
                .map(|file_type| file_type.is_dir())
                // ponytail: Windows cloud/reparse providers can be flaky here; metadata is enough for drawer display.
                .or_else(|_| entry.metadata().map(|metadata| metadata.is_dir()))
                .unwrap_or(false);

            Ok(VaultEntry {
                name,
                relative_path: relative_string(&root, &path)?,
                is_dir,
            })
        })
        .collect::<Result<Vec<_>, String>>()?;

    entries.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    Ok(entries)
}
#[tauri::command]
pub(crate) fn list_vault_markdown_files(root: String) -> Result<Vec<VaultIndexedFile>, String> {
    let root = vault_root(&root)?;
    let mut files = Vec::new();

    walk_note_files(&root, &root, &mut files)?;

    let mut indexed = files
        .into_iter()
        .map(|path| {
            let name = path
                .file_name()
                .map(|name| name.to_string_lossy().into_owned())
                .unwrap_or_else(|| path.to_string_lossy().into_owned());

            Ok(VaultIndexedFile {
                name,
                relative_path: relative_string(&root, &path)?,
            })
        })
        .collect::<Result<Vec<_>, String>>()?;

    indexed.sort_by(|left, right| {
        left.name
            .to_lowercase()
            .cmp(&right.name.to_lowercase())
            .then_with(|| left.relative_path.cmp(&right.relative_path))
    });

    Ok(indexed)
}
#[tauri::command]
pub(crate) fn read_vault_file(root: String, relative: String) -> Result<OpenedFile, String> {
    let (root, path) = resolve_existing(&root, &relative)?;

    if !path.is_file() {
        return Err("Vault path is not a file".into());
    }

    let content =
        fs::read_to_string(&path).map_err(|err| format!("Could not read file as text: {err}"))?;
    let name = path
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_else(|| relative.clone());

    Ok(OpenedFile {
        name,
        relative_path: relative_string(&root, &path)?,
        content,
    })
}

#[tauri::command]
pub(crate) fn read_dropped_text_file(source: String) -> Result<String, String> {
    // External paths are canonicalized and restricted to known text extensions
    // before the backend reads them, keeping native drops within their contract.
    let source = fs::canonicalize(source.trim())
        .map_err(|err| format!("Could not read dropped text file: {err}"))?;

    if !source.is_file() || !has_extension(&source, DROPPED_TEXT_EXTENSIONS) {
        return Err("Dropped file must be a supported text file".into());
    }

    let metadata = fs::metadata(&source)
        .map_err(|err| format!("Could not inspect dropped text file: {err}"))?;

    // Bound synchronous native reads so a large file cannot block the editor
    // while its contents are transferred into the webview.
    if metadata.len() > 10 * 1024 * 1024 {
        return Err("Dropped text file is larger than 10 MB".into());
    }

    fs::read_to_string(&source).map_err(|err| format!("Could not read dropped text file: {err}"))
}
#[tauri::command]
pub(crate) fn write_vault_file(
    root: String,
    relative: String,
    content: String,
) -> Result<(), String> {
    let (_, path) = resolve_for_write(&root, &relative)?;

    if path.exists() && !path.is_file() {
        return Err("Vault path is not a file".into());
    }

    fs::write(path, content).map_err(|err| format!("Could not write file: {err}"))
}
#[tauri::command]
pub(crate) fn create_vault_markdown_file(
    root: String,
    relative: String,
) -> Result<OpenedFile, String> {
    let root_path = vault_root(&root)?;
    let clean_relative = clean_relative(&relative)?;

    if clean_relative.as_os_str().is_empty() {
        return Err("Tidbit path cannot be empty".into());
    }

    let file_name = clean_relative
        .file_name()
        .ok_or_else(|| "Tidbit path must include a file name".to_string())?
        .to_string_lossy()
        .into_owned();

    if !file_name.to_lowercase().ends_with(".md") {
        return Err("Tidbit path must end with .md".into());
    }

    let parent = clean_relative
        .parent()
        .ok_or_else(|| "Tidbit path has no parent".to_string())?;
    let parent = ensure_vault_parent_dirs(&root_path, parent)?;
    let path = parent.join(&file_name);

    if path.exists() {
        return Err("A file already exists at the tidbit path".into());
    }

    fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&path)
        .map_err(|err| format!("Could not create tidbit: {err}"))?;

    read_vault_file(
        root_path.to_string_lossy().into_owned(),
        relative_string(&root_path, &path)?,
    )
}
#[tauri::command]
pub(crate) fn create_excalidraw_file(
    root: String,
    relative: String,
    content: String,
) -> Result<OpenedFile, String> {
    let root_path = vault_root(&root)?;
    let clean_relative = clean_relative(&relative)?;

    if clean_relative.as_os_str().is_empty() {
        return Err("Drawing path cannot be empty".into());
    }

    let file_name = clean_relative
        .file_name()
        .ok_or_else(|| "Drawing path must include a file name".to_string())?
        .to_string_lossy()
        .into_owned();

    if !file_name.to_lowercase().ends_with(".excalidraw") {
        return Err("Drawing path must end with .excalidraw".into());
    }

    let parent = clean_relative
        .parent()
        .ok_or_else(|| "Drawing path has no parent".to_string())?;
    let parent = ensure_vault_parent_dirs(&root_path, parent)?;
    let path = parent.join(&file_name);

    if path.exists() {
        return Err("A drawing already exists at that path".into());
    }

    fs::write(&path, content).map_err(|err| format!("Could not create drawing: {err}"))?;

    read_vault_file(
        root_path.to_string_lossy().into_owned(),
        relative_string(&root_path, &path)?,
    )
}
#[tauri::command]
pub(crate) fn rename_vault_file(
    root: String,
    relative: String,
    next_name: String,
) -> Result<OpenedFile, String> {
    let (root_path, path) = resolve_existing(&root, &relative)?;

    if !path.is_file() {
        return Err("Vault path is not a file".into());
    }

    let next_name = match path
        .extension()
        .map(|extension| extension.to_string_lossy().to_lowercase())
        .as_deref()
    {
        Some("md" | "markdown") => sanitize_markdown_file_name(&next_name)?,
        Some("canvas") => sanitize_canvas_file_name(&next_name)?,
        other => {
            let clean = sanitize_directory_name(&next_name)?;

            match (Path::new(&clean).extension(), other) {
                (None, Some(extension)) => format!("{clean}.{extension}"),
                _ => clean,
            }
        }
    };
    let parent = path
        .parent()
        .ok_or_else(|| "File path has no parent".to_string())?;
    let next_path = parent.join(next_name);

    if path == next_path {
        return read_vault_file(root, relative);
    }

    if next_path.exists() {
        return Err("A file with that page name already exists".into());
    }

    let parent = fs::canonicalize(parent)
        .map_err(|err| format!("Could not resolve target parent: {err}"))?;

    if !parent.starts_with(&root_path) {
        return Err("Path escapes the vault".into());
    }

    fs::rename(&path, &next_path).map_err(|err| format!("Could not rename file: {err}"))?;

    read_vault_file(
        root_path.to_string_lossy().into_owned(),
        relative_string(&root_path, &next_path)?,
    )
}
#[tauri::command]
pub(crate) fn move_vault_file(
    root: String,
    relative: String,
    destination_directory: String,
) -> Result<OpenedFile, String> {
    let (root_path, path) = resolve_existing(&root, &relative)?;

    if !path.is_file() {
        return Err("Vault path is not a file".into());
    }

    let (_, destination_dir) = resolve_existing(&root, &destination_directory)?;

    if !destination_dir.is_dir() {
        return Err("Destination path is not a directory".into());
    }

    let file_name = path
        .file_name()
        .ok_or_else(|| "File path has no name".to_string())?;
    let next_path = destination_dir.join(file_name);

    if path == next_path {
        return read_vault_file(root, relative);
    }

    if next_path.exists() {
        return Err("A file with that name already exists in the destination".into());
    }

    fs::rename(&path, &next_path).map_err(|err| format!("Could not move file: {err}"))?;

    read_vault_file(
        root_path.to_string_lossy().into_owned(),
        relative_string(&root_path, &next_path)?,
    )
}
#[tauri::command]
pub(crate) fn delete_vault_file(root: String, relative: String) -> Result<(), String> {
    let (_, path) = resolve_existing(&root, &relative)?;

    if !path.is_file() {
        return Err("Vault path is not a file".into());
    }

    fs::remove_file(path).map_err(|err| format!("Could not delete file: {err}"))
}
#[tauri::command]
pub(crate) fn create_note_in_directory(
    root: String,
    relative: String,
    note_name: String,
) -> Result<OpenedFile, String> {
    let (root_path, dir) = resolve_existing(&root, &relative)?;

    if !dir.is_dir() {
        return Err("Vault path is not a directory".into());
    }

    let note_name = sanitize_markdown_file_name(&note_name)?;
    let path = dir.join(note_name);

    if path.exists() {
        return Err("A note with that name already exists in this folder".into());
    }

    fs::write(&path, "").map_err(|err| format!("Could not create note: {err}"))?;

    read_vault_file(
        root_path.to_string_lossy().into_owned(),
        relative_string(&root_path, &path)?,
    )
}
/// `status` is the bare character between the brackets. Everything else in
/// the file, line endings included, stays byte-identical so the edit never
/// shows up as a spurious diff.
#[tauri::command]
pub(crate) fn set_task_status(
    root: String,
    relative: String,
    line_number: usize,
    status: String,
) -> Result<String, String> {
    if !matches!(status.as_str(), " " | "/" | "x") {
        return Err("Task status must be to do, in progress, or done".into());
    }

    let (_, path) = resolve_existing(&root, &relative)?;
    let content = fs::read_to_string(&path).map_err(|err| format!("Could not read note: {err}"))?;
    let mut lines: Vec<&str> = content.split_inclusive('\n').collect();
    let Some(line) = line_number.checked_sub(1).and_then(|index| lines.get(index).copied()) else {
        return Err(format!("Line {line_number} is not in the note"));
    };
    let Some(marker_index) = task_marker_index(line) else {
        return Err(format!("Line {line_number} is not a task"));
    };

    let mut updated = line.to_string();
    updated.replace_range(marker_index..marker_index + 1, &status);
    lines[line_number - 1] = &updated;
    let next_content: String = lines.concat();

    fs::write(&path, next_content).map_err(|err| format!("Could not write note: {err}"))?;

    Ok(updated.trim_end_matches(['\n', '\r']).to_string())
}

/// A task travels with its indented continuation, dedented and stamped with
/// its source, so the trail reads the same in Obsidian. The archive is
/// written before any source is rewritten so a failure cannot lose a task.
#[tauri::command]
pub(crate) fn archive_tasks(
    root: String,
    tasks: Vec<TaskRef>,
    archive_relative: String,
    archived_on: String,
) -> Result<usize, String> {
    let root_path = vault_root(&root)?;
    let archive_clean = clean_relative(&archive_relative)?;

    if archive_clean.as_os_str().is_empty() {
        return Err("Task archive note is not set".into());
    }

    let mut by_file: BTreeMap<String, Vec<usize>> = BTreeMap::new();

    for task in tasks {
        by_file.entry(task.relative_path).or_default().push(task.line_number);
    }

    let mut archived = String::new();
    let mut rewritten: Vec<(PathBuf, String)> = Vec::new();
    let mut count = 0;

    for (relative, mut line_numbers) in by_file {
        if clean_relative(&relative)? == archive_clean {
            return Err("Tasks in the archive note itself cannot be archived".into());
        }

        let (_, path) = resolve_existing(&root, &relative)?;
        let content =
            fs::read_to_string(&path).map_err(|err| format!("Could not read note: {err}"))?;
        let mut lines: Vec<String> = content.split_inclusive('\n').map(str::to_string).collect();
        let source = relative.strip_suffix(".md").unwrap_or(&relative).to_string();
        let mut blocks = Vec::new();

        // Highest line first so removing one block never shifts the next.
        line_numbers.sort_unstable();
        line_numbers.dedup();

        for line_number in line_numbers.into_iter().rev() {
            let index = line_number
                .checked_sub(1)
                .filter(|index| *index < lines.len())
                .ok_or_else(|| format!("Line {line_number} is not in {relative}"))?;

            if task_marker_index(&lines[index]).is_none() {
                return Err(format!("Line {line_number} in {relative} is not a task"));
            }

            let end = task_block_end(&lines, index);
            let block: Vec<String> = lines.drain(index..end).collect();

            blocks.push(archived_block(&block, &source, &archived_on));
            count += 1;
        }

        blocks.reverse();
        archived.push_str(&blocks.concat());
        rewritten.push((path, lines.concat()));
    }

    let archive_parent = archive_clean.parent().unwrap_or_else(|| Path::new(""));
    ensure_vault_parent_dirs(&root_path, archive_parent)?;
    let (_, archive_path) = resolve_for_write(&root, &archive_relative)?;
    let mut archive_content = if archive_path.exists() {
        fs::read_to_string(&archive_path)
            .map_err(|err| format!("Could not read archive note: {err}"))?
    } else {
        String::new()
    };

    if !archive_content.is_empty() && !archive_content.ends_with('\n') {
        archive_content.push('\n');
    }

    archive_content.push_str(&archived);
    fs::write(&archive_path, archive_content)
        .map_err(|err| format!("Could not write archive note: {err}"))?;

    for (path, content) in rewritten {
        fs::write(&path, content).map_err(|err| format!("Could not write note: {err}"))?;
    }

    Ok(count)
}

fn line_indent(line: &str) -> usize {
    line.len() - line.trim_start().len()
}

/// Blank lines inside the block travel with it, but trailing blanks stay
/// with the note so its paragraph spacing survives the removal.
fn task_block_end(lines: &[String], index: usize) -> usize {
    let indent = line_indent(&lines[index]);
    let mut end = index + 1;
    let mut last_content = end;

    while end < lines.len() {
        let line = &lines[end];

        if line.trim().is_empty() {
            end += 1;
            continue;
        }

        if line_indent(line) <= indent {
            break;
        }

        end += 1;
        last_content = end;
    }

    last_content
}

fn archived_block(block: &[String], source: &str, archived_on: &str) -> String {
    let indent = line_indent(&block[0]);
    let mut out = String::new();

    for (position, line) in block.iter().enumerate() {
        // Blank lines inside the block can be shorter than the indent, so a
        // blind slice would cut into text or panic.
        let dedented = line
            .char_indices()
            .find(|(offset, character)| *offset >= indent || !character.is_whitespace())
            .map_or("", |(offset, _)| &line[offset..]);

        if position == 0 {
            let text = dedented.trim_end_matches(['\n', '\r']);
            out.push_str(&format!("{text} (from [[{source}]], archived {archived_on})\n"));
        } else {
            out.push_str(dedented);
        }
    }

    if !out.ends_with('\n') {
        out.push('\n');
    }

    out
}

fn task_marker_index(line: &str) -> Option<usize> {
    let indent = line.len() - line.trim_start().len();
    let rest = &line[indent..];
    let bullet_len = if rest.starts_with(['-', '*', '+']) {
        1
    } else {
        let digits = rest.chars().take_while(char::is_ascii_digit).count();
        (digits > 0 && rest[digits..].starts_with(['.', ')'])).then_some(digits + 1)?
    };
    let after_bullet = &rest[bullet_len..];
    let spaces = after_bullet.len() - after_bullet.trim_start_matches(' ').len();
    let checkbox = &after_bullet[spaces..];

    if spaces == 0 || !checkbox.starts_with('[') || checkbox.as_bytes().get(2) != Some(&b']') {
        return None;
    }

    // `X` and `-` are Obsidian's done/cancelled spellings; the app never writes
    // them but must still treat such lines as tasks.
    matches!(checkbox.as_bytes()[1], b' ' | b'x' | b'X' | b'/' | b'-')
        .then_some(indent + bullet_len + spaces + 1)
}
#[tauri::command]
pub(crate) fn create_canvas_in_directory(
    root: String,
    relative: String,
    canvas_name: String,
) -> Result<OpenedFile, String> {
    let (root_path, dir) = resolve_existing(&root, &relative)?;

    if !dir.is_dir() {
        return Err("Vault path is not a directory".into());
    }

    let canvas_name = sanitize_canvas_file_name(&canvas_name)?;
    let path = dir.join(canvas_name);

    if path.exists() {
        return Err("A canvas with that name already exists in this folder".into());
    }

    fs::write(&path, "{\n  \"nodes\": [],\n  \"edges\": []\n}\n")
        .map_err(|err| format!("Could not create canvas: {err}"))?;

    read_vault_file(
        root_path.to_string_lossy().into_owned(),
        relative_string(&root_path, &path)?,
    )
}
#[tauri::command]
pub(crate) fn create_directory_in_directory(
    root: String,
    relative: String,
    directory_name: String,
) -> Result<RenamedDirectory, String> {
    let (root_path, dir) = resolve_existing(&root, &relative)?;

    if !dir.is_dir() {
        return Err("Vault path is not a directory".into());
    }

    let directory_name = sanitize_directory_name(&directory_name)?;
    let path = dir.join(&directory_name);

    if path.exists() {
        return Err("A folder with that name already exists in this folder".into());
    }

    fs::create_dir(&path).map_err(|err| format!("Could not create folder: {err}"))?;

    Ok(RenamedDirectory {
        name: directory_name,
        relative_path: relative_string(&root_path, &path)?,
    })
}
#[tauri::command]
pub(crate) fn rename_vault_directory(
    root: String,
    relative: String,
    next_name: String,
) -> Result<RenamedDirectory, String> {
    if relative.trim().is_empty() {
        return Err("Cannot rename the vault root".into());
    }

    let (root_path, dir) = resolve_existing(&root, &relative)?;

    if !dir.is_dir() {
        return Err("Vault path is not a directory".into());
    }

    let next_name = sanitize_directory_name(&next_name)?;
    let parent = dir
        .parent()
        .ok_or_else(|| "Directory path has no parent".to_string())?;
    let next_dir = parent.join(&next_name);

    if dir == next_dir {
        return Ok(RenamedDirectory {
            name: next_name,
            relative_path: relative_string(&root_path, &dir)?,
        });
    }

    if next_dir.exists() {
        return Err("A folder with that name already exists".into());
    }

    let old_shadow = shadow_note_path_for_directory(&dir)?;
    let old_shadow_exists = old_shadow.exists();

    if old_shadow_exists && !old_shadow.is_file() {
        return Err("Directory shadow note path is not a file".into());
    }

    // A folder rename may also rename its companion `<folder>.md` shadow note.
    // Check for collisions before moving the directory so the operation stays
    // all-or-nothing from the user's point of view.
    let new_shadow = shadow_note_path_for_directory(&next_dir)?;
    let new_shadow_name = new_shadow
        .file_name()
        .ok_or_else(|| "Shadow note has no name".to_string())?;
    let old_shadow_name = old_shadow
        .file_name()
        .ok_or_else(|| "Shadow note has no name".to_string())?;
    let renamed_shadow_would_move = old_shadow_exists && old_shadow_name != new_shadow_name;

    if renamed_shadow_would_move && dir.join(new_shadow_name).exists() {
        return Err("A shadow note with the new folder name already exists".into());
    }

    fs::rename(&dir, &next_dir).map_err(|err| format!("Could not rename folder: {err}"))?;

    if renamed_shadow_would_move {
        let old_shadow_after_directory_rename = next_dir.join(
            old_shadow
                .file_name()
                .ok_or_else(|| "Shadow note has no name".to_string())?,
        );

        fs::rename(&old_shadow_after_directory_rename, &new_shadow)
            .map_err(|err| format!("Could not rename folder shadow note: {err}"))?;
    }

    Ok(RenamedDirectory {
        name: next_name,
        relative_path: relative_string(&root_path, &next_dir)?,
    })
}
#[tauri::command]
pub(crate) fn move_vault_directory(
    root: String,
    relative: String,
    destination_directory: String,
) -> Result<RenamedDirectory, String> {
    if relative.trim().is_empty() {
        return Err("Cannot move the vault root".into());
    }

    let (root_path, dir) = resolve_existing(&root, &relative)?;

    if !dir.is_dir() {
        return Err("Vault path is not a directory".into());
    }

    let (_, destination_dir) = resolve_existing(&root, &destination_directory)?;

    if !destination_dir.is_dir() {
        return Err("Destination path is not a directory".into());
    }

    if destination_dir == dir || destination_dir.starts_with(&dir) {
        return Err("Cannot move a folder into itself".into());
    }

    let directory_name = dir
        .file_name()
        .ok_or_else(|| "Directory path has no name".to_string())?;
    let next_dir = destination_dir.join(directory_name);

    if dir == next_dir {
        return Ok(RenamedDirectory {
            name: directory_name.to_string_lossy().into_owned(),
            relative_path: relative_string(&root_path, &dir)?,
        });
    }

    if next_dir.exists() {
        return Err("A folder with that name already exists in the destination".into());
    }

    fs::rename(&dir, &next_dir).map_err(|err| format!("Could not move folder: {err}"))?;

    Ok(RenamedDirectory {
        name: directory_name.to_string_lossy().into_owned(),
        relative_path: relative_string(&root_path, &next_dir)?,
    })
}
#[tauri::command]
pub(crate) fn open_directory_shadow_file(
    root: String,
    relative: String,
) -> Result<OpenedFile, String> {
    let (root_path, dir) = resolve_existing(&root, &relative)?;

    if !dir.is_dir() {
        return Err("Vault path is not a directory".into());
    }

    let shadow = shadow_note_path_for_directory(&dir)?;

    // A directory can be opened as an editable note by materializing a shadow
    // markdown file inside it. Subsequent opens edit the same file.
    if !shadow.exists() {
        let dir_name = dir
            .file_name()
            .ok_or_else(|| "Directory has no name".to_string())?
            .to_string_lossy()
            .into_owned();

        fs::write(&shadow, format!("# {dir_name}\n"))
            .map_err(|err| format!("Could not create directory note: {err}"))?;
    }

    read_vault_file(
        root_path.to_string_lossy().into_owned(),
        relative_string(&root_path, &shadow)?,
    )
}
