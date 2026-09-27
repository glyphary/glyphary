import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { inlineSuggestInsertion, personSuggestions, tagSuggestions } from "../.test-dist/inline-suggest-items.js";

test("tag rows rank by use, people rows come from People/, and acceptance writes plain text", () => {
  const tags = [
    { tag: "ai", files: ["a.md"] },
    { tag: "project/trr", files: ["a.md", "b.md", "c.md"] },
    { tag: "project/sre", files: ["a.md", "b.md", "c.md"] },
  ];

  assert.deepEqual(
    tagSuggestions(tags, "").map((item) => item.label),
    ["#project/sre", "#project/trr", "#ai"],
  );
  assert.deepEqual(tagSuggestions(tags, "PROJ").map((item) => item.id), ["project/sre", "project/trr"]);
  assert.equal(tagSuggestions(tags, "trr")[0].detail, "3 notes");
  assert.equal(tagSuggestions(tags, "ai")[0].detail, "1 note");

  const files = [
    { name: "Jane Doe.md", relativePath: "People/Jane Doe.md" },
    { name: "Janitor.md", relativePath: "Notes/Janitor.md" },
    { name: "Marcin Pycko.md", relativePath: "People/Team/Marcin Pycko.md" },
  ];

  assert.deepEqual(personSuggestions(files, "").map((item) => item.label), ["Jane Doe", "Marcin Pycko"]);
  assert.deepEqual(personSuggestions(files, "ma").map((item) => item.label), ["Marcin Pycko"]);
  assert.equal(inlineSuggestInsertion("tag", { id: "project/trr", label: "#project/trr", detail: "" }), "#project/trr ");
  assert.equal(inlineSuggestInsertion("person", { id: "x", label: "Jane Doe", detail: "" }), "[[Jane Doe]] ");
});

test("# and @ complete inline at the caret while typing continues in the editor", () => {
  const extension = readFileSync("src/editor/inline-suggest.ts", "utf8");
  const trigger = readFileSync("src/editor/typed-trigger.ts", "utf8");
  const hook = readFileSync("src/app-state/inline-suggest.ts", "utf8");
  const options = readFileSync("src/editor/editor-options.ts", "utf8");
  const app = readFileSync("src/App.tsx", "utf8");
  const menu = readFileSync("src/editor/InlineSuggestMenu.tsx", "utf8");
  const wikilinks = readFileSync("src/editor/wikilinks.ts", "utf8");

  assert.match(extension, /const triggers: Record<string, InlineSuggestKind> = \{ "#": "tag", "@": "person" \}/);
  // Word-starting triggers only; "# " at a paragraph start stays a heading
  // unless inside a list item.
  assert.match(extension, /if \(caret\.inCode \|\| !caret\.wordStart\)/);
  assert.match(extension, /if \(kind === "tag" && caret\.atBlockStart && !caret\.inList\)/);
  assert.match(trigger, /wordStart: before === "" \|\| \/\\s\/\.test\(before\)/);
  // The query is read from the document between trigger and caret, and the
  // session ends on whitespace or when the caret leaves the word.
  assert.match(extension, /const typed = state\.doc\.textBetween\(plugin\.from, from\)/);
  assert.match(extension, /\/\\s\/\.test\(typed\)/);
  assert.match(extension, /handleKeyDown: \(view, event\) =>/);
  assert.match(options, /createInlineSuggestExtension\(\{ onChange: onInlineSuggest, onKey: onInlineSuggestKey \}\)/);
  // The "[[" dialog is untouched by "#"/"@".
  assert.match(wikilinks, /if \(text !== "\["\) \{/);
  assert.doesNotMatch(wikilinks, /openMentionSearch|openTagSearch/);
  // Accepting replaces trigger + prefix and closes the session in the same
  // transaction; Enter on an unknown tag keeps it. App only renders.
  assert.match(hook, /tr\.insertText\(text, session\.from, to\)\.setMeta\(inlineSuggestKey, null\)/);
  assert.match(hook, /if \(session\.kind === "tag" && session\.query\)/);
  assert.match(app, /onInlineSuggest: inlineSuggest\.onSessionChange,\s*onInlineSuggestKey: inlineSuggest\.onKey/);
  assert.match(app, /<InlineSuggestMenu[\s\S]*onChoose=\{inlineSuggest\.accept\}/);
  // Clicking a row must not blur the editor before the choice lands.
  assert.match(menu, /onPointerDown=\{\(event\) => \{\s*event\.preventDefault\(\);\s*onChoose\(item\)/);
});
