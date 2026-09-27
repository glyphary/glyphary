/**
 * Obsidian task status markers.
 *
 * Responsibilities:
 * - Let `- [/] doing`, `- [-] dropped`, `- [>] forwarded`, `- [?] open
 *   question` and any other single-character marker survive the trip through
 *   an editor whose Markdown pipeline only knows `[ ]` and `[x]`.
 *
 * Contracts:
 * - Marked and Tiptap both gate task items on `[ ]`, `[x]`, or `[X]`. Any
 *   other marker is rewritten to `[ ]` followed by a sentinel made only of
 *   private-use code points, which no Markdown syntax reacts to, so the item
 *   parses as an ordinary unchecked task and the status rides in its text.
 * - The sentinel is stripped again when the task item node is built, so it is
 *   never visible and never saved; saving writes the original marker back.
 * - Fenced code is left untouched.
 */

const SENTINEL_START = "";
/** Status characters are mapped into U+E100.. so `*`, `<`, `!` and friends
 * cannot be read as emphasis, tags, or images while inside the text. */
const STATUS_BASE = 0xe100;

const taskLinePattern = /^(\s*(?:[-*+]|\d+[.)])\s+)\[([^\s\]xX])\](?=\s)/;

export function encodeTaskStatus(status: string) {
  return `${SENTINEL_START}${String.fromCharCode(STATUS_BASE + status.charCodeAt(0))}`;
}

export function decodeTaskStatus(text: string): { status: string | null; text: string } {
  if (text.charAt(0) !== SENTINEL_START || text.length < 2) {
    return { status: null, text };
  }

  const code = text.charCodeAt(1) - STATUS_BASE;

  // Only printable ASCII can be a marker; anything else is ordinary text that
  // happens to start with the sentinel character.
  if (code < 0x21 || code > 0x7e) {
    return { status: null, text };
  }

  return { status: String.fromCharCode(code), text: text.slice(2).replace(/^ /, "") };
}

export function normalizeTaskMarkers(markdown: string) {
  let inFence = false;

  return markdown
    .split("\n")
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) {
        inFence = !inFence;
        return line;
      }

      if (inFence) {
        return line;
      }

      return line.replace(taskLinePattern, (_, prefix: string, status: string) => {
        return `${prefix}[ ] ${encodeTaskStatus(status)}`;
      });
    })
    .join("\n");
}

/** Human names for the markers Obsidian themes and the Tasks plugin share. */
export const taskStatusLabels: Record<string, string> = {
  "/": "In progress",
  "-": "Cancelled",
  ">": "Forwarded",
  "<": "Scheduled",
  "?": "Question",
  "!": "Important",
  "*": "Starred",
};
