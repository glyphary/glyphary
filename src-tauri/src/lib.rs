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
#[cfg(desktop)]
use tauri::State;
use tauri::{webview::PageLoadEvent, AppHandle, Emitter, Manager};

#[cfg(target_os = "ios")]
use glyphary_folder_picker::pick_folder;

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
#[macro_use]
mod github;
mod models;
#[cfg(desktop)]
#[macro_use]
mod native_menu;
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
use github::*;
use models::*;
#[cfg(desktop)]
use native_menu::*;
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

#[derive(Default)]
struct OpenedPaths(Mutex<Vec<String>>);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct OpenedPathsPayload {
    paths: Vec<String>,
}

fn is_glyphary_document_path(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| {
            matches!(
                extension.to_ascii_lowercase().as_str(),
                "md" | "markdown" | "canvas" | "base"
            )
        })
        .unwrap_or(false)
}

fn clean_open_path(path: PathBuf) -> Option<String> {
    if !is_glyphary_document_path(&path) {
        return None;
    }

    let absolute = fs::canonicalize(&path).unwrap_or(path);
    Some(absolute.to_string_lossy().into_owned())
}

#[cfg(desktop)]
fn open_path_from_arg(arg: &str, cwd: &str) -> Option<String> {
    let trimmed = arg.trim();

    if trimmed.is_empty() || trimmed.starts_with('-') {
        return None;
    }

    if let Ok(url) = tauri::Url::parse(trimmed) {
        if url.scheme() != "file" {
            return None;
        }

        return url.to_file_path().ok().and_then(clean_open_path);
    }

    let path = PathBuf::from(trimmed);
    let path = if path.is_absolute() {
        path
    } else {
        PathBuf::from(cwd).join(path)
    };

    clean_open_path(path)
}

#[cfg(desktop)]
fn collect_open_paths(args: impl IntoIterator<Item = String>, cwd: &str) -> Vec<String> {
    let mut seen = BTreeSet::new();

    args.into_iter()
        .filter_map(|arg| open_path_from_arg(&arg, cwd))
        .filter(|path| seen.insert(path.clone()))
        .collect()
}

fn opened_paths_from_urls(urls: Vec<tauri::Url>) -> Vec<String> {
    let mut seen = BTreeSet::new();

    urls.into_iter()
        .filter_map(|url| url.to_file_path().ok())
        .filter_map(clean_open_path)
        .filter(|path| seen.insert(path.clone()))
        .collect()
}

fn focus_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn queue_and_emit_open_paths(app: &AppHandle, paths: Vec<String>) {
    if paths.is_empty() {
        focus_main_window(app);
        return;
    }

    // Open-With and single-instance events can arrive before React has mounted
    // listeners, so Rust also queues paths for the frontend to drain on startup.
    if let Ok(mut pending_paths) = app.state::<OpenedPaths>().0.lock() {
        pending_paths.extend(paths.clone());
    }

    focus_main_window(app);
    let _ = app.emit("open-paths-requested", OpenedPathsPayload { paths });
}

#[tauri::command]
fn take_opened_paths(app: AppHandle) -> Vec<String> {
    match app.state::<OpenedPaths>().0.lock() {
        Ok(mut paths) => std::mem::take(&mut *paths),
        Err(_) => Vec::new(),
    }
}

#[cfg(not(desktop))]
#[tauri::command]
fn update_native_menu_state(_state: serde_json::Value) -> Result<(), String> {
    Ok(())
}

#[tauri::command]
async fn pick_vault_folder(app: AppHandle) -> Result<Option<String>, String> {
    #[cfg(target_os = "ios")]
    return pick_folder(&app).await;

    #[cfg(not(target_os = "ios"))]
    {
        let _ = app;
        Err("The native folder picker is only available on mobile".into())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(desktop)]
    let mut builder = tauri::Builder::default().manage(OpenedPaths::default());
    #[cfg(not(desktop))]
    let builder = tauri::Builder::default().manage(OpenedPaths::default());

    #[cfg(desktop)]
    {
        builder = builder
            .plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
                queue_and_emit_open_paths(app, collect_open_paths(args, &cwd));
            }))
            .menu(|app| build_native_menu(app, &NativeMenuState::default()))
            .on_menu_event(|app, event| {
                handle_native_menu_event(app, event.id().as_ref());
            })
            .plugin(tauri_plugin_global_shortcut::Builder::new().build())
            .plugin(tauri_plugin_macos_permissions::init())
            .plugin(tauri_plugin_window_state::Builder::default().build())
            .on_page_load(|webview, payload| {
                if webview.label() == "main" && payload.event() == PageLoadEvent::Finished {
                    let window = webview.window();
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            });
    }

    builder
        .plugin(glyphary_folder_picker::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            #[cfg(not(desktop))]
            let _ = app;

            #[cfg(desktop)]
            {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.hide();
                }

                #[cfg(target_os = "macos")]
                if let Err(err) = apply_macos_titlebar_chrome(app.handle()) {
                    eprintln!("Could not apply macOS titlebar chrome: {err}");
                }

                let cwd = std::env::current_dir()
                    .ok()
                    .map(|path| path.to_string_lossy().into_owned())
                    .unwrap_or_default();
                let startup_paths = collect_open_paths(std::env::args(), &cwd);

                if let Ok(mut pending_paths) = app.state::<OpenedPaths>().0.lock() {
                    pending_paths.extend(startup_paths);
                }
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
            allow_vault_library_covers,
            import_vault_library_cover,
            set_window_glass_effect,
            save_vault_asset,
            import_remote_vault_image_asset,
            pick_vault_folder,
            github_clone_vault,
            github_pull_vault,
            github_push_vault,
            github_get_token,
            github_get_vault_token,
            github_save_token,
            github_save_vault_token,
            query_base,
            search_vault,
            fetch_rich_link_metadata,
            list_ai_models,
            test_ai_connection,
            run_ai_transform,
            read_ai_builder_history,
            write_ai_builder_history,
            update_native_menu_state,
            take_opened_paths
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            #[cfg(any(target_os = "macos", target_os = "ios", target_os = "android"))]
            if let tauri::RunEvent::Opened { urls } = event {
                queue_and_emit_open_paths(app, opened_paths_from_urls(urls));
            }
        });
}

#[cfg(test)]
mod tests;
