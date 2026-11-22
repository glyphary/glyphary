//! Glyphary plugin template for runtime `glyphary-wasm-host@1`.
//!
//! Edit `run` and leave the exports at the bottom alone. Glyphary calls `run`
//! for every command, panel, and event the manifest declares. The module has no
//! imports: to read the vault, return `requests` and Glyphary calls `run` again
//! with the answers in `call.responses`, in the same order.

// The sample does not read every field Glyphary sends.
#![allow(dead_code)]

use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::HashMap;

#[derive(Deserialize)]
struct Call {
    /// "command", "panel", "render", "save", or "open".
    event: String,
    /// The command or panel id, or the code block language for "render".
    /// For "save" and "open" it repeats the event.
    id: String,
    /// The open Markdown note, or `None` when no note is open.
    note: Option<Note>,
    /// The text of the code block, for "render".
    source: Option<String>,
    /// The manifest's settings by id, with the user's values or the defaults.
    #[serde(default)]
    settings: HashMap<String, String>,
    /// 0 on the first call, then one higher after each batch of requests.
    round: u32,
    responses: Vec<Response>,
}

#[derive(Deserialize)]
struct Note {
    path: String,
    /// Present with the `document:read` permission.
    markdown: Option<String>,
    /// Present with the `selection:read` permission.
    selection: Option<String>,
}

#[derive(Deserialize)]
struct Response {
    ok: bool,
    #[serde(default)]
    value: Value,
    #[serde(default)]
    error: String,
}

/// This sample lists the notes that link to the open one. The panel shows the
/// list, the command inserts it at the cursor, and a `backlinks` code block
/// shows it inside a note. A block may name another note on its first line.
fn run(call: Call) -> Value {
    let open_path = call.note.as_ref().map(|note| note.path.as_str()).unwrap_or_default();
    let name = open_path.rsplit('/').next().unwrap_or_default();
    let named = call.source.as_deref().unwrap_or_default().trim();
    let title = if named.is_empty() { name.strip_suffix(".md").unwrap_or(name) } else { named };

    if title.is_empty() {
        return json!({ "panel": { "markdown": "Open a note to see what links to it." } });
    }

    if call.round == 0 {
        return json!({ "requests": [{ "type": "search", "query": format!("[[{title}") }] });
    }

    let mut paths: Vec<&str> = call.responses[0]
        .value
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|hit| hit["path"].as_str())
        .filter(|path| *path != open_path)
        .collect();
    paths.sort_unstable();
    paths.dedup();

    // A select arrives as the chosen option, a switch as "true" or "false".
    let setting = |id: &str| call.settings.get(id).map(String::as_str).unwrap_or_default();

    if setting("order") == "Z to A" {
        paths.reverse();
    }

    let list = paths
        .iter()
        .map(|path| format!("- [[{path}]]"))
        .collect::<Vec<_>>()
        .join("\n");

    if call.event == "command" {
        return json!({ "actions": [{ "type": "insertAtCursor", "markdown": list }] });
    }

    let body = if list.is_empty() { "No note links here yet.".to_string() } else { list };

    let heading = setting("heading");

    if call.event == "render" || setting("insert_button") != "true" {
        return json!({ "panel": { "markdown": format!("## {heading}\n{body}") } });
    }

    json!({ "panel": { "markdown": format!("## {heading}\n{body}\n\n[Insert this list](command:insert_backlinks)") } })
}

// ---- Fixed ABI: do not edit below this line ----

fn reply(input: &[u8]) -> String {
    match serde_json::from_slice::<Call>(input) {
        Ok(call) => run(call).to_string(),
        Err(error) => json!({ "actions": [{ "type": "status", "message": error.to_string() }] })
            .to_string(),
    }
}

#[no_mangle]
pub extern "C" fn alloc(length: usize) -> *mut u8 {
    let mut buffer = Vec::<u8>::with_capacity(length.max(1));
    let pointer = buffer.as_mut_ptr();
    std::mem::forget(buffer);
    pointer
}

/// Returns a pointer to `[u32 little-endian length][UTF-8 bytes]`.
#[no_mangle]
pub unsafe extern "C" fn transform(pointer: *const u8, length: usize) -> *mut u8 {
    let output = reply(std::slice::from_raw_parts(pointer, length));
    let mut buffer = Vec::with_capacity(output.len() + 4);
    buffer.extend_from_slice(&(output.len() as u32).to_le_bytes());
    buffer.extend_from_slice(output.as_bytes());
    let output_pointer = buffer.as_mut_ptr();
    std::mem::forget(buffer);
    output_pointer
}

// Glyphary starts a fresh instance for every call, so memory is reclaimed when
// the instance is dropped.
#[no_mangle]
pub extern "C" fn dealloc(_pointer: *mut u8, _length: usize) {}
