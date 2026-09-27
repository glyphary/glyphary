import { useEffect, useState, type MutableRefObject } from "react";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import type { DocumentTab, SearchResult, VaultSettings } from "../lib/app-types";
import { localDayKey } from "../lib/activity-heatmap";
import { peerStorageKeys, readDirtyFilesMirror, subscribePeerNotices, writePeerNotice } from "../lib/peer-windows";
import { normalizeTaskArchiveNote } from "../lib/settings";
import { type TaskStatus, isLiveTaskResult, taskBoardColumns } from "../lib/task-board";
import { taskSearchPattern } from "../tasks/vault-tasks";
import { archiveTasks as archiveVaultTasks, searchVaultFiles, setTaskStatus } from "../vault/persistence";
import { openAuxiliaryWindow } from "./aux-window";

// Responsibilities:
// - Own the task board: its scan, the modal-or-window choice, moving a card
//   (one marker byte on disk), archiving, and the cross-window bookkeeping
//   both of those need.
// Contracts:
// - A note is rewritten only when it is clean everywhere: in this window's
//   tabs when the board is the overlay, in the main window's dirty mirror
//   when the board is its own window.
// - After a write the board tells the main window which notes changed
//   (window mode) or reloads the clean open tabs itself (overlay mode).
// - The archive note is excluded from the scan, or archived tasks would
//   come straight back.

type OpenTab = { groupId: string; tab: DocumentTab } | null | undefined;

type TaskBoardDeps = {
  vaultRoot: string;
  vaultRootRef: MutableRefObject<string>;
  vaultSettingsRef: MutableRefObject<VaultSettings>;
  /** The board runs inside its own window rather than as an overlay. */
  windowMode: boolean;
  canOpenWindow: boolean;
  setStatus: (message: string) => void;
  findOpenFileTab: (relativePath: string) => OpenTab;
  reloadOpenTabFromDisk: (relativePath: string) => Promise<void>;
  refreshDrawerTasks: () => void;
  patchDrawerTasks: (patch: (item: SearchResult) => SearchResult) => void;
  confirmDestructiveAction: (message: string, options: { okLabel?: string; title?: string }) => Promise<boolean>;
};

