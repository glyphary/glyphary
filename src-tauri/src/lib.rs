//! Tauri backend root for Glyphary.
//!
//! Responsibilities:
//! - Wire native menus, plugins, command registration, and application startup.
//! - Import shared backend models/defaults and responsibility modules.
//!
//! Contracts:
//! - Feature implementations should live in responsibility modules, not grow
//!   this file again.
//! - Commands registered here must preserve React as the owner of document UI
//!   state; Rust emits menu/window events and performs trusted OS work.
//! - Vault-facing command inputs are untrusted until they pass through the path
//!   and settings helpers.
use serde::{Deserialize, Serialize};
use std::{
    collections::{BTreeSet, HashMap},
    fs,
    path::{Component, Path, PathBuf},
    sync::Mutex,
    time::Duration,
};
use tauri::{
    menu::{AboutMetadata, Menu, MenuItem, PredefinedMenuItem, Submenu},
    AppHandle, Emitter, Manager, State,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

// Tauri's command macro emits helper macros beside each command. Keeping
// command-bearing modules imported with `macro_use` lets `generate_handler!`
// register those commands from this central app-wiring file.
#[macro_use]
mod ai;
#[macro_use]
mod ai_history;
#[macro_use]
mod assets;
#[macro_use]
mod base;
mod defaults;
#[macro_use]
mod calendar;
mod models;
mod paths;
#[macro_use]
mod plugins;
#[macro_use]
mod rich_links;
#[macro_use]
mod search;
#[macro_use]
mod settings;
#[macro_use]
mod shortcuts;
#[macro_use]
mod snippets;
mod themes;
#[macro_use]
mod vault;
#[macro_use]
mod windowing;

use ai::*;
use ai_history::*;
use assets::*;
use base::*;
use calendar::*;
use defaults::*;
use models::*;
use paths::*;
use plugins::*;
use rich_links::*;
use search::*;
use settings::*;
use shortcuts::*;
use snippets::*;
use themes::*;
use vault::*;
use windowing::*;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .menu(|app| {
            let package_info = app.package_info();
            let config = app.config();
            // macOS only renders a subset of Tauri's AboutMetadata fields. Keep
            // the cross-platform fields populated, but put the useful product
            // description in credits so the native macOS About panel is not bare.
            let about_metadata = AboutMetadata {
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
            };
            let open_vault = MenuItem::with_id(
                app,
                "open_vault",
                "Open Vault...",
                true,
                Some("CmdOrCtrl+O"),
            )?;
            let save = MenuItem::with_id(app, "save", "Save", true, Some("CmdOrCtrl+S"))?;
            let new_document =
                MenuItem::with_id(app, "new_document", "New", true, Some("CmdOrCtrl+N"))?;
            let new_tab =
                MenuItem::with_id(app, "new_tab", "New Tab", true, Some("CmdOrCtrl+T"))?;
            let settings =
                MenuItem::with_id(app, "settings", "Settings...", true, Some("CmdOrCtrl+,"))?;
            let appearance_auto =
                MenuItem::with_id(app, "appearance_auto", "Style: Auto", true, None::<&str>)?;
            let appearance_light =
                MenuItem::with_id(app, "appearance_light", "Style: Light", true, None::<&str>)?;
            let appearance_dark =
                MenuItem::with_id(app, "appearance_dark", "Style: Dark", true, None::<&str>)?;
            let command_palette = MenuItem::with_id(
                app,
                "command_palette",
                "Command Palette...",
                true,
                Some("CmdOrCtrl+P"),
            )?;
            let find_in_page =
                MenuItem::with_id(app, "find_in_page", "Find...", true, Some("CmdOrCtrl+F"))?;
            let paste_plain = MenuItem::with_id(
                app,
                "paste_plain",
                "Paste and Match Style",
                true,
                Some("CmdOrCtrl+Shift+V"),
            )?;
            let insert_rich_link =
                MenuItem::with_id(app, "insert_rich_link", "Rich Link", true, None::<&str>)?;
            let insert_excalidraw =
                MenuItem::with_id(app, "insert_excalidraw", "Excalidraw Drawing", true, None::<&str>)?;
            let insert_columns =
                MenuItem::with_id(app, "insert_columns", "Columns", true, None::<&str>)?;
            let insert_gallery =
                MenuItem::with_id(app, "insert_gallery", "Gallery Layout", true, None::<&str>)?;
            let insert_callout =
                MenuItem::with_id(app, "insert_callout", "Callout", true, None::<&str>)?;
            let insert_collapse =
                MenuItem::with_id(app, "insert_collapse", "Collapse", true, None::<&str>)?;
            let insert_html_block =
                MenuItem::with_id(app, "insert_html_block", "HTML Block", true, None::<&str>)?;
            let insert_mermaid =
                MenuItem::with_id(app, "insert_mermaid", "Mermaid Diagram", true, None::<&str>)?;
            let insert_table_of_contents = MenuItem::with_id(
                app,
                "insert_table_of_contents",
                "Table of Contents",
                true,
                None::<&str>,
            )?;
            let format_strikethrough =
                MenuItem::with_id(app, "format_strikethrough", "Strikethrough", true, None::<&str>)?;
            let format_highlight =
                MenuItem::with_id(app, "format_highlight", "Highlight", true, None::<&str>)?;
            let format_superscript =
                MenuItem::with_id(app, "format_superscript", "Superscript", true, None::<&str>)?;
            let format_subscript =
                MenuItem::with_id(app, "format_subscript", "Subscript", true, None::<&str>)?;
            let format_keyboard =
                MenuItem::with_id(app, "format_keyboard", "Keyboard", true, None::<&str>)?;
            let star_file =
                MenuItem::with_id(app, "star_file", "Star or Unstar File", true, None::<&str>)?;
            let app_menu = Submenu::with_items(
                app,
                package_info.name.clone(),
                true,
                &[
                    &PredefinedMenuItem::about(app, None, Some(about_metadata))?,
                    &PredefinedMenuItem::separator(app)?,
                    &settings,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::services(app, None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::hide(app, None)?,
                    &PredefinedMenuItem::hide_others(app, None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::quit(app, None)?,
                ],
            )?;
            let file_menu = Submenu::with_items(
                app,
                "File",
                true,
                &[
                    &new_tab,
                    &new_document,
                    &open_vault,
                    &save,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::close_window(app, None)?,
                ],
            )?;
            let edit_menu = Submenu::with_items(
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
            )?;
            let insert_menu = Submenu::with_items(
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
            )?;
            let format_menu = Submenu::with_items(
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
            )?;
            let view_menu = Submenu::with_items(
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
            )?;
            let window_menu = Submenu::with_items(
                app,
                "Window",
                true,
                &[
                    &PredefinedMenuItem::minimize(app, None)?,
                    &PredefinedMenuItem::maximize(app, None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::close_window(app, None)?,
                ],
            )?;
            let help_menu = Submenu::with_items(
                app,
                "Help",
                true,
                &[&PredefinedMenuItem::bring_all_to_front(app, None)?],
            )?;

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
        })
        .on_menu_event(|app, event| {
            // Menu items emit into the webview instead of duplicating app
            // behavior in Rust; React owns document state and dirty tracking.
            if event.id() == "open_vault" {
                let _ = app.emit("open-vault-requested", ());
            } else if event.id() == "save" {
                let _ = app.emit("save-requested", ());
            } else if event.id() == "new_document" {
                let _ = app.emit("new-document-requested", ());
            } else if event.id() == "new_tab" {
                let _ = app.emit("new-tab-requested", ());
            } else if event.id() == "settings" {
                let _ = app.emit("settings-requested", ());
            } else if event.id() == "appearance_auto" {
                let _ = app.emit("appearance-requested", "auto");
            } else if event.id() == "appearance_light" {
                let _ = app.emit("appearance-requested", "light");
            } else if event.id() == "appearance_dark" {
                let _ = app.emit("appearance-requested", "dark");
            } else {
                let command_id = match event.id().as_ref() {
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
                };

                if let Some(command_id) = command_id {
                    let _ = app.emit("native-command-requested", command_id);
                }
            }
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_macos_permissions::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .setup(|app| {
            if let Err(err) = apply_macos_titlebar_chrome(app.handle()) {
                eprintln!("Could not apply macOS titlebar chrome: {err}");
            }
            Ok(())
        })
        .manage(TidbitShortcutState::default())
        .invoke_handler(tauri::generate_handler![
            list_vault_dir,
            list_vault_markdown_files,
            read_vault_file,
            write_vault_file,
            create_vault_markdown_file,
            create_excalidraw_file,
            rename_vault_file,
            move_vault_file,
            delete_vault_file,
            create_note_in_directory,
            create_canvas_in_directory,
            create_directory_in_directory,
            rename_vault_directory,
            move_vault_directory,
            open_directory_shadow_file,
            open_calendar_day_file,
            list_calendar_day_files,
            read_vault_settings,
            write_vault_settings,
            register_tidbit_global_shortcut,
            unregister_tidbit_global_shortcut,
            tidbit_global_shortcut_status,
            test_tidbit_global_shortcut_event,
            list_css_snippets,
            read_css_snippets,
            list_vault_plugins,
            read_plugin_styles,
            read_plugin_template,
            read_plugin_wasm,
            allow_vault_assets,
            set_window_glass_effect,
            save_vault_asset,
            import_remote_vault_image_asset,
            query_base,
            search_vault,
            fetch_rich_link_metadata,
            list_ai_models,
            test_ai_connection,
            run_ai_transform,
            read_ai_builder_history,
            write_ai_builder_history
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests;
