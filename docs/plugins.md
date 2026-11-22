# Glyphary Plugin Authoring Guide

Glyphary plugins are vault-scoped packages that live under the vault's `.glyphary/plugins` directory. They can add command palette actions, load declared stylesheets, insert declared templates, and run short WASM text transforms. With the host runtime they can also read and write notes, show a panel in the right drawer, and run when a note is saved or opened.

The plugin system is intentionally narrow. Plugins do not get shell access, direct DOM access, arbitrary filesystem access, background daemons, or network access. A plugin can only use files declared in its own manifest and can only act through the commands, requests, and actions described here.

## Plugin Location

Each plugin has its own directory:

```text
<vault root>/.glyphary/plugins/<plugin id>/plugin.json
```

For example:

```text
.glyphary/plugins/meeting_tools/
  plugin.json
  styles.css
  templates/agenda.md
  plugin.wasm
```

The plugin directory name must match the manifest `id`.

## Enabling A Plugin

1. Copy the plugin directory into `<vault root>/.glyphary/plugins`.
2. Open the vault in Glyphary.
3. Open Settings.
4. Go to the Plugins tab.
5. Click Refresh if the plugin was added while Settings was already open.
   Each plugin lists its permissions, panels, events, and code block languages here before you enable it.
6. Enable the plugin.
7. Save Settings.

Enabled plugin commands appear in the command palette.

## Manifest

Every plugin must have a `plugin.json` file.

```json
{
  "id": "meeting_tools",
  "name": "Meeting Tools",
  "runtime": "glyphary-wasm-transform@1",
  "version": "0.1.0",
  "description": "Commands and styles for meeting notes.",
  "permissions": ["document:write", "styles:load"],
  "styles": ["styles.css"],
  "commands": [
    {
      "id": "insert_agenda",
      "title": "Insert Agenda",
      "description": "Insert a meeting agenda template.",
      "template": "templates/agenda.md"
    },
    {
      "id": "insert_decision_callout",
      "title": "Insert Decision Callout",
      "insertMarkdown": "::: callout note \"Decision\"\nDecision:\n\nOwner:\n:::\n"
    },
    {
      "id": "uppercase_selection",
      "title": "Uppercase Selection",
      "description": "Uppercase the current selection in a Web Worker.",
      "wasm": {
        "module": "plugin.wasm",
        "input": "selection",
        "output": "replaceSelection",
        "timeoutMs": 200
      }
    }
  ]
}
```

### Top-Level Fields

| Field | Required | Description |
| --- | --- | --- |
| `id` | Yes | Plugin id. Must match the directory name. |
| `name` | Yes | Display name shown in Settings. |
| `runtime` | Yes | Runtime identifier: `glyphary-wasm-transform@1` or `glyphary-wasm-host@1`. |
| `version` | No | Plugin version string. Stored as display metadata. |
| `description` | No | Short description shown in Settings. |
| `permissions` | No | Declared permissions. Unsupported values make the plugin invalid. |
| `styles` | No | Declared CSS files to load when the plugin is enabled. |
| `commands` | No | Command palette actions contributed by the plugin. |

### Id Rules

Plugin ids and command ids must:

- Use only ASCII letters, ASCII numbers, dash, or underscore.
- Be 1-80 characters.
- Avoid spaces and path separators.

Valid examples:

```text
meeting_tools
daily-notes
uppercase_selection
```

Invalid examples:

```text
Meeting Tools
../plugin
notes.plugin
```

### Runtime

There are two runtimes:

```text
glyphary-wasm-transform@1
glyphary-wasm-host@1
```

The first is Glyphary's raw WASM transform ABI. The second uses the same ABI to carry JSON and is described under [Host Runtime](#host-runtime). Neither is WASI or Extism. Runtime versioning is separate from the plugin's own `version`; future runtimes should use different runtime identifiers so Glyphary can reject unsupported plugins cleanly.

### Permissions

Supported permissions are:

```text
document:read
document:write
selection:read
selection:write
styles:load
vault:read
vault:write
```

For transform plugins, permissions are declarative. They communicate intent and prevent unknown capabilities from being silently accepted. The host runtime enforces them on every call.

### Declared File Paths

Manifest file paths must be relative to the plugin directory. Paths are normalized and must not escape the plugin directory.

Supported extensions:

| Field | Extensions |
| --- | --- |
| `styles` | `.css` |
| `template` | `.md`, `.markdown`, `.txt` |
| `wasm.module` | `.wasm` |

Examples:

```json
{
  "styles": ["styles.css"],
  "commands": [
    {
      "id": "insert_template",
      "title": "Insert Template",
      "template": "templates/note.md"
    }
  ]
}
```

