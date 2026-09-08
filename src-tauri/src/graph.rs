//! Vault link graph and tag index.
//!
//! Responsibilities:
//! - Extract wikilink edges and tags from every Markdown note in one pass for
//!   the graph view and the Tags drawer.
//! - Scan files across a few threads with the same in-process grep searcher
//!   that powers vault search, so neither view needs a database or cache.
//! - Group linked notes into clusters with label propagation so the graph can
//!   color by topic without any metadata from the user.
//!
//! Contracts:
//! - Never mutates the vault. Nothing is cached; every call rescans.
//! - Nodes are visible Markdown notes (dot paths excluded), sorted by relative
//!   path. Edges reference node indices, skip self-links, and are deduplicated.
//! - Targets resolve with the frontend rules in `src/app-state/wikilinks.ts`:
//!   exact relative path (with or without `.md`) first, then filename, where an
//!   ambiguous filename links to every candidate.
//! - Tags come from inline `#tag` tokens and the frontmatter `tags:` property
//!   (inline list, block list, or scalar). They are lowercased, deduplicated per
//!   note, and never purely numeric, matching Obsidian's rules.
//! - Cluster ids are dense and ordered by cluster size, largest first, so the
//!   frontend can map them straight onto a palette.
use super::*;
use grep::{
    matcher::Matcher,
    regex::{RegexMatcher, RegexMatcherBuilder},
    searcher::{BinaryDetection, Searcher, SearcherBuilder, Sink, SinkMatch},
};
use std::collections::HashMap;
use std::io;

// The scan is I/O bound; beyond a handful of threads the disk, not the regex,
// is the limit, and every extra thread costs a searcher allocation.
const GRAPH_SCAN_MAX_THREADS: usize = 8;
// Synchronous label propagation can oscillate on bipartite structures instead
// of converging, so the loop is capped rather than run to a fixed point.
const CLUSTER_MAX_ROUNDS: usize = 20;

/// Mirrors `wikiLinkTargetFromMarkup` plus the lowercase normalization used
/// for lookup: alias after `|` and heading after `#` are dropped.
fn wikilink_target(markup: &str) -> String {
    markup
        .split('|')
        .next()
        .unwrap_or("")
        .split('#')
        .next()
        .unwrap_or("")
        .trim()
        .to_lowercase()
}

pub(crate) fn normalize_tag(raw: &str) -> Option<String> {
    let tag = raw
        .trim()
        .trim_matches(|c| c == '"' || c == '\'')
        .trim_start_matches('#')
        .trim_end_matches(|c: char| matches!(c, '.' | ',' | ';' | ':' | '!' | '?' | ')' | ']'))
        .trim_matches('/')
        .to_lowercase();

    if tag.is_empty() || tag.chars().all(|c| c.is_ascii_digit()) {
        return None;
    }

    Some(tag)
}

fn markdown_display_name(relative_path: &str) -> String {
    let file_name = relative_path.rsplit('/').next().unwrap_or(relative_path);
    match file_name.rsplit_once('.') {
        Some((stem, extension)) if extension.eq_ignore_ascii_case("md") => stem.to_string(),
        _ => file_name.to_string(),
    }
}

struct NodeIndex {
    by_path: HashMap<String, usize>,
    by_name: HashMap<String, Vec<usize>>,
}

impl NodeIndex {
    fn build(nodes: &[LinkGraphNode]) -> Self {
        let mut by_path = HashMap::new();
        let mut by_name: HashMap<String, Vec<usize>> = HashMap::new();

        for (index, node) in nodes.iter().enumerate() {
            let path = node.relative_path.to_lowercase();
            // Both `notes/a` and `notes/a.md` are valid link targets in Obsidian.
            if let Some(without_extension) = path.strip_suffix(".md") {
                by_path.insert(without_extension.to_string(), index);
            }
            by_path.insert(path, index);
            by_name
                .entry(node.name.to_lowercase())
                .or_default()
                .push(index);
        }

        Self { by_path, by_name }
    }

    fn resolve(&self, target: &str) -> &[usize] {
        if let Some(index) = self.by_path.get(target) {
            return std::slice::from_ref(index);
        }
        self.by_name.get(target).map(Vec::as_slice).unwrap_or(&[])
    }
}

struct Matchers {
    // Selects every line the sink needs to see: wikilinks, inline tags, and
    // the frontmatter delimiter/key/list lines that drive the tag parser.
    lines: RegexMatcher,
    wikilink: RegexMatcher,
    tag: RegexMatcher,
}

impl Matchers {
    fn build() -> Result<Self, String> {
        let build = |pattern: &str| {
            RegexMatcherBuilder::new()
                // Frontmatter keys such as `Tags:` are matched loosely; the
                // wikilink and tag patterns have no letters to be affected.
                .case_insensitive(true)
                .line_terminator(Some(b'\n'))
                .build(pattern)
                .map_err(|err| format!("Invalid scan pattern: {err}"))
        };
        Ok(Self {
            lines: build(
                r"\[\[[^\]\n]+\]\]|(?:^|[\s(\[])#[\p{L}\p{N}_/-]+|^---\s*$|^[\p{L}_][\w-]*:|^\s*-\s+",
            )?,
            wikilink: build(r"\[\[[^\]\n]+\]\]")?,
            tag: build(r"(?:^|[\s(\[])#[\p{L}\p{N}_/-]+")?,
        })
    }
}

