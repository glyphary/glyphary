import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  decodeTaskStatus,
  encodeTaskStatus,
  normalizeTaskMarkers,
  taskStatusLabels,
} from "../.test-dist/task-status.js";

test("non-standard task markers become standard boxes carrying a sentinel", () => {
  const source = [
    "- [ ] open",
    "- [x] done",
    "- [X] also done",
    "- [/] doing",
    "  * [-] nested cancelled",
    "3) [>] forwarded",
    "- [?] question mark",
    "- [[Not a task]] wikilink bullet",
    "- [ab] two chars is not a marker",
    "```",
    "- [/] inside a fence stays",
    "```",
    "- [!] after the fence",
  ].join("\n");
  const lines = normalizeTaskMarkers(source).split("\n");

  assert.equal(lines[0], "- [ ] open");
  assert.equal(lines[1], "- [x] done");
  assert.equal(lines[2], "- [X] also done");
  assert.equal(lines[3], `- [ ] ${encodeTaskStatus("/")} doing`);
  assert.equal(lines[4], `  * [ ] ${encodeTaskStatus("-")} nested cancelled`);
  assert.equal(lines[5], `3) [ ] ${encodeTaskStatus(">")} forwarded`);
  assert.equal(lines[6], `- [ ] ${encodeTaskStatus("?")} question mark`);
  assert.equal(lines[7], "- [[Not a task]] wikilink bullet");
  assert.equal(lines[8], "- [ab] two chars is not a marker");
  assert.equal(lines[10], "- [/] inside a fence stays");
  assert.equal(lines[12], `- [ ] ${encodeTaskStatus("!")} after the fence`);

  // Sentinels use private-use code points only, so no Markdown syntax fires.
  for (const status of ["/", "-", ">", "<", "?", "!", "*"]) {
    const encoded = encodeTaskStatus(status);
    assert.ok([...encoded].every((character) => character >= "" && character <= ""), status);
    assert.deepEqual(decodeTaskStatus(`${encoded} text`), { status, text: "text" });
  }
  assert.deepEqual(decodeTaskStatus("plain"), { status: null, text: "plain" });
  assert.equal(taskStatusLabels["/"], "In progress");
});

test("the editor uses the status-aware task item and lexes through the normalizer", () => {
  const options = readFileSync("src/editor/editor-options.ts", "utf8");
  const extension = readFileSync("src/editor/task-status.ts", "utf8");
  const marked = readFileSync("src/lib/markdown-table.ts", "utf8");
  const css = readFileSync("src/App.css", "utf8");

  assert.match(options, /StatusTaskItem\.configure\(\{\s*nested: true,\s*\}\)/);
  assert.doesNotMatch(options, /\bTaskItem\.configure/);
  assert.match(marked, /super\.lex\(normalizeTaskMarkers\(src\)\)/);
  assert.match(extension, /markdown\.replace\(\/\^\(\\s\*\[-\*\+\] \)\\\[ \\\] \/, `\$1\[\$\{attrs\.status\}\] `\)/);
  // The node view emits li[data-checked] with no data-type.
  assert.match(css, /ul\[data-type="taskList"\] > li\[data-status="\/"\]/);
  assert.match(css, /ul\[data-type="taskList"\] > li\[data-status="-"\]/);
});
