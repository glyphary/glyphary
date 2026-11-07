//! Theme settings validation.
//!
//! Responsibilities:
//! - Trim the chosen light/dark theme ids.
//! - Normalize callout style/icon choices.
//! - Drop empty theme payloads so default vaults do not persist noise.
//!
//! Contracts:
//! - Theme palettes live in the frontend (built-in presets plus app-wide custom
//!   themes); the vault only stores which id fills each slot.
//! - Unknown callout styles or icon names are rejected before saving settings.
use super::*;

fn clean_theme_id(id: Option<String>) -> Option<String> {
    id.map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

pub(crate) fn clean_theme(theme: Option<VaultTheme>) -> Result<Option<VaultTheme>, String> {
    let Some(theme) = theme else {
        return Ok(None);
    };
    let light_theme_id = clean_theme_id(theme.light_theme_id);
    let dark_theme_id = clean_theme_id(theme.dark_theme_id);
    let callouts = clean_theme_callouts(theme.callouts)?;

    if light_theme_id.is_none()
        && dark_theme_id.is_none()
        && theme.options == VaultThemeOptions::default()
        && callouts == VaultThemeCallouts::default()
    {
        Ok(None)
    } else {
        Ok(Some(VaultTheme {
            light_theme_id,
            dark_theme_id,
            callouts,
            options: theme.options,
        }))
    }
}
pub(crate) fn clean_theme_callouts(
    callouts: VaultThemeCallouts,
) -> Result<VaultThemeCallouts, String> {
    let style = callouts.style.trim().to_string();

    if !THEME_CALLOUT_STYLE_ALLOWLIST.contains(&style.as_str()) {
        return Err(format!("Unsupported callout style: {style}"));
    }

    let mut icons = default_callout_icons();

    for (key, value) in callouts.icons {
        let key = key.trim().to_string();
        let value = value.trim().to_string();

        if !THEME_CALLOUT_ICON_KEY_ALLOWLIST.contains(&key.as_str()) {
            return Err(format!("Unsupported callout icon key: {key}"));
        }

        if !THEME_CALLOUT_ICON_ALLOWLIST.contains(&value.as_str()) {
            return Err(format!("Unsupported callout icon: {value}"));
        }

        icons.insert(key, value);
    }

    Ok(VaultThemeCallouts { style, icons })
}
