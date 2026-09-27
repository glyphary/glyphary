import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isPersonNotePath, peopleDirectory } from "../.test-dist/people.js";

test("people are the notes under People/, at any depth", () => {
  assert.equal(peopleDirectory, "People");
  assert.equal(isPersonNotePath("People/Jane Doe.md"), true);
  assert.equal(isPersonNotePath("people/Team/Jane Doe.md"), true);
  assert.equal(isPersonNotePath("Peoples/Jane.md"), false);
  assert.equal(isPersonNotePath("Notes/People/Jane.md"), false);
});

test("typing @ completes people inline and writes a plain wikilink", () => {
  const extension = readFileSync("src/editor/inline-suggest.ts", "utf8");
  const items = readFileSync("src/lib/inline-suggest-items.ts", "utf8");

  assert.match(extension, /"@": "person"/);
  assert.match(items, /\.filter\(\(file\) => isPersonNotePath\(file\.relativePath\)\)/);
  assert.match(items, /`\[\[\$\{item\.label\}\]\] `/);
});
