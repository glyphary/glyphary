import { useState, type MutableRefObject } from "react";
import { localDayKey } from "../lib/activity-heatmap";
import type { SearchResult, VaultSettings } from "../lib/app-types";
import { type DashboardTasks, dashboardTasks } from "../lib/dashboard";
import { taskKey } from "../lib/task-board";
import { scanLiveTasks } from "./task-board";

// Responsibilities:
// - Own the Today's dashboard overlay: open state and the scan of open tasks
//   that feeds its due-today and overdue lists.
// Contracts:
// - Reuses the task scan the board uses, so the archive note is excluded
//   the same way and a task moved elsewhere is reflected after `refresh`.

type DashboardDeps = {
  vaultRoot: string;
  vaultSettingsRef: MutableRefObject<VaultSettings>;
  setStatus: (message: string) => void;
};

const empty: DashboardTasks = { overdue: [], today: [] };

export function useTodayDashboard({ vaultRoot, vaultSettingsRef, setStatus }: DashboardDeps) {
  const [open, setOpen] = useState(false);
  const [tasks, setTasks] = useState<DashboardTasks>(empty);
  const [loading, setLoading] = useState(false);

  async function refresh() {
    if (!vaultRoot) {
      return;
    }

    try {
      setLoading(true);
      setTasks(
        dashboardTasks(
          await scanLiveTasks(vaultRoot, "incomplete", vaultSettingsRef.current),
          localDayKey(new Date()),
        ),
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }

  function openDashboard() {
    if (!vaultRoot) {
      setStatus("Open a vault to see today's dashboard");
      return;
    }

    setOpen(true);
    void refresh();
  }

  /** Drops one task from the lists without a rescan, after it was completed. */
  function remove(result: SearchResult) {
    const key = taskKey(result);

    setTasks((current) => ({
      overdue: current.overdue.filter((item) => taskKey(item) !== key),
      today: current.today.filter((item) => taskKey(item) !== key),
    }));
  }

  return { open, close: () => setOpen(false), tasks, loading, refresh, openDashboard, remove };
}
