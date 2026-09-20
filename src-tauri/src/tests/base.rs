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
    fs::write(root.join("Link.md"), "---\nsourcetype: link\n---\n# Link\n")
        .expect("link should be created");
    fs::write(root.join("Loose.md"), "# Loose\n").expect("loose note should be created");

    let result = query_base(root.to_string_lossy().into_owned(), "Sources.base".into(), None)
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
    assert_eq!(
        articles.rows[0].image_reference.as_deref(),
        Some("![[cover one.png]]")
    );
    assert_eq!(links.r#type, "table");
    assert_eq!(links.rows[0].relative_path, "Link.md");

    fs::remove_dir_all(root).expect("test root should be removed");
}

#[test]
fn renders_structured_base_edits_and_keeps_unknown_lines() {
    let root = test_root();
    fs::write(
        root.join("Sources.base"),
        r#"filters:
  or:
    - file.hasProperty("Sourcetype")
    - and:
      - file.hasTag("keep")
      - 'status != "done"'
    - not:
        - file.inFolder("Trash")
        - status == "dropped"
formulas:
  total: 'price * 2'
  label: "sourcetype.title() + \" \" + file.ext"
properties:
  status:
    displayName: State
  formula.total:
    displayName: "Total price"
views:
- type: table
  name: Links
  filters:
    and:
      - 'sourcetype == "link"'
      - formula.total > 5
  sort:
    - property: file.name
      direction: desc
  limit: 5
"#,
    )
    .expect("base file should be created");
    fs::write(
        root.join("Link.md"),
        "---\nSourceType: link\nprice: 4\n---\n",
    )
    .expect("note should be created");
    fs::write(
        root.join("Cheap.md"),
        "---\nsourcetype: link\nprice: 1\n---\n",
    )
    .expect("note should be created");
    fs::write(root.join("Tagged.md"), "---\nstatus: open\n---\n#keep\n")
        .expect("note should be created");
    fs::write(root.join("Done.md"), "---\nstatus: done\n---\n#keep\n")
        .expect("note should be created");
    fs::write(root.join("Loose.md"), "# Loose\n").expect("note should be created");
    fs::create_dir_all(root.join("Trash")).expect("folder should be created");
    fs::write(root.join("Trash/Old.md"), "# Old\n").expect("note should be created");

    let root_string = root.to_string_lossy().into_owned();
    let result = query_base(root_string.clone(), "Sources.base".into(), Some(0))
        .expect("base query should succeed");
    let mut definition = result.definition;

    assert_eq!(result.errors, Vec::<String>::new());
    assert_eq!(
        result.display_names,
        HashMap::from([
            ("status".to_string(), "State".to_string()),
            ("formula.total".to_string(), "Total price".to_string()),
        ])
    );
    assert_eq!(definition.views[0].extra, Vec::<String>::new());
    assert_eq!(definition.views[0].limit, Some(5));
    assert_eq!(definition.views[0].sort[0].direction, "DESC");
    assert_eq!(definition.formulas.len(), 2);
    assert_eq!(definition.formulas[1].expression, "sourcetype.title() + \" \" + file.ext");
    assert!(matches!(
        definition.filters,
        Some(BaseFilter::Or { ref filters }) if filters.len() == 3
    ));

    // Only Link.md has price * 2 > 5; the not-group keeps Loose.md out of the
    // global match set but the view filter needs a sourcetype anyway.
    assert_eq!(result.views[0].rows.len(), 1);
    assert_eq!(result.views[0].rows[0].relative_path, "Link.md");
    assert_eq!(result.views[0].rows[0].properties["formula.total"], "8");
    assert_eq!(result.views[0].rows[0].properties["formula.label"], "Link md");
    assert_eq!(result.views[0].rows[0].properties["file.folder"], "");

    definition.views[0].name = "All: Links".into();
    definition.views[0].order = vec!["file.name".into(), "formula.total".into()];
    definition.views.push(BaseViewDefinition {
        name: "Kept".into(),
        view_type: "cards".into(),
        image: Some("note.cover".into()),
        filters: Some(BaseFilter::And {
            filters: vec![
                BaseFilter::Expression {
                    source: "file.hasTag(\"keep\")".into(),
                },
                BaseFilter::Not {
                    filters: vec![BaseFilter::Expression {
                        source: "status == 'done'".into(),
                    }],
                },
            ],
        }),
        ..Default::default()
    });

    let rendered = render_base_definition(definition).expect("base render should succeed");
    fs::write(root.join("Sources.base"), &rendered).expect("base should be writable");
    let saved = query_base(root_string.clone(), "Sources.base".into(), Some(0))
        .expect("base query should succeed");

    assert_eq!(saved.errors, Vec::<String>::new());
    assert_eq!(saved.views.len(), 2);
    assert_eq!(saved.views[0].name, "All: Links");
    assert_eq!(saved.views[1].rows.len(), 1);
    assert_eq!(saved.views[1].rows[0].relative_path, "Tagged.md");
    assert_eq!(saved.display_names["status"], "State");

    assert_eq!(
        rendered,
        r#"filters:
  or:
    - 'file.hasProperty("Sourcetype")'
    - and:
        - 'file.hasTag("keep")'
        - 'status != "done"'
    - not:
        - 'file.inFolder("Trash")'
        - 'status == "dropped"'
formulas:
  total: 'price * 2'
  label: 'sourcetype.title() + " " + file.ext'
properties:
  status:
    displayName: State
  formula.total:
    displayName: "Total price"
views:
  - type: table
    name: "All: Links"
    limit: 5
    filters:
      and:
        - 'sourcetype == "link"'
        - 'formula.total > 5'
    order:
      - file.name
      - formula.total
    sort:
      - property: file.name
        direction: DESC
  - type: cards
    name: Kept
    filters:
      and:
        - 'file.hasTag("keep")'
        - not:
            - "status == 'done'"
    image: note.cover
"#
    );

    fs::write(
        root.join("Broken.base"),
        "filters:\n  and:\n    - price +\nformulas:\n  bad: 'nope()'\nviews:\n  - type: table\n    order:\n      - formula.bad\n",
    )
    .expect("base file should be created");
    let broken = query_base(root_string, "Broken.base".into(), None).expect("broken base still queries");
    assert_eq!(broken.views[0].rows.len(), 0);
    assert!(broken.errors.iter().any(|error| error.starts_with("Filter `price +`")));
    assert!(render_base_definition(BaseDefinition::default()).is_err());

    fs::remove_dir_all(root).expect("test root should be removed");
}

#[test]
fn creates_base_starter_file_in_directory() {
    let root = test_root();
    fs::create_dir_all(root.join("Views")).expect("directory should be created");

    let root_string = root.to_string_lossy().into_owned();
    let file = create_base_in_directory(root_string.clone(), "Views".into(), "My Sources".into())
        .expect("base should be created");

    assert_eq!(file.relative_path, "Views/My Sources.base");
    assert_eq!(file.content, "views:\n  - type: table\n    name: Table\n");
    assert!(create_base_in_directory(root_string.clone(), "Views".into(), "My Sources".into()).is_err());

    let result = query_base(root_string, "Views/My Sources.base".into(), None)
        .expect("new base should query");
    assert_eq!(result.views[0].name, "Table");

    fs::remove_dir_all(root).expect("test root should be removed");
}
