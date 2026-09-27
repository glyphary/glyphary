import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseTaskMeta } from "../.test-dist/task-meta.js";
import { sortTasks } from "../.test-dist/task-board.js";

test("task lines in the Tasks emoji format yield priority, dates, and bare text", () => {
  const meta = parseTaskMeta(
    "- [x] Fix bathroom closet /home 🆔 4 #todo ⏫ 📅 2025-12-01 ⏳2025-11-20 🛫 2025-11-01 ➕ 2025-10-01 ✅ 2025-12-02 🔁 every week <!-- todoist-id:abc -->",
  );

  assert.equal(meta.priority, 1);
  assert.equal(meta.priorityLabel, "High");
  assert.equal(meta.due, "2025-12-01");
  assert.equal(meta.scheduled, "2025-11-20");
  assert.equal(meta.start, "2025-11-01");
  assert.equal(meta.created, "2025-10-01");
  assert.equal(meta.done, "2025-12-02");
  assert.equal(meta.text, "- [x] Fix bathroom closet /home #todo");

  const plain = parseTaskMeta("- [ ] plain task");
  assert.equal(plain.priority, 3);
  assert.equal(plain.priorityLabel, null);
  assert.equal(plain.due, null);
  assert.equal(plain.text, "- [ ] plain task");
  assert.equal(parseTaskMeta("- [ ] 🔺 top").priority, 0);
  assert.equal(parseTaskMeta("- [ ] ⏬ later ❌ 2024-01-01").priority, 5);
  assert.equal(parseTaskMeta("- [ ] ⏬ later ❌ 2024-01-01").cancelled, "2024-01-01");
});

test("board sorts put important, soon, or fresh tasks first and keep note order otherwise", () => {
  const tasks = [
    { relativePath: "a.md", lineNumber: 1, isContentMatch: true, modifiedMs: 5, lineText: "- [ ] low 🔽 📅 2026-01-01" },
    { relativePath: "a.md", lineNumber: 2, isContentMatch: true, modifiedMs: 5, lineText: "- [ ] none" },
    { relativePath: "b.md", lineNumber: 1, isContentMatch: true, modifiedMs: 9, lineText: "- [ ] high ⏫ 📅 2026-03-01" },
    { relativePath: "c.md", lineNumber: 1, isContentMatch: true, modifiedMs: 1, lineText: "- [ ] soon 📅 2025-12-31" },
  ];
  const names = (sorted) => sorted.map((task) => task.lineText.split(" ")[3]);

  assert.deepEqual(names(sortTasks(tasks, "note")), ["low", "none", "high", "soon"]);
  assert.deepEqual(names(sortTasks(tasks, "priority")), ["high", "soon", "none", "low"]);
  assert.deepEqual(names(sortTasks(tasks, "due")), ["soon", "low", "high", "none"]);
  assert.deepEqual(names(sortTasks(tasks, "updated")), ["high", "low", "none", "soon"]);

  const board = readFileSync("src/tasks/TaskBoard.tsx", "utf8");
  assert.match(board, /className="task-board-sort"/);
  assert.match(board, /sortTasks\(grouped\[" "\], sort\)/);
  assert.match(board, /meta\.due < today/);
});
