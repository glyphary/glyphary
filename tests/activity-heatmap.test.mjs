import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  activityLevel,
  buildActivityHeatmap,
  bucketActivityByDay,
  localDayKey,
} from "../.test-dist/activity-heatmap.js";

// Wednesday 2026-09-16, local time.
const today = new Date(2026, 8, 16, 15, 30);
const at = (year, month, day, hour = 12) => new Date(year, month - 1, day, hour).getTime();

test("bucketActivityByDay keys by local calendar day", () => {
  const days = bucketActivityByDay([
    { relativePath: "a.md", modifiedMs: at(2026, 9, 16, 1) },
    { relativePath: "b.md", modifiedMs: at(2026, 9, 16, 23) },
    { relativePath: "c.md", modifiedMs: at(2026, 9, 15) },
  ]);

  assert.deepEqual([...days.keys()].sort(), ["2026-09-15", "2026-09-16"]);
  assert.deepEqual(days.get("2026-09-16"), ["a.md", "b.md"]);
  assert.equal(localDayKey(new Date(2026, 0, 5)), "2026-01-05");
});

test("activityLevel scales by quartile of the busiest day", () => {
  assert.equal(activityLevel(0, 8), 0);
  assert.equal(activityLevel(1, 8), 1);
  assert.equal(activityLevel(4, 8), 2);
  assert.equal(activityLevel(8, 8), 4);
  assert.equal(activityLevel(3, 0), 0);
});

test("buildActivityHeatmap ends on today with Sunday-first week columns", () => {
  const heatmap = buildActivityHeatmap(
    [
      { relativePath: "today.md", modifiedMs: at(2026, 9, 16) },
      { relativePath: "old.md", modifiedMs: at(2024, 1, 1) },
    ],
    today,
    3,
  );

  assert.equal(heatmap.weeks.length, 3);
  assert.equal(heatmap.weeks[0][0].date.getDay(), 0);
  const last = heatmap.weeks[2];
  assert.equal(last[3].key, "2026-09-16");
  assert.equal(last[3].files[0], "today.md");
  assert.equal(last[3].level, 4);
  assert.deepEqual(last.slice(4), [null, null, null]);
  // Activity outside the window does not set the scale.
  assert.equal(heatmap.busiest, 1);
});

test("buildActivityHeatmap labels the first column of each month", () => {
  const heatmap = buildActivityHeatmap([], today, 53);

  assert.equal(heatmap.months[0].column, 0);
  const september = heatmap.months.find((month) => month.label === "Sep" && month.column > 40);
  assert.ok(september);
  assert.equal(heatmap.weeks[september.column][0].date.getMonth(), 8);
  assert.notEqual(heatmap.weeks[september.column - 1][0].date.getMonth(), 8);
});

test("activity heatmap is wired into the Recent drawer through persistence", () => {
  const app = readFileSync("src/App.tsx", "utf8");
  const persistence = readFileSync("src/vault/persistence.ts", "utf8");
  const component = readFileSync("src/vault/ActivityHeatmap.tsx", "utf8");
  const panel = readFileSync("src/vault/VaultActivityPanel.tsx", "utf8");
  const backend = readFileSync("src-tauri/src/lib.rs", "utf8");

  assert.match(persistence, /invoke<VaultFileActivity\[\]>\("list_vault_activity"/);
  assert.match(backend, /list_vault_activity,/);
  assert.match(app, /<VaultActivityPanel/);
  assert.match(app, /load: readVaultActivity,/);
  assert.match(panel, /<ActivityHeatmap/);
  assert.doesNotMatch(component, /invoke\(/);
  assert.match(component, /scroller\.scrollLeft = scroller\.scrollWidth/);
});