#[derive(Default)]
struct ScannedNote {
    targets: Vec<String>,
    tags: Vec<String>,
}

struct NoteSink<'a> {
    matchers: &'a Matchers,
    note: &'a mut ScannedNote,
    in_frontmatter: bool,
    in_tags_list: bool,
}

/// Splits an inline frontmatter value such as `[a, b]` or `a b` into raw tags.
fn inline_tag_values(value: &str) -> impl Iterator<Item = &str> {
    value
        .trim_start_matches('[')
        .trim_end_matches(']')
        .split(|c| c == ',' || c == ' ')
}

/// Byte ranges of every match of `matcher` in `line`.
fn match_ranges(matcher: &RegexMatcher, line: &[u8]) -> Result<Vec<(usize, usize)>, io::Error> {
    let mut ranges = Vec::new();
    matcher
        .find_iter(line, |found| {
            ranges.push((found.start(), found.end()));
            true
        })
        .map_err(io::Error::other)?;
    Ok(ranges)
}

impl NoteSink<'_> {
    fn push_tag(&mut self, raw: &str) {
        let Some(tag) = normalize_tag(raw) else {
            return;
        };
        if !self.note.tags.contains(&tag) {
            self.note.tags.push(tag);
        }
    }

    fn frontmatter_line(&mut self, line: &str) {
        let trimmed = line.trim();
        if trimmed == "---" {
            self.in_frontmatter = false;
            self.in_tags_list = false;
            return;
        }

        // List items are checked before keys: `- a: b` contains a colon and
        // would otherwise be misread as a new frontmatter key.
        if let Some(item) = trimmed.strip_prefix('-') {
            if self.in_tags_list {
                self.push_tag(item);
            }
            return;
        }

        let Some((key, value)) = trimmed.split_once(':') else {
            return;
        };
        let key = key.trim().to_lowercase();
        self.in_tags_list = false;
        if key != "tags" && key != "tag" {
            return;
        }

        let value = value.trim();
        if value.is_empty() {
            self.in_tags_list = true;
            return;
        }
        for raw in inline_tag_values(value) {
            self.push_tag(raw);
        }
    }

    fn body_line(&mut self, line: &[u8]) -> Result<(), io::Error> {
        for (start, end) in match_ranges(&self.matchers.wikilink, line)? {
            // The pattern is anchored by `[[` and `]]`, so the inner text is the
            // match minus two bytes on each side.
            let inner = String::from_utf8_lossy(&line[start + 2..end - 2]);
            let target = wikilink_target(&inner);
            if !target.is_empty() {
                self.note.targets.push(target);
            }
        }

        for (start, end) in match_ranges(&self.matchers.tag, line)? {
            let token = String::from_utf8_lossy(&line[start..end]);
            self.push_tag(token.trim_start_matches(|c| c != '#'));
        }
        Ok(())
    }
}

impl Sink for NoteSink<'_> {
    type Error = io::Error;

    fn matched(&mut self, _searcher: &Searcher, mat: &SinkMatch<'_>) -> Result<bool, Self::Error> {
        let line = mat.bytes();
        let text = String::from_utf8_lossy(line);

        // Only a delimiter on the very first line opens frontmatter; `---`
        // anywhere else is a horizontal rule.
        if mat.line_number() == Some(1) && text.trim() == "---" {
            self.in_frontmatter = true;
            return Ok(true);
        }

        if self.in_frontmatter {
            self.frontmatter_line(&text);
        } else {
            self.body_line(line)?;
        }
        Ok(true)
    }
}

fn scan_chunk(
    files: &[PathBuf],
    first_index: usize,
    matchers: &Matchers,
    index: &NodeIndex,
) -> Result<(Vec<LinkGraphEdge>, Vec<(usize, Vec<String>)>), String> {
    let mut searcher = SearcherBuilder::new()
        .binary_detection(BinaryDetection::quit(b'\x00'))
        // Line numbers cost a little per match but are the only way the sink
        // can tell an opening frontmatter delimiter from a horizontal rule.
        .line_number(true)
        .build();
    let mut edges = Vec::new();
    let mut tags = Vec::new();

    for (offset, file) in files.iter().enumerate() {
        let source = first_index + offset;
        let mut note = ScannedNote::default();
        searcher
            .search_path(
                &matchers.lines,
                file,
                NoteSink {
                    matchers,
                    note: &mut note,
                    in_frontmatter: false,
                    in_tags_list: false,
                },
            )
            .map_err(|err| format!("Could not scan file {}: {err}", file.display()))?;

        for target in &note.targets {
            for &resolved in index.resolve(target) {
                if resolved != source {
                    edges.push(LinkGraphEdge {
                        source,
                        target: resolved,
                    });
                }
            }
        }
        if !note.tags.is_empty() {
            tags.push((source, note.tags));
        }
    }

    Ok((edges, tags))
}

