/**
 * Today's dashboard.
 *
 * Responsibilities:
 * - Pick, from the vault's open tasks, the ones due today and the ones past
 *   due, in the order a person would work them.
 *
 * Contracts:
 * - Dates are the Tasks-format `📅` due date compared as `YYYY-MM-DD`
 *   strings against the local day, so no timezone math is involved.
 * - Both lists use the board's due-date order: oldest first, ties by
 *   priority. Tasks without a due date are not shown.
 * - The greeting and the one-line summary are plain functions of the clock
 *   and the counts, so the same day reads the same way all day.
 */
import type { SearchResult } from "./app-types";
import { sortTasks } from "./task-board.js";
import { parseTaskMeta } from "./task-meta.js";

export type DashboardTasks = {
  overdue: SearchResult[];
  today: SearchResult[];
};

export function dashboardTasks(results: readonly SearchResult[], todayKey: string): DashboardTasks {
  const due = new Map(results.map((result) => [result, parseTaskMeta(result.lineText).due]));
  const dated = sortTasks(
    results.filter((result) => {
      const day = due.get(result);

      return typeof day === "string" && day <= todayKey;
    }),
    "due",
  );

  return {
    overdue: dated.filter((result) => due.get(result) !== todayKey),
    today: dated.filter((result) => due.get(result) === todayKey),
  };
}

export function dashboardGreeting(now: Date) {
  const hour = now.getHours();

  if (hour < 5) {
    return "Burning the midnight oil";
  }
  if (hour < 12) {
    return "Good morning";
  }
  if (hour < 17) {
    return "Good afternoon";
  }
  if (hour < 22) {
    return "Good evening";
  }

  return "Still at it";
}

export function friendlyDate(now: Date) {
  return now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}

/** One sentence about the day, warm but honest about what slipped. */
export function dashboardSummary(tasks: DashboardTasks) {
  const today = tasks.today.length;
  const overdue = tasks.overdue.length;
  const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;

  if (today === 0 && overdue === 0) {
    return "Nothing is due and nothing has slipped. The day is yours.";
  }
  if (overdue === 0) {
    return today === 1
      ? "One thing due today, and that's all."
      : `${count(today, "thing")} due today. Nothing has slipped.`;
  }
  if (today === 0) {
    return overdue === 1
      ? "Nothing new today, but one task is waiting from earlier."
      : `Nothing new today, but ${count(overdue, "task")} are waiting from earlier.`;
  }

  return `${count(today, "thing")} due today, and ${count(overdue, "task")} from earlier still open. Start with the oldest.`;
}
