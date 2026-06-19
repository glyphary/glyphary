# Glyphary 1.0.0-beta.1 Release Notes

This release is a large step forward from `0.1.0`, focused on making Glyphary feel like a serious local-first Markdown workspace: richer editing, AI-assisted page building, Obsidian-compatible canvas support, faster navigation, better packaging, and more polished app chrome.

## Highlights

### AI Builder

Glyphary now includes an AI Builder for creating and refining page sections from natural-language prompts.

- Supports bring-your-own-key OpenAI-compatible backends.
- Can generate rich Markdown content, including Glyphary-native blocks.
- Can search bounded vault context when the prompt asks about related notes.
- Supports follow-up refinement of previously inserted AI Builder blocks.
- Preserves AI Builder history per file.
- Adds review actions before applying generated content.

### Obsidian Canvas Support

Glyphary can now open and edit Obsidian-compatible `.canvas` files.

- Render canvas files as editable graph documents.
- Add cards, notes, media, web pages, and groups.
- Move nodes and edit edges.
- Delete selected nodes/edges with keyboard shortcuts.
- Use right-click canvas actions.
- Configure canvas appearance, including edge style, stroke width, node borders, and minimap visibility.
- Preserve unknown canvas JSON fields for safer round-tripping.

### Better Command Palette

The command palette has been reorganized into cleaner command groups.

- Contextual command groups for AI, Insert, Table, and Canvas actions.
- Better keyboard navigation, including scrolling selected results into view.
- Canvas mode now shows canvas-relevant commands instead of Markdown-only commands.
- Insert commands include rich blocks such as callouts, columns, HTML blocks, table of contents, gallery layout, and rich links.

### Tasks View

The left drawer now has a Tasks view.

- Finds Markdown task-list items across the vault.
- Filters complete, incomplete, or all tasks.
- Defaults to incomplete tasks.
- Supports quick filtering and sorting by name or date.
- Uses internal search logic, avoiding an external `rg` dependency.
- Ignores dotfiles/dotfolders and non-Markdown files for task scans.

### Visual Editing Improvements

- Added gallery blocks for selected images.
- Improved insertion points between special blocks.
- Improved HTML block insertion and rendering.
- Improved table, callout, columns, collapse, rich-link, and TOC block behavior.
- Better block boundary controls with less intrusive UI.

### Appearance And Layout

- Softer visual language across drawers, panes, and tabs.
- Better glass window behavior.
- Added configurable glass opacity.
- Added configurable workspace margins, section corners, status bar visibility, and UI text weight.
- Improved Windows title/menu chrome behavior.
- Updated application icon assets.

### Packaging And Platform Work

- Version moved to `1.0.0-beta.1`.
- Added Mac and Windows build targets.
- Added Windows-specific Tauri configuration.
- Added release/build Makefile improvements.
- Added app icon generation for platform bundles.
- Added `Cmd+W` behavior for closing the current tab.

### Documentation

- Reworked README for a clearer product overview.
- Added and expanded the full manual site.
- Added documentation for AI Builder, AI commands, canvas files, plugins, theming, galleries, search, tasks, and workspace workflows.

### Internal Cleanup

- Continued splitting frontend and backend code into smaller feature modules.
- Added more focused regression tests.
- Expanded Rust backend tests for settings, search, plugins, AI, canvas-adjacent workflows, assets, calendar, vault behavior, and snippets.
- Removed or reduced stale compatibility paths where no longer needed.

## Fixes

- Fixed block insertion between adjacent rich/special blocks.
- Fixed glass background opacity behavior.
- Fixed stale README gallery test expectation.
- Fixed Windows file listing edge cases for underscore-prefixed `.canvas` files.
- Fixed duplicate File/New controls on platforms with an app menu.
- Fixed app icon packaging issues.
- Fixed command palette organization and keyboard navigation issues.

## Notes

This release is still marked beta because the feature surface grew significantly: AI Builder, canvas editing, Windows packaging, plugins, and richer appearance settings all deserve real-world vault testing before calling it stable.
