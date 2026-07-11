import type { BaseRow, BaseViewResult } from "../lib/app-types";

// Responsibilities:
// - Keep `.base` file display helpers out of App and the renderer.
// - Normalize the supported Obsidian Bases field names for card/table output.
// Contracts:
// - These helpers are presentation-only; Rust owns parsing and filesystem trust.

export function isBasePath(relativePath: string | null | undefined) {
  return Boolean(relativePath?.toLowerCase().endsWith(".base"));
}

export function baseTitle(fileName: string) {
  return fileName.replace(/\.base$/i, "");
}

export function baseFieldLabel(field: string) {
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

export function baseSortedRows(
  rows: BaseRow[],
  field: string,
  direction: "asc" | "desc",
) {
  const multiplier = direction === "desc" ? -1 : 1;

  return [...rows].sort((left, right) => {
    const valueCompare = compareBaseFieldValues(
      baseFieldValue(left, field),
      baseFieldValue(right, field),
    );

    if (valueCompare !== 0) {
      return valueCompare * multiplier;
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
