# Glyphary 1.0.0-beta.9 Release Notes

This beta adds a Today's dashboard for the tasks due and overdue, notes you can lock, pictures in frontmatter and beside people links, a light and a dark theme per vault with custom themes you can build and keep, and clippings that match the Obsidian Web Clipper's frontmatter. It also fixes a bug where a note could be overwritten with the welcome text while a vault was restoring.

## What's New Since 1.0.0-beta.8

### Today's Dashboard

- Run **Today's Dashboard** from the command palette. It shows the date, the open tasks due today, and the ones that slipped, oldest first with priority as the tie-break. Tick a row to complete the task in its note, the same way the board does, or click it to open the note. A Refresh button rescans the vault.
- Only tasks with a `📅` due date are listed, and the archive note is left out, as on the board.

### Locked Notes

- **Lock Note** in the command palette writes `locked: true` to the note's frontmatter. While it is set, the editor refuses every change: typing, the margin `+` button, the Insert menu, slash commands, drops, and AI rewrites. A banner above the note offers Unlock, which removes the property again.
- The lock is part of the file, so it travels with the vault and shows up in Obsidian's properties.

### Pictures And Switches In Frontmatter

- A property named `photo`, `image`, `avatar`, `cover`, `picture`, or `thumbnail`, or any property whose value names an image, shows a thumbnail, a Choose... button that copies a picture from disk into the vault's image folder, and takes a picture dropped from Finder onto the row. The value is written as `"[[file.jpg]]"`, the form Obsidian uses, and quoted values now resolve to the file.
- A property whose value is `true` or `false` is edited with a switch.
- A wikilink to a note under `People/` whose frontmatter names a `photo`, `image`, or `avatar` shows that picture beside the link. The Markdown is untouched, a link that could mean more than one note shows no picture, and pictures update after any save in the vault.

### Themes

- A vault now picks a light theme and a dark theme, and the appearance mode decides which one applies. Picking a theme previews it live; closing Settings without saving reverts it.
- The Theme Builder starts from any theme and saves the result as a named custom theme. Custom themes sit in the light or dark grid beside the built-ins, can be edited or deleted, and are shared by every vault on this machine. The vault stores only the theme's id. On a machine without that custom theme, the Cupertino theme of the same base is shown instead.
- The tidbit capture window follows the vault's theme for the current mode.
- Toggles in Settings and the frontmatter editor are drawn as switches.

### Editing

- Fixed: a note could be overwritten with the welcome text. When settings loaded during vault restore rebuilt the editor, a tab could be read from the editor that was never hydrated, and autosave wrote the placeholder to disk. The live editor is now always the one hydrated, and the placeholder is never taken as a note's content.
- Shift+Up and Shift+Down from a selected block (a rich link, a table, a drawing) extend the selection across the block into the text beyond it, and Backspace deletes the whole selection. Each block the selection covers is outlined. Before, the block fell out of the selection on the first press.
- A wikilink shows its brackets only while the caret is inside it. Before, every link on the active line showed its raw syntax.
- Clicking a rich link card opens its URL in the browser.
- Opening a note by clicking a calendar day or a file row no longer leaves a stray caret in the top left corner of the editor.
- The calendar highlights the day whose note is open, and its Today button opens today's note instead of only showing the month.
- The graph applies its starting zoom when it opens.

### Web Clipper

- Clippings follow the Obsidian Web Clipper's default template, so a vault shared with it holds one shape of clipping: `author` is a list of wikilinks, `published` and `created` are dates, and the note gains `sourcetype: default`, `reviewed: false`, `cover` with the page's share image, and `permalink`. The `clipped` property is replaced by `created`.
- The Chrome extension has moved to its own repository, `glyphary-web-clipper`, and is packaged for the Chrome Web Store. Its popup gains a source type (`article`, `default`, `github`, `link`, `video`, or a word of your own), remembered per category, with GitHub and video pages preselected. When a page has a share image, the extension saves it the way the Obsidian Featured Image plugin does: the original under `thumbnails/external/`, a 256x144 WebP under `thumbnails/resized/`, referenced from `feature` and `thumbnail`.

### Known Beta Limitations

- A theme tuned token by token in an earlier beta is not carried over. Rebuild it in the Theme Builder and save it as a custom theme.
- Completing a task from the dashboard while its note has unsaved edits removes the row although the note was not changed. Refresh brings it back.
- Base support is a documented subset of Obsidian Bases, not the full engine. Only simple filter leaves are edited as fields; other conditions are edited as expression text.
- The graph counts `#tags` inside fenced code, and its legend matches tags exactly rather than by hierarchy.
- The web clipper fetches pages cold, so pages behind logins or rendered by JavaScript clip poorly from the app. Use the extension for those.
- Live preview in Obsidian only exposes a tag's root segment, so an exported tag colour for a nested tag shows its root's colour there.
- Obsidian Sync skips `.excalidraw` files unless "Sync all other types" is enabled on every device.
- The Windows installer is unsigned, so SmartScreen shows an "unrecognized app" prompt on first launch.

### Engineering

- Theme palettes left the Rust side. Vault settings keep two theme ids, and the token allowlist and value validation went with the per-vault token overrides.
- Note locking, the theme library, the dashboard, people photos, and image-valued frontmatter are separate modules; the task scan, task labels, and theme lists are shared instead of copied.
- Comments added this cycle explain a constraint or a reason, and restating comments were removed.
- Frontend contract tests grew to 146 and Rust tests to 84. Block selection was verified in headless WebKit and Chromium.
