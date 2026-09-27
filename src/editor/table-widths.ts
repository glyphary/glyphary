import { Table, TableView, renderTableToMarkdown } from "@tiptap/extension-table";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { EditorView } from "@tiptap/pm/view";
import { tableMarkdownWithRatios } from "../lib/table-widths";

// Responsibilities:
// - Carry delimiter-row width ratios through the editor: a `columnRatios`
//   attribute on the table node, percentage `<col>` widths while editing, and
//   the ratios written back into the delimiter row on save.
// Contracts:
// - Ratios come from Markdown only; a mouse resize sets Tiptap's own pixel
//   `colwidth` on cells, which then wins for both display and save.
// - Everything else about tables stays Tiptap's: this extends, it does not
//   replace, the stock node.

type TableJson = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TableJson[];
};

function ratiosFromPixelWidths(node: TableJson): number[] | null {
  const cells = node.content?.[0]?.content ?? [];
  const widths = cells.flatMap((cell) => (cell.attrs?.colwidth as number[] | null) ?? [null]);

  return widths.length > 0 && widths.every((width): width is number => typeof width === "number")
    ? widths
    : null;
}

/** Tiptap's view sizes columns in pixels; ratios become percentages of the
 * full-width table instead, unless a pixel resize has taken over. */
class RatioTableView extends TableView {
  constructor(
    node: ProseMirrorNode,
    cellMinWidth: number,
    view: EditorView,
    HTMLAttributes?: Record<string, unknown>,
  ) {
    super(node, cellMinWidth, view, HTMLAttributes);
    this.applyRatios();
  }

  update(node: ProseMirrorNode) {
    const updated = super.update(node);

    this.applyRatios();

    return updated;
  }

  private applyRatios() {
    const ratios = this.node.attrs.columnRatios as number[] | null;
    const firstRow = this.node.firstChild;
    let pixelResized = false;

    firstRow?.forEach((cell) => {
      if (cell.attrs.colwidth) {
        pixelResized = true;
      }
    });

    if (!ratios || pixelResized) {
      return;
    }

    const total = ratios.reduce((sum, ratio) => sum + ratio, 0);

    Array.from(this.colgroup.children).forEach((col, index) => {
      const ratio = ratios[index];

      if (ratio && col instanceof HTMLElement) {
        col.style.width = `${((ratio / total) * 100).toFixed(2)}%`;
      }
    });
    this.table.style.width = "";
    this.table.style.minWidth = "";
  }
}

export const GlypharyTable = Table.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      columnRatios: {
        default: null,
        parseHTML: (element: HTMLElement) => {
          const raw = element.getAttribute("data-column-ratios");

          return raw ? raw.split(",").map(Number) : null;
        },
        renderHTML: (attributes: Record<string, unknown>) =>
          Array.isArray(attributes.columnRatios)
            ? { "data-column-ratios": attributes.columnRatios.join(",") }
            : {},
      },
    };
  },
  parseMarkdown(token, helpers) {
    const node = Table.config.parseMarkdown?.(token, helpers) as TableJson;
    const widths = (token as { widths?: number[] }).widths;

    return widths ? { ...node, attrs: { ...(node.attrs ?? {}), columnRatios: widths } } : node;
  },
  renderMarkdown(node, helpers) {
    const markdown = renderTableToMarkdown(node, helpers);
    const table = node as TableJson;
    const ratios = ratiosFromPixelWidths(table) ?? (table.attrs?.columnRatios as number[] | null);

    return ratios ? tableMarkdownWithRatios(markdown, ratios) : markdown;
  },
}).configure({
  resizable: true,
  // The stock 5px hit zone is hard to find; 8px matches the handle drawn.
  handleWidth: 8,
  View: RatioTableView,
});
