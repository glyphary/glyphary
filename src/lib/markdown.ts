/**
 * Markdown and frontmatter pure helpers.
 *
 * Responsibilities:
 * - Split and compose hidden frontmatter around the WYSIWYG editor body.
 * - Extract document headings for table-of-contents UI.
 * - Extract simple frontmatter list values for tag pills.
 *
 * Contracts:
 * - Frontmatter handling must round-trip complete YAML/TOML fences without editing the body.
 * - Heading extraction must ignore fenced code blocks.
 * - Frontmatter list parsing is intentionally a small display heuristic, not a full YAML parser.
 */

import { defaultFrontmatterPillHeader } from "./defaults.js";

export type MarkdownParts = {
  metaHeader: string;
  metaDelimiter: "---" | "+++";
  body: string;
};

export type TocEntry = {
  id: string;
  level: number;
  title: string;
  occurrence: number;
};

export type FrontmatterEntry = {
  key: string;
  value: string;
  startLine: number;
  endLine: number;
};

export const defaultMetaDelimiter: MarkdownParts["metaDelimiter"] = "---";

export function markdownHeadings(markdown: string): TocEntry[] {
  const headings: TocEntry[] = [];
  const occurrences = new Map<string, number>();
  let inFence = false;
  let fenceMarker = "";

  for (const line of markdown.split(/\r?\n/)) {
    const fenceMatch = line.match(/^\s*(```+|~~~+)/);

    if (fenceMatch) {
      const marker = fenceMatch[1][0];

      if (!inFence) {
        inFence = true;
        fenceMarker = marker;
      } else if (marker === fenceMarker) {
        inFence = false;
        fenceMarker = "";
      }

      continue;
    }

    if (inFence) {
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.+?)\s*$/);

    if (!headingMatch) {
      continue;
    }

    const title = headingMatch[2].replace(/\s+#+\s*$/, "").trim();

    if (!title) {
      continue;
    }

    const level = headingMatch[1].length;
    const key = `${level}:${title}`;
    const occurrence = (occurrences.get(key) ?? 0) + 1;

    occurrences.set(key, occurrence);
    headings.push({
      id: `${key}:${occurrence}`,
      level,
      title,
      occurrence,
    });
  }

  return headings;
}

export function splitMetaHeader(content: string): MarkdownParts {
  // Frontmatter is hidden from the WYSIWYG editor but must round-trip exactly
  // enough for save. Only complete YAML/TOML-style opening and closing fences
  // are treated as metadata; unterminated fences remain part of the document.
  const delimiter = content.startsWith("---\n") || content.startsWith("---\r\n")
    ? "---"
    : content.startsWith("+++\n") || content.startsWith("+++\r\n")
      ? "+++"
      : null;

  if (!delimiter) {
    return { metaHeader: "", metaDelimiter: defaultMetaDelimiter, body: content };
  }

  const linePattern = /\r?\n/g;
  let match: RegExpExecArray | null;

  while ((match = linePattern.exec(content)) !== null) {
    const lineStart = match.index + match[0].length;
    const nextBreak = content.indexOf("\n", lineStart);
    const lineEnd = nextBreak === -1 ? content.length : nextBreak;
    const line = content.slice(lineStart, lineEnd).replace(/\r$/, "");

    if (line === delimiter) {
      const headerEnd = nextBreak === -1 ? content.length : nextBreak + 1;
      const metaHeader = content
        .slice(content.indexOf("\n") + 1, match.index)
        .replace(/\r\n/g, "\n")
        .replace(/\r$/, "");

      if (!looksLikeFrontmatter(metaHeader, delimiter)) {
        return { metaHeader: "", metaDelimiter: defaultMetaDelimiter, body: content };
      }

      return {
        metaHeader,
        metaDelimiter: delimiter,
        body: content.slice(headerEnd),
      };
    }
  }

  return { metaHeader: "", metaDelimiter: defaultMetaDelimiter, body: content };
}

function looksLikeFrontmatter(metaHeader: string, delimiter: MarkdownParts["metaDelimiter"]) {
  const lines = metaHeader.split("\n").filter((line) => line.trim());

  if (lines.length === 0) {
    return false;
  }

  if (delimiter === "+++") {
    let sawKey = false;
    const validToml = lines.every((line) => {
      const trimmed = line.trim();

      if (trimmed.startsWith("#") || /^\[[A-Za-z0-9_.-]+\]$/.test(trimmed)) {
        return true;
      }

      if (/^[A-Za-z0-9_.-]+\s*=/.test(trimmed)) {
        sawKey = true;
        return true;
      }

      return false;
    });

    return validToml && sawKey;
  }

  let sawKey = false;

  const validYaml = lines.every((line) => {
    const trimmed = line.trim();

    if (trimmed.startsWith("#")) {
      return true;
    }

    if (/^[A-Za-z0-9_-]+:\s*/.test(trimmed)) {
      sawKey = true;
      return true;
    }

    return sawKey && (/^\s+/.test(line) || trimmed.startsWith("- "));
  });

  return validYaml && sawKey;
}

function frontmatterEntryPattern(delimiter: MarkdownParts["metaDelimiter"]) {
  return delimiter === "+++"
    ? /^([A-Za-z0-9_.-]+)\s*=\s*(.*)$/
    : /^([A-Za-z0-9_-]+):\s*(.*)$/;
}

export function frontmatterEntries(
  metaHeader: string,
  delimiter: MarkdownParts["metaDelimiter"],
): FrontmatterEntry[] {
  const lines = metaHeader.replace(/\r\n/g, "\n").split("\n");
  const pattern = frontmatterEntryPattern(delimiter);
  const entries: FrontmatterEntry[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(pattern);

    if (!match) {
      continue;
    }

    let endLine = index;
    let value = match[2] ?? "";

    while (endLine + 1 < lines.length) {
      const continuation = lines[endLine + 1];

      if (!/^\s+\S/.test(continuation) && !/^\s*-\s+/.test(continuation)) {
        break;
      }

      value += `\n${continuation}`;
      endLine += 1;
    }

    entries.push({ key: match[1], value, startLine: index, endLine });
    index = endLine;
  }

  return entries;
}

function serializeFrontmatterEntry(
  delimiter: MarkdownParts["metaDelimiter"],
  entry: Pick<FrontmatterEntry, "key" | "value">,
) {
  const prefix = delimiter === "+++" ? `${entry.key} =` : `${entry.key}:`;

  if (!entry.value) {
    return prefix;
  }

  return entry.value.startsWith("\n") ? `${prefix}${entry.value}` : `${prefix} ${entry.value}`;
}

export function replaceFrontmatterEntry(
  metaHeader: string,
  delimiter: MarkdownParts["metaDelimiter"],
  entryIndex: number,
  nextEntry: Pick<FrontmatterEntry, "key" | "value"> | null,
) {
  const lines = metaHeader.replace(/\r\n/g, "\n").split("\n");
  const entry = frontmatterEntries(metaHeader, delimiter)[entryIndex];

  if (!entry) {
    return metaHeader;
  }

  lines.splice(
    entry.startLine,
    entry.endLine - entry.startLine + 1,
    ...(nextEntry ? serializeFrontmatterEntry(delimiter, nextEntry).split("\n") : []),
  );
  return lines.join("\n");
}

export function appendFrontmatterEntry(
  metaHeader: string,
  delimiter: MarkdownParts["metaDelimiter"],
) {
  const keys = new Set(frontmatterEntries(metaHeader, delimiter).map((entry) => entry.key));
  let key = "property";
  let suffix = 2;

  while (keys.has(key)) {
    key = `property${suffix}`;
    suffix += 1;
  }

  const entry = serializeFrontmatterEntry(delimiter, { key, value: "" });
  const cleanHeader = metaHeader.replace(/\n+$/, "");

  return cleanHeader ? `${cleanHeader}\n${entry}` : entry;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cleanFrontmatterListItem(value: string) {
  const trimmed = value.trim();

  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      return JSON.parse(trimmed);
    } catch {
      // Fall through to the permissive YAML-style cleanup.
    }
  }

  return trimmed.replace(/^['"]|['"]$/g, "").trim();
}

function splitFrontmatterInlineList(value: string) {
  const values: string[] = [];
  let current = "";
  let quote = "";
  let escaped = false;

  for (const character of value) {
    if (escaped) {
      current += character;
      escaped = false;
      continue;
    }

    if (character === "\\" && quote) {
      current += character;
      escaped = true;
      continue;
    }

    if ((character === '"' || character === "'") && (!quote || quote === character)) {
      quote = quote ? "" : character;
      current += character;
      continue;
    }

    if (character === "," && !quote) {
      values.push(cleanFrontmatterListItem(current));
      current = "";
      continue;
    }

    current += character;
  }

  if (current.trim() || value.includes(",")) {
    values.push(cleanFrontmatterListItem(current));
  }

  return values;
}

export function frontmatterEntryListValues(value: string, forceList = false) {
  const trimmed = value.trim();
  const inlineMatch = trimmed.match(/^\[([\s\S]*)\]$/);

  if (inlineMatch) {
    return inlineMatch[1].trim() ? splitFrontmatterInlineList(inlineMatch[1]) : [];
  }

  const blockLines = value.split("\n").filter((line) => line.trim());
  const blockItems = blockLines.map((line) => line.match(/^\s*-\s+(.+?)\s*$/));

  if (blockItems.length > 0 && blockItems.every(Boolean)) {
    return blockItems.map((match) => cleanFrontmatterListItem(match?.[1] ?? ""));
  }

  if (!forceList) {
    return null;
  }

  return trimmed ? [cleanFrontmatterListItem(trimmed)] : [];
}

export function serializeFrontmatterListValues(values: string[]) {
  return `[${values.map((value) => JSON.stringify(value)).join(", ")}]`;
}

export function frontmatterListValues(
  metaHeader: string,
  headerName = defaultFrontmatterPillHeader,
) {
  const cleanHeaderName = headerName.trim();

  if (!cleanHeaderName) {
    return [];
  }

  const values: string[] = [];
  const seen = new Set<string>();
  const lines = metaHeader.replace(/\r\n/g, "\n").split("\n");
  const escapedHeaderName = escapeRegExp(cleanHeaderName);
  const inlinePattern = new RegExp(`^\\s*${escapedHeaderName}\\s*:\\s*\\[([^\\]]*)\\]\\s*$`, "i");
  const blockPattern = new RegExp(`^(\\s*)${escapedHeaderName}\\s*:\\s*$`, "i");

  // This is a display heuristic, not a full YAML parser. It intentionally only
  // recognizes simple list shapes for the vault-configured frontmatter key.
  function pushValue(value: string) {
    const cleanValue = cleanFrontmatterListItem(value);
    const key = cleanValue.toLowerCase();

    if (!cleanValue || seen.has(key)) {
      return;
    }

    seen.add(key);
    values.push(cleanValue);
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const inlineMatch = line.match(inlinePattern);

    if (inlineMatch) {
      inlineMatch[1].split(",").forEach(pushValue);
      continue;
    }

    const blockMatch = line.match(blockPattern);

    if (!blockMatch) {
      continue;
    }

    const baseIndent = blockMatch[1].length;

    for (let itemIndex = index + 1; itemIndex < lines.length; itemIndex += 1) {
      const itemLine = lines[itemIndex];

      if (!itemLine.trim()) {
        continue;
      }

      const itemMatch = itemLine.match(/^(\s*)-\s+(.+?)\s*$/);

      if (!itemMatch || itemMatch[1].length < baseIndent) {
        break;
      }

      pushValue(itemMatch[2]);
      index = itemIndex;
    }
  }

  return values;
}

export function frontmatterScalarValue(metaHeader: string, headerName: string) {
  const cleanHeaderName = headerName.trim();

  if (!cleanHeaderName) {
    return "";
  }

  const escapedHeaderName = escapeRegExp(cleanHeaderName);
  const pattern = new RegExp(`^\\s*${escapedHeaderName}\\s*:\\s*(.+?)\\s*$`, "im");
  const match = metaHeader.match(pattern);
  const value = match?.[1]?.trim() ?? "";

  return value.replace(/^['"]|['"]$/g, "").trim();
}

export function composeMarkdown(
  metaHeader: string,
  metaDelimiter: MarkdownParts["metaDelimiter"],
  body: string,
) {
  const cleanMeta = metaHeader.trim();

  if (!cleanMeta) {
    return body;
  }

  return `${metaDelimiter}\n${cleanMeta}\n${metaDelimiter}\n${body}`;
}
