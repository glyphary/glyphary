# Glyphary 1.0.0-beta.6 Release Notes

This beta makes everyday navigation faster and brings the most common workspace actions into a quieter, more configurable titlebar.

## What's New Since 1.0.0-beta.5

### Faster Document Opening

- Document rows in Files, nested folder trees, Search, Recent, Starred, and Tasks now open with one click by default.
- Added an **Open documents with a double click** per-vault setting for users who prefer selection before opening. Keyboard activation remains available in either mode.

### Native Workspace Controls

- Moved Back onto the titlebar row above the active Files drawer.
- Added low-profile New Note and New Folder titlebar actions. Both remain visible by default, can be hidden independently, and keep their folder context-menu equivalents.
- Added a command-palette button immediately beside Save while retaining `Cmd+P`.
- The open-vault welcome screen now hides drawer, document, appearance, and status controls until a vault is open.

### Interface Settings

- Added an Interface settings group for the New Note and New Folder buttons, title-bar document proxy, status bar, and document click behavior.
- Existing vault settings migrate to the new one-click and visible-button defaults without rewriting hand-edited configuration values.

### Engineering And Documentation

- Centralized document activation so Files, Search, Recent, Starred, Tasks, and folder trees share one click policy.
- Extracted reusable settings checkboxes and titlebar vault actions, normalized display settings once per render, and consolidated Rust migration defaults.
- Added focused comments only where event ordering, legacy migration, or resizable titlebar positioning would otherwise be non-obvious.
- Updated the README and user manual, with regression coverage for click and keyboard activation, interface defaults, older vault settings, titlebar controls, and the clean welcome screen.

## Notes

`1.0.0-beta.6` remains a beta because it changes persisted per-vault interface settings and document-opening behavior. Existing settings files receive the new one-click and visible-button defaults automatically.
