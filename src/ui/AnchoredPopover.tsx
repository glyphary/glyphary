import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CSSProperties, ReactNode, RefObject } from "react";

type AnchoredPopoverProps = {
  anchorRef: RefObject<HTMLElement | null>;
  children: ReactNode;
  className?: string;
  open: boolean;
  onRequestClose: () => void;
};

export function AnchoredPopover({
  anchorRef,
  children,
  className,
  open,
  onRequestClose,
}: AnchoredPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties>();

  useLayoutEffect(() => {
    if (!open) {
      setStyle(undefined);
      return;
    }

    const anchor = anchorRef.current;
    const popover = popoverRef.current;

    if (!anchor || !popover) {
      return;
    }

    const updatePosition = () => {
      const anchorBounds = anchor.getBoundingClientRect();
      const popoverBounds = popover.getBoundingClientRect();
      const gutter = 8;
      const left = Math.max(
        gutter,
        Math.min(anchorBounds.right - popoverBounds.width, window.innerWidth - popoverBounds.width - gutter),
      );
      const below = anchorBounds.bottom + 4;
      const top =
        below + popoverBounds.height <= window.innerHeight - gutter
          ? below
          : Math.max(gutter, anchorBounds.top - popoverBounds.height - 4);

      setStyle({ left, top });
    };

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onRequestClose();
        anchor.focus();
      }
    };
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target;

      if (
        target instanceof Node &&
        !anchor.contains(target) &&
        !popover.contains(target)
      ) {
        onRequestClose();
      }
    };

    updatePosition();
    const observer = new ResizeObserver(updatePosition);
    observer.observe(anchor);
    observer.observe(popover);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("pointerdown", closeOnOutsidePointer);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
    };
  }, [anchorRef, onRequestClose, open]);

  if (!open) {
    return null;
  }

  return createPortal(
    <div
      className={className}
      ref={popoverRef}
      role="menu"
      style={style ?? { visibility: "hidden" }}
    >
      {children}
    </div>,
    document.body,
  );
}
