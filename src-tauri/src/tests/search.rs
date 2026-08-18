//! Vault search regression tests.
//!
//! Responsibilities:
//! - Verify filename and content search command behavior.
//! - Lock result fields used by the vault drawer for navigation.
//!
//! Contracts:
//! - Search returns vault-relative navigation results.
//! - Content matches must include line numbers and compact preview text.
use super::*;

#[test]
fn searches_vault_file_names() {
    let root = test_root();
    fs::create_dir(root.join("notes")).expect("directory should be created");
    fs::write(root.join("notes").join("Project Plan.md"), "# Plan\n")
        .expect("file should be created");
    fs::write(root.join("other.md"), "# Other\n").expect("file should be created");

    let results = search_vault(
        root.to_string_lossy().into_owned(),
        "project".into(),
        false,
        None,
        None,
        None,
    )
    .expect("vault search should succeed");

    assert!(results
        .iter()
        .any(|result| result.relative_path == "notes/Project Plan.md"
            && !result.is_content_match
            && result.modified_ms.is_some()));

    fs::remove_dir_all(root).expect("test root should be removed");
}

#[test]
fn searches_vault_file_content() {
    let root = test_root();
    fs::write(root.join("alpha.md"), "# Alpha\nNeedle lives here\n")
        .expect("file should be created");
    fs::write(root.join("beta.md"), "# Beta\n").expect("file should be created");

    let results = search_vault(
        root.to_string_lossy().into_owned(),
        "needle".into(),
        true,
        None,
        None,
        None,
    )
    .expect("vault search should succeed");

    assert!(results.iter().any(|result| {
        result.relative_path == "alpha.md"
            && result.is_content_match
            && result.line_number == Some(2)
            && result.modified_ms.is_some()
            && result
                .line_text
                .as_deref()
                .is_some_and(|line| line.contains("Needle"))
    }));

    fs::remove_dir_all(root).expect("test root should be removed");
}

#[test]
fn searches_vault_file_content_with_internal_regex() {
    let root = test_root();
    fs::write(root.join("alpha.md"), "# Alpha\nNEEDLE-123 lives here\n")
        .expect("file should be created");

    let results = search_vault(
        root.to_string_lossy().into_owned(),
        "needle-\\d+".into(),
        true,
        None,
        None,
        None,
    )
    .expect("vault search should succeed");

    assert!(results.iter().any(|result| {
        result.relative_path == "alpha.md"
            && result.is_content_match
            && result.line_number == Some(2)
            && result
                .line_text
                .as_deref()
                .is_some_and(|line| line.contains("NEEDLE-123"))
    }));

    fs::remove_dir_all(root).expect("test root should be removed");
}

#[test]
fn split_terms_search_requires_every_word_in_the_same_file() {
    let root = test_root();
    fs::write(
        root.join("both.md"),
        "# Setup\nnetbird runs fine\nsee the github repo\n",
    )
    .expect("file should be created");
    fs::write(root.join("one.md"), "# Other\nonly netbird here\n")
        .expect("file should be created");

    let results = search_vault(
        root.to_string_lossy().into_owned(),
        "netbird github".into(),
        true,
        None,
        None,
        Some(true),
    )
    .expect("vault search should succeed");
    let paths = results
        .iter()
        .map(|result| result.relative_path.as_str())
        .collect::<Vec<_>>();

    assert!(paths.contains(&"both.md"));
    assert!(!paths.contains(&"one.md"));

    fs::remove_dir_all(root).expect("test root should be removed");
}

#[test]
fn search_results_are_sorted_newest_first() {
    let root = test_root();
    fs::write(root.join("older.md"), "needle\n").expect("file should be created");
    // Coarse filesystem mtime resolution needs a real gap between writes.
    std::thread::sleep(std::time::Duration::from_millis(50));
    fs::write(root.join("newer.md"), "needle\n").expect("file should be created");

    let results = search_vault(
        root.to_string_lossy().into_owned(),
        "needle".into(),
        true,
        None,
        None,
        None,
    )
    .expect("vault search should succeed");
    let paths = results
        .iter()
        .map(|result| result.relative_path.as_str())
        .collect::<Vec<_>>();

    assert_eq!(paths, vec!["newer.md", "older.md"]);

    fs::remove_dir_all(root).expect("test root should be removed");
}

#[test]
fn filtered_search_ignores_dot_paths_and_non_markdown_files() {
    let root = test_root();
    fs::create_dir(root.join("notes")).expect("visible directory should be created");
    fs::create_dir(root.join(".hidden")).expect("hidden directory should be created");
    fs::write(root.join("notes").join("open.md"), "- [ ] visible\n")
        .expect("visible markdown task should be created");
    fs::write(root.join("notes").join(".hidden.md"), "- [ ] hidden file\n")
        .expect("hidden markdown task should be created");
    fs::write(
        root.join(".hidden").join("inside.md"),
        "- [ ] hidden directory\n",
    )
    .expect("hidden directory markdown task should be created");
    fs::write(root.join("notes").join("plain.txt"), "- [ ] text task\n")
        .expect("non-markdown task should be created");

    let results = search_vault(
        root.to_string_lossy().into_owned(),
        "- \\[ \\]".into(),
        true,
        Some(true),
        Some(true),
        None,
    )
    .expect("filtered vault search should succeed");
    let paths = results
        .iter()
        .filter(|result| result.is_content_match)
        .map(|result| result.relative_path.as_str())
        .collect::<Vec<_>>();

    assert_eq!(paths, vec!["notes/open.md"]);

    fs::remove_dir_all(root).expect("test root should be removed");
}
