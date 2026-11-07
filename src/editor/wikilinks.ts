import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { VaultIndexedFile } from "../lib/app-types";

// Responsibilities:
// - Render Obsidian-style wikilinks as inline decorations.
// - Open the wikilink search after typing a double left bracket.
// Contracts:
// - Vault filename indexing and navigation stay app-owned through callbacks.
// - A link under the caret keeps its raw [[target|alias]] syntax editable; every other link hides it.

export function wikiLinkTargetFromMarkup(value: string) {
  return value.split("|")[0]?.split("#")[0]?.trim() ?? "";
}

export type WikiLinkResolution = {
  candidates: VaultIndexedFile[];
  /**
   * Candidate sources for a picture beside the link when it points at one
   * person note; a bare file name can live in any of the image folders, so
   * the widget tries them in order.
   */
  avatar?: string[];
};

function avatarWidget(sources: string[]) {
  const image = document.createElement("img");

  image.className = "wikilink-avatar";
  image.alt = "";
  image.draggable = false;

  // WebKit keeps an <img> whose first load failed in its broken, zero-size
  // state even after a later src loads, so each candidate is tried on a
  // detached Image and the visible element only ever receives a good one.
  const tryCandidate = (index: number) => {
    if (index >= sources.length) {
      image.remove();
      return;
    }

    const probe = new Image();

    probe.onload = () => {
      image.src = sources[index];
    };
    probe.onerror = () => tryCandidate(index + 1);
    probe.src = sources[index];
  };

  tryCandidate(0);

  return image;
}

type WikiLinkExtensionOptions = {
  openSearch: () => void;
  resolveTarget: (target: string) => WikiLinkResolution;
};

const wikiLinkTokenPattern = /\[\[([^\]\n]+)\]\]/g;

export function createWikiLinkExtension(options: WikiLinkExtensionOptions) {
  return Extension.create({
    name: "glypharyWikilinks",

    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: new PluginKey("glypharyWikilinks"),
          props: {
            decorations: (state) => {
              const decorations: Decoration[] = [];

              state.doc.descendants((node, position, parent) => {
                if (!node.isText || !node.text || parent?.type.spec.code) {
                  return true;
                }

                for (const match of node.text.matchAll(wikiLinkTokenPattern)) {
                  const markup = match[1] ?? "";
                  const target = wikiLinkTargetFromMarkup(markup);

                  if (!target) {
                    continue;
                  }

                  const from = position + match.index;
                  const to = from + match[0].length;
                  const resolution = options.resolveTarget(target);
                  const candidates = resolution.candidates;
                  const stateClass =
                    candidates.length === 0
                      ? "missing"
                      : candidates.length === 1
                        ? "resolved"
                        : "ambiguous";

                  decorations.push(
                    Decoration.inline(from, to, {
                      class: `wikilink wikilink-${stateClass}`,
                      "data-wikilink-target": target,
                      title:
                        candidates.length === 0
                          ? "No matching note"
                          : candidates.length === 1
                            ? candidates[0].relativePath
                            : `${candidates.length} matching notes`,
                    }),
                  );

                  if (resolution.avatar?.length) {
                    const avatar = resolution.avatar;

                    // Keyed on the sources so an unchanged avatar is not
                    // rebuilt on every transaction.
                    decorations.push(
                      Decoration.widget(from, () => avatarWidget(avatar), {
                        side: -1,
                        key: `avatar:${avatar.join("|")}`,
                      }),
                    );
                  }

                  // The brackets show only while the caret is inside the link,
                  // so the rest of the paragraph reads as plain links.
                  const editing = state.selection.from <= to && state.selection.to >= from;

                  if (!editing) {
                    decorations.push(
                      Decoration.inline(from, from + 2, { class: "wikilink-hidden-syntax" }),
                      Decoration.inline(to - 2, to, { class: "wikilink-hidden-syntax" }),
                    );

                    const pipeIndex = markup.indexOf("|");

                    if (pipeIndex >= 0) {
                      // Obsidian-style aliases display only the alias outside
                      // the active line: [[Actual Page|Shown Text]] -> Shown Text.
                      decorations.push(
                        Decoration.inline(from + 2, from + 2 + pipeIndex + 1, {
                          class: "wikilink-hidden-syntax",
                        }),
                      );
                    }
                  }
                }

                return true;
              });

              return DecorationSet.create(state.doc, decorations);
            },
            handleTextInput: (view, from, _to, text) => {
              if (text !== "[") {
                return false;
              }

              const $from = view.state.doc.resolve(from);
              const inCode =
                Boolean($from.parent.type.spec.code) ||
                $from.marks().some((mark) => mark.type.name === "code");

              if (inCode) {
                return false;
              }

              if (view.state.doc.textBetween(Math.max(0, from - 1), from) !== "[") {
                return false;
              }

              // Returning false lets the second "[" land in the document first;
              // the search opens on the next tick, after that insertion.
              window.setTimeout(options.openSearch, 0);
              return false;
            },
          },
        }),
      ];
    },
  });
}
