import { useCallback, useRef, useState, type MutableRefObject } from "react";
import type { Editor } from "@tiptap/core";
import type { TaskDateTrigger } from "../editor/task-dates";
import type { TaskQuickTrigger } from "../editor/task-quick-menu";
import { caretPoint } from "../editor/typed-trigger";
import { calendarDateKey } from "../lib/calendar";
import { dateFieldInsertion, spaceBefore } from "../lib/task-fields";
import { taskQuickInsertion } from "../lib/task-quick-menu";

// Responsibilities:
// - Own the two caret popovers for task fields: the calendar (date fields)
//   and the "+" quick menu (priorities, due shortcuts), and write their
//   choices into the document.
// Contracts:
// - `openTaskDatePicker` and `openTaskQuickMenu` are stable for the editor
//   extensions that capture them once. Closing refocuses the editor.
// - Text is written the way the Tasks plugin writes it: one space before a
//   field when needed, `📅 YYYY-MM-DD `, the caret left after the field.

type Deps = { editorRef: MutableRefObject<Editor | null> };

export function useTaskFieldPickers({ editorRef }: Deps) {
  const [datePicker, setDatePicker] = useState<TaskDateTrigger | null>(null);
  const [quickMenu, setQuickMenu] = useState<TaskQuickTrigger | null>(null);
  const datePickerRef = useRef<TaskDateTrigger | null>(null);
  const quickMenuRef = useRef<TaskQuickTrigger | null>(null);

  const openTaskDatePicker = useCallback((trigger: TaskDateTrigger) => {
    datePickerRef.current = trigger;
    setDatePicker(trigger);
  }, []);

  const openTaskQuickMenu = useCallback((trigger: TaskQuickTrigger) => {
    quickMenuRef.current = trigger;
    setQuickMenu(trigger);
  }, []);

  function closeTaskDatePicker() {
    const trigger = datePickerRef.current;

    datePickerRef.current = null;
    setDatePicker(null);

    if (trigger && !trigger.editor.isDestroyed) {
      trigger.editor.commands.focus();
    }
  }

  function closeTaskQuickMenu() {
    const trigger = quickMenuRef.current;

    quickMenuRef.current = null;
    setQuickMenu(null);

    if (trigger && !trigger.editor.isDestroyed) {
      trigger.editor.commands.focus();
    }
  }

  // Slash-menu path: no emoji was typed, so it is written here before the
  // calendar opens.
  function insertTaskDateField(emoji: string) {
    const editor = editorRef.current;

    if (!editor || editor.isDestroyed) {
      return;
    }

    const { from, to } = editor.state.selection;
    const text = spaceBefore(editor.state.doc.textBetween(Math.max(0, from - 1), from)) + emoji;

    editor
      .chain()
      .focus()
      .command(({ tr, dispatch }) => {
        dispatch?.(tr.insertText(text, from, to));
        return true;
      })
      .run();

    const pos = from + text.length;

    openTaskDatePicker({ editor, pos, ...caretPoint(editor, pos) });
  }

  function pickTaskDate(date: Date) {
    const trigger = datePickerRef.current;

    if (!trigger || trigger.editor.isDestroyed) {
      closeTaskDatePicker();
      return;
    }

    const { state } = trigger.editor;
    const pos = Math.min(trigger.pos, state.doc.content.size);
    const insertion = dateFieldInsertion(
      calendarDateKey(date),
      state.doc.textBetween(Math.max(0, pos - 1), pos) === " ",
    );

    trigger.editor
      .chain()
      .command(({ tr, dispatch }) => {
        dispatch?.(tr.insertText(insertion, pos, pos));
        return true;
      })
      .setTextSelection(pos + insertion.length)
      .run();
    closeTaskDatePicker();
  }

  function applyTaskQuickChoice(id: string) {
    const trigger = quickMenuRef.current;

    quickMenuRef.current = null;
    setQuickMenu(null);

    if (!trigger || trigger.editor.isDestroyed) {
      return;
    }

    const editor = trigger.editor;
    const pos = Math.min(trigger.pos, editor.state.doc.content.size);
    const start = editor.state.doc.textBetween(Math.max(0, pos - 1), pos) === "+" ? pos - 1 : pos;
    const insertion = taskQuickInsertion(id, new Date());
    const text =
      insertion === null
        ? ""
        : spaceBefore(editor.state.doc.textBetween(Math.max(0, start - 1), start)) + insertion + " ";

    editor
      .chain()
      .focus()
      .command(({ tr, dispatch }) => {
        dispatch?.(tr.insertText(text, start, pos));
        return true;
      })
      .setTextSelection(start + text.length)
      .run();

    // A null insertion is the "Due date..." item; the calendar writes the field.
    if (insertion === null) {
      insertTaskDateField("📅");
    }
  }

  return {
    datePicker,
    quickMenu,
    openTaskDatePicker,
    openTaskQuickMenu,
    closeTaskDatePicker,
    closeTaskQuickMenu,
    insertTaskDateField,
    pickTaskDate,
    applyTaskQuickChoice,
  };
}
