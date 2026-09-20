/**
 * Base display helpers.
 *
 * Responsibilities:
 * - Keep `.base` file display helpers out of App and the renderer.
 * - Normalize the supported Obsidian Bases field names for card/table output.
 * - Sort rows by a view's `sort:` keys, with the note name as the final tie-break.
 * - `baseVisibleRows` is the pane's whole pipeline: title filter, then the
 *   session sort key ahead of the view's remaining keys, then the view limit.
 *
 * Contracts:
 * - These helpers are presentation-only; Rust owns parsing and filesystem trust.
 */
import type { BaseRow, BaseSort, BaseViewResult } from "./app-types";

export type BaseSortKey = { field: string; direction: "asc" | "desc" };

export function baseSortKeys(sort: BaseSort[]): BaseSortKey[] {
  return sort.map((entry) => ({
    field: entry.property,
    direction: entry.direction.toLowerCase() === "desc" ? "desc" : "asc",
  }));
}

export function isBasePath(relativePath: string | null | undefined) {
  return Boolean(relativePath?.toLowerCase().endsWith(".base"));
}

export function baseTitle(fileName: string) {
  return fileName.replace(/\.base$/i, "");
}

export function baseFieldLabel(field: string, displayNames?: Record<string, string>) {
  const named = displayNames?.[field] ?? displayNames?.[field.replace(/^note\./, "")];

  if (named) {
    return named;
  }

  const clean = field.replace(/^note\./, "").replace(/^file\./, "");

  return clean
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function baseFieldValue(row: BaseRow, field: string) {
  if (field === "file.name") {
    return row.name;
  }

  return row.properties[field.replace(/^note\./, "").toLowerCase()] ?? "";
}

export function baseAvailableFields(view: BaseViewResult) {
  const fields = new Set(view.order.length ? view.order : ["file.name"]);

  fields.add("file.name");
  view.rows.forEach((row) => {
    Object.keys(row.properties).forEach((property) => {
      if (!fields.has(property) && !fields.has(`note.${property}`)) {
        fields.add(property);
      }
    });
  });

  return Array.from(fields);
}

export function baseRowsMatchingTitle(rows: BaseRow[], query: string) {
  const needle = query.trim().toLowerCase();

  if (!needle) {
    return rows;
  }

  return rows.filter((row) => {
    const frontmatterTitle = baseFieldValue(row, "title").toLowerCase();

    return row.name.toLowerCase().includes(needle) || frontmatterTitle.includes(needle);
  });
}

export function baseVisibleRows(
  rows: BaseRow[],
  options: {
    limit?: number | null;
    sortKey: BaseSortKey;
    titleQuery: string;
    viewSortKeys: BaseSortKey[];
  },
) {
  const { limit, sortKey, titleQuery, viewSortKeys } = options;
  const sorted = baseSortedRows(baseRowsMatchingTitle(rows, titleQuery), [
    sortKey,
    ...viewSortKeys.filter((key) => key.field !== sortKey.field),
  ]);

  return limit && limit > 0 ? sorted.slice(0, limit) : sorted;
}

export function baseSortedRows(rows: BaseRow[], keys: BaseSortKey[]) {
  return [...rows].sort((left, right) => {
    for (const key of keys) {
      const valueCompare = compareBaseFieldValues(
        baseFieldValue(left, key.field),
        baseFieldValue(right, key.field),
      );

      if (valueCompare !== 0) {
        return key.direction === "desc" ? -valueCompare : valueCompare;
      }
    }

    return left.name.localeCompare(right.name, undefined, {
      numeric: true,
      sensitivity: "base",
    });
  });
}

function compareBaseFieldValues(left: string, right: string) {
  const leftValue = left.trim();
  const rightValue = right.trim();

  if (!leftValue && !rightValue) {
    return 0;
  }

  if (!leftValue) {
    return 1;
  }

  if (!rightValue) {
    return -1;
  }

  const leftNumber = Number(leftValue);
  const rightNumber = Number(rightValue);

  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
    return leftNumber - rightNumber;
  }

  return leftValue.localeCompare(rightValue, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}
