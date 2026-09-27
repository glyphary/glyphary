import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { taskQuickInsertion, taskQuickItems } from "../.test-dist/task-quick-menu.js";

test("the + menu offers the five priorities, then due shortcuts, in Tasks format", () => {
  assert.deepEqual(
    taskQuickItems.map((item) => item.id),
    ["highest", "high", "medium", "low", "lowest", "due", "today", "tomorrow", "next-week"],
  );

  const now = new Date(2026, 8, 26);
  assert.equal(taskQuickInsertion("highest", now), "🔺");
  assert.equal(taskQuickInsertion("high", now), "⏫");
  assert.equal(taskQuickInsertion("lowest", now), "⏬");
  assert.equal(taskQuickInsertion("today", now), "📅 2026-09-26");
  assert.equal(taskQuickInsertion("tomorrow", now), "📅 2026-09-27");
  assert.equal(taskQuickInsertion("next-week", now), "📅 2026-10-03");
  // Month rollover stays in local time.
  assert.equal(taskQuickInsertion("next-week", new Date(2026, 11, 28)), "📅 2027-01-04");
  assert.equal(taskQuickInsertion("due", now), null);
  assert.equal(taskQuickInsertion("nope", now), null);
});

test("+ on a task line opens the menu and the choice replaces the +", () => {
  const extension = readFileSync("src/editor/task-quick-menu.ts", "utf8");
  const options = readFileSync("src/editor/editor-options.ts", "utf8");
  const pickers = readFileSync("src/app-state/task-field-pickers.ts", "utf8");
  const app = readFileSync("src/App.tsx", "utf8");
  const menu = readFileSync("src/editor/TaskQuickMenu.tsx", "utf8");

  assert.match(extension, /if \(text !== "\+"\)/);
  // Task lines only, outside code, at a word start ("C++" never triggers).
  assert.match(extension, /if \(!caret\.inTask \|\| caret\.inCode \|\| !caret\.wordStart\)/);
  assert.match(options, /createTaskQuickMenuExtension\(\{ openQuickMenu: openTaskQuickMenu \}\)/);
  assert.match(pickers, /=== "\+" \? pos - 1 : pos/);
  assert.match(pickers, /if \(insertion === null\) \{\s*insertTaskDateField\("📅"\)/);
  assert.match(app, /<TaskQuickMenu[\s\S]*onChoose=\{pickers\.applyTaskQuickChoice\}/);
  assert.match(menu, /if \(event\.key === "Enter"\)/);
  assert.match(menu, /if \(event\.key === "Escape"\)/);
  assert.match(menu, /useAnchoredPopover<HTMLDivElement>\(onClose\)/);
});
