/**
 * Editor drop-target geometry and hit testing.
 *
 * Responsibilities:
 * - Resolve pointer coordinates to an editor group and split side.
 * - Calculate the rectangle used by split-drop feedback.
 *
 * Contracts:
 * - Callers own drag state and file opening; these helpers only inspect the DOM.
 * - Coordinates are CSS-pixel client coordinates, matching `elementFromPoint`.
 */

export type EditorDropSide = "left" | "right";

export type EditorDropTarget = {
  groups: HTMLElement;
  side: EditorDropSide;
};

export type EditorDropRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export function editorGroupsAtPointer(clientX: number, clientY: number): EditorDropTarget | null {
  const element = document.elementFromPoint(clientX, clientY);
  const groups = element instanceof Element
    ? element.closest<HTMLElement>(".editor-groups")
    : null;

  if (!groups) {
    return null;
  }

  const bounds = groups.getBoundingClientRect();
  const insideGroups =
    clientX >= bounds.left &&
    clientX <= bounds.right &&
    clientY >= bounds.top &&
    clientY <= bounds.bottom;

  if (!insideGroups) {
    return null;
  }

  return {
    groups,
    side: clientX < bounds.left + bounds.width / 2 ? "left" : "right",
  };
}

export function editorDropTargetRect(target: EditorDropTarget): EditorDropRect {
  const panes = Array.from(
    target.groups.querySelectorAll<HTMLElement>(".editor-pane-shell"),
  );
  const pane = target.groups.classList.contains("split")
    ? panes[target.side === "left" ? 0 : 1]
    : null;

  if (pane) {
    const bounds = pane.getBoundingClientRect();
    return {
      left: bounds.left,
      top: bounds.top,
      width: bounds.width,
      height: bounds.height,
    };
  }

  const bounds = target.groups.getBoundingClientRect();
  const splitGap =
    Number.parseFloat(
      getComputedStyle(target.groups).getPropertyValue("--glyphary-split-gap"),
    ) || 12;
  const width = (bounds.width - splitGap) / 2;

  return {
    left: target.side === "left" ? bounds.left : bounds.left + width + splitGap,
    top: bounds.top,
    width,
    height: bounds.height,
  };
}
