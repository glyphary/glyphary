import { useMemo, useState } from "react";
import { localDayKey } from "../lib/activity-heatmap";
import type { SearchResult } from "../lib/app-types";
import {
  type TaskBoardSort,
  type TaskStatus,
  adjacentTaskStatus,
  doneColumnLimit,
  recentFirst,
  rememberTaskBoardSort,
  rememberedTaskBoardSort,
  sortTasks,
  taskBoardColumns,
  taskBoardGroups,
  taskBoardSorts,
  taskStatusFromLine,
} from "../lib/task-board";
import { parseTaskMeta } from "../lib/task-meta";
import { ModalDialog } from "../ui/ModalDialog";
import { useCardDrag } from "./use-card-drag";

// Responsibilities:
// - Show every vault task as a card in a To Do / In Progress / Done board and
//   report moves between columns.
// Contracts:
// - Cards are search results; the board never edits notes itself. A drop or
//   an arrow button asks App to change that line's checkbox marker.
// - Dragging is delegated to `useCardDrag`; this component only renders the
//   drag state it reports. The arrow buttons give the same move to keyboard
//   users.
// - `windowSurface` fills a dedicated window instead of a modal overlay; the
//   board itself is the same either way.
// - Done shows the newest finishes up to a cap, lifted by a button at the
//   foot of the column; archiving is per card only, so no single click can
//   rewrite every note at once.
// - Cards show the Tasks-format priority and due date, and every column
//   follows one sort choice, remembered per browser.

type TaskBoardProps = {
  results: readonly SearchResult[];
  loading: boolean;
  onMoveTask: (result: SearchResult, status: TaskStatus) => void;
  onArchiveTasks: (results: readonly SearchResult[]) => void;
  onOpenTask: (result: SearchResult) => void;
  onRefresh: () => void;
  onRequestClose: () => void;
  windowSurface?: boolean;
};

function taskKey(result: SearchResult) {
  return `${result.relativePath}:${result.lineNumber ?? 0}`;
}

