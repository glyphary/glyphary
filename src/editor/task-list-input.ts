import { Extension, InputRule } from "@tiptap/core";
import { Fragment, type Node as ProseMirrorNode, type ResolvedPos, type Schema } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";

// Responsibilities:
// - Turn a bullet item into a task item when `[ ] ` or `[x] ` is typed at its
//   start, so the Obsidian habit of typing `- [ ] ` produces a checkbox.
// Contracts:
// - Only the bullet-item case lives here; the stock TaskItem rule already
//   converts a bare paragraph, and it returns null inside a list because a
//   taskItem cannot wrap there.
// - Sibling bullets keep their type: the list is split around the item, which
//   also nests correctly under a parent bullet.
// - The edit is one structural replacement rather than lift/wrap commands.
//   ProseMirror's lift moves a nested item to the outer list instead of out of
//   it, and a chained command that fails partway still dispatches its steps.

const TASK_MARKER = /^\s*\[([ xX])?\]\s$/;
// Positions consumed by the opening tokens of taskList, taskItem, and paragraph.
const CARET_DEPTH_INTO_TASK = 3;

function insideBulletItem($from: ResolvedPos) {
  return $from.depth >= 2 && $from.node(-1).type.name === "listItem";
}

function childOffset(list: ProseMirrorNode, index: number) {
  let offset = 0;
  for (let child = 0; child < index; child += 1) {
    offset += list.child(child).nodeSize;
  }
  return offset;
}

/** A copy of `list` holding only its children in [from, to), or nothing when empty. */
function listSlice(list: ProseMirrorNode, from: number, to: number): ProseMirrorNode[] {
  if (from >= to) {
    return [];
  }
  const content = list.content.cut(childOffset(list, from), childOffset(list, to));
  return [list.type.create(list.attrs, content)];
}

/**
 * Splits `list` around the item at `itemIndex`, turning that item into a task
 * list. Returns the replacement fragment and the caret offset into it.
 */
function convertItemToTask(list: ProseMirrorNode, itemIndex: number, checked: boolean, schema: Schema) {
  const { taskList, taskItem } = schema.nodes;
  const before = listSlice(list, 0, itemIndex);
  const after = listSlice(list, itemIndex + 1, list.childCount);
  const task = taskList.create(null, taskItem.create({ checked }, list.child(itemIndex).content));
  const beforeSize = before.reduce((size, node) => size + node.nodeSize, 0);

  return {
    replacement: Fragment.from([...before, task, ...after]),
    caretOffset: beforeSize + CARET_DEPTH_INTO_TASK,
  };
}

export const TaskListInputRules = Extension.create({
  name: "glypharyTaskListInputRules",

  addInputRules() {
    return [
      new InputRule({
        find: TASK_MARKER,
        handler: ({ state, range, match, chain }) => {
          const $from = state.selection.$from;
          if (!insideBulletItem($from)) {
            return null;
          }

          const checked = (match[1] ?? "").toLowerCase() === "x";
          const listPos = $from.before(-2);
          const itemIndex = $from.index(-2);

          chain()
            .command(({ tr }) => {
              // The marker sits inside the item, so positions before the list
              // are unaffected and can be reused after the delete.
              tr.delete(range.from, range.to);
              const list = tr.doc.nodeAt(listPos)!;
              const { replacement, caretOffset } = convertItemToTask(list, itemIndex, checked, state.schema);
              tr.replaceWith(listPos, listPos + list.nodeSize, replacement);
              tr.setSelection(TextSelection.create(tr.doc, listPos + caretOffset));
              return true;
            })
            .run();
        },
      }),
    ];
  },
});
