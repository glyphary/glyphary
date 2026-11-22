---
name: glyphary-plugin
description: Write, build, and test a plugin for the Glyphary Markdown editor. Use when the user asks for a Glyphary plugin, a custom command palette command for their vault, a Markdown snippet or template command, plugin CSS, a text transform on the selection or the document, a side panel, a custom code block, plugin settings, or something that reads or writes other notes or reacts when a note is saved or opened.
---

# Glyphary plugin authoring

A Glyphary plugin is a folder inside one vault. The full reference is at https://glyphary.github.io/plugins.html.

## Pick the runtime

Glyphary has two runtimes. Choose the smaller one that covers the request.

`glyphary-wasm-transform@1` covers:

- Inserting a fixed piece of Markdown at the cursor.
- Inserting a Markdown template kept in a file.
- Loading stylesheets while the plugin is enabled.
- A text transform that receives the selection or the whole document and returns text.

`glyphary-wasm-host@1` does all of the above and adds:

- Reading notes, listing notes, and searching the vault.
- Writing notes other than the open one.
- Panels in the right drawer, each with its own tab, drawn from Markdown the plugin returns.
- Rendering fenced code blocks in a language the plugin declares.
- Running when a note is saved or opened.
- Settings the user edits in Glyphary.

Neither runtime can reach the network, read the clock or a random source, keep state between calls, draw custom HTML, or add buttons outside its panel. A plugin that needs to remember something stores it in a note. Fixed options belong in `settings`. If the request needs more than that, tell the user which part is out of reach and offer the closest version that fits. Do not fake a missing capability.

A snippet needs only `insertMarkdown`. A longer block is a `template`. A change of appearance is CSS. None of those need WASM.

## Where the plugin goes

```text
<vault>/.glyphary/plugins/<plugin id>/
  plugin.json
  plugin.wasm        only when the plugin runs code
  styles.css         optional
  templates/*.md     optional
```

The folder name must equal the manifest `id`. Ids use letters, numbers, dash, and underscore, up to 80 characters. Ask the user for the vault path if you cannot see a `.glyphary` folder.

## Manifest rules for both runtimes

- `permissions` lists what the plugin uses, from `document:read`, `document:write`, `selection:read`, `selection:write`, `styles:load`, `vault:read`, and `vault:write`. An unknown value makes the plugin invalid.
- Every command needs an `id` and a `title` of 1 to 96 characters.
- File paths are relative to the plugin folder. Styles end in `.css`, templates in `.md`, `.markdown`, or `.txt`, modules in `.wasm`.
- At most 8 stylesheets, 8 panels, 8 renderers, 16 settings, and 32 commands.
- `timeoutMs` is clamped to the range 50 to 2000.
- In `insertMarkdown`, write newlines as the JSON escape `\n`. Glyphary's block syntax for callouts, columns, and the rest is documented at https://glyphary.github.io/.

## Transform plugins

```json
{
  "id": "meeting_tools",
  "name": "Meeting Tools",
  "runtime": "glyphary-wasm-transform@1",
  "version": "0.1.0",
  "description": "Commands and styles for meeting notes.",
  "permissions": ["document:write", "selection:read", "selection:write", "styles:load"],
  "styles": ["styles.css"],
  "commands": [
    {
      "id": "insert_decision",
      "title": "Insert Decision Callout",
      "insertMarkdown": "::: callout note \"Decision\"\nDecision:\n\nOwner:\n:::\n"
    },
    { "id": "insert_agenda", "title": "Insert Agenda", "template": "templates/agenda.md" },
    {
      "id": "sort_lines",
      "title": "Sort Selected Lines",
      "wasm": {
        "module": "plugin.wasm",
        "input": "selection",
        "output": "replaceSelection",
        "timeoutMs": 500
      }
    }
  ]
}
```

Each command needs one of `insertMarkdown`, `template`, or `wasm`. `wasm.input` is `selection` or `document`. `wasm.output` is `replaceSelection`, `insertAtCursor`, or `replaceDocument`.

For the code, copy the `template/` folder that ships with this skill and edit one function in `src/lib.rs`:

```rust
fn transform_text(input: &str) -> String {
    input.to_uppercase()
}
```

