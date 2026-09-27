import { TaskItem } from "@tiptap/extension-task-item";
import { decodeTaskStatus, taskStatusLabels } from "../lib/task-status";

// Responsibilities:
// - Carry an Obsidian task status marker (`/`, `-`, `>`, `?`, ...) through the
//   editor as a `status` attribute on the task item, rendered as
//   `data-status` for the stylesheet and written back on save.
// Contracts:
// - The marker arrives as a sentinel at the start of the item's text, put
//   there by `normalizeTaskMarkers` before lexing; it is lifted into the
//   attribute here and never reaches the document text.
// - A checked item always saves as `[x]`. Unchecking restores the status it
//   had, so a click on an in-progress box toggles between `[/]` and `[x]`.
// - Everything else about task items stays Tiptap's.

type NodeJson = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: NodeJson[];
  text?: string;
};

function liftStatus(node: NodeJson) {
  const paragraph = node.content?.[0];
  const first = paragraph?.content?.[0];

  if (!first || first.type !== "text" || typeof first.text !== "string") {
    return node;
  }

  const { status, text } = decodeTaskStatus(first.text);

  if (!status) {
    return node;
  }

  const rest = paragraph.content?.slice(1) ?? [];
  const content = text ? [{ ...first, text }, ...rest] : rest;

  return {
    ...node,
    attrs: { ...(node.attrs ?? {}), status },
    content: [{ ...paragraph, content }, ...(node.content?.slice(1) ?? [])],
  };
}

export const StatusTaskItem = TaskItem.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      status: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute("data-status") || null,
        renderHTML: (attributes: Record<string, unknown>) =>
          typeof attributes.status === "string"
            ? {
                "data-status": attributes.status,
                "data-status-label": taskStatusLabels[attributes.status] ?? attributes.status,
              }
            : {},
      },
    };
  },
  parseMarkdown(token, helpers) {
    const node = TaskItem.config.parseMarkdown?.(token, helpers) as NodeJson;

    return liftStatus(node);
  },
  renderMarkdown(node, helpers, context) {
    const markdown = TaskItem.config.renderMarkdown?.(node, helpers, context) ?? "";
    const attrs = (node as NodeJson).attrs ?? {};

    return !attrs.checked && typeof attrs.status === "string"
      ? markdown.replace(/^(\s*[-*+] )\[ \] /, `$1[${attrs.status}] `)
      : markdown;
  },
});
