# Glyphary 1.0.0-beta.3 Release Notes

This beta adds the pieces that were missing from the previous releases,
and some of these pieces were definitely must-haves (oops):
Mermaid diagrams, in-page search, startup update checks, and more complete
inline Markdown formatting while keeping files plain Markdown on disk.

## What's New Since 1.0.0-beta.2

### Markdown And Formatting

- Added rendered Mermaid diagrams from fenced `mermaid` code blocks, with an
  Edit control to return to the Markdown source.
- Added an Insert Mermaid Diagram command to the command palette.
- Added rendered `<kbd>...</kbd>` support for keyboard-style inline text.
- Added Format commands for keyboard text, strikethrough, highlight,
  superscript, and subscript.
- Added inline rendering support for `==highlight==`, `^superscript^`, and
  `~subscript~`.
- Fixed keyboard formatting so it wraps the current selection inline instead of
  adding extra line breaks.

### Search And Navigation

- Added in-page search with `Cmd+F`, highlighted matches, match counts, and
  previous/next navigation.
- Fixed in-page search so matches are selected without hiding the editor cursor.
- Preserved editor selections when opening and closing the command palette.
- Search result clicks now keep the left drawer on the Search tab instead of
  switching back to Files.
- Vault search results now show one row per file, include the number of matches
  in that file, and sort from the newest modified page to the oldest.

### Updates

- Glyphary now checks GitHub Releases on startup and shows an update dialog when
  the newest published release is different from the running app version.
- The update dialog displays release notes and includes aligned Later and Open
  Release actions.

## Notes

`1.0.0-beta.3` is still a beta because these changes touch Markdown rendering,
search selection, command-palette selection preservation, startup networking,
and release packaging. Please test with a real vault before replacing your
daily build.
