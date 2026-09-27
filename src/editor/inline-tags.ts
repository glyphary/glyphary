import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { inlineTagRanges } from "../lib/inline-tags";
import type { TagColors } from "../lib/tag-colors";
import { tagStyleAttribute } from "../lib/tag-colors";

// Responsibilities:
// - Draw inline `#tags` in note text as pills, the way tags look in the
//   frontmatter and the Tags drawer.
// Contracts:
// - Decorations only. The document and the Markdown never change; the tag
//   stays plain text, so nothing here can break compatibility.
// - Text inside code blocks, inline code, and other verbatim nodes is left
//   alone, matching what the backend scanner counts as a tag.
// - A tag the vault picked a colour for carries it through `getTagColors`,
//   read at decoration time; `refreshTagColorsMeta` on a transaction redraws
//   after the vault settings change without touching the document.

const pluginKey = new PluginKey("glypharyInlineTags");
export const refreshTagColorsMeta = "glypharyTagColors";

function decorations(doc: ProseMirrorNode, colors: TagColors) {
  const found: Decoration[] = [];

  doc.descendants((node, position, parent) => {
    if (parent?.type.spec.code) {
      return false;
    }

    if (!node.isText || !node.text || node.marks.some((mark) => mark.type.name === "code")) {
      return;
    }

    for (const range of inlineTagRanges(node.text)) {
      const style = tagStyleAttribute(range.tag, colors);

      found.push(
        Decoration.inline(position + range.from, position + range.to, {
          class: style ? "inline-tag tag-tinted" : "inline-tag",
          "data-tag": range.tag,
          ...(style ? { style } : {}),
        }),
      );
    }
  });

  return DecorationSet.create(doc, found);
}

export function createInlineTagExtension(getTagColors: () => TagColors) {
  return Extension.create({
    name: "glypharyInlineTags",

    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: pluginKey,
          state: {
            init: (_, state) => decorations(state.doc, getTagColors()),
            apply: (transaction, previous) =>
              transaction.docChanged || transaction.getMeta(refreshTagColorsMeta)
                ? decorations(transaction.doc, getTagColors())
                : previous,
          },
          props: {
            decorations(state) {
              return pluginKey.getState(state);
            },
          },
        }),
      ];
    },
  });
}
