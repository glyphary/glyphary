//! Web clipper tests.
//!
//! Responsibilities:
//! - Lock article extraction and note composition against local HTML, and
//!   the no-overwrite rule for clashing titles.
//!
//! Contracts:
//! - No network: pages are strings, the vault is a temporary directory.
use super::*;
use crate::clipper::{clippable_url, compose_clipping, extract_clipping, unique_note_path};

const PAGE: &str = r#"<!doctype html>
<html lang="en"><head>
<title>Why Notes Rot: A Field Guide</title>
<meta name="author" content="Ada Example">
<meta property="og:site_name" content="Example Journal">
<meta property="article:published_time" content="2026-03-04T10:00:00Z">
<meta name="description" content="Notes rot when nobody revisits them.">
</head><body>
<nav><a href="/">Home</a> <a href="/about">About</a></nav>
<article>
<h1>Why Notes Rot: A Field Guide</h1>
<p>Notes rot when nobody revisits them. This is the first of several paragraphs that make the article long enough to be recognised as the main content of the page.</p>
<p>The second paragraph adds a <a href="/links">relative link</a> and some <strong>emphasis</strong> so the Markdown conversion has something to do beyond plain text.</p>
<pre><code class="language-rust">fn main() {}</code></pre>
<p>A third paragraph closes the argument with enough words to keep the readability score comfortably above the threshold used by the extractor.</p>
</article>
<footer>Copyright 2026</footer>
</body></html>"#;

#[test]
fn extracts_readable_article_as_markdown_with_metadata() {
    let clipping = extract_clipping(PAGE, "https://example.com/notes/rot")
        .expect("article should be readable");

    assert_eq!(clipping.title, "Why Notes Rot: A Field Guide");
    assert_eq!(clipping.author.as_deref(), Some("Ada Example"));
    assert_eq!(clipping.site_name.as_deref(), Some("Example Journal"));
    assert!(clipping.published.as_deref().unwrap_or("").starts_with("2026-03-04"));
    assert!(clipping.markdown.contains("Notes rot when nobody revisits them."));
    assert!(clipping.markdown.contains("[relative link](https://example.com/links)"));
    assert!(clipping.markdown.contains("**emphasis**"));
    assert!(clipping.markdown.contains("fn main() {}"));
    assert!(!clipping.markdown.contains("Copyright 2026"));
    assert!(!clipping.markdown.contains("About"));

    let note = compose_clipping(&clipping, None, "2026-09-20");
    assert!(note.starts_with("---\ntitle: \"Why Notes Rot: A Field Guide\"\nsource: https://example.com/notes/rot\nauthor: Ada Example\n"));
    assert!(note.contains("\nclipped: 2026-09-20\ntags:\n  - clippings\n---\n\n"));
    assert!(note.ends_with("threshold used by the extractor.\n"));

    let quoted = compose_clipping(&clipping, Some("first line\nsecond line"), "2026-09-20");
    assert!(quoted.ends_with("---\n\n> first line\n> second line\n"));
    assert!(!quoted.contains("**emphasis**"));
}

#[test]
fn clip_targets_are_validated_and_never_overwritten() {
    assert!(clippable_url("ftp://example.com/x").is_err());
    assert!(clippable_url("not a url").is_err());
    assert_eq!(
        clippable_url(" https://example.com/a?b=c ").unwrap().as_str(),
        "https://example.com/a?b=c"
    );

    let root = test_root();
    fs::write(root.join("Why Notes Rot- A Field Guide.md"), "existing\n").expect("note should be created");
    fs::write(root.join("Why Notes Rot- A Field Guide 2.md"), "existing\n").expect("note should be created");

    let path = unique_note_path(&root, "Why Notes Rot: A Field Guide").expect("path should resolve");
    assert_eq!(path, root.join("Why Notes Rot- A Field Guide 3.md"));
    assert!(unique_note_path(&root, "   ").is_err());

    fs::remove_dir_all(root).expect("test root should be removed");
}
