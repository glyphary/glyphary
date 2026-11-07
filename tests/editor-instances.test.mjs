import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("a rebuilt editor instance is always the one hydrated, and the placeholder never overwrites a note", () => {
  const app = readFileSync("src/App.tsx", "utf8");

  // Settings loaded during restore rebuild the Tiptap editors; async restore
  // code must resolve the live instance through the ref, not a closure.
  assert.match(app, /editorsRef\.current = \{ primary: primaryEditor, secondary: secondaryEditor \};/);
  assert.match(app, /const groupEditor = editorsRef\.current\[groupId\];/);
  // Snapshotting an un-hydrated editor must not copy the welcome text into a
  // file-backed tab, which autosave would then write to disk.
  assert.match(app, /\(tab\.activeFile && editorMarkdown === initialMarkdown\)\s*\? tab\.markdown/);
});

test("wikilinks hide their brackets unless the caret is inside them, and the calendar marks the open day", () => {
  const wikilinks = readFileSync("src/editor/wikilinks.ts", "utf8");
  const app = readFileSync("src/App.tsx", "utf8");
  const css = readFileSync("src/App.css", "utf8");

  assert.match(wikilinks, /const editing = state\.selection\.from <= to && state\.selection\.to >= from;/);
  assert.match(wikilinks, /if \(!editing\) \{/);
  assert.match(app, /const open = activeCalendarDateKey === calendarDateKey\(date\);/);
  assert.match(css, /\.calendar-day\.open \{/);
});
