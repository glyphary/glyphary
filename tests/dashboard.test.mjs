import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { dashboardGreeting, dashboardSummary, dashboardTasks, friendlyDate } from "../.test-dist/dashboard.js";

test("the dashboard splits dated open tasks into overdue and due today, oldest and most important first", () => {
  const tasks = [
    { relativePath: "a.md", lineNumber: 1, isContentMatch: true, lineText: "- [ ] late low 🔽 📅 2026-09-20" },
    { relativePath: "a.md", lineNumber: 2, isContentMatch: true, lineText: "- [ ] late high ⏫ 📅 2026-09-20" },
    { relativePath: "b.md", lineNumber: 1, isContentMatch: true, lineText: "- [ ] later 📅 2026-09-30" },
    { relativePath: "c.md", lineNumber: 1, isContentMatch: true, lineText: "- [/] today 📅 2026-10-02" },
    { relativePath: "d.md", lineNumber: 1, isContentMatch: true, lineText: "- [ ] tomorrow 📅 2026-10-03" },
    { relativePath: "e.md", lineNumber: 1, isContentMatch: true, lineText: "- [ ] undated" },
  ];
  const label = (result) => result.lineText.replace(/^- \[.\] /, "").split(" ").slice(0, 2).join(" ");
  const groups = dashboardTasks(tasks, "2026-10-02");

  assert.deepEqual(groups.overdue.map(label), ["late high", "late low", "later 📅"]);
  assert.deepEqual(groups.today.map(label), ["today 📅"]);
});

test("Today's Dashboard is a palette command that opens, completes, and refreshes tasks", () => {
  const palette = readFileSync("src/command-palette/command-definitions.ts", "utf8");
  const app = readFileSync("src/App.tsx", "utf8");
  const hook = readFileSync("src/app-state/dashboard.ts", "utf8");
  const view = readFileSync("src/dashboard/TodayDashboard.tsx", "utf8");

  assert.match(palette, /id: "open-today-dashboard"[\s\S]*run: openTodayDashboard/);
  assert.match(app, /openTodayDashboard: dashboard\.openDashboard/);
  // Completing reuses the board's move, so the dirty-tab guard applies.
  assert.match(app, /taskBoard\.moveTask\(result, "x"\)\.then\(\(\) => dashboard\.remove\(result\)\)/);
  // Open tasks only, through the one scan the board uses (archive note excluded).
  assert.match(hook, /scanLiveTasks\(vaultRoot, "incomplete", vaultSettingsRef\.current\)/);
  assert.match(readFileSync("src/app-state/task-board.ts", "utf8"), /export async function scanLiveTasks/);
  assert.match(view, /title="Due today"/);
  assert.match(view, /title="Slipped"/);
});

test("the greeting follows the clock and the summary is honest about what slipped", () => {
  assert.equal(dashboardGreeting(new Date(2026, 9, 2, 8)), "Good morning");
  assert.equal(dashboardGreeting(new Date(2026, 9, 2, 14)), "Good afternoon");
  assert.equal(dashboardGreeting(new Date(2026, 9, 2, 19)), "Good evening");
  assert.equal(dashboardGreeting(new Date(2026, 9, 2, 23)), "Still at it");
  assert.equal(dashboardGreeting(new Date(2026, 9, 2, 3)), "Burning the midnight oil");
  assert.match(friendlyDate(new Date(2026, 9, 2)), /Friday/);

  const task = (lineText) => ({ relativePath: "a.md", lineNumber: 1, isContentMatch: true, lineText });
  assert.equal(dashboardSummary({ today: [], overdue: [] }), "Nothing is due and nothing has slipped. The day is yours.");
  assert.equal(dashboardSummary({ today: [task("x")], overdue: [] }), "One thing due today, and that's all.");
  assert.equal(dashboardSummary({ today: [task("x"), task("y")], overdue: [] }), "2 things due today. Nothing has slipped.");
  assert.equal(dashboardSummary({ today: [], overdue: [task("x")] }), "Nothing new today, but one task is waiting from earlier.");
  assert.equal(
    dashboardSummary({ today: [task("x")], overdue: [task("y"), task("z")] }),
    "1 thing due today, and 2 tasks from earlier still open. Start with the oldest.",
  );

  const view = readFileSync("src/dashboard/TodayDashboard.tsx", "utf8");
  // A tick plays its exit before the note is rewritten, so it feels acknowledged.
  assert.match(view, /window\.setTimeout\(\(\) => \{\s*onCompleteTask\(result\);/);
  assert.match(view, /title="Slipped"/);
});
