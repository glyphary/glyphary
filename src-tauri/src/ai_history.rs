//! AI Builder history persistence.
//!
//! Responsibilities:
//! - Read and write `.glyphary/ai-builder-history.json` for the active vault.
//! - Keep AI Builder working context out of note Markdown and frontmatter.
//!
//! Contracts:
//! - Missing history files return an empty store and do not create `.glyphary/`.
//! - Writes create `.glyphary/` only when a history update is explicitly saved.
//! - The frontend owns retention policy and per-file keys; Rust only enforces
//!   vault scoping and JSON serialization.
use super::*;

fn ai_builder_history_path(root: &Path) -> PathBuf {
    root.join(SETTINGS_DIRECTORY_NAME)
        .join(AI_BUILDER_HISTORY_FILE_NAME)
}

#[tauri::command]
pub(crate) fn read_ai_builder_history(root: String) -> Result<AiBuilderHistoryStore, String> {
    let root = vault_root(&root)?;
    let path = ai_builder_history_path(&root);

    if !path.exists() {
        return Ok(AiBuilderHistoryStore::default());
    }

    let content = fs::read_to_string(path)
        .map_err(|err| format!("Could not read AI Builder history: {err}"))?;

    serde_json::from_str::<AiBuilderHistoryStore>(&content)
        .map_err(|err| format!("Could not parse AI Builder history: {err}"))
}

#[tauri::command]
pub(crate) fn write_ai_builder_history(
    root: String,
    history: AiBuilderHistoryStore,
) -> Result<AiBuilderHistoryStore, String> {
    let root = vault_root(&root)?;
    let content = serde_json::to_string_pretty(&history)
        .map_err(|err| format!("Could not serialize AI Builder history: {err}"))?;
    let path = ai_builder_history_path(&root);

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|err| format!("Could not create AI Builder history directory: {err}"))?;
    }

    fs::write(path, format!("{content}\n"))
        .map_err(|err| format!("Could not write AI Builder history: {err}"))?;

    Ok(history)
}