## Command Actions

Each command must have an `id`, a `title`, and at least one action.

Supported actions:

| Action | Description |
| --- | --- |
| `insertMarkdown` | Inserts literal Markdown at the current cursor or selection. |
| `template` | Reads a declared template file and inserts it at the current cursor or selection. |
| `wasm` | Runs a pure WASM transform in a Web Worker. |

`title` must be 1-96 characters. `description` is optional and is truncated to 180 characters.

### Insert Literal Markdown

```json
{
  "id": "insert_status_callout",
  "title": "Insert Status Callout",
  "insertMarkdown": "::: callout info \"Status\"\n\n:::\n"
}
```

Use this for small snippets that do not need separate files.

### Insert A Template

```json
{
  "id": "insert_retro",
  "title": "Insert Retro Template",
  "template": "templates/retro.md"
}
```

The template file is read through the backend and must be declared in the manifest. Use this when Markdown is long enough that keeping it in JSON would be hard to maintain.

### Run A WASM Transform

```json
{
  "id": "uppercase_selection",
  "title": "Uppercase Selection",
  "wasm": {
    "module": "plugin.wasm",
    "input": "selection",
    "output": "replaceSelection",
    "timeoutMs": 200
  }
}
```

WASM commands run off the UI thread in a Web Worker. Each command run gets a fresh worker and WASM instance. This keeps plugin memory isolated and lets Glyphary terminate stuck transforms.

Supported `input` values:

| Value | Meaning |
| --- | --- |
| `selection` | Pass the current editor selection to the plugin. |
| `document` | Pass the current document Markdown to the plugin. |

Supported `output` values:

| Value | Meaning |
| --- | --- |
| `replaceSelection` | Replace the current selection with the plugin output. |
| `insertAtCursor` | Insert the plugin output at the current cursor. |
| `replaceDocument` | Replace the current document with the plugin output. |

`timeoutMs` is clamped between `50` and `2000` milliseconds.

## WASM Transform ABI

Runtime `glyphary-wasm-transform@1` loads a raw WebAssembly module with no imports:

```ts
WebAssembly.instantiate(bytes, {})
```

The module must export:

```text
memory
alloc(length) -> pointer
transform(pointer, length) -> outputPointer
```

It may also export:

```text
dealloc(pointer, length)
```

Input:

- Glyphary encodes the selected input as UTF-8.
- Glyphary calls `alloc(inputLength)`.
- Glyphary copies the UTF-8 bytes into exported `memory` at the returned pointer.
- Glyphary calls `transform(inputPointer, inputLength)`.

Output:

- `transform` returns a pointer into exported `memory`.
- That pointer must point to a little-endian `u32` output byte length.
- The UTF-8 output bytes must start immediately after that 4-byte length.

Memory layout:

```text
outputPointer
  +0  u32 little-endian output byte length
  +4  UTF-8 output bytes
```

After decoding the output, Glyphary calls `dealloc` for the input and output buffers if the export exists.

## Host Runtime

Runtime `glyphary-wasm-host@1` is for plugins that need more than a text transform. A host plugin can read, list, and search notes, write notes, show panels in the right drawer, render its own code blocks, take settings from the user, and run when a note is saved or opened. The sample is `examples/plugins/backlinks`.

```json
{
  "id": "backlinks",
  "name": "Backlinks",
  "runtime": "glyphary-wasm-host@1",
  "module": "plugin.wasm",
  "timeoutMs": 500,
  "permissions": ["vault:read", "selection:write"],
  "events": ["save"],
  "panels": [{ "id": "linked_from", "title": "Backlinks" }],
  "renderers": ["backlinks"],
  "settings": [{ "id": "heading", "title": "List heading", "default": "Linked from" }],
  "commands": [{ "id": "insert_backlinks", "title": "Insert Backlinks List" }]
}
```

| Field | Required | Description |
| --- | --- | --- |
| `module` | Yes | The WASM module that answers every call. |
| `timeoutMs` | No | Time allowed for each round of a call, clamped between `50` and `2000`. |
| `events` | No | `save`, `open`, or both. The module is called after a note is saved or opened. |
| `panels` | No | Up to 8 panels, each with an `id`, a `title`, and an optional `icon`. Each gets its own tab in the right drawer. |
| `renderers` | No | Up to 8 code block languages the module renders. `toc` and `mermaid` are reserved. |
| `settings` | No | Up to 16 settings, each with an `id`, a `title`, an optional `default`, and a `type`. The user edits them under Settings, Plugins. |
| `commands` | No | A command with no action of its own is sent to the module. `insertMarkdown` and `template` still work. |

### Settings

A setting's `type` decides the control Glyphary shows and the text the module receives:

