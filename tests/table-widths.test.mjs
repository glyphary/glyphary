import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { tokenizeGfmTable } from "../.test-dist/markdown-table.js";
import {
  tableColumnRatios,
  tableDelimiterDashCounts,
  tableMarkdownWithRatios,
} from "../.test-dist/table-widths.js";

const inline = (text) => [{ type: "text", raw: text, text }];

test("dash counts read as width ratios unless they are just padding", () => {
  assert.deepEqual(tableDelimiterDashCounts([":-", "--:", ":---:"]), [1, 2, 3]);
  assert.deepEqual(tableColumnRatios([1, 2, 1], [5, 5, 5]), [1, 2, 1]);
  assert.deepEqual(tableColumnRatios([3, 9, 6], [1, 1, 1]), [1, 3, 2]);
  // Equal counts mean no preference.
  assert.equal(tableColumnRatios([3, 3, 3], [10, 2, 4]), null);
  // Every count equals max(3, longest cell): a formatter padded this row.
  assert.equal(tableColumnRatios([4, 3, 12], [4, 2, 12]), null);
  // Same counts, but the content does not explain them: intentional.
  assert.deepEqual(tableColumnRatios([4, 3, 12], [4, 2, 5]), [4 / 3, 1, 4]);
  assert.equal(tableColumnRatios([], []), null);
});

test("tokenized tables carry ratios only when the delimiter row means it", () => {
  const compact = tokenizeGfmTable("| Qty | Item | Note |\n|-|--|-|\n| 1 | Pen | blue |\n", inline);
  assert.deepEqual(compact.widths, [1, 2, 1]);
  assert.deepEqual(compact.align, [null, null, null]);

  const padded = tokenizeGfmTable("| Qty | Item name | Note |\n| --- | --------- | ---- |\n| 1 | Pen | blue |\n", inline);
  assert.equal(padded.widths, undefined);

  const aligned = tokenizeGfmTable("| a | b |\n|:--|----:|\n| 1 | 2 |\n", inline);
  assert.deepEqual(aligned.widths, [1, 2]);
  assert.deepEqual(aligned.align, ["left", "right"]);
});

test("serialized tables get a compact delimiter row that encodes the ratios", () => {
  const padded = "\n| Qty | Item name | Note |\n| :-- | --------- | ---: |\n| 1   | Pen       | blue |\n\nAfter";

  assert.equal(
    tableMarkdownWithRatios(padded, [1, 2, 1]),
    "\n| Qty | Item name | Note |\n| :--- | ------ | ---: |\n| 1 | Pen | blue |\n\nAfter",
  );
  // A column added after the ratios were read gets the narrowest width.
  assert.equal(
    tableMarkdownWithRatios("| a | b | c |\n| --- | --- | --- |\n", [1, 3]),
    "| a | b | c |\n| --- | --------- | --- |\n",
  );
  // Reading the compact row back gives the same ratios.
  const again = tokenizeGfmTable(tableMarkdownWithRatios(padded, [1, 2, 1]).trim(), inline);
  assert.deepEqual(again.widths, [1, 2, 1]);
});

test("the editor swaps in the ratio-aware table node", () => {
  const options = readFileSync("src/editor/editor-options.ts", "utf8");
  const extension = readFileSync("src/editor/table-widths.ts", "utf8");

  assert.match(options, /TableKit\.configure\(\{ table: false \}\)/);
  assert.match(options, /GlypharyTable,/);
  assert.match(extension, /class RatioTableView extends TableView/);
  assert.match(extension, /ratiosFromPixelWidths\(table\) \?\? /);
  assert.match(extension, /View: RatioTableView/);
  assert.match(extension, /handleWidth: 8/);

  // The resize affordance needs positioned cells and the class on the
  // ProseMirror root, where prosemirror-tables puts it.
  const css = readFileSync("src/App.css", "utf8");
  assert.match(css, /\.editor-surface td \{\s*\/\*[^*]*\*\/\s*position: relative;/);
  assert.match(css, /\.editor-surface \.ProseMirror\.resize-cursor/);
  assert.doesNotMatch(css, /^\.editor-surface\.resize-cursor/m);
});
