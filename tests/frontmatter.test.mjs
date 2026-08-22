import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultDrawerOpen,
  defaultExcalidrawDirectory,
  defaultFrontmatterPillHeader,
  defaultInspectorDrawerWidth,
  defaultVaultDrawerWidth,
  defaultVaultDrawerOpen,
  defaultVaultAssetDirectory,
  defaultVaultImageDirectory,
  defaultTidbitGlobalShortcut,
  defaultTidbitPathPattern,
  emptyCalloutMarkdown,
  emptyCollapseMarkdown,
  emptyColumnsMarkdown,
  emptyHtmlBlockMarkdown,
  emptyTableMarkdown,
  maxRecentFiles,
} from "../.test-dist/defaults.js";
import {
  appendFrontmatterEntry,
  composeMarkdown,
  frontmatterEntries,
  frontmatterEntryListValues,
  frontmatterListValues,
  frontmatterScalarValue,
  markdownHeadings,
  replaceFrontmatterEntry,
  serializeFrontmatterListValues,
  splitMetaHeader,
} from "../.test-dist/markdown.js";

test("frontmatter is split out of the editor body and composed back without losing it", () => {
  const source = "---\ntitle: Alpha\ntags: [note]\n---\n# Body\n";
  const parts = splitMetaHeader(source);

  assert.deepEqual(parts, {
    metaHeader: "title: Alpha\ntags: [note]",
    metaDelimiter: "---",
    body: "# Body\n",
  });
  assert.equal(composeMarkdown(parts.metaHeader, parts.metaDelimiter, parts.body), source);
});

test("frontmatter supports toml delimiters and ignores unterminated headers", () => {
  assert.deepEqual(splitMetaHeader("+++\ntitle = \"Alpha\"\n+++\nBody\n"), {
    metaHeader: "title = \"Alpha\"",
    metaDelimiter: "+++",
    body: "Body\n",
  });
  assert.deepEqual(splitMetaHeader("---\ntitle: Alpha\n# Body\n"), {
    metaHeader: "",
    metaDelimiter: "---",
    body: "---\ntitle: Alpha\n# Body\n",
  });
  assert.deepEqual(
    splitMetaHeader("---\nConvoso: [[Convoso Debugging]]\n\nNormal note text\n---\n"),
    {
      metaHeader: "",
      metaDelimiter: "---",
      body: "---\nConvoso: [[Convoso Debugging]]\n\nNormal note text\n---\n",
    },
  );
});

test("frontmatter tags are extracted as display pills", () => {
  assert.deepEqual(
    frontmatterListValues(`title: Alpha
tags: [draft, "project x", draft]
owners:
  - Chris
  - Sam
status: active
`),
    ["draft", "project x"],
  );
  assert.deepEqual(
    frontmatterListValues(`title: Alpha
TAGS:
  - draft
  - project x
owners:
  - Chris
`),
    ["draft", "project x"],
  );
  assert.deepEqual(
    frontmatterListValues(`tags:
- databases
- devops
- networking
feature: _assets_/Pasted image 20230102173741.png
thumbnail: thumbnails/resized/2b2618e8548253e7deaf445fe995f4cc_86cf658e.webp
permalink: convoso/convoso-projects/convoso-las-vegas
`),
    ["databases", "devops", "networking"],
  );
  assert.equal(defaultFrontmatterPillHeader, "tags");
  assert.deepEqual(
    frontmatterListValues(`title: Alpha
topics: [draft, project]
tags: [ignored]
`, "topics"),
    ["draft", "project"],
  );
  assert.deepEqual(frontmatterListValues("title: Alpha\nstatus: active\n"), []);
  assert.deepEqual(frontmatterListValues("owners:\n  - Chris\n  - Sam\n"), []);
});

test("frontmatter banner values can be extracted for page chrome", () => {
  assert.equal(
    frontmatterScalarValue("banner: '![[Attachments/Pasted image 20230521183520.png]]'", "banner"),
    "![[Attachments/Pasted image 20230521183520.png]]",
  );
  assert.equal(frontmatterScalarValue("title: Alpha", "banner"), "");
});

test("frontmatter entries edit as rows without discarding surrounding source", () => {
  const source = "title: Alpha\ntags:\n  - note\n  - project\n# keep this comment\nstatus: active";
  const entries = frontmatterEntries(source, "---");

  assert.deepEqual(entries.map(({ key, value }) => ({ key, value })), [
    { key: "title", value: "Alpha" },
    { key: "tags", value: "\n  - note\n  - project" },
    { key: "status", value: "active" },
  ]);
  assert.equal(
    replaceFrontmatterEntry(source, "---", 1, { key: "topics", value: "[notes, projects]" }),
    "title: Alpha\ntopics: [notes, projects]\n# keep this comment\nstatus: active",
  );
  assert.equal(
    replaceFrontmatterEntry(source, "---", 0, null),
    "tags:\n  - note\n  - project\n# keep this comment\nstatus: active",
  );
  assert.equal(appendFrontmatterEntry('title = "Alpha"', "+++"), 'title = "Alpha"\nproperty =');
});

test("frontmatter list values use pills for arrays, block lists, and tags", () => {
  assert.deepEqual(frontmatterEntryListValues('[draft, "project x"]'), ["draft", "project x"]);
  assert.deepEqual(frontmatterEntryListValues('["quoted \\"value\\""]'), ['quoted "value"']);
  assert.deepEqual(frontmatterEntryListValues("\n  - Chris\n  - Sam"), ["Chris", "Sam"]);
  assert.equal(frontmatterEntryListValues("active"), null);
  assert.deepEqual(frontmatterEntryListValues("inbox", true), ["inbox"]);
  assert.deepEqual(frontmatterEntryListValues("", true), []);
  assert.equal(
    serializeFrontmatterListValues(["draft", "project x", "value, with comma"]),
    '["draft", "project x", "value, with comma"]',
  );
});