| Type | Control | Value |
| --- | --- | --- |
| `text` | Text field. This is the default type. | The text. |
| `switch` | Switch. | `"true"` or `"false"`. The default is `"false"`. |
| `select` | Dropdown of `options`, 1 to 32 entries. | The chosen option. The default is the first. |

```json
"settings": [
  { "id": "heading", "title": "List heading", "default": "Linked from" },
  { "id": "order", "title": "Order", "type": "select", "options": ["A to Z", "Z to A"] },
  { "id": "insert_button", "title": "Show the insert button", "type": "switch", "default": "true" }
]
```

A default that the type does not allow makes the plugin invalid.

### The Call

The module exports the same `memory`, `alloc`, and `transform` as a transform plugin, and still has no imports. The text passed to `transform` is JSON:

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

`event` is `command`, `panel`, `render`, `save`, or `open`. `id` is the command or panel id, or the language for `render`. A `render` call also carries `source`, the text inside the code block. `settings` holds every declared setting by id, with the user's value or the default. `note` is the open Markdown note or `null`. Its `markdown` is the body without frontmatter and needs `document:read`. Its `selection` needs `selection:read`.

### Requests

A module cannot call Glyphary. To get vault data it returns requests, and Glyphary calls it again with the answers:

```json
{ "requests": [
  { "type": "readNote", "path": "Projects/Plan.md" },
  { "type": "listNotes" },
  { "type": "search", "query": "[[Plan" }
] }
```

The next call has `round` one higher and one entry in `responses` per request, in the same order. Each entry is `{ "ok": true, "value": ... }` or `{ "ok": false, "error": "..." }`.

| Request | `value` |
| --- | --- |
| `readNote` | `{ "path", "markdown" }`, the file as saved on disk, frontmatter included. |
| `listNotes` | An array of `{ "path", "name" }`. |
| `search` | Up to 200 of `{ "path", "line", "text" }`. The query is literal and case-insensitive. A file name match has `line: null`. |

Requests need the `vault:read` permission. The module starts fresh on every round, so it decides what to do from `round` and `responses`. A call gets 4 rounds and 16 requests per round.

### Actions And Panels

A call ends when the module returns no requests. It may return actions, a panel, or both:

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

| Action | Permission | Allowed in |
| --- | --- | --- |
| `replaceSelection`, `insertAtCursor` | `selection:write` | Commands |
| `replaceDocument` | `document:write` | Commands |
| `openNote` | None | Commands |
| `writeNote` | `vault:write` | Commands, `save`, `open` |
| `status` | None | Every call |

Glyphary checks every action before applying any. One action the manifest does not permit fails the whole call.

`writeNote` replaces a whole file. It cannot target the open note, a locked note, or a note with unsaved edits in a tab. Note paths are vault-relative Markdown files, and folders that start with a dot, such as `.glyphary`, are out of reach.

A panel's `icon` is SVG path data, the content of a `d` attribute, for example `"M4 6h16M4 12h16M4 18h10"`. Glyphary draws it as a 2 pixel outline in a 24 by 24 box in the current text colour, like its own drawer icons. SVG markup is rejected, which keeps plugin files out of the window. Without an icon the tab shows the first two letters of the title.

A panel is Markdown that Glyphary draws itself. It understands headings, bullets, paragraphs, `[[note|label]]` links that open a note, and `[label](command:command_id)` buttons that run one of the plugin's commands. Everything else is shown as literal text, so a panel cannot load images or markup. Glyphary asks for the panel again after a save, after a switch to another note, and when Refresh is pressed.

A code block in a declared language is drawn the same way. Glyphary sends a `render` call with the block's text and shows the returned `panel.markdown` in place of the block until the caret moves into it. Blocks are drawn again after a save and after a note switch. Panels and code blocks are drawn without the user asking, so `panel` and `render` calls cannot write notes.

## Rust Example

The sample Rust plugin lives at:

```text
examples/plugins/uppercase_selection_rust
```

Build it:

```sh
rustup target add wasm32-unknown-unknown
cargo build --manifest-path examples/plugins/uppercase_selection_rust/Cargo.toml \
  --release \
  --target wasm32-unknown-unknown
cp examples/plugins/uppercase_selection_rust/target/wasm32-unknown-unknown/release/glyphary_uppercase_selection_plugin.wasm \
  examples/plugins/uppercase_selection_rust/plugin.wasm
```

Install it into a vault:

```sh
mkdir -p /path/to/vault/.glyphary/plugins
cp -R examples/plugins/uppercase_selection_rust /path/to/vault/.glyphary/plugins/
```

The Rust sample does not use `wasm-bindgen` or JavaScript glue. It exports the raw ABI directly and uses a small bump allocator.

