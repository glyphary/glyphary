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

test("a link to a person with a picture gets an avatar beside it", () => {
  const wikilinks = readFileSync("src/editor/wikilinks.ts", "utf8");
  const app = readFileSync("src/App.tsx", "utf8");
  const people = readFileSync("src-tauri/src/people.rs", "utf8");

  assert.match(wikilinks, /avatar\?: string\[\];/);
  // A bare file name may sit in any image folder, so each candidate path is
  // tried in turn. The probing happens on a detached Image because WebKit
  // keeps an <img> whose first load failed at zero size for good.
  assert.match(wikilinks, /const probe = new Image\(\);/);
  assert.match(wikilinks, /probe\.onerror = \(\) => tryCandidate\(index \+ 1\);/);
  assert.match(wikilinks, /key: `avatar:\$\{avatar\.join\("\|"\)\}`/);
  assert.match(app, /return avatar\.length > 0 \? \{ \.\.\.resolution, avatar \} : resolution;/);
  // The editor's block image margins must not apply to the inline avatar.
  assert.match(readFileSync("src/App.css", "utf8"), /\.editor-surface \.wikilink-avatar \{[^}]*margin: 0 5px 0 0;/);
  // Only an unambiguous link gets a picture, resolved like any vault image.
  assert.match(app, /resolution\.candidates\.length === 1 \? resolution\.candidates\[0\] : null/);
  assert.match(app, /resolveWikiLinkTarget: \(target\) => withPersonAvatar\(resolveWikiLinkTargetRef\.current\(target\)\)/);
  assert.match(app, /void refreshPeoplePhotos\(root\);/);
  assert.match(people, /const PHOTO_KEYS: \[&str; 3\] = \["photo", "image", "avatar"\];/);
});
