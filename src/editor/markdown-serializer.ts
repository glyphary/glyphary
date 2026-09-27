import { Markdown } from "@tiptap/markdown";

// Responsibilities:
// - The Markdown extension the editor uses, with text written back the way
//   it was typed.
// Contracts:
// - `@tiptap/markdown` backslash-escapes `[ ] * _ ~ \` and a backtick in
//   every text node and HTML-encodes entities. In a vault that is corruption:
//   `[[Note]]` became `\[\[Note\]\]` on save, so Obsidian lost the link, and
//   `a_b` became `a\_b`. Wikilinks and tags live in plain text here on
//   purpose (decorations, not nodes), so text must round-trip untouched,
//   which is also what Obsidian does. Code contexts were never escaped.
// - A file that already carries `\[\[` reads back as `[[` and is repaired on
//   its next save.

type TextEncoder = (text: string, node: unknown, parentNode: unknown) => string;

export const GlypharyMarkdown = Markdown.extend({
  onBeforeCreate(props) {
    this.parent?.(props);

    const manager = this.storage.manager as unknown as { encodeTextForMarkdown: TextEncoder };

    manager.encodeTextForMarkdown = (text) => text;
  },
});
