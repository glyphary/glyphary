import { useEffect, useRef } from "react";

// Responsibilities:
// - The lifecycle every caret-anchored popover shares: take focus on mount,
//   close on a press outside.
// Contracts:
// - Returns the ref to put on the popover root, which must be focusable
//   (tabIndex -1) for the keyboard handling the caller adds.

export function useAnchoredPopover<T extends HTMLElement>(onClose: () => void) {
  const rootRef = useRef<T>(null);

  useEffect(() => {
    rootRef.current?.focus();

    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener("pointerdown", closeOnOutsidePress);

    return () => document.removeEventListener("pointerdown", closeOnOutsidePress);
  }, [onClose]);

  return rootRef;
}
