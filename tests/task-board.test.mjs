import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  adjacentTaskStatus,
  rememberTaskBoardSort,
  rememberedTaskBoardSort,
  doneColumnLimit,
  recentFirst,
  taskBoardColumns,
  taskBoardGroups,
  taskStatusFromLine,
  withTaskStatus,
} from "../.test-dist/task-board.js";

test("task status lives in the checkbox marker and only the marker changes", () => {
  assert.equal(taskStatusFromLine("- [ ] a"), " ");
  assert.equal(taskStatusFromLine("  * [/] b"), "/");
  assert.equal(taskStatusFromLine("3) [X] c"), "x");
  assert.equal(taskStatusFromLine("- plain"), null);
  assert.equal(taskStatusFromLine("[ ] no bullet"), null);
  assert.equal(taskStatusFromLine(null), null);

  assert.equal(withTaskStatus("  - [ ] keep  this [x] text", "x"), "  - [x] keep  this [x] text");
  assert.equal(withTaskStatus("1. [x] done", "/"), "1. [/] done");
  assert.equal(withTaskStatus("- not a task", "x"), "- not a task");
});

test("cards group by column in file order and step between neighbours", () => {
  const results = [
    { relativePath: "b.md", lineNumber: 2, lineText: "- [x] done" },
    { relativePath: "a.md", lineNumber: 1, lineText: "- [ ] todo" },
    { relativePath: "a.md", lineNumber: 5, lineText: "- [/] doing" },
    { relativePath: "a.md", lineNumber: 7, lineText: "- [ ] todo two" },
    { relativePath: "c.md", lineNumber: 1, lineText: "not a task" },
  ];
  const groups = taskBoardGroups(results);

  assert.deepEqual(
    groups[" "].map((result) => result.lineNumber),
    [1, 7],
  );
  assert.deepEqual(groups["/"].map((result) => result.relativePath), ["a.md"]);
  assert.deepEqual(groups.x.map((result) => result.relativePath), ["b.md"]);
  assert.deepEqual(
    taskBoardColumns.map((column) => column.status),
    [" ", "/", "x"],
  );
  assert.equal(adjacentTaskStatus(" ", -1), null);
  assert.equal(adjacentTaskStatus(" ", 1), "/");
  assert.equal(adjacentTaskStatus("/", 1), "x");
  assert.equal(adjacentTaskStatus("x", 1), null);
});