/// Synchronous label propagation: each note adopts the most common label among
/// its neighbours until nothing changes. Ties pick the smallest label so runs
/// are deterministic. Ids are then renumbered by cluster size.
fn cluster_labels(node_count: usize, edges: &[LinkGraphEdge]) -> Vec<usize> {
    let mut adjacency: Vec<Vec<usize>> = vec![Vec::new(); node_count];
    for edge in edges {
        adjacency[edge.source].push(edge.target);
        adjacency[edge.target].push(edge.source);
    }

    let mut labels: Vec<usize> = (0..node_count).collect();
    let mut votes: HashMap<usize, usize> = HashMap::new();
    for _ in 0..CLUSTER_MAX_ROUNDS {
        let mut changed = false;
        for node in 0..node_count {
            if adjacency[node].is_empty() {
                continue;
            }
            votes.clear();
            for &neighbor in &adjacency[node] {
                *votes.entry(labels[neighbor]).or_default() += 1;
            }
            let best = votes
                .iter()
                .map(|(&label, &count)| (std::cmp::Reverse(count), label))
                .min()
                .map(|(_, label)| label)
                .unwrap_or(labels[node]);
            if best != labels[node] {
                labels[node] = best;
                changed = true;
            }
        }
        if !changed {
            break;
        }
    }

    let mut sizes: HashMap<usize, usize> = HashMap::new();
    for &label in &labels {
        *sizes.entry(label).or_default() += 1;
    }
    let mut ordered: Vec<(usize, usize)> = sizes.into_iter().collect();
    ordered.sort_by_key(|&(label, size)| (std::cmp::Reverse(size), label));
    let dense: HashMap<usize, usize> = ordered
        .into_iter()
        .enumerate()
        .map(|(cluster, (label, _))| (label, cluster))
        .collect();

    labels.into_iter().map(|label| dense[&label]).collect()
}

fn scan_vault(root: &Path) -> Result<LinkGraph, String> {
    let mut files = Vec::new();
    walk_files(
        root,
        root,
        &mut files,
        SearchFileFilter {
            markdown_only: true,
            exclude_dot_paths: true,
        },
    )?;
    files.sort();

    let mut nodes = files
        .iter()
        .map(|file| {
            let relative_path = relative_string(root, file)?;
            Ok(LinkGraphNode {
                name: markdown_display_name(&relative_path),
                relative_path,
                tags: Vec::new(),
                cluster: 0,
            })
        })
        .collect::<Result<Vec<_>, String>>()?;
    let index = NodeIndex::build(&nodes);
    let matchers = Matchers::build()?;

    let threads = std::thread::available_parallelism()
        .map(|count| count.get())
        .unwrap_or(1)
        .clamp(1, GRAPH_SCAN_MAX_THREADS);
    // Contiguous chunks let each thread derive node indices from its offset
    // instead of sharing a counter; `max(1)` keeps `chunks` valid for empty vaults.
    let chunk_size = files.len().div_ceil(threads).max(1);
    let (mut edges, tags) = std::thread::scope(|scope| {
        let handles: Vec<_> = files
            .chunks(chunk_size)
            .enumerate()
            .map(|(chunk_index, chunk)| {
                let (matchers, index) = (&matchers, &index);
                scope.spawn(move || scan_chunk(chunk, chunk_index * chunk_size, matchers, index))
            })
            .collect();

        let mut edges = Vec::new();
        let mut tags = Vec::new();
        for handle in handles {
            let (chunk_edges, chunk_tags) = handle
                .join()
                .map_err(|_| "Link graph scan thread panicked".to_string())??;
            edges.extend(chunk_edges);
            tags.extend(chunk_tags);
        }
        Ok::<_, String>((edges, tags))
    })?;

    edges.sort_by_key(|edge| (edge.source, edge.target));
    edges.dedup_by_key(|edge| (edge.source, edge.target));

    for (node, note_tags) in tags {
        nodes[node].tags = note_tags;
    }
    for (node, cluster) in cluster_labels(nodes.len(), &edges).into_iter().enumerate() {
        nodes[node].cluster = cluster;
    }

    Ok(LinkGraph { nodes, edges })
}

#[tauri::command]
pub(crate) fn read_link_graph(root: String) -> Result<LinkGraph, String> {
    scan_vault(&vault_root(&root)?)
}

#[tauri::command]
pub(crate) fn read_vault_tags(root: String) -> Result<Vec<VaultTag>, String> {
    let graph = scan_vault(&vault_root(&root)?)?;
    let mut by_tag: HashMap<String, Vec<String>> = HashMap::new();
    for node in graph.nodes {
        for tag in node.tags {
            by_tag
                .entry(tag)
                .or_default()
                .push(node.relative_path.clone());
        }
    }

    let mut tags: Vec<VaultTag> = by_tag
        .into_iter()
        .map(|(tag, files)| VaultTag { tag, files })
        .collect();
    tags.sort_by(|left, right| {
        right
            .files
            .len()
            .cmp(&left.files.len())
            .then_with(|| left.tag.cmp(&right.tag))
    });
    Ok(tags)
}
