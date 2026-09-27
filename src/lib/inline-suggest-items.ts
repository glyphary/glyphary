/**
 * Candidate lists for inline completion.
 *
 * Responsibilities:
 * - Turn the vault's tags or people notes into ranked, filtered rows for
 *   the "#" and "@" menus.
 *
 * Contracts:
 * - Matching is a case-insensitive substring of the query. Tags rank by how
 *   many notes use them, then by name; people keep index order.
 * - Rows carry what the menu shows and what acceptance inserts: a tag's id
 *   is the tag, a person's label is the note name the wikilink targets.
 */
import type { VaultIndexedFile, VaultTag } from "./app-types";
import { fileNameWithoutMarkdownExtension } from "./paths.js";
import { isPersonNotePath } from "./people.js";

export type InlineSuggestItem = { id: string; label: string; detail: string };

export const inlineSuggestLimit = 12;

export function tagSuggestions(tags: readonly VaultTag[], query: string): InlineSuggestItem[] {
  const needle = query.toLowerCase();

  return tags
    .filter((entry) => !needle || entry.tag.toLowerCase().includes(needle))
    .sort((left, right) => right.files.length - left.files.length || left.tag.localeCompare(right.tag))
    .slice(0, inlineSuggestLimit)
    .map((entry) => ({
      id: entry.tag,
      label: `#${entry.tag}`,
      detail: `${entry.files.length} ${entry.files.length === 1 ? "note" : "notes"}`,
    }));
}

export function personSuggestions(files: readonly VaultIndexedFile[], query: string): InlineSuggestItem[] {
  const needle = query.toLowerCase();

  return files
    .filter((file) => isPersonNotePath(file.relativePath))
    .map((file) => ({ id: file.relativePath, label: fileNameWithoutMarkdownExtension(file.name), detail: file.relativePath }))
    .filter((item) => !needle || item.label.toLowerCase().includes(needle))
    .slice(0, inlineSuggestLimit);
}

/** What acceptance writes over the trigger and the typed prefix. */
export function inlineSuggestInsertion(kind: "tag" | "person", item: InlineSuggestItem) {
  return kind === "tag" ? `#${item.id} ` : `[[${item.label}]] `;
}
