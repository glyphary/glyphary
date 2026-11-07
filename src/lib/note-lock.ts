/**
 * Note locking.
 *
 * Responsibilities:
 * - Read and toggle the `locked` frontmatter property that marks a note as
 *   read-only in the editor.
 *
 * Contracts:
 * - The lock lives in the note itself (`locked: true`), so it travels with
 *   the file and Obsidian users can see and flip it too.
 * - Unlocking removes the property instead of writing `false`, keeping
 *   frontmatter tidy.
 */
import {
  frontmatterEntries,
  replaceFrontmatterEntry,
  serializeFrontmatterEntry,
  type MarkdownParts,
} from "./markdown.js";

const lockKey = "locked";

function lockState(metaHeader: string, delimiter: MarkdownParts["metaDelimiter"]) {
  const entries = frontmatterEntries(metaHeader, delimiter);
  const index = entries.findIndex((entry) => entry.key.toLowerCase() === lockKey);
  const value = entries[index]?.value.trim().toLowerCase();

  return { index, locked: value === "true" || value === "yes" };
}

export function noteLocked(metaHeader: string, delimiter: MarkdownParts["metaDelimiter"] = "---") {
  return lockState(metaHeader, delimiter).locked;
}

export function toggleNoteLock(metaHeader: string, delimiter: MarkdownParts["metaDelimiter"]) {
  const { index, locked } = lockState(metaHeader, delimiter);
  const entry = { key: lockKey, value: "true" };

  if (locked) {
    return replaceFrontmatterEntry(metaHeader, delimiter, index, null);
  }
  if (index !== -1) {
    return replaceFrontmatterEntry(metaHeader, delimiter, index, entry);
  }

  const line = serializeFrontmatterEntry(delimiter, entry);

  return metaHeader.trim() ? `${metaHeader.replace(/\n+$/, "")}\n${line}` : line;
}
