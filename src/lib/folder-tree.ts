/**
 * Folder tree expansion helpers.
 *
 * Responsibilities:
 * - Compute which folder paths must be expanded for a selected folder/file.
 * - Keep path expansion decisions out of React rendering components.
 *
 * Contracts:
 * - The vault root is represented by an empty string and is always expanded.
 * - Active file paths expand their parent folders, not the file path itself.
 */

import { parentDirectory } from "./paths.js";

export function folderExpansionPaths(relativePath: string) {
  const parts = relativePath.split("/").filter(Boolean);

  return parts.map((_, index) => parts.slice(0, index + 1).join("/"));
}

export function expandedFolderPathsForSelection(
  selectedPath: string,
  activeFilePath?: string | null,
) {
  const paths = new Set([""]);
  const activeFileDirectory = activeFilePath ? parentDirectory(activeFilePath) : "";

  for (const path of [selectedPath, activeFileDirectory]) {
    for (const expandedPath of folderExpansionPaths(path)) {
      paths.add(expandedPath);
    }
  }

  return Array.from(paths);
}

export function mergeExpandedFolderPaths(current: string[], required: string[]) {
  return Array.from(new Set([...current, ...required]));
}
