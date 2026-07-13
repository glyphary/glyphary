# Glyphary 1.0.0-beta.5 Release Notes

This beta expands Glyphary from a single-vault Markdown editor into a more
complete desktop knowledge workspace. The main additions are remembered vaults,
starred files, Base views, structured frontmatter editing, and much deeper
macOS integration.

## What's New Since 1.0.0-beta.4

### Vaults, Files, And Navigation

- Added a vault library that remembers opened folders and switches between them without reopening the system picker:
  Each vault now restores its own current folder, open and recent files, active page, drawer state, and split layout.
  Vault library entries can use custom cover images and can be forgotten without deleting the vault on disk.
- Added a Starred view for notes, canvases, and Base files. Starred items can be reordered by dragging.
  Starred paths follow renamed or moved files and folders, and deleted files are removed from the list.
- Added optional file-tree previews with note excerpts and first-image thumbnails.
  Added settings for showing files inside folder trees, preview images, and the folder-tree background.
- Added rendered calendar-note previews on hover, including an empty-state preview for days without a note and a configurable preview delay.

### Frontmatter And Markdown Editing

- Replaced the freeform frontmatter textarea with one single-line editor row per property.
  Frontmatter properties can now be added, renamed, edited, and removed without exposing the raw metadata block.
  Tags and other detected multi-value properties are edited as individual pills, with support for inline arrays and YAML block lists.
  YAML and TOML frontmatter delimiters and unrelated source lines remain preserved during row edits.
- Fixed Markdown tables so the pipe in a wikilink alias such as `[[Page|Display text]]` stays inside its table cell.
- Fixed cursor movement around rendered block widgets so users can enter and leave surrounding text without becoming trapped or skipping an insertion point.
- Fixed rendering in the standalone Tidbit capture window.

### Base Files And Canvas

- Added support for opening Obsidian-compatible `.base` files as local database-style views over Markdown frontmatter.
  Base files can contain multiple named table or gallery views.
- Gallery cards can render local or remote note images, with side or top image layouts.
- Added Base result counts, title search, ascending and descending property sorting, and controls for choosing visible properties.
- Clicking a Base table row or gallery card opens its source note.
- Base and canvas files participate in recent files, starring, reordering, native file actions, and tab restoration like Markdown notes.

### Native macOS Integration

- Added native File, Edit, Insert, Format, View, Window, and Help menus with current enabled and checked states.
- Added native Open Recent, tab navigation, drawer toggles, appearance choices, table commands, and active-file actions.
- Vault entries, tables, Base controls, and vault-library items now use native context menus when available.
- Settings now opens in a dedicated window on macOS.
- Added native file associations and Open With handling for Markdown, Canvas, and Base files inside the current vault.
- Added Open in Default App, Reveal in Finder, and Copy Path actions for files and folders.
- Added an optional title-bar document proxy with active-file actions and dirty state.
- Reworked title-bar layout, traffic-light placement, drag regions, native window material, window restoration, and single-instance file opening.

### Appearance And Settings

- Added the optional title-bar document proxy and folder-tree background controls.
- Reduced the strength of glass overlays so native material remains visible without washing out the editor.
  Kept Settings, command palettes, and other decision surfaces opaque for readability.

### Engineering And Reliability

- Reduced the main app shell by moving editor, search, vault state, tasks, command-palette, and Excalidraw code into focused modules.
- Split Settings, theme controls, vault context menus, and file-action helpers out of the main app shell.
- Fixed startup update checks to compare the running version with GitHub's latest published release.
- Added a real-app Tauri smoke-test harness with a self-test mode and an owned scratch-note workflow.
- Added regression coverage for per-vault sessions, vault-library persistence, Base queries, file previews, native menus, frontmatter rows and pills, and
  wikilink aliases inside tables.
- Pinned patched DOMPurify and Lodash ES releases used by the Markdown and diagram dependency tree.

## Notes

`1.0.0-beta.5` is still a beta because it changes workspace persistence, frontmatter serialization, Markdown table parsing, Base queries, and native window behavior. Test it against a real vault and keep a normal backup before replacing a daily build.
