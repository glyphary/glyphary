//! Link graph and tag index regression tests.
//!
//! Responsibilities:
//! - Lock wikilink target resolution, tag extraction, cluster ids, and edge
//!   shape for the graph view and Tags drawer.
//!
//! Contracts:
//! - Nodes are sorted Markdown notes outside dot paths; edges use node indices.
//! - Tags are lowercase, deduplicated, and never purely numeric.
use super::*;

#[test]
fn builds_link_graph_from_wikilinks() {
    let root = test_root();
    fs::create_dir_all(root.join("notes/deep")).expect("directories should be created");
    fs::create_dir_all(root.join(".obsidian")).expect("dot directory should be created");
    fs::write(
        root.join("Home.md"),
        "[[Alpha|alias]] [[notes/deep/Beta#Heading]] [[Missing]] [[Home]] [[alpha]]\n![[image.png]]\n",
    )
    .expect("file should be created");
    fs::write(root.join("notes/Alpha.md"), "[[Beta]]\n").expect("file should be created");
    fs::write(root.join("notes/deep/Beta.md"), "[[Beta.md]] [[Alpha]] [[Alpha]]\n")
        .expect("file should be created");
    fs::write(root.join("notes/deep/Beta.txt"), "[[Home]]\n").expect("file should be created");
    fs::write(root.join(".obsidian/Hidden.md"), "[[Home]]\n").expect("file should be created");

    let graph = read_link_graph(root.to_string_lossy().into_owned())
        .expect("link graph should succeed");

    let paths: Vec<&str> = graph
        .nodes
        .iter()
        .map(|node| node.relative_path.as_str())
        .collect();
    assert_eq!(paths, ["Home.md", "notes/Alpha.md", "notes/deep/Beta.md"]);
    assert_eq!(graph.nodes[2].name, "Beta");

    let edges: Vec<(usize, usize)> = graph
        .edges
        .iter()
        .map(|edge| (edge.source, edge.target))
        .collect();
    // Home -> Alpha (alias, case-insensitive dedup), Home -> Beta (path + heading),
    // Alpha -> Beta (name), Beta -> Alpha (dedup). Missing, self-links, and the
    // non-Markdown `[[Beta.md]]` self-path are dropped.
    assert_eq!(edges, [(0, 1), (0, 2), (1, 2), (2, 1)]);

    fs::remove_dir_all(root).expect("test root should be removed");
}

#[test]
fn extracts_tags_and_clusters() {
    let root = test_root();
    fs::write(
        root.join("A.md"),
        "---\ntitle: A\ntags:\n  - Project/Alpha\n  - \"quoted\"\nother:\n  - not-a-tag\n---\n[[B]] Body #Inline, and #123 plus (#paren) http://x/#anchor\n# Heading\n",
    )
    .expect("file should be created");
    fs::write(root.join("B.md"), "---\nTags: [one, two]\n---\n[[A]] #one\n")
        .expect("file should be created");
    fs::write(root.join("C.md"), "---\ntag: solo\n---\nno links\n").expect("file should be created");
    fs::write(root.join("D.md"), "[[C]]\n").expect("file should be created");

    let graph = read_link_graph(root.to_string_lossy().into_owned())
        .expect("link graph should succeed");
    let tags: Vec<Vec<&str>> = graph
        .nodes
        .iter()
        .map(|node| node.tags.iter().map(String::as_str).collect())
        .collect();
    assert_eq!(
        tags,
        [
            vec!["project/alpha", "quoted", "inline", "paren"],
            vec!["one", "two"],
            vec!["solo"],
            vec![],
        ]
    );
    // A<->B form the first cluster, C<->D the second; both have two members so
    // the tie breaks on the lower original label.
    let clusters: Vec<usize> = graph.nodes.iter().map(|node| node.cluster).collect();
    assert_eq!(clusters, [0, 0, 1, 1]);

    let vault_tags = read_vault_tags(root.to_string_lossy().into_owned())
        .expect("vault tags should succeed");
    let summary: Vec<(&str, Vec<&str>)> = vault_tags
        .iter()
        .map(|entry| (entry.tag.as_str(), entry.files.iter().map(String::as_str).collect()))
        .collect();
    // Every tag has one note here, so the count sort falls back to name order.
    assert_eq!(summary[0], ("inline", vec!["A.md"]));
    assert_eq!(summary.len(), 7);
    assert!(summary.iter().any(|(tag, files)| *tag == "project/alpha" && files == &["A.md"]));

    fs::remove_dir_all(root).expect("test root should be removed");
}
