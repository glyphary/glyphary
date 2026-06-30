//! Base query regression tests.
//!
//! Responsibilities:
//! - Lock the supported `.base` syntax subset against real vault files.
//! - Verify card/table rows are filtered from Markdown frontmatter only.
//!
//! Contracts:
//! - Tests use isolated temporary vaults.
//! - Base query assertions should check user-visible rows, not parser internals.
use super::*;

#[test]
fn queries_base_views_from_note_frontmatter() {
    let root = test_root();
    fs::write(
        root.join("Sources.base"),
        r#"filters:
  and:
    - file.hasProperty("sourcetype")
views:
  - type: cards
    name: All
    order:
      - file.name
      - sourcetype
      - reviewed
    image: note.cover
  - type: cards
    name: Articles
    filters:
      and:
        - sourcetype == "article"
    image: note.cover
  - type: table
    name: Link
    filters:
      and:
        - sourcetype == "link"
"#,
    )
    .expect("base file should be created");
    fs::write(
        root.join("Article.md"),
        "---\nsourcetype: article\nreviewed: yes\ncover: '![[cover one.png]]'\n---\n# Article\n",
    )
    .expect("article should be created");
    fs::write(
        root.join("Link.md"),
        "---\nsourcetype: link\n---\n# Link\n",
    )
    .expect("link should be created");
    fs::write(root.join("Loose.md"), "# Loose\n").expect("loose note should be created");

    let result = query_base(
        root.to_string_lossy().into_owned(),
        "Sources.base".into(),
    )
    .expect("base query should succeed");

    let all = result
        .views
        .iter()
        .find(|view| view.name == "All")
        .expect("all view should exist");
    let articles = result
        .views
        .iter()
        .find(|view| view.name == "Articles")
        .expect("articles view should exist");
    let links = result
        .views
        .iter()
        .find(|view| view.name == "Link")
        .expect("link view should exist");

    assert_eq!(result.name, "Sources");
    assert_eq!(all.rows.len(), 2);
    assert_eq!(articles.rows.len(), 1);
    assert_eq!(articles.rows[0].relative_path, "Article.md");
    assert_eq!(articles.rows[0].image_reference.as_deref(), Some("![[cover one.png]]"));
    assert_eq!(links.r#type, "table");
    assert_eq!(links.rows[0].relative_path, "Link.md");

    fs::remove_dir_all(root).expect("test root should be removed");
}
