import { useState } from "react";
import type { SearchResult } from "../lib/app-types";
import { type DashboardTasks, dashboardGreeting, dashboardSummary, friendlyDate } from "../lib/dashboard";
import { taskKey, taskLabel } from "../lib/task-board";
import { parseTaskMeta } from "../lib/task-meta";
import { ModalDialog } from "../ui/ModalDialog";

// Responsibilities:
// - Show today's dashboard: a greeting, the tasks due today, and the ones
//   overdue, each openable and completable in place.
// Contracts:
// - Completing a task is delegated to App, which rewrites the note the same
//   way the board does. The row plays its exit first so the tick feels
//   acknowledged, then leaves once the note is written.

type TodayDashboardProps = {
  tasks: DashboardTasks;
  loading: boolean;
  now: Date;
  onOpenTask: (result: SearchResult) => void;
  onCompleteTask: (result: SearchResult) => void;
  onRefresh: () => void;
  onRequestClose: () => void;
};

// Must match the `dashboard-leave` animation in App.css: the note is only
// written once the row has finished leaving.
const exitDurationMs = 360;

function DayIcon({ hour }: { hour: number }) {
  const night = hour < 6 || hour >= 20;

  return night ? (
    <svg className="dashboard-day-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M15.5 3.5a8.5 8.5 0 1 0 5 15.4A9.5 9.5 0 0 1 15.5 3.5Z" />
    </svg>
  ) : (
    <svg className="dashboard-day-icon" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" />
    </svg>
  );
}

function TaskSection({
  title,
  emptyText,
  items,
  overdue,
  leaving,
  onOpenTask,
  onTick,
}: {
  title: string;
  emptyText: string;
  items: readonly SearchResult[];
  overdue: boolean;
  leaving: ReadonlySet<string>;
  onOpenTask: (result: SearchResult) => void;
  onTick: (result: SearchResult) => void;
}) {
  return (
    <section className="dashboard-section" aria-label={title}>
      <h3>
        {title}
        <span className="task-board-count">{items.length}</span>
      </h3>
      {items.length === 0 ? <p className="dashboard-empty">{emptyText}</p> : null}
      <ul className="dashboard-tasks">
        {items.map((result) => {
          const meta = parseTaskMeta(result.lineText);
          const key = taskKey(result);

          return (
            <li key={key} className={leaving.has(key) ? "dashboard-task leaving" : "dashboard-task"}>
              <input
                type="checkbox"
                aria-label={`Mark done: ${taskLabel(result.lineText)}`}
                checked={leaving.has(key)}
                onChange={() => onTick(result)}
              />
              <button type="button" className="dashboard-task-open" onClick={() => onOpenTask(result)}>
                <strong>{taskLabel(result.lineText)}</strong>
                <span>
                  {meta.priorityLabel ? <em className={`task-board-priority priority-${meta.priority}`}>{meta.priorityLabel}</em> : null}
                  <em className={overdue ? "task-board-due overdue" : "task-board-due"}>
                    {overdue ? "Due " : "Today "}
                    {meta.due}
                  </em>
                  <small>{result.relativePath}</small>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function TodayDashboard({
  tasks,
  loading,
  now,
  onOpenTask,
  onCompleteTask,
  onRefresh,
  onRequestClose,
}: TodayDashboardProps) {
  const [leaving, setLeaving] = useState<ReadonlySet<string>>(new Set());

  function tick(result: SearchResult) {
    const key = taskKey(result);

    if (leaving.has(key)) {
      return;
    }

    setLeaving((current) => new Set(current).add(key));
    window.setTimeout(() => {
      onCompleteTask(result);
      // Cleared so the same key, should a refresh bring the task back, is not
      // stuck mid-exit.
      setLeaving((current) => {
        const next = new Set(current);

        next.delete(key);
        return next;
      });
    }, exitDurationMs);
  }

  return (
    <ModalDialog className="task-board-screen" aria-label="Today's dashboard" onRequestClose={onRequestClose}>
      <section className="task-board-card dashboard-card">
        <header className="dashboard-header">
          <DayIcon hour={now.getHours()} />
          <div className="dashboard-heading">
            <p className="dashboard-date">{friendlyDate(now)}</p>
            <h2>{dashboardGreeting(now)}</h2>
            <p className="dashboard-summary">{loading ? "Looking through the vault..." : dashboardSummary(tasks)}</p>
          </div>
          <div className="graph-view-actions">
            <button className="inline-action" type="button" disabled={loading} onClick={onRefresh}>
              {loading ? "Refreshing..." : "Refresh"}
            </button>
            <button className="inline-action" type="button" onClick={onRequestClose}>
              Close
            </button>
          </div>
        </header>
        <div className="dashboard-columns">
          <TaskSection
            title="Due today"
            emptyText={loading ? "Loading..." : "Nothing due today. Enjoy the quiet."}
            items={tasks.today}
            overdue={false}
            leaving={leaving}
            onOpenTask={onOpenTask}
            onTick={tick}
          />
          <TaskSection
            title="Slipped"
            emptyText={loading ? "Loading..." : "Nothing overdue. Look at you."}
            items={tasks.overdue}
            overdue
            leaving={leaving}
            onOpenTask={onOpenTask}
            onTick={tick}
          />
        </div>
      </section>
    </ModalDialog>
  );
}
