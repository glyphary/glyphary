/**
 * Inline `#tag` detection in note text.
 *
 * Responsibilities:
 * - Find the character ranges of inline tags in a run of text so the editor
 *   can decorate them.
 *
 * Contracts:
 * - Mirrors the backend scanner in `graph.rs`: a tag starts with `#` at the
 *   start of the text or after whitespace, continues over letters, digits,
 *   `_`, `-` and `/`, drops trailing punctuation, and is never purely
 *   numeric, so `#1` in "issue #1" is not a tag while `#ai` is.
 * - Ranges are offsets into the given text; callers add their own base.
 */

export type InlineTagRange = { from: number; to: number; tag: string };

const tagPattern = /(^|\s)(#[\p{L}\p{N}_/-]+)/gu;
const trailingPunctuation = /[.,;:!?)\]]+$/u;

export function inlineTagRanges(text: string): InlineTagRange[] {
  const ranges: InlineTagRange[] = [];

  for (const match of text.matchAll(tagPattern)) {
    const start = match.index + match[1].length;
    const raw = match[2].replace(trailingPunctuation, "");
    const tag = raw.slice(1).replace(/^\/+|\/+$/g, "").toLowerCase();

    if (!tag || /^\d+$/.test(tag)) {
      continue;
    }

    ranges.push({ from: start, to: start + raw.length, tag });
  }

  return ranges;
}
