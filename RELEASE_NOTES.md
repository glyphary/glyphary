# Glyphary 1.0.0-beta.7 Release Notes

This beta focuses on writing flow: a slash command menu, a distraction-free focus mode, a new Apple-editorial theme pair, smarter search, and a round of Excalidraw and editor fixes. It also lands a large internal restructuring of the app shell that makes future work safer.

## What's New Since 1.0.0-beta.6

### Slash Commands And First-Use Hints

- Type `/` at the start of a line or after a space to open a caret-anchored menu of the Insert and AI commands. Type to filter, Enter to run, Escape to keep the plain slash.
- The slash menu is on by default and can be turned off per vault in Settings → Editor.
- Glyphary now shows a one-time hint the first time you use a feature that deserves an explanation (the slash menu and the Source drawer today). Hints can be disabled or reset from the new Settings → Hints section.

### Focus Mode

- Enter Focus Mode from the command palette or View → Focus Mode to hide the file drawer, inspector, tabs, formatting toolbar, frontmatter, and titlebar icons other than Save and the command palette. Drawer widths, open tabs, and scroll positions come back exactly as they were when you exit.

### Themes And Appearance

- Added the **Cupertino** and **Cupertino Dark** theme templates: white or graphite surfaces, one vivid blue accent, system fonts, subtle shadows, and ink-dark code colors for the light variant.
- Picking a theme template now switches light or dark mode to match it, and closing Settings without saving reverts both the preview and the mode.
- The Theme Builder exposes shadow, highlight, and list-marker colors, plus two new theme options: hide the accent border around the active note, and cast a shadow from the file drawer.
- The selected file in the drawer now uses the theme accent, and every template ships with a full-width editor by default.
- Settings saves now close the dialog on success and show the failure reason inside the dialog when a save is rejected.

### Editing

- `==text==` expands to a highlight while typing, and `~~text~~` strikes through without needing a leading space.
- The formatting menu, code block picker, and syntax highlighting cover 40 languages including Go, C, C++, Java, C#, Swift, Kotlin, PHP, Ruby, YAML, TOML, Dockerfile, diff, Makefile, Lua, Perl, R, Scala, Haskell, PowerShell, GraphQL, LaTeX, Protobuf, Dart, and Elixir, with common fence aliases.
- Mermaid syntax errors stay inside the diagram block instead of injecting a full-width error banner into the page.
- Insertion `+` controls now appear between adjacent callouts, columns, and collapsible blocks, and opening a note places the caret in the editor immediately.
- Improved modal dialogs and anchored popovers, and native file drag and drop into the editor and between split panes.
- Obsidian-style `glyphary://open` deep links open a vault file from other apps.

### Search

- Multi-word queries in the vault drawer now find notes containing every word, in any order, while regular expression search still works per term.
- Results are sorted newest-first before the result cap is applied, so recently edited notes are never pushed out of large result sets.

### AI

- New **AI: Diagram from selection or note** generates an editable Mermaid diagram (flowchart, sequence, or state) below the source text, reviewed before insertion.
- New **AI: Humanize selection** rewrites AI-sounding prose using the patterns from Wikipedia's "Signs of AI writing" while keeping every claim intact.

### Excalidraw

- Saving a drawing no longer leaves it marked as unsaved; the dialog shows a Saved confirmation and disables Save until the next edit.
- Notes with embedded drawings no longer flicker when you return to them, and preview failures now show the actual reason.
- Drawing previews render offline: Excalidraw fonts ship with the app instead of loading from a CDN.

### Known Beta Limitations

- Obsidian Sync skips `.excalidraw` files unless "Sync all other types" is enabled on every device; drawings created on one machine will otherwise appear as missing previews on another.
- The Windows installer is unsigned, so SmartScreen shows an "unrecognized app" prompt on first launch.

### Engineering

- `App.tsx` shrank by about 1,850 lines: Excalidraw sessions, AI commands, the command palette catalog, and vault file operations now live in dedicated modules with explicit dependencies.
- Frontend contract tests were split into nine domain files, and a parity test guarantees every Theme Builder token is accepted by the Rust settings allowlist.
- Theme options and code block languages are each defined in a single table that drives both the UI and the underlying behavior.