## Generated WASM Example

The dependency-free generated sample lives at:

```text
examples/plugins/uppercase_selection
```

Rebuild it:

```sh
node examples/plugins/uppercase_selection/build-wasm.mjs
```

Install it into a vault:

```sh
mkdir -p /path/to/vault/.glyphary/plugins
cp -R examples/plugins/uppercase_selection /path/to/vault/.glyphary/plugins/
```

This sample is useful for validating the end-to-end ABI without installing a WASM language toolchain.

## Writing A Plugin With An AI Assistant

The repository ships an agent skill at `skills/glyphary-plugin`. It gives a coding assistant such as Claude Code the manifest rules, a Rust template for each runtime where one function holds the logic, and a harness that checks a plugin folder and runs its WASM outside Glyphary.

Install it for Claude Code by copying the folder:

```sh
cp -R skills/glyphary-plugin ~/.claude/skills/
```

Then describe the plugin you want and name the vault it is for. Other assistants can read `skills/glyphary-plugin/SKILL.md` directly.

The harness is useful without an assistant too:

```sh
node skills/glyphary-plugin/run-plugin.mjs /path/to/vault/.glyphary/plugins/my_plugin "some text"
```

It reports every manifest rule the plugin breaks, then prints the output and timing of each WASM command for the given input.

For a host plugin, name the call and a vault to answer requests from. The vault is only read:

```sh
node skills/glyphary-plugin/run-plugin.mjs examples/plugins/backlinks \
  --event panel --id linked_from --vault /path/to/vault --note Projects/Plan.md
```

## Plugin Styles

Plugins can declare stylesheets:

```json
{
  "permissions": ["styles:load"],
  "styles": ["styles.css"]
}
```

Glyphary loads declared styles only when the plugin is enabled. Styles are injected after built-in styles. Plugin styles should follow the same public styling contract as CSS snippets; see [the theming reference](theming.md).

Glyphary marks injected plugin styles with metadata:

```html
<style data-glyphary-plugin="plugin_id" data-glyphary-plugin-style="styles.css">
```

That marker is for inspection and debugging. Do not rely on it as the primary way to style editor content.

## Validation Limits

Current limits:

- Plugin manifest must be named `plugin.json`.
- Manifest id must match the plugin directory name.
- Manifest runtime must be `glyphary-wasm-transform@1` or `glyphary-wasm-host@1`.
- `module`, `events`, `panels`, `renderers`, and `settings` are valid only with the host runtime, which requires `module`.
- A plugin may declare at most 8 panels, 8 renderers, and 16 settings.
- Plugin id and command ids must be 1-80 characters.
- Plugin name must be 1-96 characters.
- Plugin description is truncated to 240 characters.
- Command descriptions are truncated to 180 characters.
- Plugin version is truncated to 40 characters.
- A plugin may declare at most 8 stylesheets.
- Glyphary reads at most 32 commands from a manifest.
- Manifest file paths must be 1-180 characters after normalization.
- Unknown runtimes, permissions, input modes, output modes, and file extensions make the plugin invalid.

Invalid plugins are shown as catalog errors in Settings. They are not enabled and do not contribute commands.

If an older plugin shows a missing runtime error, add this top-level field to `plugin.json`:

```json
"runtime": "glyphary-wasm-transform@1"
```

## Security Model

The system is designed for small, fast, local plugins:

- Plugins are installed per vault.
- Plugins are disabled until approved in Settings.
- Plugin files are restricted to their own plugin directory.
- Plugin styles and assets must be declared in the manifest.
- WASM runs in a Web Worker with no imports.
- WASM commands receive only the selected input mode.
- WASM commands have bounded timeouts.
- A host plugin reaches the vault only by asking Glyphary, which checks each request and action against the declared permissions.
- Host plugins see Markdown notes only. Dot folders such as `.glyphary`, where settings and plugins live, are out of reach.
- A host plugin cannot write a locked note or overwrite unsaved edits.
- Panels are drawn by Glyphary from a small Markdown subset, so plugin output never becomes HTML.

This keeps the plugin surface predictable. Network access, custom HTML, and background work are still out of reach. If plugins ever need them, they should arrive as a new runtime or an explicit permission.

## Practical Recommendations

- Use `insertMarkdown` for tiny fixed snippets.
- Use `template` for larger Markdown insertions.
- Use WASM only for deterministic text transforms.
- Keep WASM transforms small and fast.
- Prefer `selection` input and `replaceSelection` output unless a command truly needs the whole document.
- Keep plugin styles scoped to documented editor selectors.
- Include a short README in each plugin directory so users know what commands are added and what permissions mean.