- With `input: "selection"` the function receives the selected text as plain text, without Markdown markers. An empty selection arrives as an empty string.
- With `input: "document"` it receives the note body as Markdown.
- The returned string is parsed as Markdown when it is inserted. An empty or blank result inserts nothing, so a transform cannot delete the selection.

## Host plugins

```json
{
  "id": "backlinks",
  "name": "Backlinks",
  "runtime": "glyphary-wasm-host@1",
  "module": "plugin.wasm",
  "timeoutMs": 500,
  "permissions": ["vault:read", "selection:write"],
  "events": ["save"],
  "panels": [{ "id": "linked_from", "title": "Backlinks", "icon": "M4 6h16M4 12h16M4 18h10" }],
  "renderers": ["backlinks"],
  "settings": [
    { "id": "heading", "title": "List heading", "default": "Linked from" },
    { "id": "order", "title": "Order", "type": "select", "options": ["A to Z", "Z to A"] },
    { "id": "insert_button", "title": "Show the insert button", "type": "switch", "default": "true" }
  ],
  "commands": [{ "id": "insert_backlinks", "title": "Insert Backlinks List" }]
}
```

`module` is required. One module answers every call. A command with no action of its own is sent to the module. `events` may contain `save` and `open`. `renderers` lists code block languages, as ids, other than `toc` and `mermaid`. Each setting has an `id`, a `title`, an optional `default`, and a `type`: `text` (the default), `switch`, or `select` with a list of `options`.

For the code, copy the `template-host/` folder and edit `run` in `src/lib.rs`. The sample there is a working backlinks plugin. Glyphary calls `run` with this JSON:

```json
{
  "event": "command",
  "id": "insert_backlinks",
  "note": { "path": "Projects/Plan.md", "markdown": "...", "selection": "..." },
  "settings": { "heading": "Linked from" },
  "round": 0,
  "responses": []
}
```

- `event` is `command`, `panel`, `render`, `save`, or `open`. `id` is the command or panel id, the language for `render`, and repeats the event name for `save` and `open`.
- `source` is present for `render` and holds the text inside the code block.
- `settings` holds every declared setting by id, always as text, with the user's value or the default. A switch is `"true"` or `"false"` and defaults to `"false"`. A select is one of its options and defaults to the first.
- `note` is the open Markdown note, or `null`. `markdown` is the body without frontmatter and is present only with `document:read`. `selection` is present only with `selection:read`. During `save` the note is the one just saved.

`run` returns one of two things.

To ask for vault data, it returns requests. This needs `vault:read`:

```json
{ "requests": [
  { "type": "readNote", "path": "Projects/Plan.md" },
  { "type": "listNotes" },
  { "type": "search", "query": "[[Plan" }
] }
```

Glyphary then calls `run` again with `round` one higher and one entry in `responses` per request, in the same order. An entry is `{ "ok": true, "value": ... }` or `{ "ok": false, "error": "..." }`. A missing note is an `ok: false` entry, so handle it.

| Request | `value` |
| --- | --- |
| `readNote` | `{ "path", "markdown" }`, the file as saved on disk, frontmatter included |
| `listNotes` | an array of `{ "path", "name" }` |
| `search` | up to 200 of `{ "path", "line", "text" }`. The query is literal and case-insensitive. A file name match has `line: null`. |

The module starts fresh on every round and remembers nothing. Decide what to do from `round` and `responses`. A call gets 4 rounds and 16 requests per round.

To finish, it returns actions, a panel, or both:

```json
{
  "actions": [
    { "type": "insertAtCursor", "markdown": "..." },
    { "type": "writeNote", "path": "Logs/Saved.md", "markdown": "..." },
    { "type": "status", "message": "Done" }
  ],
  "panel": { "markdown": "## Linked from\n- [[Projects/Plan.md|Plan]]" }
}
```

| Action | Needs | Allowed in |
| --- | --- | --- |
| `replaceSelection`, `insertAtCursor` | `selection:write` | commands |
| `replaceDocument` | `document:write` | commands |
| `openNote` with `path` | nothing | commands |
| `writeNote` with `path` and `markdown` | `vault:write` | commands, `save`, `open` |
| `status` with `message` | nothing | everything |

One action the manifest does not permit fails the whole call, and nothing is applied. Other limits:

