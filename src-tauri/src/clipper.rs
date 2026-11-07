//! Web page clipping.
//!
//! Responsibilities:
//! - Fetch a page, extract its readable article, convert it to Markdown, and
//!   save it as a note under the vault's clippings folder.
//!
//! Contracts:
//! - Only http and https URLs are fetched, with the same size cap and timeout
//!   as rich-link previews. Pages are fetched cold: no cookies, no scripts.
//! - The note is never overwritten; a clashing title gets a numeric suffix.
//! - Extraction and note composition are pure so they can be tested on local
//!   HTML without the network.
//! - The frontmatter follows the Obsidian Web Clipper's default template
//!   (author list of wikilinks, published/created dates, cover, permalink) so
//!   a vault shared with it holds one shape of clipping. The browser
//!   extension's `clipping.ts` mirrors every rule here.
use super::*;
use dom_smoothie::{Config, Readability};
use std::time::Duration;

const CLIPPINGS_DIRECTORY: &str = "Clippings";
const MAX_CLIP_HTML_BYTES: u64 = 8 * 1024 * 1024;

pub(crate) struct Clipping {
    pub(crate) title: String,
    pub(crate) url: String,
    pub(crate) author: Option<String>,
    pub(crate) published: Option<String>,
    pub(crate) description: Option<String>,
    pub(crate) site_name: Option<String>,
    pub(crate) image: Option<String>,
    pub(crate) markdown: String,
}

/// Obsidian's default template: `{{author|split:", "|wikilink|join}}`.
fn author_list(author: Option<&str>) -> Vec<String> {
    author
        .unwrap_or("")
        .split(", ")
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .map(|name| format!("[[{name}]]"))
        .collect()
}

/// The day part of an ISO date; anything else is kept as written.
fn date_only(value: &str) -> &str {
    let bytes = value.as_bytes();
    let iso = bytes.len() >= 10
        && bytes[..10]
            .iter()
            .enumerate()
            .all(|(index, byte)| if index == 4 || index == 7 { *byte == b'-' } else { byte.is_ascii_digit() });

    if iso {
        &value[..10]
    } else {
        value
    }
}

/// The Obsidian clipper's kebab rule: camelCase splits, punctuation other
/// than dots and hyphens is dropped, spaces become hyphens.
pub(crate) fn kebab(text: &str) -> String {
    let mut out = String::new();
    let mut previous: Option<char> = None;
    let mut pending_hyphen = false;

    for character in text.chars() {
        let keep = character.is_ascii_alphanumeric() || character == '.';

        if character.is_whitespace() || character == '-' {
            pending_hyphen = !out.is_empty();
        } else if keep {
            let camel = character.is_ascii_uppercase()
                && previous.is_some_and(|prev| prev.is_ascii_lowercase() || prev.is_ascii_digit());

            if pending_hyphen || camel {
                out.push('-');
            }
            out.push(character.to_ascii_lowercase());
            pending_hyphen = false;
        }

        // Dropped punctuation still counts as the previous character, as in
        // the extension: "x/Y" is "xy", not a camelCase split.
        previous = Some(character);
    }

    out
}

fn non_empty(value: Option<String>) -> Option<String> {
    value
        .map(|text| text.trim().to_string())
        .filter(|text| !text.is_empty())
}

pub(crate) fn extract_clipping(html: &str, url: &str) -> Result<Clipping, String> {
    let mut readability = Readability::new(html, Some(url), Some(Config::default()))
        .map_err(|err| format!("Could not read page: {err}"))?;
    let article = readability
        .parse()
        .map_err(|err| format!("Could not find readable content: {err}"))?;
    let markdown = htmd::HtmlToMarkdown::builder()
        .skip_tags(vec!["script", "style", "noscript", "iframe", "form", "button"])
        .build()
        .convert(&article.content)
        .map_err(|err| format!("Could not convert page to Markdown: {err}"))?;
    let title = match article.title.trim() {
        "" => url.to_string(),
        title => title.to_string(),
    };

    Ok(Clipping {
        title,
        url: article.url.clone().unwrap_or_else(|| url.to_string()),
        author: non_empty(article.byline),
        published: non_empty(article.published_time),
        description: non_empty(article.excerpt),
        site_name: non_empty(article.site_name),
        image: non_empty(article.image)
            .map(|value| absolute_metadata_url(url, &value))
            .filter(|value| !value.is_empty()),
        markdown: markdown.trim().to_string(),
    })
}

fn push_property(out: &mut String, key: &str, value: Option<&str>) {
    if let Some(value) = value {
        out.push_str(&format!("{key}: {}\n", yaml_scalar(value)));
    }
}

