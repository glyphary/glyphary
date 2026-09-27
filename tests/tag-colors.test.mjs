import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  normalizeTagColors,
  obsidianTagColorSnippet,
  sameTagColors,
  withTagColor,
  tagOverride,
  tagStyle,
  tagStyleAttribute,
} from "../.test-dist/tag-colors.js";

test("tag colours normalize to lowercase keys and #rrggbb values", () => {
  assert.deepEqual(
    normalizeTagColors({ "#AI": "#E12729", " ml/notes/ ": "#00ff00", bad: "red", "": "#123456", x: "#12345" }),
    { ai: "#e12729", "ml/notes": "#00ff00" },
  );
  assert.equal(sameTagColors({ a: "#000000" }, { a: "#000000" }), true);
  assert.equal(sameTagColors({ a: "#000000" }, { a: "#000001" }), false);
  assert.equal(sameTagColors({}, { a: "#000000" }), false);
  assert.deepEqual(withTagColor({ a: "#000000" }, "b", "#111111"), { a: "#000000", b: "#111111" });
  assert.deepEqual(withTagColor({ a: "#000000", b: "#111111" }, "a", null), { b: "#111111" });
});

test("a pick covers the tag and its descendants until a deeper pick", () => {
  const colors = { ml: "#111111", "ml/notes/old": "#222222" };
  assert.equal(tagOverride("ml", colors), "#111111");
  assert.equal(tagOverride("ml/notes", colors), "#111111");
  assert.equal(tagOverride("ml/notes/old", colors), "#222222");
  assert.equal(tagOverride("ml/notes/old/x", colors), "#222222");
  assert.equal(tagOverride("ai", colors), null);
  assert.equal(tagStyle("ai", colors), undefined);
  assert.equal(tagStyleAttribute("ai", colors), undefined);
  assert.deepEqual(tagStyle("ml/notes", colors), { "--tag-color": "#111111" });
  assert.equal(tagStyleAttribute("ml", colors), "--tag-color: #111111");
});

test("every tag surface is tinted from the same policy", () => {
  const inline = readFileSync("src/editor/inline-tags.ts", "utf8");
  const pane = readFileSync("src/editor/EditorPane.tsx", "utf8");
  const panel = readFileSync("src/vault/VaultTagsPanel.tsx", "utf8");
  const app = readFileSync("src/App.tsx", "utf8");
  const css = readFileSync("src/App.css", "utf8");
  const settings = readFileSync("src-tauri/src/settings.rs", "utf8");

  assert.match(inline, /const style = tagStyleAttribute\(range\.tag, colors\)/);
  assert.match(inline, /transaction\.getMeta\(refreshTagColorsMeta\)/);
  assert.match(pane, /"frontmatter-value-pill tag-tinted"/);
  assert.match(panel, /type="color"/);
  assert.match(panel, /schedulePick\(entry\.tag, event\.currentTarget\.value\.toLowerCase\(\)\)/);
  assert.match(panel, /swatch\.value = UNSET_SWATCH_VALUE;\s*\}\s*onSetTagColor\(entry\.tag, null\)/);
  assert.match(app, /persistVaultSettingsPatch\(\{ tagColors \}, redrawInlineTags\)/);
  // Starred files and tag colours share one optimistic partial write.
  assert.match(app, /return persistVaultSettingsPatch\(\{ starredFiles \}\)/);
  assert.match(app, /setMeta\(refreshTagColorsMeta, true\)/);
  assert.match(css, /\.editor-surface \.inline-tag\.tag-tinted \{/);
  assert.doesNotMatch(inline + pane + panel + css, /tag-hue/);
  assert.match(settings, /fn clean_tag_colors/);
});

test("the Obsidian snippet mirrors picks through Obsidian's tag variables", () => {
  const css = obsidianTagColorSnippet({ "ml/notes": "#222222", ml: "#111111" });

  assert.match(css, /^\/\* Tag colours exported from Glyphary/);
  assert.ok(css.indexOf('a.tag[href="#ml" i]') < css.indexOf('a.tag[href="#ml/notes" i]'));
  assert.match(css, /a\.tag\[href\^="#ml\/" i\]/);
  assert.match(css, /span\.cm-hashtag\.cm-tag-ml \{/);
  assert.doesNotMatch(css, /cm-tag-ml\/notes/);
  assert.match(css, /--tag-color: color-mix\(in srgb, #111111 70%, var\(--text-normal\)\)/);
  assert.match(css, /--tag-background: color-mix\(in srgb, #222222 22%, var\(--background-primary\)\)/);
  assert.match(css, /--tag-border-color:/);
  assert.equal(obsidianTagColorSnippet({}).trim().split("\n").length, 1);

  const dialog = readFileSync("src/settings/SettingsDialog.tsx", "utf8");
  assert.match(dialog, /settingsTab === "export"/);
  assert.match(dialog, /writeObsidianSnippet\(vaultRoot, OBSIDIAN_TAG_SNIPPET_NAME, obsidianTagColorSnippet\(tagColors\)\)/);
  // The settings window has no status bar; feedback has to live in the dialog.
  assert.match(dialog, /setExportNote\(\{\s*text: `Wrote \$\{relative\}/);
  assert.match(dialog, /\{exportNote \? \(/);
});
