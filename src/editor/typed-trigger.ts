import type { Editor } from "@tiptap/core";
import type { EditorView } from "@tiptap/pm/view";

// Responsibilities:
// - Answer the questions every typed-trigger extension asks about the caret
//   ("#", "@", "+", a date emoji): is it in code, at a word start, in a
//   list or task, at the start of its block?
// - Place a popover under a document position, after the typed character
//   has landed.
// Contracts:
// - Read-only. Extensions decide; nothing here changes the document.
// - `afterInput` runs on the next tick so the handler that returned false
//   has let the character into the document first, and is skipped when the
//   editor is gone by then.

export type CaretContext = {
  inCode: boolean;
  /** Nothing, or whitespace, before the caret in its text block. */
  wordStart: boolean;
  atBlockStart: boolean;
  inList: boolean;
  inTask: boolean;
};

export function caretContext(view: EditorView, from: number): CaretContext {
  const $from = view.state.doc.resolve(from);
  const before =
    $from.parentOffset === 0
      ? ""
      : $from.parent.textBetween($from.parentOffset - 1, $from.parentOffset);
  let inList = false;
  let inTask = false;

  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const name = $from.node(depth).type.name;

    if (name === "taskItem") {
      inTask = true;
      inList = true;
    } else if (name === "listItem") {
      inList = true;
    }
  }

  return {
    inCode: Boolean($from.parent.type.spec.code) || $from.marks().some((mark) => mark.type.name === "code"),
    wordStart: before === "" || /\s/.test(before),
    atBlockStart: $from.parentOffset === 0,
    inList,
    inTask,
  };
}

export function textAfterCaret(view: EditorView, from: number, length: number) {
  const $from = view.state.doc.resolve(from);

  return $from.parent.textBetween($from.parentOffset, Math.min($from.parent.content.size, $from.parentOffset + length));
}

export function caretPoint(editor: Editor, pos: number) {
  const coords = editor.view.coordsAtPos(Math.min(pos, editor.state.doc.content.size));

  return { x: coords.left, y: coords.bottom + 4 };
}

export function afterInput(editor: Editor, callback: () => void) {
  window.setTimeout(() => {
    if (!editor.isDestroyed) {
      callback();
    }
  }, 0);
}
