/**
 * Relative table column widths from the delimiter row.
 *
 * Responsibilities:
 * - Read Pandoc-style width ratios from the dash counts of a GFM delimiter
 *   row, and write a delimiter row back from ratios.
 *
 * Contracts:
 * - `|-|--|-|` means the middle column is twice as wide as the others. Equal
 *   counts mean no preference.
 * - Formatters pad the delimiter row to each column's longest cell, which
 *   would read as accidental ratios. A row whose every count equals
 *   `max(3, longest cell)` is treated as padding, not intent.
 * - Output stays valid GFM: every renderer that ignores dash counts sees an
 *   ordinary table.
 */
import { splitGfmTableRow } from "./markdown-table.js";

const MIN_DASHES = 3;
const MAX_DASHES = 30;

export function tableDelimiterDashCounts(cells: readonly string[]) {
  return cells.map((cell) => cell.replace(/[^-]/g, "").length);
}

/** Ratios normalized so the narrowest column is 1, or null for no preference. */
export function tableColumnRatios(
  dashCounts: readonly number[],
  longestCellLengths: readonly number[],
): number[] | null {
  if (dashCounts.length === 0 || dashCounts.some((count) => count <= 0)) {
    return null;
  }

  const narrowest = Math.min(...dashCounts);

  if (dashCounts.every((count) => count === narrowest)) {
    return null;
  }

  const padded = dashCounts.every(
    (count, index) => count === Math.max(MIN_DASHES, longestCellLengths[index] ?? 0),
  );

  return padded ? null : dashCounts.map((count) => count / narrowest);
}

function delimiterCell(alignment: string, dashes: number) {
  const left = alignment.startsWith(":") ? ":" : "";
  const right = alignment.endsWith(":") ? ":" : "";

  return `${left}${"-".repeat(dashes)}${right}`;
}

/**
 * Rewrites a serialized table so its delimiter row carries `ratios` and its
 * cells are unpadded, since padding would make the row look like formatting.
 */
export function tableMarkdownWithRatios(markdown: string, ratios: readonly number[]) {
  const narrowest = Math.min(...ratios.filter((ratio) => ratio > 0));
  const lines = markdown.split("\n");
  let sawHeader = false;

  return lines
    .map((line) => {
      if (!line.trimStart().startsWith("|")) {
        return line;
      }

      const cells = splitGfmTableRow(line).map((cell) => cell.trim());

      if (sawHeader && cells.every((cell) => /^:?-+:?$/.test(cell))) {
        sawHeader = false;

        return `| ${cells
          .map((cell, index) => {
            const ratio = ratios[index] ?? narrowest;
            const dashes = Math.min(MAX_DASHES, Math.max(MIN_DASHES, Math.round((ratio / narrowest) * MIN_DASHES)));

            return delimiterCell(cell, dashes);
          })
          .join(" | ")} |`;
      }

      sawHeader = true;

      return `| ${cells.join(" | ")} |`;
    })
    .join("\n");
}
