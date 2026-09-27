/**
 * Task board helpers.
 *
 * Responsibilities:
 * - Map Markdown checkbox markers to the three board columns and back, and
 *   group task search results by column.
 *
 * Contracts:
 * - Status lives in the checkbox itself: `[ ]` to do, `[/]` in progress,
 *   `[x]` done. Obsidian themes and the Tasks plugin render `[/]` as in
 *   progress, so a board move never invents metadata a note would not have.
 * - Rewriting a line changes only the marker character; indentation, list
 *   bullet, and text are untouched.
 * - Done is shown newest-first and capped, so finished work ages out of view
 *   before it is archived out of the notes.
 * - Sorting reads the Tasks emoji metadata (`task-meta.ts`); note order is
 *   the scan order, so a note's own sequence is the default.
 */
import type { SearchResult } from "./app-types";
import { parseTaskMeta } from "./task-meta.js";

export type TaskStatus = " " | "/" | "x";

export type TaskBoardColumn = { status: TaskStatus; title: string };

export const taskBoardColumns: readonly TaskBoardColumn[] = [
  { status: " ", title: "To Do" },
  { status: "/", title: "In Progress" },
  { status: "x", title: "Done" },
];

const taskMarkerPattern = /^(\s*(?:[-*+]|\d+[.)])\s+\[)([ xX/])(\])/;

export function taskStatusFromLine(lineText: string | null | undefined): TaskStatus | null {
  const match = taskMarkerPattern.exec(lineText ?? "");

  if (!match) {
    return null;
  }

  return match[2] === "X" ? "x" : (match[2] as TaskStatus);
}

export function withTaskStatus(lineText: string, status: TaskStatus) {
  return lineText.replace(taskMarkerPattern, `$1${status}$3`);
}

export function taskBoardGroups(results: readonly SearchResult[]) {
  const groups: Record<TaskStatus, SearchResult[]> = { " ": [], "/": [], x: [] };

  for (const result of results) {
    const status = taskStatusFromLine(result.lineText);

    if (status) {
      groups[status].push(result);
    }
  }

  return groups;
}

export const doneColumnLimit = 25;

/** Content hits only, and never from the archive note, which is all `- [x]` lines. */
export function isLiveTaskResult(result: SearchResult, archiveNote: string) {
  return result.isContentMatch && result.relativePath !== archiveNote;
}

/** Newest notes first; a capped Done column keeps recent finishes visible. */
export function recentFirst(results: readonly SearchResult[]) {
  return [...results].sort((left, right) => (right.modifiedMs ?? 0) - (left.modifiedMs ?? 0));
}

export type TaskBoardSort = "note" | "priority" | "due" | "updated";

const sortStorageKey = "glyphary.taskBoardSort";

export function rememberedTaskBoardSort(storage: Pick<Storage, "getItem">): TaskBoardSort {
  try {
    const stored = storage.getItem(sortStorageKey);

    return taskBoardSorts.some((sort) => sort.id === stored) ? (stored as TaskBoardSort) : "note";
  } catch {
    return "note";
  }
}

export function rememberTaskBoardSort(storage: Pick<Storage, "setItem">, sort: TaskBoardSort) {
  try {
    storage.setItem(sortStorageKey, sort);
  } catch {
    // A blocked store only loses the remembered choice.
  }
}

export const taskBoardSorts: readonly { id: TaskBoardSort; title: string }[] = [
  { id: "note", title: "Note order" },
  { id: "priority", title: "Priority" },
  { id: "due", title: "Due date" },
  { id: "updated", title: "Recently updated" },
];

function compareDue(left: string | null, right: string | null) {
  if (left === right) {
    return 0;
  }
  // Undated tasks sort after every dated one.
  if (!left || !right) {
    return left ? -1 : 1;
  }

  return left < right ? -1 : 1;
}

export function sortTasks(results: readonly SearchResult[], sort: TaskBoardSort) {
  if (sort === "note") {
    return [...results];
  }

  if (sort === "updated") {
    return recentFirst(results);
  }

  const metas = new Map(results.map((result) => [result, parseTaskMeta(result.lineText)]));

  return [...results].sort((left, right) => {
    const leftMeta = metas.get(left)!;
    const rightMeta = metas.get(right)!;
    const byPriority = leftMeta.priority - rightMeta.priority;
    const byDue = compareDue(leftMeta.due, rightMeta.due);

    return sort === "priority" ? byPriority || byDue : byDue || byPriority;
  });
}

export function adjacentTaskStatus(status: TaskStatus, direction: -1 | 1): TaskStatus | null {
  const index = taskBoardColumns.findIndex((column) => column.status === status);

  return taskBoardColumns[index + direction]?.status ?? null;
}
