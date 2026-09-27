import { useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { monthGridDays, monthTitle, sameCalendarDate } from "../lib/calendar";
import { weekdayLabels } from "../lib/defaults";
import { useAnchoredPopover } from "../ui/use-anchored-popover";

// Responsibilities:
// - A small month calendar anchored at a point; picking a day reports it and
//   the keyboard walks days like a spreadsheet.
// Contracts:
// - Fully keyboard-driven: arrows move a day or a week, PageUp/PageDown a
//   month, Enter picks, Escape closes. Clicking outside closes.
// - Reuses the drawer calendar's day styling so both calendars look alike.

type TaskDatePickerProps = {
  x: number;
  y: number;
  onPick: (date: Date) => void;
  onClose: () => void;
};

function shiftDays(date: Date, days: number) {
  const next = new Date(date);

  next.setDate(date.getDate() + days);

  return next;
}

function shiftMonths(date: Date, months: number) {
  const next = new Date(date);

  next.setMonth(date.getMonth() + months);

  return next;
}

export function TaskDatePicker({ x, y, onPick, onClose }: TaskDatePickerProps) {
  const [focused, setFocused] = useState(() => new Date());
  const [month, setMonth] = useState(() => new Date());
  const rootRef = useAnchoredPopover<HTMLDivElement>(onClose);

  function focusDay(next: Date) {
    setFocused(next);
    setMonth(new Date(next.getFullYear(), next.getMonth(), 1));
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const moves: Record<string, () => Date> = {
      ArrowLeft: () => shiftDays(focused, -1),
      ArrowRight: () => shiftDays(focused, 1),
      ArrowUp: () => shiftDays(focused, -7),
      ArrowDown: () => shiftDays(focused, 7),
      PageUp: () => shiftMonths(focused, -1),
      PageDown: () => shiftMonths(focused, 1),
    };

    if (moves[event.key]) {
      event.preventDefault();
      focusDay(moves[event.key]());
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      onPick(focused);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  }

  const today = new Date();

  return (
    <div
      ref={rootRef}
      className="task-date-picker"
      style={{ left: x, top: y }}
      role="dialog"
      aria-label="Pick a date"
      tabIndex={-1}
      onKeyDown={handleKeyDown}
    >
      <div className="task-date-picker-header">
        <button type="button" aria-label="Previous month" onClick={() => setMonth(shiftMonths(month, -1))}>
          ‹
        </button>
        <strong>{monthTitle(month)}</strong>
        <button type="button" aria-label="Next month" onClick={() => setMonth(shiftMonths(month, 1))}>
          ›
        </button>
      </div>
      <div className="calendar-grid" role="grid" aria-label={monthTitle(month)}>
        {weekdayLabels.map((weekday) => (
          <span className="calendar-weekday" key={weekday}>
            {weekday}
          </span>
        ))}
        {monthGridDays(month).map((date) => (
          <button
            className={[
              "calendar-day",
              date.getMonth() === month.getMonth() ? "" : "outside-month",
              sameCalendarDate(date, today) ? "today" : "",
              sameCalendarDate(date, focused) ? "focused" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            key={date.toISOString()}
            type="button"
            tabIndex={-1}
            onClick={() => onPick(date)}
            onMouseEnter={() => setFocused(date)}
          >
            <span>{date.getDate()}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
