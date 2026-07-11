//! Native application menu bridge.
//!
//! Responsibilities:
//! - Build the platform menu from the current frontend-owned app state.
//! - Translate native menu selections into webview events.
//! - Keep native chrome actions separate from vault/file persistence.
//!
//! Contracts:
//! - React owns document state. Menu events must emit intent and avoid
//!   duplicating editor or vault behavior in Rust.
//! - Menu labels may use document metadata, but filesystem paths stay on the
//!   frontend side unless an existing Tauri command explicitly asks for them.
use serde::Deserialize;
use std::path::Path;
use tauri::{
    menu::{
        AboutMetadata, CheckMenuItem, IsMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu,
        HELP_SUBMENU_ID, WINDOW_SUBMENU_ID,
    },
    AppHandle, Emitter, Runtime,
};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct NativeMenuState {
    appearance: String,
    can_save: bool,
    has_active_file: bool,
    active_file_name: Option<String>,
    active_file_starred: bool,
    markdown_editor_active: bool,
    recent_files: Vec<NativeMenuFile>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct NativeMenuFile {
    name: String,
    relative_path: String,
}

impl Default for NativeMenuState {
    fn default() -> Self {
        Self {
            appearance: "auto".into(),
            can_save: false,
            has_active_file: false,
            active_file_name: None,
            active_file_starred: false,
            markdown_editor_active: true,
            recent_files: Vec::new(),
        }
    }
}

fn normalized_appearance(value: &str) -> &str {
    match value {
        "light" => "light",
        "dark" => "dark",
        _ => "auto",
    }
}

fn clipped_menu_label(value: &str) -> String {
    const MAX_CHARS: usize = 52;
    let mut chars = value.chars();
    let clipped: String = chars.by_ref().take(MAX_CHARS).collect();

    if chars.next().is_some() {
        format!("{clipped}...")
    } else {
        clipped
    }
}

fn menu_file_label(file: &NativeMenuFile) -> String {
    let parent = Path::new(&file.relative_path)
        .parent()
        .and_then(|path| path.to_str())
        .filter(|path| !path.is_empty());

    match parent {
        Some(parent) => clipped_menu_label(&format!("{} ({parent})", file.name)),
        None => clipped_menu_label(&file.name),
    }
}

fn active_file_action_label(verb: &str, suffix: &str, active_file_name: Option<&str>) -> String {
    match active_file_name.filter(|name| !name.is_empty()) {
        Some(name) => format!("{verb} \"{}\" {suffix}", clipped_menu_label(name)),
        None => format!("{verb} {suffix}"),
    }
}

fn open_recent_menu_id(index: usize) -> String {
    format!("open_recent_{index}")
}

fn open_recent_index(menu_id: &str) -> Option<usize> {
    menu_id.strip_prefix("open_recent_")?.parse().ok()
}

fn menu_item<R: Runtime>(
    app: &AppHandle<R>,
    id: &str,
    text: impl AsRef<str>,
    enabled: bool,
    accelerator: Option<&str>,
) -> tauri::Result<MenuItem<R>> {
    MenuItem::with_id(app, id, text.as_ref(), enabled, accelerator)
}

fn editor_item<R: Runtime>(
    app: &AppHandle<R>,
    id: &str,
    text: &str,
    enabled: bool,
) -> tauri::Result<MenuItem<R>> {
    menu_item(app, id, text, enabled, None)
}

fn build_about_metadata<R: Runtime>(app: &AppHandle<R>) -> AboutMetadata<'_> {
    let package_info = app.package_info();
    let config = app.config();

    // macOS only renders a subset of Tauri's AboutMetadata fields. Keep
    // cross-platform fields populated and put the product description in
    // credits so the native macOS About panel is not bare.
    AboutMetadata {
        name: Some("Glyphary".into()),
        version: Some(package_info.version.to_string()),
        short_version: Some(package_info.version.to_string()),
        copyright: config
            .bundle
            .copyright
            .clone()
            .or_else(|| Some("Copyright © 2026 Glyphary contributors".into())),
        authors: Some(vec!["Glyphary contributors".into()]),
        comments: Some(
            "A local-first Markdown workspace with vaults, tabs, drawers, themes, and Tiptap editing."
                .into(),
        ),
        website: Some("https://github.com/".into()),
        website_label: Some("Glyphary Project".into()),
        credits: Some(
            "Glyphary\n\nA local-first Markdown workspace for vaults, rich notes, calendar pages, and themed writing.\n\nBuilt with Tauri, React, Tiptap, ProseMirror, highlight.js, and lowlight."
                .into(),
        ),
        ..Default::default()
    }
}

