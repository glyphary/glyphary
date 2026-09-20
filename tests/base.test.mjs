import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  addBaseView,
  baseImageField,
  parseSimpleCondition,
  removeBaseView,
  replaceFilterAt,
  simpleConditionSource,
  stripEmptyBaseConditions,
  updateBaseView,
} from "../.test-dist/base-definition.js";
import {
  baseFieldLabel,
  baseSortKeys,
  baseSortedRows,
  baseVisibleRows,
} from "../.test-dist/base.js";

const definition = {
  filters: { kind: "and", filters: [{ kind: "expression", source: 'file.hasProperty("sourcetype")' }] },
  formulas: [{ name: "total", expression: "price * 2" }],
  views: [
    {
      name: "Table",
      type: "table",
      order: ["file.name"],
      sort: [],
      limit: null,
      image: null,
      filters: null,
      extra: [],
    },
  ],
  extra: ["properties:", "  status:", "    displayName: State"],
};

test("base view edits are immutable and keep unrelated parts", () => {
  const added = addBaseView(addBaseView(definition, "cards"), "cards");
  const renamed = updateBaseView(added, 1, { name: "Covers", image: "note.cover" });

  assert.deepEqual(
    added.views.map((view) => view.name),
    ["Table", "Cards", "Cards 2"],
  );
  assert.equal(renamed.views[1].name, "Covers");
  assert.equal(renamed.views[1].image, "note.cover");
  assert.equal(renamed.views[2].name, "Cards 2");
  assert.deepEqual(renamed.extra, definition.extra);
  assert.deepEqual(renamed.formulas, definition.formulas);
  assert.equal(definition.views.length, 1);
  assert.equal(removeBaseView(definition, 0), definition);
  assert.deepEqual(
    removeBaseView(added, 1).views.map((view) => view.name),
    ["Table", "Cards 2"],
  );
  assert.equal(baseImageField("Cover"), "note.cover");
  assert.equal(baseImageField("file.name"), "");
});

test("filter tree edits replace, insert, and remove nodes by path", () => {
  const root = {
    kind: "or",
    filters: [
      { kind: "expression", source: "a" },
      { kind: "and", filters: [{ kind: "expression", source: "b" }] },
    ],
  };

  const replaced = replaceFilterAt(root, [1, 0], { kind: "expression", source: "c" });
  assert.equal(replaced.filters[1].filters[0].source, "c");
  assert.equal(root.filters[1].filters[0].source, "b");

  const removed = replaceFilterAt(root, [0], null);
  assert.equal(removed.filters.length, 1);
  assert.equal(removed.filters[0].kind, "and");

  const nested = replaceFilterAt(root, [1], {
    kind: "not",
    filters: [...root.filters[1].filters, { kind: "expression", source: "" }],
  });
  assert.equal(nested.filters[1].kind, "not");
  assert.equal(replaceFilterAt(root, [], null), null);

  const stripped = stripEmptyBaseConditions({
    ...definition,
    filters: nested,
    formulas: [...definition.formulas, { name: "", expression: "x" }],
    views: [{ ...definition.views[0], sort: [{ property: "", direction: "ASC" }] }],
  });
  assert.deepEqual(stripped.filters.filters[1].filters, [{ kind: "expression", source: "b" }]);
  assert.deepEqual(stripped.formulas, definition.formulas);
  assert.deepEqual(stripped.views[0].sort, []);
});

test("simple conditions round-trip through fields and fall back to text", () => {
  const cases = [
    ['file.hasProperty("status")', { operator: "hasProperty", property: "", value: "status" }],
    ['file.hasTag("book")', { operator: "hasTag", property: "", value: "book" }],
    ['file.inFolder("Refs")', { operator: "inFolder", property: "", value: "Refs" }],
    ["status.isEmpty()", { operator: "isEmpty", property: "status", value: "" }],
    ["!status.isEmpty()", { operator: "notEmpty", property: "status", value: "" }],
    ['tags.contains("x")', { operator: "contains", property: "tags", value: "x" }],
    ['status == "done"', { operator: "equals", property: "status", value: "done" }],
    ['note.status != "done"', { operator: "notEquals", property: "note.status", value: "done" }],
    ["price > 5", { operator: "greaterThan", property: "price", value: "5" }],
    ["formula.total < 2.5", { operator: "lessThan", property: "formula.total", value: "2.5" }],
  ];

  for (const [source, fields] of cases) {
    assert.deepEqual(parseSimpleCondition(source), fields, source);
    assert.equal(simpleConditionSource(fields), source);
  }

  assert.deepEqual(parseSimpleCondition("status == 'done'"), {
    operator: "equals",
    property: "status",
    value: "done",
  });
  assert.equal(parseSimpleCondition('status == "a" && x'), null);
  assert.equal(parseSimpleCondition("file.mtime > now() - '7d'"), null);
  assert.equal(
    simpleConditionSource({ operator: "equals", property: "status", value: 'say "hi"' }),
    'status == "say hi"',
  );
});

