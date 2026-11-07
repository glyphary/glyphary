/**
 * Locked-note guard.
 *
 * Responsibilities:
 * - Drop every document change while the editor is read-only.
 *
 * Contracts:
 * - `editor.setEditable(false)` only stops typing: the margin "+" button, the
 *   Insert menu, slash commands, drops and AI rewrites all dispatch their own
 *   transactions, so one filter here covers them all.
 * - Hydration tags its transaction with `hydrateMeta` so a locked tab can
 *   still load and swap documents.
 */
import { Extension } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";

export const hydrateMeta = "glyphary-hydrate";

export const NoteLockGuard = Extension.create({
  name: "noteLockGuard",

  addProseMirrorPlugins() {
    const { editor } = this;

    return [
      new Plugin({
        filterTransaction: (transaction) =>
          !transaction.docChanged || editor.isEditable || transaction.getMeta(hydrateMeta) === true,
      }),
    ];
  },
});
