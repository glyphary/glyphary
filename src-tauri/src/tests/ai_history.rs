//! AI Builder history persistence regression tests.
//!
//! Responsibilities:
//! - Verify missing history files read as empty state.
//! - Verify saved per-file turns round-trip through `.glyphary`.
//!
//! Contracts:
//! - Tests use isolated vault roots and clean them up.
//! - History storage must stay separate from vault settings.
use super::*;

#[test]
fn reads_empty_ai_builder_history_when_missing() {
    let root = test_root();
    let history = read_ai_builder_history(root.to_string_lossy().into_owned())
        .expect("missing history should read as empty");

    assert!(history.entries.is_empty());
    assert!(!root.join(SETTINGS_DIRECTORY_NAME).exists());

    fs::remove_dir_all(root).expect("test root should be removed");
}

#[test]
fn writes_and_reads_ai_builder_history() {
    let root = test_root();
    let mut entries = HashMap::new();

    entries.insert(
        "Notes/Example.md".into(),
        vec![AiBuilderHistoryTurn {
            id: "turn-1".into(),
            prompt: "Build a comparison".into(),
            markdown: "Generated markdown".into(),
            assets: vec![AiBuilderHistoryAsset {
                id: "logo".into(),
                label: "Logo".into(),
                file_name: "logo.png".into(),
                relative_path: "_assets_/images/logo.png".into(),
            }],
            timestamp_ms: 123,
            applied: true,
            superseded: false,
            replaced_by_turn_id: None,
        }],
    );

    write_ai_builder_history(
        root.to_string_lossy().into_owned(),
        AiBuilderHistoryStore { entries },
    )
    .expect("history should write");
    let history =
        read_ai_builder_history(root.to_string_lossy().into_owned()).expect("history should read");
    let turns = history
        .entries
        .get("Notes/Example.md")
        .expect("file history should exist");

    assert_eq!(turns.len(), 1);
    assert_eq!(turns[0].prompt, "Build a comparison");
    assert!(turns[0].applied);
    assert!(root
        .join(SETTINGS_DIRECTORY_NAME)
        .join(AI_BUILDER_HISTORY_FILE_NAME)
        .exists());
    assert!(!root
        .join(SETTINGS_DIRECTORY_NAME)
        .join(SETTINGS_CONFIG_FILE_NAME)
        .exists());

    fs::remove_dir_all(root).expect("test root should be removed");
}