test("the task board opens as its own window and talks to the main window through storage", () => {
  const app = readFileSync("src/App.tsx", "utf8");
  const main = readFileSync("src/main.tsx", "utf8");
  const board = readFileSync("src/tasks/TaskBoard.tsx", "utf8");
  const capabilities = JSON.parse(readFileSync("src-tauri/capabilities/default.json", "utf8"));

  assert.match(main, /view"\) === "tasks"/);
  assert.match(main, /<App taskBoardWindowMode \/>/);
  assert.ok(capabilities.windows.includes("tasks"));
  const hook = readFileSync("src/app-state/task-board.ts", "utf8");
  const auxWindow = readFileSync("src/app-state/aux-window.ts", "utf8");
  const peer = readFileSync("src/lib/peer-windows.ts", "utf8");
  assert.match(hook, /label: "tasks", view: "tasks", title: "Task Board"/);
  assert.match(auxWindow, /url: `index\.html\?view=\$\{spec\.view\}`/);
  assert.match(app, /canOpenWindow: isTauri\(\) && !auxiliaryWindowMode && !isIPad/);
  // Settings and the board share one window opener.
  assert.match(app, /label: "settings", view: "settings", title: "Settings"/);
  // The main window mirrors dirty tabs so the board window refuses to rewrite
  // a note with unsaved edits; the board reports its writes back the same way.
  assert.match(app, /writeDirtyFilesMirror\(dirtyFilePaths\(editorGroups\)\)/);
  assert.match(hook, /const mirror = readDirtyFilesMirror\(\)/);
  assert.match(hook, /writePeerNotice\(peerStorageKeys\.fileRevision, \{ root, relativePath \}\)/);
  assert.match(hook, /writePeerNotice\(peerStorageKeys\.openRequest/);
  assert.match(app, /peerRequestHandlersRef\.current\.reloadOpenTabFromDisk\(notice\.relativePath\)/);
  assert.match(peer, /dirtyFiles: "glyphary\.dirtyFiles"/);
  // Saves and tree changes in the main window reach the board as a revision
  // signal, so it refreshes without a manual click.
  assert.match(app, /await writeVaultFile\(vaultRoot, file\.relativePath, content\);\s*notifyVaultChanged\(vaultRoot\)/);
  assert.match(app, /setVaultTreeRevision\(\(revision\) => revision \+ 1\);\s*notifyVaultChanged\(root\)/);
  assert.match(readFileSync("src/app-state/task-board.ts", "utf8"), /subscribePeerNotices\(\[peerStorageKeys\.vaultRevision\]/);
  // HTML5 drag and drop snaps back inside the WebKit webview; cards move
  // through pointer capture and column hit-testing instead.
  assert.doesNotMatch(board, /draggable|onDragStart=|onDrop=/);
  const cardDrag = readFileSync("src/tasks/use-card-drag.ts", "utf8");
  assert.match(cardDrag, /setPointerCapture\(event\.pointerId\)/);
  assert.match(board, /const drag = useCardDrag\(/);
  assert.match(cardDrag, /closest\("\[data-task-status\]"\)/);
  assert.match(board, /data-task-status=\{column\.status\}/);
  assert.match(board, /windowSurface \? \(/);
  assert.match(board, /task-board-screen task-board-window/);
});

test("done tasks are shown newest first and archiving moves lines into the archive note", () => {
  const sorted = recentFirst([
    { relativePath: "a.md", isContentMatch: true, modifiedMs: 1 },
    { relativePath: "b.md", isContentMatch: true },
    { relativePath: "c.md", isContentMatch: true, modifiedMs: 5 },
  ]);
  assert.deepEqual(sorted.map((result) => result.relativePath), ["c.md", "a.md", "b.md"]);
  assert.ok(doneColumnLimit > 0);

  const app = readFileSync("src/App.tsx", "utf8");
  const board = readFileSync("src/tasks/TaskBoard.tsx", "utf8");
  const vault = readFileSync("src-tauri/src/vault.rs", "utf8");
  const settings = readFileSync("src/lib/settings.ts", "utf8");

  assert.match(settings, /defaultTaskArchiveNote = "Archive\/Tasks\.md"/);
  assert.match(board, /done\.slice\(0, doneColumnLimit\)/);
  // Archiving is per card only; a whole-column archive button was removed as
  // too easy to hit.
  assert.doesNotMatch(board, /onArchiveTasks\(groups\.allDone\)/);
  assert.match(board, /className="task-board-show-more"/);
  // A moved card must carry the write time or the capped, newest-first Done
  // column hides it.
  assert.match(readFileSync("src/app-state/task-board.ts", "utf8"), /\? \{ \.\.\.item, lineText, modifiedMs \}/);
  assert.match(board, /onArchiveTasks\(\[result\]\)/);
  // Every touched note plus the archive must be clean before lines move, in
  // both the overlay (open tabs) and the board window (dirty mirror).
  const boardHook = readFileSync("src/app-state/task-board.ts", "utf8");
  assert.match(boardHook, /const touched = \[\.\.\.new Set\(\[\.\.\.tasks\.map\(\(task\) => task\.relativePath\), archive\]\)\]/);
  assert.match(boardHook, /Save \$\{blocker\} before archiving its tasks/);
  assert.match(boardHook, /await refresh\(\);\s*setStatus\(`Archived/);
  assert.match(vault, /pub\(crate\) fn archive_tasks\(/);
  assert.match(vault, /fn task_block_end\(/);
  assert.match(readFileSync("src/vault/persistence.ts", "utf8"), /"archive_tasks"/);
  // Otherwise every archived task reappears in Done, scanned from the archive.
  assert.match(readFileSync("src/app-state/task-board.ts", "utf8"), /isLiveTaskResult\(result, archive\)/);
  assert.match(app, /results\.filter\(\(result\) => isLiveTaskResult\(result, archiveNote\)\)/);
});

test("the board sort is remembered per browser and falls back to note order", () => {
  const map = new Map();
  const storage = { getItem: (key) => map.get(key) ?? null, setItem: (key, value) => map.set(key, value) };

  assert.equal(rememberedTaskBoardSort(storage), "note");
  rememberTaskBoardSort(storage, "priority");
  assert.equal(rememberedTaskBoardSort(storage), "priority");
  storage.setItem("glyphary.taskBoardSort", "bogus");
  assert.equal(rememberedTaskBoardSort(storage), "note");
  assert.equal(rememberedTaskBoardSort({ getItem: () => { throw new Error("blocked"); } }), "note");
});
