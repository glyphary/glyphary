import type { BaseRow } from "../lib/app-types";

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

