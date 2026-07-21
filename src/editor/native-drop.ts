import type { Editor } from "@tiptap/core";
import { Selection } from "@tiptap/pm/state";
import type { EditorGroupId } from "../lib/app-types";

export type NativeDropTarget = {
  editor: Editor;
  groupId: EditorGroupId;
};

export type NativeEditor = {
  editor: Editor | null;
  groupId: EditorGroupId;
};

function nativeDropPoint(physicalX: number, physicalY: number) {
  // Tauri reports window coordinates in physical pixels, while DOM hit testing
  // uses CSS pixels; conversion keeps native drops aligned on Retina displays.
  const scale = window.devicePixelRatio || 1;

  return {
    left: physicalX / scale,
    top: physicalY / scale,
  };
}

export function findNativeDropTarget(
  editors: NativeEditor[],
  physicalX: number,
  physicalY: number,
): NativeDropTarget | null {
  const point = nativeDropPoint(physicalX, physicalY);
  const element = document.elementFromPoint(point.left, point.top);
  const editorElement = element?.closest<HTMLElement>(".ProseMirror");

  if (!editorElement) {
    return null;
  }

  return (
    editors.find(
      (candidate): candidate is NativeDropTarget =>
        candidate.editor?.view.dom === editorElement,
    ) ?? null
  );
}

export function focusNativeDropTarget(
  target: NativeDropTarget,
  physicalX: number,
  physicalY: number,
) {
  const position = target.editor.view.posAtCoords(nativeDropPoint(physicalX, physicalY));

  if (position) {
    target.editor.view.dispatch(
      target.editor.state.tr.setSelection(
        // A native drop can land between blocks, so normalize the mapped point
        // to the nearest valid caret before the editor inserts content.
        Selection.near(target.editor.state.doc.resolve(position.pos)),
      ),
    );
  }

  target.editor.view.focus();
}
