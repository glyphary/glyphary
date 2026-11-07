//! People notes: the pictures behind person wikilinks.
//!
//! Responsibilities:
//! - List every note under `People/` that names a picture in its frontmatter,
//!   so the editor can draw an avatar beside `[[Name]]`.
//!
//! Contracts:
//! - Only Markdown notes under the vault's `People` folder (any case, any
//!   depth) are read; the folder's absence means an empty list, not an error.
//! - The picture is the first of the `photo`, `image`, or `avatar`
//!   frontmatter keys, read with the same parser bases use, so quoting
//!   rules match; the wikilink or path is kept as written and resolving it
//!   to a file is the frontend's job.

use super::*;
use crate::base_expr::Value;

const PEOPLE_DIRECTORY: &str = "People";
const PHOTO_KEYS: [&str; 3] = ["photo", "image", "avatar"];

pub(crate) fn frontmatter_photo(content: &str) -> Option<String> {
    // Only string values are read; the timezone offset matters for dates alone.
    let properties = base::parse_note_values(content, 0);

    PHOTO_KEYS.iter().find_map(|key| match properties.get(*key) {
        Some(Value::Str(text)) if !text.trim().is_empty() => Some(text.trim().to_string()),
        _ => None,
    })
}

fn people_directory(root: &Path) -> Option<PathBuf> {
    fs::read_dir(root)
        .ok()?
        .filter_map(|entry| entry.ok())
        .map(|entry| entry.path())
        .find(|path| {
            path.is_dir()
                && path
                    .file_name()
                    .map(|name| name.to_string_lossy().eq_ignore_ascii_case(PEOPLE_DIRECTORY))
                    .unwrap_or(false)
        })
}

#[tauri::command]
pub(crate) fn read_people_photos(root: String) -> Result<Vec<PersonPhoto>, String> {
    let root = vault_root(&root)?;
    let Some(people) = people_directory(&root) else {
        return Ok(Vec::new());
    };
    let mut files = Vec::new();

    walk_files(
        &root,
        &people,
        &mut files,
        SearchFileFilter {
            markdown_only: true,
            exclude_dot_paths: true,
        },
    )?;
    files.sort();

    let mut photos = Vec::new();

    for file in files {
        // An unreadable note is skipped rather than failing every avatar.
        let Ok(content) = fs::read_to_string(&file) else {
            continue;
        };

        if let Some(photo) = frontmatter_photo(&content) {
            photos.push(PersonPhoto {
                relative_path: relative_string(&root, &file)?,
                photo,
            });
        }
    }

    Ok(photos)
}
