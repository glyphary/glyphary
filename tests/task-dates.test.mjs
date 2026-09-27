import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { monthGridDays } from "../.test-dist/calendar.js";
import { taskDateEmojis } from "../.test-dist/task-meta.js";
import { dateFieldInsertion, spaceBefore } from "../.test-dist/task-fields.js";

test("a month grid is six Sunday-first weeks around the month", () => {
  const days = monthGridDays(new Date(2026, 8, 15));

  assert.equal(days.length, 42);
  assert.equal(days[0].getDay(), 0);
  assert.equal(days[0].getMonth(), 7);
  assert.equal(days[0].getDate(), 30);
  assert.ok(days.some((day) => day.getMonth() === 8 && day.getDate() === 1));
  assert.ok(days.some((day) => day.getMonth() === 8 && day.getDate() === 30));
});

test("task fields are spaced the way the Tasks plugin writes them", () => {
  assert.equal(spaceBefore(""), "");
  assert.equal(spaceBefore(" "), "");
  assert.equal(spaceBefore("d"), " ");
  assert.equal(dateFieldInsertion("2026-09-27", true), "2026-09-27 ");
  assert.equal(dateFieldInsertion("2026-09-27", false), " 2026-09-27 ");
});

test("typing a Tasks date emoji opens a calendar that inserts the picked day", () => {
  const extension = readFileSync("src/editor/task-dates.ts", "utf8");
  const picker = readFileSync("src/editor/TaskDatePicker.tsx", "utf8");
  const options = readFileSync("src/editor/editor-options.ts", "utf8");
  const pickers = readFileSync("src/app-state/task-field-pickers.ts", "utf8");
  const app = readFileSync("src/App.tsx", "utf8");
  const palette = readFileSync("src/command-palette/command-definitions.ts", "utf8");

  assert.deepEqual([...taskDateEmojis], ["📅", "⏳", "⌛", "🛫", "➕", "✅", "❌"]);
  assert.match(extension, /if \(!taskDateEmojis\.includes\(text\)\)/);
  // Not in code, and a field that already carries a date is not re-prompted.
  assert.match(extension, /caretContext\(view, from\)\.inCode \|\| dateAhead\.test\(textAfterCaret\(view, from, 12\)\)/);
  assert.match(options, /createTaskDateExtension\(\{ openDatePicker: openTaskDatePicker \}\)/);
  assert.match(pickers, /dateFieldInsertion\(\s*calendarDateKey\(date\)/);
  assert.match(pickers, /function insertTaskDateField\(emoji: string\)/);
  assert.match(app, /<TaskDatePicker[\s\S]*onPick=\{pickers\.pickTaskDate\}/);
  assert.match(picker, /ArrowLeft: \(\) => shiftDays\(focused, -1\)/);
  assert.match(picker, /PageDown: \(\) => shiftMonths\(focused, 1\)/);
  assert.match(picker, /if \(event\.key === "Enter"\)/);
  assert.match(picker, /if \(event\.key === "Escape"\)/);
  assert.match(picker, /useAnchoredPopover<HTMLDivElement>\(onClose\)/);
  // Slash menu: "/due", "/scheduled", "/start" reach the calendar without
  // typing an emoji, at the root and under Insert.
  assert.match(palette, /id: "insert-due-date"[\s\S]*run: \(\) => insertTaskDateField\("📅"\)/);
  assert.match(palette, /id: "insert-scheduled-date"[\s\S]*insertTaskDateField\("⏳"\)/);
  assert.match(palette, /id: "insert-start-date"[\s\S]*insertTaskDateField\("🛫"\)/);
  assert.equal((palette.match(/\.\.\.taskDateCommandPaletteCommands,/g) ?? []).length, 2);
  assert.match(app, /insertTaskDateField: pickers\.insertTaskDateField/);
});
