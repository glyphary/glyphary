import { Extension, type Editor } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { taskDateEmojis } from "../lib/task-meta";
import { afterInput, caretContext, caretPoint, textAfterCaret } from "./typed-trigger";

// Responsibilities:
// - Notice when a Tasks-format date field (📅 ⏳ 🛫 ➕ ✅ ❌) is typed and ask
//   App to show a calendar at the caret so the date is picked, not typed.
// Contracts:
// - Only typed input triggers it, never pasted or loaded text, and never
//   inside code. A field that already has a date after it is left alone.
// - The document is not changed here; picking inserts `YYYY-MM-DD` through
//   App, so cancelling the picker leaves just the emoji.

export type TaskDateTrigger = {
  editor: Editor;
  /** Position right after the emoji, where the date goes. */
  pos: number;
  x: number;
  y: number;
};

type TaskDateExtensionOptions = {
  openDatePicker: (trigger: TaskDateTrigger) => void;
};

const dateAhead = /^\s?\d{4}-\d{2}-\d{2}/;

export function createTaskDateExtension(options: TaskDateExtensionOptions) {
  return Extension.create({
    name: "glypharyTaskDates",

    addProseMirrorPlugins() {
      const editor = this.editor;

      return [
        new Plugin({
          key: new PluginKey("glypharyTaskDates"),
          props: {
            handleTextInput: (view, from, _to, text) => {
              if (!taskDateEmojis.includes(text)) {
                return false;
              }

              if (caretContext(view, from).inCode || dateAhead.test(textAfterCaret(view, from, 12))) {
                return false;
              }

              const pos = from + text.length;

              afterInput(editor, () => options.openDatePicker({ editor, pos, ...caretPoint(editor, pos) }));
              return false;
            },
          },
        }),
      ];
    },
  });
}
