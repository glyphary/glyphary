# Glyphary 1.0.0-beta.8 Release Notes

This beta is about seeing and working across the vault rather than inside one note: a link graph, Bases you can build and edit, a Kanban board for tasks with Obsidian Tasks metadata, tag and people completion, tag colours, a web clipper with a Chrome extension, and a serializer fix that stops notes from being damaged on save.

## What's New Since 1.0.0-beta.7

### Graph View

- Open a global graph of every note and its links with `Cmd+G`, or a local graph of the notes around the current one with `Cmd+Shift+G`. Both are also in the command palette and the View menu.
- Nodes are coloured by cluster, tags can filter the graph, and a globe mode wraps the same layout onto a sphere.
- The graph never keeps an index. Each open rescans the vault, which takes well under a second even for very large vaults.

### Bases

- Create a `.base` file from a folder's context menu and edit it structurally: views, filters, `order:`, `sort:`, `limit:`, and the card image property, all with normal dirty state and an explicit save.
- Filters support nested `and`, `or`, and `not` groups at the base level and per view, evaluated in order, with `==`, `!=`, comparisons, and `contains`.
- Formulas follow the Obsidian Bases syntax and function set: typed values, dates and durations, memoised per note, with cycle detection and problems reported in the editor's "Base problems" list.
- The editor pane follows macOS conventions, and filter rows have proper contrast in dark mode.

### Tasks

- **Task Board**: a Kanban window with To Do, In Progress, and Done columns over every task in the vault. Drag a card or use its arrows to change the checkbox marker in the note; a note with unsaved edits refuses the move until saved, and a clean open tab reloads. Clicking a card opens the note in the main window.
- **Sorting and metadata**: cards read the Obsidian Tasks emoji format. Priority and due date show on the card, overdue in red, and every column can be sorted by priority, due date, or recent update.
- **Archiving**: the archive button on a Done card cuts the task and its sub-bullets out of the note and appends them to an archive note, stamped with the source and date. The archive note is configurable in Settings and is excluded from the board. Done shows the newest 25 finishes with a Show All button at the foot of the column.
- **Quick entry**: on a task line, `+` at the start of a word opens a menu of priorities and due shortcuts (calendar, today, tomorrow, next week). `/due`, `/scheduled`, and `/start` in the slash menu, or typing a date emoji, open a calendar at the caret that writes `📅 2026-09-27`.
- **Status markers**: Obsidian-style `[/]`, `[-]`, `[>]`, `[?]` and any other single-character marker render as status boxes and survive editing.
- **Drawer**: the Tasks drawer remembers its sort per vault.

### Tags And People

- Typing `#` at the start of a word drops a list of the vault's tags under the caret, most used first, filtering as you type. Enter, Tab, or a click completes it, and Enter on a tag nobody used yet keeps what you typed.
- Notes under `People/` are people. Typing `@` completes them the same way and writes a plain `[[Name]]` link.
- Inline `#tags` in note text render as pills, like frontmatter tags.
- Pick a colour per tag from the Tags drawer. Nested tags inherit it, and the colour shows on inline tags, frontmatter pills, and the drawer. Unpicked tags stay neutral. Settings → Export writes the picks as an Obsidian CSS snippet so the vault looks alike in both apps.
- A Tags drawer lists every tag with its notes, and the Recent drawer gained an activity heatmap with hover tooltips.

### Web Clipper

- Clip a web page by URL from the command palette, through a `glyphary://clip` deep link, or with a bookmarklet you can copy from the palette. Pages land in `Clippings/` as Markdown with the same frontmatter Obsidian's clipper writes; a selection clips as a quote.
- A companion Chrome extension, in `browser-extension/`, clips the current tab straight to disk using Defuddle for extraction. It supports categories mapped to vault folders, tags, an optional "open in Glyphary" hand-off, and ships with store listing material.

### Editing

- **Fixed: notes are no longer damaged on save.** The Markdown serializer backslash-escaped `[[links]]`, `#tags`, `a_b`, and `*`, and HTML-encoded `<` and `&`, on every save. Text now round-trips exactly as typed, and a note that an earlier build saved as `\[\[Note\]\]` reads back as `[[Note]]` and is repaired on its next save.
- Table column widths follow the Pandoc convention: the dash counts in the separator row set the columns' relative widths, and dragging a column border works in the visual editor.
- `- [ ] ` converts a bullet into a task item, and typing through the slash menu keeps the keystroke.
- Image properties accept bare wikilinks, `photo: "[[file.jpg]]"`, the way Obsidian writes them.

### Windows And Drawers

- Settings and the Task Board open as their own windows and stay in sync with the main window. Closing the main window now exits the app even when they are open.
- A gear at the foot of the vault rail opens Settings.
- The inspector drawer can be pinned, or left unpinned to reveal on hover.
- The folder tree refreshes after deleting a file in a nested folder.
- The Settings checkboxes for Vim mode and the slash menu no longer throw when toggled.

### Known Beta Limitations

- Base support is a documented subset of Obsidian Bases, not the full engine. Only simple filter leaves are edited as fields; other conditions are edited as expression text.
- The graph counts `#tags` inside fenced code, and its legend matches tags exactly rather than by hierarchy.
- The web clipper fetches pages cold, so pages behind logins or rendered by JavaScript clip poorly from the app. Use the extension for those.
- Live preview in Obsidian only exposes a tag's root segment, so an exported tag colour for a nested tag shows its root's colour there.
- Obsidian Sync skips `.excalidraw` files unless "Sync all other types" is enabled on every device.
- The Windows installer is unsigned, so SmartScreen shows an "unrecognized app" prompt on first launch.

### Engineering

- The Bases engine (reader, writer, expression parser, and evaluator) lives in `base.rs` and `base_expr/` with its own test suites.
- The task board, inline completion, task field pickers, window opening, and cross-window notices are modules with explicit dependencies; App.tsx only wires them.
- Card dragging is pointer-based because HTML5 drag and drop snaps back inside the WebKit webview.
- Every comment in code added this cycle explains a constraint or a reason; restating comments were removed.
- Frontend contract tests grew to 131 and Rust tests to 83, with pure-function tests for peer-window notices, completion rows, task metadata, archiving, and the Markdown round trip verified in headless Chromium.