- Note paths are vault-relative Markdown files. Folders that start with a dot, such as `.glyphary`, are out of reach.
- `writeNote` cannot target the open note, a locked note, or a note with unsaved edits in a tab. It replaces the whole file, so read the note first when appending. The parent folder must exist.
- `save` and `open` cannot edit the open note. That rule prevents a save from triggering itself.
- `panel` and `render` cannot write at all, because Glyphary draws them without the user asking.

### Panels and code blocks

Each panel gets its own tab in the right drawer. Give it an `icon` to choose what the tab shows: SVG path data, the content of a `d` attribute, drawn as a 2 pixel outline in a 24 by 24 box in the current text colour. Several shapes go in one string, each starting with `M`. SVG markup is rejected. Without an icon the tab shows the first two letters of the title. For a `panel` call, return `panel.markdown`. Glyphary calls again after a save, after the user switches notes, and when they press Refresh.

A `render` call works the same way. Glyphary sends the text of a fenced code block whose language the plugin declared, and draws the returned `panel.markdown` in place of the block. The user presses Edit, or moves the caret into the block, to see the source again. Blocks are drawn again after a save and after a note switch, so keep `render` fast.

Both understand a small subset:

- `## Heading` lines, `- bullet` lines, and plain paragraphs.
- `[[path/to/note.md|Label]]` or `[[Note name]]`, shown as a link that opens the note.
- `[Label](command:command_id)`, shown as a button that runs one of the plugin's commands.

Everything else, including images, tables, bold, and HTML, is shown as literal text.

## Build

```sh
rustup target add wasm32-unknown-unknown
cargo build --manifest-path <source>/Cargo.toml --release \
  --target wasm32-unknown-unknown --target-dir "${TMPDIR:-/tmp}/glyphary-plugin-target"
cp "${TMPDIR:-/tmp}/glyphary-plugin-target/wasm32-unknown-unknown/release/glyphary_plugin.wasm" \
  <vault>/.glyphary/plugins/<plugin id>/plugin.wasm
```

The target directory lives outside the vault so build output is never synced with the notes. Keep the Rust source wherever the user wants it. A `src/` folder beside `plugin.json` is fine, because Glyphary reads only the files the manifest declares.

The module runs with no imports. Crates that need time, randomness, files, network, or threads will not load. The Rust standard library's strings and collections are fine, and so are `serde` and `serde_json`. A panic aborts the call and the user sees an error, with nothing changed.

Another language works if it can produce a module with no imports that exports `memory`, `alloc(length) -> pointer`, and `transform(pointer, length) -> pointer`. The returned pointer addresses a little-endian `u32` byte length followed by that many UTF-8 bytes. Host plugins use the same three exports with JSON as the text.

## Test before handing over

Run the harness that ships with this skill against the installed folder. For a transform plugin:

```sh
node run-plugin.mjs <vault>/.glyphary/plugins/<plugin id> "text to transform"
```

Input can also be piped on stdin, which suits `document` commands. For a host plugin, name the call to make and the vault to answer requests from:

```sh
node run-plugin.mjs <vault>/.glyphary/plugins/<plugin id> \
  --event panel --id linked_from --vault <vault> --note Projects/Plan.md
```

`--event` takes `command`, `panel`, `render`, `save`, or `open`. `--selection "text"` sets the selection, `--source "text"` sets the code block text for `render`, and `--setting name=value` overrides a setting's default. The harness applies the manifest and permission rules Glyphary applies, prints each request, each action, and the panel, and reports timing. It only reads the vault: `writeNote` and editor actions are printed, never applied.

Fix every `invalid:` and `failed:` line. Try an empty input and a non-ASCII one, and for host plugins try a call with no `--note`.

The harness does not render Markdown or CSS. For snippets, templates, and styles, read the result once more against the syntax reference.

## Tell the user how to turn it on

Plugins are off until the user approves them:

1. Open the vault in Glyphary and open Settings.
2. Go to the Plugins tab and click Refresh.
3. Enable the plugin and save.

The Plugins tab lists each plugin's permissions, panels, events, and code block languages before it is enabled, and holds its settings. Commands then appear in the command palette, and each panel adds a tab to the right drawer. A rebuilt `plugin.wasm` is picked up on the next call. A changed manifest needs Refresh again.

## CSS

Plugin styles follow the same contract as CSS snippets, described at https://glyphary.github.io/theming.html. Use the documented variables and selectors, and scope rules tightly so the rest of the interface is left alone.
