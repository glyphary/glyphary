/**
 * Task metadata in the Obsidian Tasks emoji format.
 *
 * Responsibilities:
 * - Read priority and dates out of a task line and give back the bare text
 *   for display.
 *
 * Contracts:
 * - The vocabulary is the Tasks plugin's, which Task Board and most other
 *   Obsidian task tooling read and write: 📅 due, ⏳ scheduled, 🛫 start,
 *   ➕ created, ✅ done, ❌ cancelled, each followed by `YYYY-MM-DD`, and the
 *   priorities 🔺 highest, ⏫ high, 🔼 medium, 🔽 low, ⏬ lowest. Recurrence
 *   (🔁), ids (🆔), dependencies (⛔), 🏁 and HTML comments are stripped
 *   from the text and otherwise ignored.
 * - `priority` uses the Tasks plugin scale, 0 highest to 5 lowest with 3 for
 *   none, so ascending order is descending importance.
 */

export type TaskMeta = {
  text: string;
  priority: number;
  priorityLabel: string | null;
  due: string | null;
  scheduled: string | null;
  start: string | null;
  created: string | null;
  done: string | null;
  cancelled: string | null;
};

const priorities: readonly [string, number, string][] = [
  ["🔺", 0, "Highest"],
  ["⏫", 1, "High"],
  ["🔼", 2, "Medium"],
  ["🔽", 4, "Low"],
  ["⏬", 5, "Lowest"],
];

const dateFields: readonly [keyof TaskMeta, string][] = [
  ["due", "📅"],
  ["scheduled", "⏳"],
  ["scheduled", "⌛"],
  ["start", "🛫"],
  ["created", "➕"],
  ["done", "✅"],
  ["cancelled", "❌"],
];

export const taskDateEmojis: readonly string[] = dateFields.map(([, emoji]) => emoji);

const isoDate = "(\\d{4}-\\d{2}-\\d{2})";
// Recurrence text runs to the next field, as the Tasks plugin assumes fields
// sit at the end of the line. HTML comments are sync-tool bookkeeping.
const stripPattern = /(?:🔁[^📅⏳⌛🛫➕✅❌🔺⏫🔼🔽⏬🆔⛔🏁<]*|[🆔⛔🏁]\s*\S*|<!--[\s\S]*?-->)/gu;

export function parseTaskMeta(lineText: string | null | undefined): TaskMeta {
  let text = lineText ?? "";
  const meta: TaskMeta = {
    text: "",
    priority: 3,
    priorityLabel: null,
    due: null,
    scheduled: null,
    start: null,
    created: null,
    done: null,
    cancelled: null,
  };

  for (const [field, emoji] of dateFields) {
    const match = new RegExp(`${emoji}\\s*${isoDate}`, "u").exec(text);

    if (match) {
      // ⏳ and ⌛ both mean scheduled; the first one found wins.
      if (!meta[field]) {
        (meta as Record<string, unknown>)[field] = match[1];
      }
      text = text.replace(match[0], " ");
    }
  }

  for (const [emoji, priority, label] of priorities) {
    if (text.includes(emoji)) {
      meta.priority = priority;
      meta.priorityLabel = label;
      text = text.split(emoji).join(" ");
      break;
    }
  }

  meta.text = text.replace(stripPattern, " ").replace(/\s+/g, " ").trim();

  return meta;
}
