import { useCallback, useEffect, useRef, useState, type FocusEvent } from "react";

// Responsibilities:
// - Own the hover-reveal lifecycle of the unpinned inspector drawer: reveal on
//   rail hover, hide after the pointer leaves, and keep it open while a control
//   inside has focus.
// Contracts:
// - Peek is transient UI state and is never persisted; App owns the pinned
//   and docked flags and passes `pinned` in.
// - Every callback is a no-op while the drawer is pinned, so callers can wire
//   the handlers unconditionally.

// Grace period so a pointer that brushes out and back does not flicker the
// panel, and a focused control (typing in Source) keeps it open.
const HIDE_DELAY_MS = 220;

export function useDrawerPeek(pinned: boolean) {
  const [drawerPeek, setDrawerPeek] = useState(false);
  const hideTimerRef = useRef<number | null>(null);
  const drawerPaneRef = useRef<HTMLElement>(null);

  const cancelDrawerPeekHide = useCallback(() => {
    if (hideTimerRef.current === null) {
      return;
    }
    window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = null;
  }, []);

  const revealDrawerPeek = useCallback(() => {
    if (pinned) {
      return;
    }
    cancelDrawerPeekHide();
    setDrawerPeek(true);
  }, [cancelDrawerPeekHide, pinned]);

  const scheduleDrawerPeekHide = useCallback(() => {
    if (pinned) {
      return;
    }
    cancelDrawerPeekHide();
    hideTimerRef.current = window.setTimeout(() => {
      hideTimerRef.current = null;
      if (drawerPaneRef.current?.contains(document.activeElement)) {
        return;
      }
      setDrawerPeek(false);
    }, HIDE_DELAY_MS);
  }, [cancelDrawerPeekHide, pinned]);

  const hideDrawerPeekOnBlur = useCallback(
    (event: FocusEvent<HTMLElement>) => {
      const pane = event.currentTarget;
      const focusStaysInside = pane.contains(event.relatedTarget as Node | null);
      if (pinned || focusStaysInside || pane.matches(":hover")) {
        return;
      }
      setDrawerPeek(false);
    },
    [pinned],
  );

  useEffect(() => cancelDrawerPeekHide, [cancelDrawerPeekHide]);

  return {
    drawerPeek,
    setDrawerPeek,
    drawerPaneRef,
    cancelDrawerPeekHide,
    revealDrawerPeek,
    scheduleDrawerPeekHide,
    hideDrawerPeekOnBlur,
  };
}
