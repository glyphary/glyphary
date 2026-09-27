import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { TaskStatus } from "../lib/task-board";

// Responsibilities:
// - Pointer-based card dragging for the task board: press, 6px threshold,
//   ghost label, the column under the pointer, drop.
// Contracts:
// - HTML5 drag and drop snaps back inside the WebKit webview, so this uses
//   pointer capture and `elementFromPoint` on `[data-task-status]` columns.
// - A drag suppresses the click that follows its release, so a drop never
//   opens the note; `consumeClick` tells the caller whether to ignore one.

type Press = { pointerId: number; key: string; label: string; x: number; y: number; dragging: boolean };

export type CardGhost = { x: number; y: number; label: string };

function columnUnderPointer(x: number, y: number): TaskStatus | null {
  const status = document.elementFromPoint(x, y)?.closest("[data-task-status]")?.getAttribute("data-task-status");

  return status === " " || status === "/" || status === "x" ? status : null;
}

export function useCardDrag(onDrop: (key: string, status: TaskStatus) => void) {
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [dropStatus, setDropStatus] = useState<TaskStatus | null>(null);
  const [ghost, setGhost] = useState<CardGhost | null>(null);
  const pressRef = useRef<Press | null>(null);
  const suppressClickRef = useRef(false);

  function start(event: ReactPointerEvent<HTMLElement>, key: string, label: string) {
    if (event.button !== 0) {
      return;
    }

    pressRef.current = { pointerId: event.pointerId, key, label, x: event.clientX, y: event.clientY, dragging: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function move(event: ReactPointerEvent<HTMLElement>) {
    const press = pressRef.current;

    if (!press || press.pointerId !== event.pointerId) {
      return;
    }

    if (!press.dragging) {
      if (Math.hypot(event.clientX - press.x, event.clientY - press.y) < 6) {
        return;
      }

      press.dragging = true;
      suppressClickRef.current = true;
      setDragKey(press.key);
    }

    event.preventDefault();
    setGhost({ x: event.clientX, y: event.clientY, label: press.label });
    setDropStatus(columnUnderPointer(event.clientX, event.clientY));
  }

  function end(event: ReactPointerEvent<HTMLElement>, commit: boolean) {
    const press = pressRef.current;

    if (!press || press.pointerId !== event.pointerId) {
      return;
    }

    pressRef.current = null;
    setDragKey(null);
    setDropStatus(null);
    setGhost(null);

    if (!press.dragging || !commit) {
      return;
    }

    const status = columnUnderPointer(event.clientX, event.clientY);

    if (status) {
      onDrop(press.key, status);
    }
  }

  /** True once after a drag, so the click that follows the release is ignored. */
  function consumeClick() {
    const suppressed = suppressClickRef.current;

    suppressClickRef.current = false;

    return suppressed;
  }

  return {
    dragKey,
    dropStatus,
    ghost,
    consumeClick,
    cardHandlers: (key: string, label: string) => ({
      onPointerDown: (event: ReactPointerEvent<HTMLElement>) => start(event, key, label),
      onPointerMove: move,
      onPointerUp: (event: ReactPointerEvent<HTMLElement>) => end(event, true),
      onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => end(event, false),
    }),
  };
}