test("base rows sort by every view sort key with name as tie-break", () => {
  const rows = [
    { name: "b", relativePath: "b.md", properties: { status: "open", priority: "2" } },
    { name: "a", relativePath: "a.md", properties: { status: "done", priority: "10" } },
    { name: "c", relativePath: "c.md", properties: { status: "open", priority: "10" } },
    { name: "d", relativePath: "d.md", properties: { status: "open", priority: "10" } },
  ];
  const keys = baseSortKeys([
    { property: "status", direction: "ASC" },
    { property: "priority", direction: "desc" },
  ]);

  assert.deepEqual(keys, [
    { field: "status", direction: "asc" },
    { field: "priority", direction: "desc" },
  ]);
  assert.deepEqual(
    baseSortedRows(rows, keys).map((row) => row.name),
    ["a", "c", "d", "b"],
  );
  assert.deepEqual(
    baseSortedRows(rows, []).map((row) => row.name),
    ["a", "b", "c", "d"],
  );
  const visible = (options) => baseVisibleRows(rows, { viewSortKeys: keys, ...options }).map((row) => row.name);

  // The session key leads, the view's remaining keys break ties, then the limit.
  assert.deepEqual(visible({ sortKey: { field: "priority", direction: "asc" }, titleQuery: "" }), [
    "b",
    "a",
    "c",
    "d",
  ]);
  assert.deepEqual(
    visible({ sortKey: { field: "status", direction: "asc" }, titleQuery: "", limit: 2 }),
    ["a", "c"],
  );
  assert.deepEqual(
    visible({ sortKey: { field: "status", direction: "desc" }, titleQuery: "d", limit: 0 }),
    ["d"],
  );
  assert.equal(baseFieldLabel("note.status", { status: "State" }), "State");
  assert.equal(baseFieldLabel("formula.total", { "formula.total": "Total" }), "Total");
  assert.equal(baseFieldLabel("formula.price_per_unit"), "Formula.price Per Unit");
});

test("base pane wires the structured editor", () => {
  const view = readFileSync("src/base/BaseView.tsx", "utf8");
  const editor = readFileSync("src/base/BaseEditor.tsx", "utf8");
  const document = readFileSync("src/base/use-base-document.ts", "utf8");

  assert.match(view, /<BaseEditor/);
  assert.match(view, /useBaseDocument\(\{ content, dirty, onChange, relativePath, vaultRoot \}\)/);
  assert.match(view, /useBaseViewSession\(activeView, savedView\)/);
  assert.match(view, /function BaseRows/);
  assert.doesNotMatch(view, /visibleView/);
  assert.match(document, /renderBaseDefinition\(stripEmptyBaseConditions\(next\)\)/);
  assert.match(document, /onChange\(text, text !== loadedRef\.current\?\.content\)/);
  assert.match(document, /samePath && \(dirty \|\| loaded\?\.content === content\)/);
  assert.match(view, /displayNames=\{result\.displayNames\}/);
  assert.match(readFileSync("src/lib/base.ts", "utf8"), /sorted\.slice\(0, limit\)/);
  assert.match(editor, /<span>Limit<\/span>/);
  assert.match(editor, /onBlur=\{commitDraft\}/);
  assert.match(editor, /Discard Changes/);
  assert.match(editor, /function FilterGroup/);
  assert.match(editor, /function FormulaList/);
  assert.match(editor, /Add sort key/);
  assert.match(editor, /function RemoveButton/);
  assert.match(editor, /\{\.\.\.commitOn\(onBlur\)\}/);
  assert.match(editor, /aria-label="Base problems"/);
});
