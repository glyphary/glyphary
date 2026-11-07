import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { imagePropertyValue, imageReferenceFromValue, isImageProperty } from "../.test-dist/frontmatter-images.js";

test("image rows are picked by key or by an image-looking value", () => {
  assert.equal(isImageProperty("photo", ""), true);
  assert.equal(isImageProperty("Avatar", ""), true);
  assert.equal(isImageProperty("notes", ""), false);
  assert.equal(isImageProperty("notes", '"[[jane.jpg]]"'), true);
  assert.equal(isImageProperty("notes", "https://example.com/a.png?x=1"), true);
  assert.equal(isImageProperty("notes", "[[Jane Doe]]"), false);
});

test("values are stored as quoted bare wikilinks and read back as references", () => {
  assert.equal(imagePropertyValue("jane-doe 20261001120000.jpg"), '"[[jane-doe 20261001120000.jpg]]"');
  assert.equal(imageReferenceFromValue('"[[jane.jpg]]"'), "jane.jpg");
  assert.equal(imageReferenceFromValue("'![[jane.jpg|alt]]'"), "jane.jpg");
  assert.equal(imageReferenceFromValue("Attachments/jane.jpg"), "Attachments/jane.jpg");
});

test("the frontmatter row offers a picker and takes native drops", () => {
  const pane = readFileSync("src/editor/EditorPane.tsx", "utf8");
  const field = readFileSync("src/editor/FrontmatterImageField.tsx", "utf8");
  const app = readFileSync("src/App.tsx", "utf8");

  assert.match(pane, /isImageProperty\(entry\.key, entry\.value\) \? \(/);
  assert.match(pane, /updateEntry\(entry\.key, imagePropertyValue\(fileName\)\)/);
  assert.match(field, /data-frontmatter-image-key=\{entryKey\}/);
  // Load errors reach the pane's shared image fallback through the meta header.
  assert.match(field, /data-vault-target=\{value\}/);
  assert.match(pane, /className="metadata-shell"[^>]*onErrorCapture=\{handleEditorImageError\}/);
  // Native drops are window events; the row under the pointer wins over the
  // editor, and the active pane's meta header is what gets written.
  assert.match(app, /closest<HTMLElement>\("\[data-frontmatter-image-key\]"\)/);
  assert.match(app, /row\.dataset\.frontmatterGroup !== activeGroupIdRef\.current/);
  assert.match(app, /value: imagePropertyValue\(fileName\)/);
  assert.match(app, /onPickImageFile=\{pickImageFile\}/);
});

test("a true/false property renders as a checkbox that writes true or false", () => {
  const pane = readFileSync("src/editor/EditorPane.tsx", "utf8");

  assert.match(pane, /const flag = entry\.value\.trim\(\)\.toLowerCase\(\);/);
  assert.match(pane, /flag === "true" \|\| flag === "false" \? \(/);
  assert.match(pane, /type="checkbox"/);
  assert.match(pane, /event\.currentTarget\.checked \? "true" : "false"/);

  // On/off settings share the switch presentation; every settings checkbox
  // announces itself as a switch.
  const settings = readFileSync("src/settings/SettingsDialog.tsx", "utf8");
  const css = readFileSync("src/App.css", "utf8");

  assert.equal(
    (settings.match(/type="checkbox"/g) ?? []).length,
    (settings.match(/role="switch"/g) ?? []).length,
  );
  assert.match(css, /\.metadata-shell \.frontmatter-row \.frontmatter-checkbox,\n\.settings-panel \.settings-check-control input\[type="checkbox"\] \{\n  appearance: none;/);
});
