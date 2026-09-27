/**
 * Task quick menu: what "+" on a task line offers.
 *
 * Responsibilities:
 * - List the priorities and due-date shortcuts, and turn a choice into the
 *   Tasks-format text that goes into the line.
 *
 * Contracts:
 * - Output is the Tasks plugin vocabulary only: a priority emoji, or `📅`
 *   with an ISO date. "Due date" itself has no text; the caller opens the
 *   calendar for it.
 * - Relative days count from the given date in local time, so "tomorrow"
 *   never crosses a timezone.
 */
import { calendarDateKey } from "./calendar.js";

export type TaskQuickItem = {
  id: string;
  label: string;
  emoji: string;
  /** Items are drawn in groups; the first item of a new group starts one. */
  group: "priority" | "due";
};

export const taskQuickItems: readonly TaskQuickItem[] = [
  { id: "highest", label: "Highest priority", emoji: "🔺", group: "priority" },
  { id: "high", label: "High priority", emoji: "⏫", group: "priority" },
  { id: "medium", label: "Medium priority", emoji: "🔼", group: "priority" },
  { id: "low", label: "Low priority", emoji: "🔽", group: "priority" },
  { id: "lowest", label: "Lowest priority", emoji: "⏬", group: "priority" },
  { id: "due", label: "Due date...", emoji: "📅", group: "due" },
  { id: "today", label: "Due today", emoji: "📅", group: "due" },
  { id: "tomorrow", label: "Due tomorrow", emoji: "📅", group: "due" },
  { id: "next-week", label: "Due next week", emoji: "📅", group: "due" },
];

const dayOffsets: Record<string, number> = { today: 0, tomorrow: 1, "next-week": 7 };

/** The text a choice inserts, or null when the choice opens the calendar. */
export function taskQuickInsertion(id: string, now: Date): string | null {
  const item = taskQuickItems.find((candidate) => candidate.id === id);

  if (!item) {
    return null;
  }

  if (item.group === "priority") {
    return item.emoji;
  }

  if (id === "due") {
    return null;
  }

  const date = new Date(now);

  date.setDate(now.getDate() + dayOffsets[id]);

  return `📅 ${calendarDateKey(date)}`;
}
