//! Vault search commands.
//!
//! Responsibilities:
//! - Search vault filenames and optionally file contents.
//! - Use the same `grep` matcher/searcher crates that power ripgrep, but keep
//!   execution in-process so Glyphary has no external `rg` binary dependency.
//! - Return compact, capped results suitable for drawer navigation.
//!
//! Contracts:
//! - Search never mutates the vault.
//! - Results are vault-relative, sorted newest-first, and bounded to avoid
//!   large IPC payloads.
//! - Content search treats the query as a regular expression, matching the old
//!   `rg` behavior instead of silently changing search semantics.
//! - With `split_terms`, whitespace separates independent terms that must ALL
//!   match somewhere in a file (drawer search); without it the query stays one
//!   regex so patterns containing spaces (task search, AI builder) keep working.
use super::*;
use grep::{
    matcher::Matcher,
    regex::{RegexMatcher, RegexMatcherBuilder},
    searcher::{BinaryDetection, Searcher, SearcherBuilder, Sink, SinkMatch},
};
use std::io;
use std::time::UNIX_EPOCH;

#[derive(Clone, Copy, Default)]
pub(crate) struct SearchFileFilter {
    pub(crate) markdown_only: bool,
    pub(crate) exclude_dot_paths: bool,
}

pub(crate) fn normalize_preview(line: &str) -> String {
    line.trim().chars().take(220).collect()
}
pub(crate) fn file_modified_ms(file: &Path) -> Option<u64> {
    let modified = fs::metadata(file).ok()?.modified().ok()?;
    let duration = modified.duration_since(UNIX_EPOCH).ok()?;

    u64::try_from(duration.as_millis()).ok()
}
pub(crate) fn is_dot_path_component(path: &Path) -> bool {
    path.file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| name.starts_with('.'))
}
pub(crate) fn is_markdown_file(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("md"))
}
pub(crate) fn walk_files(
    root: &Path,
    dir: &Path,
    files: &mut Vec<PathBuf>,
    filter: SearchFileFilter,
) -> Result<(), String> {
    for entry in fs::read_dir(dir).map_err(|err| format!("Could not list directory: {err}"))? {
        let entry = entry.map_err(|err| format!("Could not read directory entry: {err}"))?;
        let file_type = entry
            .file_type()
            .map_err(|err| format!("Could not read file type: {err}"))?;
        let path = entry.path();

        // Task search is intentionally limited to visible Markdown notes. Keeping
        // this filter in the shared walker lets future drawer views opt into the
        // same vault-local constraints without duplicating traversal rules.
        if filter.exclude_dot_paths && is_dot_path_component(&path) {
            continue;
        }

        if file_type.is_dir() {
            walk_files(root, &path, files, filter)?;
        } else if file_type.is_file()
            && path.starts_with(root)
            && (!filter.markdown_only || is_markdown_file(&path))
        {
            files.push(path);
        }
    }

    Ok(())
}
pub(crate) fn filename_matches(
    root: &Path,
    files: Vec<PathBuf>,
    terms: &[String],
) -> Result<Vec<SearchResult>, String> {
    let terms: Vec<String> = terms.iter().map(|term| term.to_lowercase()).collect();
    let mut results = Vec::new();

    for file in files {
        let relative_path = relative_string(root, &file)?;
        let haystack = relative_path.to_lowercase();

        if terms.iter().all(|term| haystack.contains(term)) {
            results.push(SearchResult {
                relative_path,
                line_number: None,
                line_text: None,
                is_content_match: false,
                modified_ms: file_modified_ms(&file),
            });
        }
    }

    Ok(results)
}

fn build_matcher(pattern: &str) -> Result<RegexMatcher, String> {
    RegexMatcherBuilder::new()
        .case_insensitive(true)
        .line_terminator(Some(b'\n'))
        .build(pattern)
        .map_err(|err| format!("Invalid search pattern: {err}"))
}