fn build_app_menu<R: Runtime>(
    app: &AppHandle<R>,
    settings: &MenuItem<R>,
) -> tauri::Result<Submenu<R>> {
    Submenu::with_items(
        app,
        app.package_info().name.clone(),
        true,
        &[
            &PredefinedMenuItem::about(app, None, Some(build_about_metadata(app)))?,
            &PredefinedMenuItem::separator(app)?,
            settings,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::services(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::hide(app, None)?,
            &PredefinedMenuItem::hide_others(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::quit(app, None)?,
        ],
    )
}

fn build_open_recent_menu<R: Runtime>(
    app: &AppHandle<R>,
    recent_files: &[NativeMenuFile],
) -> tauri::Result<Submenu<R>> {
    let recent_file_items = recent_files
        .iter()
        .take(10)
        .enumerate()
        .map(|(index, file)| {
            menu_item(
                app,
                &open_recent_menu_id(index),
                menu_file_label(file),
                true,
                None,
            )
        })
        .collect::<tauri::Result<Vec<_>>>()?;
    let no_recent_files = menu_item(app, "open_recent_empty", "No Recent Files", false, None)?;
    let clear_recent_files = menu_item(
        app,
        "clear_recent_files",
        "Clear Menu",
        !recent_file_items.is_empty(),
        None,
    )?;
    let recent_files_separator = PredefinedMenuItem::separator(app)?;
    let mut open_recent_items: Vec<&dyn IsMenuItem<R>> = Vec::new();

    // Tauri builds submenus from borrowed trait objects, so the concrete menu
    // items must stay alive until `with_items` has consumed the reference list.
    if recent_file_items.is_empty() {
        open_recent_items.push(&no_recent_files);
    } else {
        for item in &recent_file_items {
            open_recent_items.push(item);
        }
        open_recent_items.push(&recent_files_separator);
        open_recent_items.push(&clear_recent_files);
    }

    Submenu::with_items(app, "Open Recent", true, &open_recent_items)
}

fn build_file_menu<R: Runtime>(
    app: &AppHandle<R>,
    state: &NativeMenuState,
) -> tauri::Result<Submenu<R>> {
    let new_tab = menu_item(app, "new_tab", "New Tab", true, Some("CmdOrCtrl+T"))?;
    let new_document = menu_item(app, "new_document", "New", true, Some("CmdOrCtrl+N"))?;
    let open_vault = menu_item(
        app,
        "open_vault",
        "Open Vault...",
        true,
        Some("CmdOrCtrl+O"),
    )?;
    let save = menu_item(app, "save", "Save", state.can_save, Some("CmdOrCtrl+S"))?;
    let open_recent = build_open_recent_menu(app, &state.recent_files)?;
    let active_file_name = state.active_file_name.as_deref();
    let reveal_active_file = menu_item(
        app,
        "reveal_active_file",
        active_file_action_label("Reveal", "in Finder", active_file_name),
        state.has_active_file,
        None,
    )?;
    let open_active_file_default = menu_item(
        app,
        "open_active_file_default",
        active_file_action_label("Open", "in Default App", active_file_name),
        state.has_active_file,
        None,
    )?;
    let copy_active_file_path = menu_item(
        app,
        "copy_active_file_path",
        "Copy File Path",
        state.has_active_file,
        None,
    )?;

    Submenu::with_items(
        app,
        "File",
        true,
        &[
            &new_tab,
            &new_document,
            &open_vault,
            &save,
            &PredefinedMenuItem::separator(app)?,
            &open_recent,
            &PredefinedMenuItem::separator(app)?,
            &reveal_active_file,
            &open_active_file_default,
            &copy_active_file_path,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::close_window(app, None)?,
        ],
    )
}

fn build_edit_menu<R: Runtime>(
    app: &AppHandle<R>,
    markdown_enabled: bool,
) -> tauri::Result<Submenu<R>> {
    let command_palette = menu_item(
        app,
        "command_palette",
        "Command Palette...",
        true,
        Some("CmdOrCtrl+P"),
    )?;
    let find_in_page = menu_item(app, "find_in_page", "Find...", true, Some("CmdOrCtrl+F"))?;
    let paste_plain = menu_item(
        app,
        "paste_plain",
        "Paste and Match Style",
        markdown_enabled,
        Some("CmdOrCtrl+Shift+V"),
    )?;

    Submenu::with_items(
        app,
        "Edit",
        true,
        &[
            &PredefinedMenuItem::undo(app, None)?,
            &PredefinedMenuItem::redo(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, None)?,
            &PredefinedMenuItem::copy(app, None)?,
            &PredefinedMenuItem::paste(app, None)?,
            &paste_plain,
            &PredefinedMenuItem::select_all(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &find_in_page,
            &command_palette,
        ],
    )
}

fn build_insert_menu<R: Runtime>(
    app: &AppHandle<R>,
    markdown_enabled: bool,
) -> tauri::Result<Submenu<R>> {
    let insert_rich_link = editor_item(app, "insert_rich_link", "Rich Link", markdown_enabled)?;
    let insert_excalidraw = editor_item(
        app,
        "insert_excalidraw",
        "Excalidraw Drawing",
        markdown_enabled,
    )?;
    let insert_columns = editor_item(app, "insert_columns", "Columns", markdown_enabled)?;
    let insert_gallery = editor_item(app, "insert_gallery", "Gallery Layout", markdown_enabled)?;
    let insert_callout = editor_item(app, "insert_callout", "Callout", markdown_enabled)?;
    let insert_collapse = editor_item(app, "insert_collapse", "Collapse", markdown_enabled)?;
    let insert_html_block = editor_item(app, "insert_html_block", "HTML Block", markdown_enabled)?;
    let insert_mermaid = editor_item(app, "insert_mermaid", "Mermaid Diagram", markdown_enabled)?;
    let insert_table_of_contents = editor_item(
        app,
        "insert_table_of_contents",
        "Table of Contents",
        markdown_enabled,
    )?;

    Submenu::with_items(
        app,
        "Insert",
        true,
        &[
            &insert_rich_link,
            &insert_excalidraw,
            &PredefinedMenuItem::separator(app)?,
            &insert_columns,
            &insert_gallery,
            &insert_callout,
            &insert_collapse,
            &insert_html_block,
            &insert_mermaid,
            &insert_table_of_contents,
        ],
    )
}

fn build_format_menu<R: Runtime>(
    app: &AppHandle<R>,
    state: &NativeMenuState,
) -> tauri::Result<Submenu<R>> {
    let markdown_enabled = state.markdown_editor_active;
    let format_strikethrough = editor_item(
        app,
        "format_strikethrough",
        "Strikethrough",
        markdown_enabled,
    )?;
    let format_highlight = editor_item(app, "format_highlight", "Highlight", markdown_enabled)?;
    let format_superscript =
        editor_item(app, "format_superscript", "Superscript", markdown_enabled)?;
    let format_subscript = editor_item(app, "format_subscript", "Subscript", markdown_enabled)?;
    let format_keyboard = editor_item(app, "format_keyboard", "Keyboard", markdown_enabled)?;
    let star_file = menu_item(
        app,
        "star_file",
        if state.active_file_starred {
            "Unstar File"
        } else {
            "Star File"
        },
        state.has_active_file,
        None,
    )?;

    Submenu::with_items(
        app,
        "Format",
        true,
        &[
            &format_strikethrough,
            &format_highlight,
            &format_superscript,
            &format_subscript,
            &format_keyboard,
            &PredefinedMenuItem::separator(app)?,
            &star_file,
        ],
    )
}

fn build_view_menu<R: Runtime>(app: &AppHandle<R>, appearance: &str) -> tauri::Result<Submenu<R>> {
    let appearance_auto = CheckMenuItem::with_id(
        app,
        "appearance_auto",
        "Style: Auto",
        true,
        appearance == "auto",
        None::<&str>,
    )?;
    let appearance_light = CheckMenuItem::with_id(
        app,
        "appearance_light",
        "Style: Light",
        true,
        appearance == "light",
        None::<&str>,
    )?;
    let appearance_dark = CheckMenuItem::with_id(
        app,
        "appearance_dark",
        "Style: Dark",
        true,
        appearance == "dark",
        None::<&str>,
    )?;

    Submenu::with_items(
        app,
        "View",
        true,
        &[
            &appearance_auto,
            &appearance_light,
            &appearance_dark,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::fullscreen(app, None)?,
        ],
    )
}

fn build_window_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Submenu<R>> {
    let close_tab = menu_item(app, "close_tab", "Close Tab", true, None)?;
    let previous_tab = menu_item(app, "previous_tab", "Show Previous Tab", true, None)?;
    let next_tab = menu_item(app, "next_tab", "Show Next Tab", true, None)?;

    Submenu::with_id_and_items(
        app,
        WINDOW_SUBMENU_ID,
        "Window",
        true,
        &[
            &close_tab,
            &previous_tab,
            &next_tab,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::minimize(app, None)?,
            &PredefinedMenuItem::maximize(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::bring_all_to_front(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::close_window(app, None)?,
        ],
    )
}

pub(crate) fn build_native_menu<R: Runtime>(
    app: &AppHandle<R>,
    state: &NativeMenuState,
) -> tauri::Result<Menu<R>> {
    let appearance = normalized_appearance(&state.appearance);
    let markdown_enabled = state.markdown_editor_active;
    let settings = menu_item(app, "settings", "Settings...", true, Some("CmdOrCtrl+,"))?;
    let app_menu = build_app_menu(app, &settings)?;
    let file_menu = build_file_menu(app, state)?;
    let edit_menu = build_edit_menu(app, markdown_enabled)?;
    let insert_menu = build_insert_menu(app, markdown_enabled)?;
    let format_menu = build_format_menu(app, state)?;
    let view_menu = build_view_menu(app, appearance)?;
    let window_menu = build_window_menu(app)?;
    let help_menu = Submenu::with_id_and_items(app, HELP_SUBMENU_ID, "Help", true, &[])?;

    Menu::with_items(
        app,
        &[
            &app_menu,
            &file_menu,
            &edit_menu,
            &insert_menu,
            &format_menu,
            &view_menu,
            &window_menu,
            &help_menu,
        ],
    )
}

#[tauri::command]
pub(crate) fn update_native_menu_state(
    app: AppHandle,
    state: NativeMenuState,
) -> Result<(), String> {
    let menu = build_native_menu(&app, &state).map_err(|error| error.to_string())?;
    app.set_menu(menu).map_err(|error| error.to_string())?;
    Ok(())
}

fn native_command_id(menu_id: &str) -> Option<&'static str> {
    match menu_id {
        "command_palette" => Some("command-palette"),
        "find_in_page" => Some("find-in-page"),
        "paste_plain" => Some("paste-plain"),
        "insert_rich_link" => Some("insert-rich-link"),
        "insert_excalidraw" => Some("insert-excalidraw"),
        "insert_columns" => Some("insert-columns"),
        "insert_gallery" => Some("gallery-layout"),
        "insert_callout" => Some("insert-callout"),
        "insert_collapse" => Some("insert-collapse"),
        "insert_html_block" => Some("insert-html-block"),
        "insert_mermaid" => Some("insert-mermaid-diagram"),
        "insert_table_of_contents" => Some("insert-table-of-contents"),
        "format_strikethrough" => Some("format-strikethrough"),
        "format_highlight" => Some("format-highlight"),
        "format_superscript" => Some("format-superscript"),
        "format_subscript" => Some("format-subscript"),
        "format_keyboard" => Some("format-keyboard"),
        "star_file" => Some("toggle-star-file"),
        _ => None,
    }
}

pub(crate) fn handle_native_menu_event<R: Runtime>(app: &AppHandle<R>, menu_id: &str) {
    // Recent-file entries are generated from frontend state, so their menu IDs
    // carry an index instead of belonging to the static command map below.
    if let Some(index) = open_recent_index(menu_id) {
        let _ = app.emit("open-recent-file-requested", index);
        return;
    }

    match menu_id {
        "open_vault" => {
            let _ = app.emit("open-vault-requested", ());
        }
        "save" => {
            let _ = app.emit("save-requested", ());
        }
        "new_document" => {
            let _ = app.emit("new-document-requested", ());
        }
        "new_tab" => {
            let _ = app.emit("new-tab-requested", ());
        }
        "settings" => {
            let _ = app.emit("settings-requested", ());
        }
        "appearance_auto" => {
            let _ = app.emit("appearance-requested", "auto");
        }
        "appearance_light" => {
            let _ = app.emit("appearance-requested", "light");
        }
        "appearance_dark" => {
            let _ = app.emit("appearance-requested", "dark");
        }
        "clear_recent_files" => {
            let _ = app.emit("clear-recent-files-requested", ());
        }
        "reveal_active_file" => {
            let _ = app.emit("active-file-reveal-requested", ());
        }
        "open_active_file_default" => {
            let _ = app.emit("active-file-open-default-requested", ());
        }
        "copy_active_file_path" => {
            let _ = app.emit("active-file-copy-path-requested", ());
        }
        "close_tab" => {
            let _ = app.emit("close-active-tab-requested", ());
        }
        "previous_tab" => {
            let _ = app.emit("switch-document-tab-requested", -1i32);
        }
        "next_tab" => {
            let _ = app.emit("switch-document-tab-requested", 1i32);
        }
        _ => {
            if let Some(command_id) = native_command_id(menu_id) {
                let _ = app.emit("native-command-requested", command_id);
            }
        }
    }
}