fn push_list(out: &mut String, key: &str, values: &[String]) {
    if !values.is_empty() {
        out.push_str(&format!("{key}:\n"));
        for value in values {
            out.push_str(&format!("  - {}\n", yaml_scalar(value)));
        }
    }
}

/// A selection clips as a quote under the page's metadata instead of the
/// whole article, which is what someone highlighting a passage asked for.
pub(crate) fn compose_clipping(clipping: &Clipping, selection: Option<&str>, created_on: &str) -> String {
    let mut out = String::from("---\n");

    push_property(&mut out, "title", Some(&clipping.title));
    push_property(&mut out, "source", Some(&clipping.url));
    push_list(&mut out, "author", &author_list(clipping.author.as_deref()));
    push_property(&mut out, "published", clipping.published.as_deref().map(date_only));
    push_property(&mut out, "created", Some(created_on));
    push_property(&mut out, "site", clipping.site_name.as_deref());
    push_property(&mut out, "description", clipping.description.as_deref());
    // The app has no clip UI to pick a type; the browser extension does. The
    // extension also saves a local feature/thumbnail pair the app skips.
    out.push_str("tags:\n  - clippings\nsourcetype: default\nreviewed: false\n");
    push_property(&mut out, "cover", clipping.image.as_deref());
    let permalink: Vec<String> = [CLIPPINGS_DIRECTORY, clipping.title.as_str()]
        .iter()
        .map(|part| kebab(part))
        .filter(|part| !part.is_empty())
        .collect();
    push_property(&mut out, "permalink", Some(&permalink.join("/")));
    out.push_str("---\n\n");

    match selection.map(str::trim).filter(|text| !text.is_empty()) {
        Some(selection) => {
            for line in selection.lines() {
                out.push_str("> ");
                out.push_str(line);
                out.push('\n');
            }
        }
        None => {
            out.push_str(&clipping.markdown);
            out.push('\n');
        }
    }

    out
}

pub(crate) fn unique_note_path(directory: &Path, title: &str) -> Result<PathBuf, String> {
    let file_name = sanitize_markdown_file_name(title)?;
    let stem = file_name.trim_end_matches(".md");
    let mut candidate = directory.join(&file_name);
    let mut counter = 2;

    while candidate.exists() {
        candidate = directory.join(format!("{stem} {counter}.md"));
        counter += 1;
    }

    Ok(candidate)
}

pub(crate) fn clippable_url(url: &str) -> Result<reqwest::Url, String> {
    let parsed = reqwest::Url::parse(url.trim())
        .map_err(|_| "Enter a valid http or https URL".to_string())?;

    if parsed.scheme() != "http" && parsed.scheme() != "https" {
        return Err("Only http and https pages can be clipped".into());
    }

    Ok(parsed)
}

async fn fetch_page(url: &str) -> Result<(String, String), String> {
    let parsed = clippable_url(url)?;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .user_agent("Glyphary/1.0 web clipper")
        .build()
        .map_err(|err| format!("Could not prepare request: {err}"))?;
    let response = client
        .get(parsed)
        .send()
        .await
        .map_err(|err| format!("Could not fetch page: {err}"))?;

    if !response.status().is_success() {
        return Err(format!("Page request returned {}", response.status()));
    }

    // Content-Length is optional and untrusted, so the body is checked again once read.
    if response.content_length().unwrap_or(0) > MAX_CLIP_HTML_BYTES {
        return Err("Page is too large to clip".into());
    }

    let final_url = response.url().to_string();
    let html = response
        .text()
        .await
        .map_err(|err| format!("Could not read page: {err}"))?;

    if html.len() as u64 > MAX_CLIP_HTML_BYTES {
        return Err("Page is too large to clip".into());
    }

    Ok((final_url, html))
}

#[tauri::command]
pub(crate) async fn clip_web_page(
    root: String,
    url: String,
    selection: Option<String>,
    clipped_on: String,
) -> Result<OpenedFile, String> {
    let root_path = vault_root(&root)?;
    let (final_url, html) = fetch_page(&url).await?;
    let clipping = extract_clipping(&html, &final_url)?;
    let directory = ensure_vault_parent_dirs(&root_path, Path::new(CLIPPINGS_DIRECTORY))?;
    let path = unique_note_path(&directory, &clipping.title)?;

    fs::write(&path, compose_clipping(&clipping, selection.as_deref(), &clipped_on))
        .map_err(|err| format!("Could not save clipping: {err}"))?;

    read_vault_file(
        root_path.to_string_lossy().into_owned(),
        relative_string(&root_path, &path)?,
    )
}