struct ContentSearchSink<'a> {
    root: &'a Path,
    file: &'a Path,
    rows: &'a mut Vec<SearchResult>,
    // One matcher per query term; a file only qualifies when every term matched
    // at least one line, so each matched line is re-tested against every term.
    term_matchers: &'a [RegexMatcher],
    term_found: &'a mut [bool],
}
impl Sink for ContentSearchSink<'_> {
    type Error = io::Error;

    fn matched(&mut self, _searcher: &Searcher, mat: &SinkMatch<'_>) -> Result<bool, Self::Error> {
        for (matcher, found) in self.term_matchers.iter().zip(self.term_found.iter_mut()) {
            if !*found && matcher.is_match(mat.bytes()).unwrap_or(false) {
                *found = true;
            }
        }

        // A single file never needs more rows than the whole response cap, but
        // scanning must continue so the remaining terms can still qualify.
        if self.rows.len() >= SEARCH_RESULT_LIMIT {
            return Ok(true);
        }

        let relative_path = relative_string(self.root, self.file).map_err(io::Error::other)?;
        let line_text = String::from_utf8_lossy(mat.bytes());
        let line_number = mat
            .line_number()
            .and_then(|line_number| usize::try_from(line_number).ok());

        self.rows.push(SearchResult {
            relative_path,
            line_number,
            line_text: Some(normalize_preview(&line_text)),
            is_content_match: true,
            modified_ms: file_modified_ms(self.file),
        });

        Ok(true)
    }
}
pub(crate) fn search_content_internal(
    root: &Path,
    terms: &[String],
    files: &[PathBuf],
) -> Result<Vec<SearchResult>, String> {
    let term_matchers = terms
        .iter()
        .map(|term| build_matcher(term))
        .collect::<Result<Vec<_>, _>>()?;
    // One pass per file: collect lines matching ANY term, then keep the file
    // only if EVERY term matched somewhere in it.
    let any_term = build_matcher(&format!("(?:{})", terms.join(")|(?:")))?;
    let mut searcher = SearcherBuilder::new()
        .binary_detection(BinaryDetection::quit(b'\x00'))
        .line_number(true)
        .build();
    let mut results = Vec::new();

    for file in files {
        let mut rows = Vec::new();
        let mut term_found = vec![false; term_matchers.len()];
        let sink = ContentSearchSink {
            root,
            file,
            rows: &mut rows,
            term_matchers: &term_matchers,
            term_found: &mut term_found,
        };
        searcher
            .search_path(&any_term, file, sink)
            .map_err(|err| format!("Could not search file {}: {err}", file.display()))?;

        if term_found.iter().all(|found| *found) {
            results.append(&mut rows);
        }
    }

    Ok(results)
}
#[tauri::command]
pub(crate) fn search_vault(
    root: String,
    query: String,
    include_content: bool,
    markdown_only: Option<bool>,
    exclude_dot_paths: Option<bool>,
    split_terms: Option<bool>,
) -> Result<Vec<SearchResult>, String> {
    let root = vault_root(&root)?;
    let query = query.trim();

    if query.is_empty() {
        return Ok(Vec::new());
    }

    let terms: Vec<String> = if split_terms.unwrap_or(false) {
        query.split_whitespace().map(str::to_string).collect()
    } else {
        vec![query.to_string()]
    };
    let filter = SearchFileFilter {
        markdown_only: markdown_only.unwrap_or(false),
        exclude_dot_paths: exclude_dot_paths.unwrap_or(false),
    };
    let mut files = Vec::new();
    walk_files(&root, &root, &mut files, filter)?;
    let mut results = filename_matches(&root, files.clone(), &terms)?;

    if include_content {
        results.extend(search_content_internal(&root, &terms, &files)?);
    }

    // Sort before capping so the newest notes survive the response limit; the
    // stable sort keeps a file's filename row ahead of its content rows for
    // the drawer's first-row-per-file dedup. None mtimes sort last.
    results.sort_by(|left, right| right.modified_ms.cmp(&left.modified_ms));
    results.truncate(SEARCH_RESULT_LIMIT);

    Ok(results)
}