export function TaskBoard({
  results,
  loading,
  onMoveTask,
  onArchiveTasks,
  onOpenTask,
  onRefresh,
  onRequestClose,
  windowSurface = false,
}: TaskBoardProps) {
  const [query, setQuery] = useState("");
  const [showAllDone, setShowAllDone] = useState(false);
  const [sort, setSort] = useState<TaskBoardSort>(() => rememberedTaskBoardSort(window.localStorage));
  const today = localDayKey(new Date());
  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const visible = needle
      ? results.filter(
          (result) =>
            (result.lineText ?? "").toLowerCase().includes(needle) ||
            result.relativePath.toLowerCase().includes(needle),
        )
      : results;

    const grouped = taskBoardGroups(visible);
    // Note order would bury fresh finishes under the cap, so Done defaults to newest first.
    const done = sort === "note" ? recentFirst(grouped.x) : sortTasks(grouped.x, sort);

    return {
      " ": sortTasks(grouped[" "], sort),
      "/": sortTasks(grouped["/"], sort),
      x: showAllDone ? done : done.slice(0, doneColumnLimit),
      allDone: done,
    };
  }, [query, results, showAllDone, sort]);

  function chooseSort(next: TaskBoardSort) {
    setSort(next);
    rememberTaskBoardSort(window.localStorage, next);
  }
  const byKey = useMemo(() => new Map(results.map((result) => [taskKey(result), result])), [results]);

  const drag = useCardDrag((key, status) => {
    const result = byKey.get(key);

    if (result && taskStatusFromLine(result.lineText) !== status) {
      onMoveTask(result, status);
    }
  });

  const board = (
      <section className="task-board-card">
        <header className="graph-view-header">
          <div>
            <h2>Task Board</h2>
            <p>Every task in the vault. Move a card to change its checkbox in the note.</p>
          </div>
          <div className="graph-view-actions">
            <input
              className="graph-view-filter"
              type="search"
              placeholder="Filter tasks"
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
            />
            <select
              className="task-board-sort"
              aria-label="Sort tasks"
              value={sort}
              onChange={(event) => chooseSort(event.currentTarget.value as TaskBoardSort)}
            >
              {taskBoardSorts.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.title}
                </option>
              ))}
            </select>
            <button className="inline-action" type="button" disabled={loading} onClick={onRefresh}>
              {loading ? "Refreshing..." : "Refresh"}
            </button>
            <button className="inline-action" type="button" onClick={onRequestClose}>
              Close
            </button>
          </div>
        </header>
        <div className="task-board-columns">
          {taskBoardColumns.map((column) => (
            <section
              key={column.status}
              className={drag.dropStatus === column.status ? "task-board-column drop-target" : "task-board-column"}
              aria-label={column.title}
              data-task-status={column.status}
            >
              <h3>
                {column.title}
                <span className="task-board-count">{groups[column.status].length}</span>
              </h3>
              <div className="task-board-cards">
                {groups[column.status].map((result) => {
                  const key = taskKey(result);
                  const meta = parseTaskMeta(result.lineText);
                  const label = meta.text.replace(/^(?:[-*+]|\d+[.)])\s+\[.\]\s*/, "") || "Task";
                  const overdue = column.status !== "x" && meta.due !== null && meta.due < today;
                  const previous = adjacentTaskStatus(column.status, -1);
                  const next = adjacentTaskStatus(column.status, 1);

                  return (
                    <article
                      key={key}
                      className={drag.dragKey === key ? "task-board-item dragging" : "task-board-item"}
                    >
                      <button
                        className="task-board-open"
                        type="button"
                        title={`${result.relativePath}:${result.lineNumber ?? ""}`}
                        {...drag.cardHandlers(key, label)}
                        onClick={() => {
                          if (!drag.consumeClick()) {
                            onOpenTask(result);
                          }
                        }}
                      >
                        <strong>{label}</strong>
                        {meta.priorityLabel || meta.due ? (
                          <span className="task-board-meta">
                            {meta.priorityLabel ? (
                              <em className={`task-board-priority priority-${meta.priority}`}>
                                {meta.priorityLabel}
                              </em>
                            ) : null}
                            {meta.due ? (
                              <em className={overdue ? "task-board-due overdue" : "task-board-due"}>
                                {overdue ? "Overdue " : "Due "}
                                {meta.due}
                              </em>
                            ) : null}
                          </span>
                        ) : null}
                        <span>{result.relativePath}</span>
                      </button>
                      <span className="task-board-move">
                        <button
                          type="button"
                          aria-label={previous ? `Move to ${taskBoardColumns.find((c) => c.status === previous)?.title}` : "First column"}
                          disabled={!previous}
                          onClick={() => previous && onMoveTask(result, previous)}
                        >
                          ‹
                        </button>
                        {column.status === "x" ? (
                          <button
                            type="button"
                            aria-label="Archive this task"
                            title="Move into the archive note"
                            onClick={() => onArchiveTasks([result])}
                          >
                            ⤓
                          </button>
                        ) : (
                          <button
                            type="button"
                            aria-label={next ? `Move to ${taskBoardColumns.find((c) => c.status === next)?.title}` : "Last column"}
                            disabled={!next}
                            onClick={() => next && onMoveTask(result, next)}
                          >
                            ›
                          </button>
                        )}
                      </span>
                    </article>
                  );
                })}
                {groups[column.status].length === 0 ? (
                  <p className="task-board-empty">{loading ? "Loading..." : "Nothing here."}</p>
                ) : null}
                {column.status === "x" && groups.allDone.length > doneColumnLimit ? (
                  <button
                    className="task-board-show-more"
                    type="button"
                    onClick={() => setShowAllDone((value) => !value)}
                  >
                    {showAllDone ? "Show Recent" : `Show All (${groups.allDone.length})`}
                  </button>
                ) : null}
              </div>
            </section>
          ))}
        </div>
      </section>
  );

  const ghostNode = drag.ghost ? (
    <div className="task-board-ghost" style={{ left: drag.ghost.x, top: drag.ghost.y }} aria-hidden="true">
      {drag.ghost.label}
    </div>
  ) : null;

  return windowSurface ? (
    <div className="task-board-screen task-board-window" data-tauri-drag-region>
      {board}
      {ghostNode}
    </div>
  ) : (
    <ModalDialog className="task-board-screen" aria-label="Task board" onRequestClose={onRequestClose}>
      {board}
      {ghostNode}
    </ModalDialog>
  );
}
