/**
 * Starred-file list interactions.
 *
 * Responsibilities:
 * - Convert a pointer position into a starred-row insertion index.
 * - Reorder starred paths without mutating the persisted list.
 *
 * Contracts:
 * - Missing dragged paths are returned unchanged so stale pointer state cannot
 *   corrupt the persisted order.
 */

export function starredDropIndexFromPointer(container: HTMLElement, pointerY: number) {
  const rows = Array.from(
    container.querySelectorAll<HTMLElement>("[data-starred-path]"),
  );

  if (rows.length === 0) {
    return -1;
  }

  const targetIndex = rows.findIndex((row) => {
    const rect = row.getBoundingClientRect();

    return pointerY < rect.top + rect.height / 2;
  });

  return targetIndex === -1 ? rows.length : targetIndex;
}

export function reorderedStarredFiles(
  current: string[],
  draggedPath: string,
  dropIndex: number,
) {
  const draggedIndex = current.indexOf(draggedPath);
  let targetIndex = Math.max(0, Math.min(dropIndex, current.length));

  if (draggedIndex === -1) {
    return current;
  }

  const next = [...current];
  const [dragged] = next.splice(draggedIndex, 1);

  if (draggedIndex < targetIndex) {
    targetIndex -= 1;
  }

  next.splice(targetIndex, 0, dragged);
  return next;
}
