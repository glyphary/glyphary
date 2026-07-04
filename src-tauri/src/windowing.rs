//! Native window appearance commands.
//!
//! Responsibilities:
//! - Apply or maintain the macOS glass/window-material behavior requested by
//!   vault appearance settings.
//! - Provide a no-op implementation on non-macOS platforms.
//!
//! Contracts:
//! - The frontend controls visual chrome classes; Rust only adjusts native
//!   window/WebView material state.
//! - Disabling the user-facing glass option must still keep enough transparent
//!   material for macOS titlebar contrast to remain legible.
#[cfg(target_os = "macos")]
use tauri::Manager;

#[cfg(target_os = "macos")]
pub(crate) fn apply_macos_titlebar_chrome(app: &tauri::AppHandle) -> Result<(), String> {
    use objc2_app_kit::{NSWindow, NSWindowStyleMask, NSWindowTitleVisibility};
    use tauri::window::Color;

    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "Main window is not available".to_string())?;
    window
        .set_background_color(Some(Color(0, 0, 0, 0)))
        .map_err(|err| format!("Could not make macOS window background transparent: {err}"))?;
    let ns_window_ptr = window
        .ns_window()
        .map_err(|err| format!("Could not access macOS window handle: {err}"))?;
    let ns_window = unsafe { ns_window_ptr.cast::<NSWindow>().as_ref() }
        .ok_or_else(|| "macOS window handle is null".to_string())?;
    let mut style_mask = ns_window.styleMask();

    style_mask.insert(NSWindowStyleMask::FullSizeContentView);
    ns_window.setStyleMask(style_mask);
    ns_window.setTitlebarAppearsTransparent(true);
    ns_window.setTitleVisibility(NSWindowTitleVisibility::Hidden);

    Ok(())
}

#[cfg(not(target_os = "macos"))]
pub(crate) fn apply_macos_titlebar_chrome(_app: &tauri::AppHandle) -> Result<(), String> {
    Ok(())
}

#[cfg(target_os = "macos")]
pub(crate) fn apply_window_glass_effect(
    app: &tauri::AppHandle,
    enabled: bool,
) -> Result<bool, String> {
    use tauri::window::{Color, Effect, EffectState, EffectsBuilder};

    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "Main window is not available".to_string())?;

    if enabled {
        // Native material is only visible if both the window and WKWebView
        // backgrounds are transparent. The Tauri config handles creation-time
        // transparency; this runtime call updates the current WebView when the
        // user toggles the vault setting.
        window
            .set_background_color(Some(Color(0, 0, 0, 0)))
            .map_err(|err| format!("Could not make window background transparent: {err}"))?;
        window
            .set_effects(
                EffectsBuilder::new()
                    .effect(Effect::UnderWindowBackground)
                    .state(EffectState::FollowsWindowActiveState)
                    .radius(12.0)
                    .build(),
            )
            .map_err(|err| format!("Could not enable window glass effect: {err}"))?;
    } else {
        // Clearing effects entirely, or switching to the narrower Titlebar
        // material, makes macOS draw black title text on this transparent
        // window. Keep the native material that gives correct title contrast;
        // the frontend's data-window-glass flag controls whether the user sees
        // the glass styling.
        window
            .set_background_color(Some(Color(0, 0, 0, 0)))
            .map_err(|err| format!("Could not keep window background transparent: {err}"))?;
        window
            .set_effects(
                EffectsBuilder::new()
                    .effect(Effect::UnderWindowBackground)
                    .state(EffectState::FollowsWindowActiveState)
                    .radius(12.0)
                    .build(),
            )
            .map_err(|err| format!("Could not keep titlebar contrast material: {err}"))?;
    }

    Ok(enabled)
}
#[cfg(not(target_os = "macos"))]
pub(crate) fn apply_window_glass_effect(
    _app: &tauri::AppHandle,
    _enabled: bool,
) -> Result<bool, String> {
    Ok(false)
}
#[tauri::command]
pub(crate) fn set_window_glass_effect(
    app: tauri::AppHandle,
    enabled: bool,
) -> Result<bool, String> {
    apply_window_glass_effect(&app, enabled)
}
