import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, type EditorState, type Transaction } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { caretContext } from "./typed-trigger";

// Responsibilities:
// - Track an inline completion session started by "#" (tags) or "@" (people):
//   where it began, the text typed since, and whether it is still alive.
// - Route the keys that drive the menu while the caret stays in the editor.
// Contracts:
// - The trigger has to start a word, outside code. "#" at a paragraph start
//   stays a heading unless inside a list item, where headings cannot form.
// - A session ends when the caret leaves the typed word, whitespace is typed,
//   the trigger character disappears, or the editor blurs. The document is
//   never changed here; App writes the accepted text.

export type InlineSuggestKind = "tag" | "person";

export type InlineSuggestSession = {
  kind: InlineSuggestKind;
  /** Position of the trigger character. */
  from: number;
  /** Text typed after the trigger, up to the caret. */
  query: string;
  x: number;
  y: number;
};

type PluginState = { kind: InlineSuggestKind; from: number } | null;

type InlineSuggestOptions = {
  onChange: (session: InlineSuggestSession | null) => void;
  /** Returns true when the key was consumed by the menu. */
  onKey: (key: string) => boolean;
};

export const inlineSuggestKey = new PluginKey<PluginState>("glypharyInlineSuggest");

const triggers: Record<string, InlineSuggestKind> = { "#": "tag", "@": "person" };

function sessionQuery(state: EditorState, plugin: PluginState) {
  if (!plugin) {
    return null;
  }

  const { from } = state.selection;

  if (!state.selection.empty || from <= plugin.from || from > state.doc.content.size) {
    return null;
  }

  const typed = state.doc.textBetween(plugin.from, from);

  if (!typed.startsWith(plugin.kind === "tag" ? "#" : "@") || /\s/.test(typed)) {
    return null;
  }

  return typed.slice(1);
}

export function dismissInlineSuggest(view: EditorView) {
  if (inlineSuggestKey.getState(view.state)) {
    view.dispatch(view.state.tr.setMeta(inlineSuggestKey, null));
  }
}

export function createInlineSuggestExtension(options: InlineSuggestOptions) {
  return Extension.create({
    name: "glypharyInlineSuggest",

    addProseMirrorPlugins() {
      return [
        new Plugin<PluginState>({
          key: inlineSuggestKey,
          state: {
            init: () => null,
            apply(tr: Transaction, previous, _old, next) {
              const meta = tr.getMeta(inlineSuggestKey) as PluginState | undefined;

              if (meta !== undefined) {
                return meta;
              }

              if (!previous) {
                return null;
              }

              const mapped = { ...previous, from: tr.mapping.map(previous.from) };

              return sessionQuery(next, mapped) === null ? null : mapped;
            },
          },
          view() {
            let last: string | null = null;

            return {
              update(view) {
                const plugin = inlineSuggestKey.getState(view.state) ?? null;
                const query = sessionQuery(view.state, plugin);
                const signature = plugin && query !== null ? `${plugin.kind}:${plugin.from}:${query}` : null;

                if (signature === last) {
                  return;
                }

                last = signature;

                if (!plugin || query === null) {
                  options.onChange(null);
                  return;
                }

                const coords = view.coordsAtPos(plugin.from);

                options.onChange({ kind: plugin.kind, from: plugin.from, query, x: coords.left, y: coords.bottom + 4 });
              },
            };
          },
          props: {
            handleTextInput: (view, from, _to, text) => {
              const kind = triggers[text];

              if (!kind) {
                return false;
              }

              const caret = caretContext(view, from);

              if (caret.inCode || !caret.wordStart) {
                return false;
              }

              // "# " at a paragraph start is a heading; inside a list item a
              // heading cannot form, so the tag search may open there.
              if (kind === "tag" && caret.atBlockStart && !caret.inList) {
                return false;
              }

              // The character lands first; the session starts on the next
              // tick so its query is read from the real document.
              window.setTimeout(() => {
                if (view.isDestroyed) {
                  return;
                }

                view.dispatch(view.state.tr.setMeta(inlineSuggestKey, { kind, from }));
              }, 0);
              return false;
            },
            handleKeyDown: (view, event) => {
              if (!inlineSuggestKey.getState(view.state)) {
                return false;
              }

              if (options.onKey(event.key)) {
                event.preventDefault();
                return true;
              }

              return false;
            },
            handleDOMEvents: {
              blur: (view) => {
                dismissInlineSuggest(view);
                return false;
              },
            },
          },
        }),
      ];
    },
  });
}
