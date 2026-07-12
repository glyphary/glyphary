/**
 * Wikilink-aware Markdown table parsing.
 *
 * Responsibilities:
 * - Keep GFM table parsing from treating pipes inside wikilinks as cell separators.
 * - Provide a fresh Marked instance for each Tiptap Markdown manager.
 *
 * Contracts:
 * - Only table tokenization is customized; all other Markdown parsing falls back to Marked.
 * - `[[target|alias]]` and `![[image.png|300]]` pipes stay inside the current cell.
 */

import {
  Marked,
  type MarkedExtension,
  type MarkedOptions,
  type Token,
  type Tokens,
  marked,
} from "marked";

type TableAlignment = Tokens.Table["align"][number];

const tableDelimiterCellPattern = /^:?-+:?$/;
const tableBlockStartPattern = /^(?: {0,3}(?:#{1,6}(?:\s|$)|>|(?:[*+-]|\d{1,9}[.)])\s|`{3,}|~{3,})| {4}\S)/;

function isEscaped(value: string, index: number) {
  let slashCount = 0;

  for (let cursor = index - 1; cursor >= 0 && value[cursor] === "\\"; cursor -= 1) {
    slashCount += 1;
  }

  return slashCount % 2 === 1;
}

function trimOuterPipe(row: string) {
  let trimmed = row.trim();

  if (trimmed.startsWith("|")) {
    trimmed = trimmed.slice(1);
  }

  if (trimmed.endsWith("|") && !isEscaped(trimmed, trimmed.length - 1)) {
    trimmed = trimmed.slice(0, -1);
  }

  return trimmed;
}

export function splitGfmTableRow(row: string) {
  const cells: string[] = [];
  const source = trimOuterPipe(row);
  let cell = "";
  let bracketDepth = 0;
  let inCode = false;
  let inWikiLink = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];

    if (char === "\\" && next) {
      cell += char;
      index += 1;
      cell += next;
      continue;
    }

    if (char === "`") {
      inCode = !inCode;
      cell += char;
      continue;
    }

    if (!inCode && char === "[" && next === "[") {
      inWikiLink = true;
      cell += "[[";
      index += 1;
      continue;
    }

    if (!inCode && inWikiLink && char === "]" && next === "]") {
      inWikiLink = false;
      cell += "]]";
      index += 1;
      continue;
    }

    if (!inCode && !inWikiLink && char === "[") {
      bracketDepth += 1;
      cell += char;
      continue;
    }

    if (!inCode && !inWikiLink && char === "]" && bracketDepth > 0) {
      bracketDepth -= 1;
      cell += char;
      continue;
    }

    if (!inCode && !inWikiLink && bracketDepth === 0 && char === "|") {
      cells.push(cell.trim());
      cell = "";
      continue;
    }

    cell += char;
  }

  cells.push(cell.trim());
  return cells;
}

function tableDelimiterAlignments(cells: string[]) {
  if (cells.length === 0) {
    return null;
  }

  const alignments = cells.map((cell) => {
    const delimiter = cell.trim();

    if (!tableDelimiterCellPattern.test(delimiter)) {
      return undefined;
    }

    if (delimiter.startsWith(":") && delimiter.endsWith(":")) {
      return "center";
    }

    if (delimiter.startsWith(":")) {
      return "left";
    }

    if (delimiter.endsWith(":")) {
      return "right";
    }

    return null;
  });

  return alignments.some((alignment) => alignment === undefined)
    ? null
    : (alignments as TableAlignment[]);
}

function normalizeTableCells(cells: string[], width: number) {
  return Array.from({ length: width }, (_, index) => cells[index] ?? "");
}

function tableCell(text: string, header: boolean, align: TableAlignment, inlineTokens: (text: string) => Token[]) {
  return {
    text,
    tokens: inlineTokens(text),
    header,
    align,
  };
}

export function tokenizeGfmTable(
  src: string,
  inlineTokens: (text: string) => Token[],
): Tokens.Table | false {
  const lines = src.split(/\r?\n/);
  const headerLine = lines[0] ?? "";
  const delimiterLine = lines[1] ?? "";

  if (!headerLine.includes("|") || !delimiterLine.includes("|")) {
    return false;
  }

  const header = splitGfmTableRow(headerLine);
  const align = tableDelimiterAlignments(splitGfmTableRow(delimiterLine));

  if (!align || align.length !== header.length) {
    return false;
  }

  const rowLines: string[] = [];

  for (let index = 2; index < lines.length; index += 1) {
    const line = lines[index] ?? "";

    if (!line.trim() || !line.includes("|") || tableBlockStartPattern.test(line)) {
      break;
    }

    rowLines.push(line);
  }

  const raw = `${lines.slice(0, rowLines.length + 2).join("\n")}\n`;

  return {
    type: "table",
    raw,
    align,
    header: header.map((text, index) => tableCell(text, true, align[index], inlineTokens)),
    rows: rowLines.map((line) =>
      normalizeTableCells(splitGfmTableRow(line), header.length).map((text, index) =>
        tableCell(text, false, align[index], inlineTokens),
      ),
    ),
  };
}

const wikilinkTableTokenizer: MarkedExtension = {
  gfm: true,
  tokenizer: {
    table(src) {
      if (!src.includes("[[")) {
        return false;
      }

      return tokenizeGfmTable(src, (text) => this.lexer.inlineTokens(text) as Token[]);
    },
  },
};

export function createGlypharyMarked() {
  const instance = new Marked(wikilinkTableTokenizer);

  class GlypharyMarkedLexer extends instance.Lexer {
    constructor(options?: MarkedOptions) {
      super(options ?? instance.defaults);
    }
  }

  instance.Lexer = GlypharyMarkedLexer as unknown as typeof instance.Lexer;
  return instance as unknown as typeof marked;
}
