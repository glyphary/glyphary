/**
 * AI Builder prompt-context helpers.
 *
 * Responsibilities:
 * - Infer whether a free-form AI Builder request needs vault-wide context.
 * - Derive small local-search queries from natural language prompts.
 * - Format bounded vault note/task retrieval results for the model prompt.
 *
 * Contracts:
 * - This module is pure: it does not call Tauri, read files, or contact AI providers.
 * - Vault context must stay bounded because the configured AI backend receives
 *   this text; callers decide what files to search and read.
 * - Source references are formatted as wikilinks so generated output can point
 *   users back to local notes without needing absolute filesystem paths.
 */

import type { SearchResult } from "./app-types.js";

export const maxAiBuilderVaultQueries = 3;
export const maxAiBuilderVaultFiles = 8;
export const maxAiBuilderVaultFileChars = 2400;
export const maxAiBuilderVaultSnippetsPerFile = 4;
export const maxAiBuilderVaultTasks = 40;

export type AiBuilderVaultNoteContext = {
  relativePath: string;
  snippets: SearchResult[];
  excerpt: string;
};

const vaultContextRequestPattern =
  /\b(vault|all\s+(?:pages|notes|files)|pages?|notes?|files?|search|matching|pertaining|related|about|regarding|tasks?|todos?|checklists?)\b/i;
const taskContextRequestPattern =
  /\b(tasks?|todos?|checklists?|open\s+items?|incomplete|unfinished|still\s+open)\b/i;
const promptFocusedPatterns = [
  /\b(?:pertaining to|related to|regarding|about|for|on)\s+([A-Za-z0-9][\w./ -]{1,80})/gi,
  /\b(?:references?|referencing|referenced|mentions?|mentioning|matching|containing)\s+([A-Za-z0-9][\w./ -]{1,80})/gi,
];
const promptStopWords = new Set([
  "all",
  "about",
  "and",
  "are",
  "build",
  "can",
  "create",
  "display",
  "file",
  "files",
  "from",
  "give",
  "incomplete",
  "link",
  "links",
  "list",
  "make",
  "note",
  "notes",
  "open",
  "opened",
  "page",
  "pages",
  "please",
  "pertaining",
  "reference",
  "referenced",
  "references",
  "referencing",
  "regarding",
  "related",
  "show",
  "still",
  "summarize",
  "summary",
  "table",
  "task",
  "tasks",
  "that",
  "the",
  "them",
  "this",
  "todo",
  "todos",
  "unfinished",
  "vault",
  "with",
]);
const genericTaskTerms = new Set([
  "incomplete",
  "open",
  "opened",
  "still",
  "task",
  "tasks",
  "todo",
  "todos",
  "unfinished",
]);

export function aiBuilderPromptRequestsVaultContext(request: string) {
  return vaultContextRequestPattern.test(request);
}

export function aiBuilderPromptRequestsTaskContext(request: string) {
  return taskContextRequestPattern.test(request);
}

function aiBuilderNormalizeFocusedQuery(candidate: string) {
  return candidate
    .split(/[,.!?;:\n]/)[0]
    .replace(/\s+\b(?:in|from|within)\s+(?:this|the|my|current)?\s*(?:vault|notes|pages|files)\b.*$/i, "")
    .replace(/\s+\b(?:as|into|with)\s+(?:a\s+)?(?:table|list|summary)\b.*$/i, "")
    .trim();
}

function aiBuilderNormalizeQuery(query: string) {
  return query.trim().replace(/^[^\w]+|[^\w]+$/g, "");
}

export function aiBuilderVaultQueries(request: string) {
  const queries: string[] = [];

  for (const match of request.matchAll(/["`']([^"`']{2,80})["`']/g)) {
    queries.push(match[1].trim());
  }

  for (const pattern of promptFocusedPatterns) {
    for (const match of request.matchAll(pattern)) {
      const query = aiBuilderNormalizeFocusedQuery(match[1]);

      if (query) {
        queries.push(query);
      }
    }
  }

  const fallbackTerms = request
    .toLowerCase()
    .match(/[a-z0-9][a-z0-9._-]{2,}/g)
    ?.filter((term) => !promptStopWords.has(term));

  for (const term of fallbackTerms ?? []) {
    queries.push(term);
  }

  return Array.from(new Set(queries.map(aiBuilderNormalizeQuery).filter(Boolean))).slice(
    0,
    maxAiBuilderVaultQueries,
  );
}

export function aiBuilderEffectiveTaskQueries(queries: string[]) {
  return queries.map((query) => query.toLowerCase()).filter((query) => !genericTaskTerms.has(query));
}

export function aiBuilderNoteLink(relativePath: string) {
  return `[[${relativePath.replace(/\.md$/i, "")}]]`;
}

export function aiBuilderTaskLabel(lineText: string | null | undefined) {
  const line = lineText?.trim() || "Task";
  const match = line.match(/^- \[([ xX])\]\s*(.*)$/);

  return match ? match[2] || "Task" : line;
}

export function aiBuilderVaultContextText(
  queries: string[],
  notes: AiBuilderVaultNoteContext[],
  tasks: SearchResult[],
  vaultContextWasRequested: boolean,
) {
  if (notes.length === 0 && tasks.length === 0) {
    return vaultContextWasRequested
      ? "No matching vault notes or open tasks were found by local search."
      : "No vault-wide context requested.";
  }

  const noteSections = notes.map((note, index) => {
    const snippets = note.snippets
      .filter((snippet) => snippet.isContentMatch && snippet.lineText)
      .map((snippet) => `- line ${snippet.lineNumber ?? "?"}: ${snippet.lineText}`)
      .join("\n");

    return [
      `Note ${index + 1}: ${aiBuilderNoteLink(note.relativePath)}`,
      snippets ? `Matched snippets:\n${snippets}` : "Matched by filename.",
      "Excerpt:",
      note.excerpt || "(empty)",
    ].join("\n");
  });
  const taskLines = tasks.map(
    (task) =>
      `- [ ] ${aiBuilderTaskLabel(task.lineText)} (${aiBuilderNoteLink(task.relativePath)}${
        task.lineNumber ? ` line ${task.lineNumber}` : ""
      })`,
  );

  return [
    `Queries used: ${queries.length > 0 ? queries.join(", ") : "(task scan only)"}`,
    notes.length > 0 ? `Matching notes:\n\n${noteSections.join("\n\n")}` : "Matching notes: none",
    tasks.length > 0 ? `Open tasks:\n${taskLines.join("\n")}` : "Open tasks: none",
  ].join("\n\n");
}
