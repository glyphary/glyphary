/**
 * Spacing rules for text written into a task line.
 *
 * Responsibilities:
 * - Decide the whitespace around a field (an emoji, a date, a priority) so
 *   what Glyphary writes matches what the Tasks plugin writes.
 *
 * Contracts:
 * - A field is separated from the word before it by one space and followed
 *   by one space, never doubled.
 */

export function spaceBefore(before: string) {
  return before && !/\s/.test(before) ? " " : "";
}

export function dateFieldInsertion(dateKey: string, alreadySpaced: boolean) {
  return `${alreadySpaced ? "" : " "}${dateKey} `;
}