const vaultChangeDebounceMs = 1000;

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function useTaskBoard(deps: TaskBoardDeps) {
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const { vaultRoot, vaultRootRef, vaultSettingsRef, windowMode, canOpenWindow, setStatus } = deps;

  function archiveNote() {
    return normalizeTaskArchiveNote(vaultSettingsRef.current.taskArchiveNote);
  }

  async function refresh() {
    if (!vaultRoot) {
      return;
    }

    try {
      setLoading(true);
      const found = await searchVaultFiles(vaultRoot, taskSearchPattern("all"), {
        includeContent: true,
        markdownOnly: true,
        excludeDotPaths: true,
      });

      const archive = archiveNote();

      setResults(found.filter((result) => isLiveTaskResult(result, archive)));
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  function openBoard() {
    if (!vaultRoot) {
      setStatus("Open a vault to see its task board");
      return;
    }

    if (canOpenWindow) {
      void openAuxiliaryWindow(
        { label: "tasks", view: "tasks", title: "Task Board", width: 1100, height: 720, minWidth: 760, minHeight: 480 },
        (message) => setStatus(`Could not open the task board: ${message}`),
      ).catch((error) => setStatus(errorMessage(error)));
      return;
    }

    setOpen(true);
    void refresh();
  }

  function dirtyBlocker(relativePaths: readonly string[]) {
    if (windowMode) {
      const mirror = readDirtyFilesMirror();

      return relativePaths.find((relativePath) => mirror.includes(relativePath)) ?? null;
    }

    for (const relativePath of relativePaths) {
      const openTab = deps.findOpenFileTab(relativePath);

      if (openTab?.tab.dirty) {
        return openTab.tab.activeFile?.name ?? relativePath;
      }
    }

    return null;
  }

  async function propagateChanges(root: string, relativePaths: readonly string[]) {
    if (windowMode) {
      for (const relativePath of relativePaths) {
        writePeerNotice(peerStorageKeys.fileRevision, { root, relativePath });
      }
      return;
    }

    for (const relativePath of relativePaths) {
      await deps.reloadOpenTabFromDisk(relativePath);
    }
  }

  async function moveTask(result: SearchResult, status: TaskStatus) {
    const root = vaultRootRef.current;

    if (!root || !result.lineNumber) {
      return;
    }

    const blocker = dirtyBlocker([result.relativePath]);

    if (blocker) {
      setStatus(`Save ${blocker} before moving its tasks`);
      return;
    }

    try {
      const lineText = await setTaskStatus(root, result.relativePath, result.lineNumber, status);
      // The note was just written, so the card is the newest thing on the
      // board; without the stamp it would sort past the Done column's cap.
      const modifiedMs = Date.now();
      const patch = (item: SearchResult) =>
        item.relativePath === result.relativePath && item.lineNumber === result.lineNumber
          ? { ...item, lineText, modifiedMs }
          : item;

      setResults((items) => items.map(patch));
      deps.patchDrawerTasks(patch);
      await propagateChanges(root, [result.relativePath]);
      setStatus(`Moved task to ${taskBoardColumns.find((column) => column.status === status)?.title ?? status}`);
    } catch (error) {
      setStatus(errorMessage(error));
    }
  }

  async function archiveTasks(selection: readonly SearchResult[]) {
    const root = vaultRootRef.current;
    const tasks = selection.filter((result) => result.lineNumber);

    if (!root || tasks.length === 0) {
      return;
    }

    const archive = archiveNote();
    const touched = [...new Set([...tasks.map((task) => task.relativePath), archive])];
    const blocker = dirtyBlocker(touched);

    if (blocker) {
      setStatus(`Save ${blocker} before archiving its tasks`);
      return;
    }

    if (
      tasks.length > 1 &&
      !(await deps.confirmDestructiveAction(`Move ${tasks.length} done tasks into ${archive}?`, {
        okLabel: "Archive",
        title: "Archive tasks",
      }))
    ) {
      return;
    }

    try {
      const count = await archiveVaultTasks(
        root,
        tasks.map((task) => ({ relativePath: task.relativePath, lineNumber: task.lineNumber ?? 0 })),
        archive,
        localDayKey(new Date()),
      );

      await propagateChanges(root, touched);

      if (!windowMode) {
        deps.refreshDrawerTasks();
      }

      // Line numbers below a removed block have shifted; rescan.
      await refresh();
      setStatus(`Archived ${count} ${count === 1 ? "task" : "tasks"} into ${archive}`);
    } catch (error) {
      setStatus(errorMessage(error));
    }
  }

  function openInMainWindow(result: SearchResult) {
    writePeerNotice(peerStorageKeys.openRequest, { root: vaultRoot, relativePath: result.relativePath });
    void WebviewWindow.getByLabel("main").then((mainWindow) => mainWindow?.setFocus());
  }

  // Debounced so an autosave burst in the main window costs one scan.
  useEffect(() => {
    if (!windowMode || !vaultRoot) {
      return;
    }

    void refresh();

    let pending: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = subscribePeerNotices([peerStorageKeys.vaultRevision], (_key, notice) => {
      if (notice.root !== vaultRoot) {
        return;
      }

      if (pending) {
        clearTimeout(pending);
      }

      pending = setTimeout(() => void refresh(), vaultChangeDebounceMs);
    });

    return () => {
      if (pending) {
        clearTimeout(pending);
      }

      unsubscribe();
    };
    // refresh reads vaultRoot from this closure; both change together.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowMode, vaultRoot]);

  return {
    open,
    close: () => setOpen(false),
    results,
    loading,
    refresh,
    openBoard,
    moveTask,
    archiveTasks,
    openInMainWindow,
  };
}
