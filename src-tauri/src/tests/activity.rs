//! Vault activity regression tests.
//!
//! Responsibilities:
//! - Lock the shape of the activity listing used by the heatmap.
//!
//! Contracts:
//! - Only visible Markdown notes are listed, each with a modification time.
use super::*;

#[test]
fn lists_markdown_modification_times() {
    let root = test_root();
    fs::create_dir_all(root.join("notes")).expect("directory should be created");
    fs::create_dir_all(root.join(".obsidian")).expect("dot directory should be created");
    fs::write(root.join("notes/A.md"), "a\n").expect("file should be created");
    fs::write(root.join("B.md"), "b\n").expect("file should be created");
    fs::write(root.join("C.txt"), "c\n").expect("file should be created");
    fs::write(root.join(".obsidian/D.md"), "d\n").expect("file should be created");

    let activity =
        list_vault_activity(root.to_string_lossy().into_owned()).expect("listing should succeed");
    let mut paths: Vec<&str> = activity
        .iter()
        .map(|entry| entry.relative_path.as_str())
        .collect();
    paths.sort();

    assert_eq!(paths, ["B.md", "notes/A.md"]);
    assert!(activity.iter().all(|entry| entry.modified_ms > 0));

    fs::remove_dir_all(root).expect("test root should be removed");
}
