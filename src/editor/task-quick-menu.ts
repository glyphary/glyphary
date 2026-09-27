import { Extension, type Editor } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { afterInput, caretContext, caretPoint } from "./typed-trigger";

// Responsibilities:
// - Notice a "+" typed at a word start on a task line and ask App to show
//   the quick menu (priorities and due-date shortcuts) at the caret.
// Contracts:
// - Task lines only: the caret must sit inside a task item. Code, and a "+"
//   glued to a word ("C++"), never trigger it.
// - The "+" lands in the document; App removes it when a choice is made and
//   leaves it when the menu is dismissed.

export type TaskQuickTrigger = {
  editor: Editor;
  /** Position right after the "+". */
  pos: number;
  x: number;
  y: number;
};

type TaskQuickMenuOptions = {
  openQuickMenu: (trigger: TaskQuickTrigger) => void;
};

export function createTaskQuickMenuExtension(options: TaskQuickMenuOptions) {
  return Extension.create({
    name: "glypharyTaskQuickMenu",

    addProseMirrorPlugins() {
      const editor = this.editor;

      return [
        new Plugin({
          key: new PluginKey("glypharyTaskQuickMenu"),
          props: {
            handleTextInput: (view, from, _to, text) => {
              if (text !== "+") {
                return false;
              }

              const caret = caretContext(view, from);

              if (!caret.inTask || caret.inCode || !caret.wordStart) {
                return false;
              }

              const pos = from + text.length;

              afterInput(editor, () => options.openQuickMenu({ editor, pos, ...caretPoint(editor, pos) }));
              return false;
            },
          },
        }),
      ];
    },
  });
}
