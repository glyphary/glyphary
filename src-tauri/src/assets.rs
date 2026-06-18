//! Vault asset commands.
//!
//! Responsibilities:
//! - Allow the current vault asset directory through Tauri's asset protocol.
//! - Persist pasted or dropped binary assets into the configured vault folder.
//! - Import approved remote images into the same vault image storage path.
//!
//! Contracts:
//! - Asset paths must remain vault-relative and validated through `paths`.
//! - Saved assets must never overwrite an existing file; collision suffixes are
//!   part of the markdown-visible filename.
//! - This module stores bytes only. Markdown insertion remains a frontend
//!   concern because it depends on the active editor selection and review step.
use super::*;

#[tauri::command]
pub(crate) fn allow_vault_assets(
    app: tauri::AppHandle,
    root: String,
    asset_directory: String,
) -> Result<(), String> {
    let root = vault_root(&root)?;
    let assets = root.join(clean_settings_asset_directory(&asset_directory)?);

    // convertFileSrc only works for directories allowed in Tauri's asset scope.
    // This permission is per-vault and must be refreshed when settings change.
    app.asset_protocol_scope()
        .allow_directory(&assets, true)
        .map_err(|err| format!("Could not allow vault assets: {err}"))
}
#[tauri::command]
pub(crate) fn save_vault_asset(
    root: String,
    asset_directory: String,
    file_name: String,
    bytes: Vec<u8>,
) -> Result<SavedAsset, String> {
    save_vault_asset_bytes(root, asset_directory, file_name, bytes)
}

fn save_vault_asset_bytes(
    root: String,
    asset_directory: String,
    file_name: String,
    bytes: Vec<u8>,
) -> Result<SavedAsset, String> {
    if bytes.is_empty() {
        return Err("Image file is empty".into());
    }

    if bytes.len() > MAX_ASSET_BYTES {
        return Err("Image file is larger than 50 MB".into());
    }

    let root = vault_root(&root)?;
    let assets = root.join(clean_settings_asset_directory(&asset_directory)?);
    fs::create_dir_all(&assets)
        .map_err(|err| format!("Could not create asset directory: {err}"))?;

    let file_name = sanitize_asset_file_name(&file_name);
    let path = unique_asset_path(&assets, &file_name);
    // Never overwrite a pasted/dropped asset. The frontend inserts the stored
    // filename returned here, so collision suffixes stay visible in markdown.
    fs::write(&path, bytes).map_err(|err| format!("Could not write image asset: {err}"))?;

    let stored_name = path
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .ok_or_else(|| "Stored asset has no file name".to_string())?;

    Ok(SavedAsset {
        file_name: stored_name,
        relative_path: relative_string(&root, &path)?,
    })
}

#[tauri::command]
pub(crate) async fn import_remote_vault_image_asset(
    root: String,
    asset_directory: String,
    file_name: String,
    url: String,
) -> Result<SavedAsset, String> {
    let parsed = reqwest::Url::parse(url.trim())
        .map_err(|_| "Remote image URL must be valid".to_string())?;

    if parsed.scheme() != "http" && parsed.scheme() != "https" {
        return Err("Remote image URL must use http or https".into());
    }

    let response = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|err| format!("Could not create remote image client: {err}"))?
        .get(parsed)
        .send()
        .await
        .map_err(|err| format!("Could not fetch remote image: {err}"))?;
    let status = response.status();

    if !status.is_success() {
        return Err(format!("Remote image server returned {status}"));
    }

    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("");

    if !content_type.starts_with("image/") {
        return Err("Remote URL did not return an image".into());
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|err| format!("Could not read remote image: {err}"))?;

    if bytes.len() > MAX_ASSET_BYTES {
        return Err("Remote image is larger than 50 MB".into());
    }

    save_vault_asset_bytes(root, asset_directory, file_name, bytes.to_vec())
}
