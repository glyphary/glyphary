import { useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { taskQuickItems } from "../lib/task-quick-menu";
import { useAnchoredPopover } from "../ui/use-anchored-popover";

// Responsibilities:
// - The "+" menu on a task line: priorities, then due-date shortcuts, as a
//   keyboard-driven list anchored at a point.
// Contracts:
// - Arrows move, Enter chooses, Escape closes, clicking outside closes. The
//   choice is reported by item id; App writes the text.

type TaskQuickMenuProps = {
  x: number;
  y: number;
  onChoose: (id: string) => void;
  onClose: () => void;
};

export function TaskQuickMenu({ x, y, onChoose, onClose }: TaskQuickMenuProps) {
  const [index, setIndex] = useState(0);
  const rootRef = useAnchoredPopover<HTMLDivElement>(onClose);

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;

      setIndex((current) => (current + step + taskQuickItems.length) % taskQuickItems.length);
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      onChoose(taskQuickItems[index].id);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  }

  return (
    <div
      ref={rootRef}
      className="task-quick-menu"
      style={{ left: x, top: y }}
      role="menu"
      aria-label="Task priority and due date"
      tabIndex={-1}
      onKeyDown={handleKeyDown}
    >
      {taskQuickItems.map((item, itemIndex) => (
        <button
          key={item.id}
          className={[
            itemIndex === index ? "active" : "",
            itemIndex > 0 && taskQuickItems[itemIndex - 1].group !== item.group ? "group-start" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          type="button"
          role="menuitem"
          tabIndex={-1}
          onClick={() => onChoose(item.id)}
          onMouseEnter={() => setIndex(itemIndex)}
        >
          <span aria-hidden="true">{item.emoji}</span>
          {item.label}
        </button>
      ))}
    </div>
  );
}
