import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { inlineTagRanges } from "../.test-dist/inline-tags.js";

test("inline tags follow the backend scanner's rules", () => {
  const text = "this is #ai for the masses, see #ml/notes. issue #1 and foo#bar and #Tag_2)";
  const ranges = inlineTagRanges(text);

  assert.deepEqual(
    ranges.map((range) => [range.tag, text.slice(range.from, range.to)]),
    [
      ["ai", "#ai"],
      ["ml/notes", "#ml/notes"],
      ["tag_2", "#Tag_2"],
    ],
  );
  assert.deepEqual(inlineTagRanges("#start of text"), [{ from: 0, to: 6, tag: "start" }]);
  assert.deepEqual(inlineTagRanges("no tags here, # alone, ## heading"), []);
  assert.deepEqual(inlineTagRanges("url http://x.test/#frag"), []);
});

test("the editor decorates tags without touching the document", () => {
  const options = readFileSync("src/editor/editor-options.ts", "utf8");
  const extension = readFileSync("src/editor/inline-tags.ts", "utf8");
  const css = readFileSync("src/App.css", "utf8");

  assert.match(options, /createInlineTagExtension\(getTagColors\)/);
  assert.match(extension, /Decoration\.inline\(/);
  assert.match(extension, /parent\?\.type\.spec\.code/);
  assert.match(extension, /mark\.type\.name === "code"/);
  assert.match(css, /\.editor-surface \.inline-tag \{/);
});
