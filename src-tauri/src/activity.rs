//! Vault activity listing.
//!
//! Responsibilities:
//! - Report the modification time of every visible Markdown note so the
//!   frontend can draw a contribution-style activity heatmap.
//!
//! Contracts:
//! - Never mutates the vault and caches nothing.
//! - Timestamps are epoch milliseconds; the frontend buckets them into local
//!   calendar days because only it knows the user's timezone.
//! - Notes whose metadata cannot be read are omitted rather than failing the
//!   whole listing.
use super::*;

#[tauri::command]
pub(crate) fn list_vault_activity(root: String) -> Result<Vec<VaultFileActivity>, String> {
    let root = vault_root(&root)?;
    let mut files = Vec::new();
    walk_files(
        &root,
        &root,
        &mut files,
        SearchFileFilter {
            markdown_only: true,
            exclude_dot_paths: true,
        },
    )?;

    let mut activity = Vec::with_capacity(files.len());
    for file in files {
        let Some(modified_ms) = file_modified_ms(&file) else {
            continue;
        };
        activity.push(VaultFileActivity {
            relative_path: relative_string(&root, &file)?,
            modified_ms,
        });
    }
    Ok(activity)
}
