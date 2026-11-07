import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { noteLocked, toggleNoteLock } from "../.test-dist/note-lock.js";

test("locking adds the frontmatter flag and unlocking removes it", () => {
  assert.equal(noteLocked("", "---"), false);
  assert.equal(toggleNoteLock("", "---"), "locked: true");
  assert.equal(toggleNoteLock("title: Hi\n", "---"), "title: Hi\nlocked: true");
  assert.equal(noteLocked("title: Hi\nlocked: true", "---"), true);
  assert.equal(noteLocked("Locked: yes", "---"), true);
  assert.equal(noteLocked("locked: false", "---"), false);
  assert.equal(toggleNoteLock("title: Hi\nlocked: true\ntags: [a]", "---"), "title: Hi\ntags: [a]");
  assert.equal(toggleNoteLock("locked: false", "---"), "locked: true");
  assert.equal(toggleNoteLock("", "+++"), "locked = true");
  assert.equal(noteLocked("locked = true", "+++"), true);
});

test("the lock reaches the palette, the editor view, and the pane", () => {
  const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  const palette = readFileSync(new URL("../src/command-palette/command-definitions.ts", import.meta.url), "utf8");
  const pane = readFileSync(new URL("../src/editor/EditorPane.tsx", import.meta.url), "utf8");

  assert.match(palette, /id: activeNoteLocked \? "unlock-note" : "lock-note"[\s\S]*run: toggleActiveNoteLock/);
  assert.match(app, /groupEditor\.isEditable !== editable\) \{\s*groupEditor\.setEditable\(editable, false\)/);
  assert.match(app, /function toggleActiveNoteLock\(\)[\s\S]*setActiveDocumentDirty\(true\)/);
  assert.match(pane, /className="note-lock-banner"[\s\S]*toggleNoteLock\(paneMetaHeader, paneMetaDelimiter\)/);
  assert.match(pane, /showEditingChrome && !locked \? \(\s*<Toolbar/);
});

test("a locked editor drops every document change except hydration", () => {
  const guard = readFileSync(new URL("../src/editor/note-lock.ts", import.meta.url), "utf8");
  const options = readFileSync(new URL("../src/editor/editor-options.ts", import.meta.url), "utf8");
  const documents = readFileSync(new URL("../src/app-state/documents.ts", import.meta.url), "utf8");

  assert.match(guard, /!transaction\.docChanged \|\| editor\.isEditable \|\| transaction\.getMeta\(hydrateMeta\) === true/);
  assert.match(options, /extensions: \[\s*NoteLockGuard,/);
  assert.match(documents, /targetEditor\.chain\(\)\.setMeta\(hydrateMeta, true\)/);
});
