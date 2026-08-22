import { useRef, useState } from "react";
import type { MutableRefObject } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Editor } from "@tiptap/core";
import {
  aiBuilderEffectiveTaskQueries,
  aiBuilderPromptRequestsTaskContext,
  aiBuilderPromptRequestsVaultContext,
  aiBuilderVaultContextText,
  aiBuilderVaultQueries,
  maxAiBuilderVaultFileChars,
  maxAiBuilderVaultFiles,
  maxAiBuilderVaultSnippetsPerFile,
  maxAiBuilderVaultTasks,
} from "../lib/ai-builder";
import type {
  ActiveFile,
  AiBuilderHistoryAsset,
  AiBuilderHistoryStore,
  AiBuilderHistoryTurn,
  AiPageBuilderAssetRequest,
  AiPageBuilderResponse,
  AiSettings,
  AiTransformResponse,
  SavedAsset,
  SearchResult,
} from "../lib/app-types";
import { defaultVaultImageDirectory } from "../lib/defaults";
import { splitMetaHeader } from "../lib/markdown";
import { cleanVaultAssetReference } from "../lib/paths";
import { currentCursorContext, currentSelectionText } from "../editor/commands";
import { taskSearchPattern } from "../tasks/vault-tasks";
import { readVaultFile, searchVaultFiles } from "../vault/persistence";

// Responsibilities:
// - Own AI command execution, review state, page-builder sessions, and the
//   per-vault AI builder history.
// Contracts:
// - Note content is only changed through the review dialog's explicit apply
//   actions; running a command never edits the document by itself.
// - State and actions keep their historical names so App destructures them
//   without renames.

export type AiReviewState = {
  title: string;
  output: string;
  applyMode: "replace-selection" | "insert-below-selection" | "insert-at-cursor";
  aiBuilderHistoryKey?: string;
  aiBuilderTurnId?: string;
  aiBuilderReplaceTurnId?: string;
};

export type AiPageBuilderAssetReviewState = {
  prompt: string;
  historyKey: string;
  replaceTurnId?: string;
  markdown: string;
  assets: AiPageBuilderAssetRequest[];
};

const aiPageBuilderMarkdownContextLimit = 12000;
const maxAiBuilderHistoryTurnsPerFile = 20;
const maxAiBuilderPromptHistoryTurns = 5;

export function useAiCommands({
  activeFileRef,
  editor,
  markdown,
  metaHeaderRef,
  notifyUser,
  pageNameRef,
  savedAiSettings,
  setEditorBody,
  setStatus,
  vaultRoot,
  vaultRootRef,
}: {
  activeFileRef: MutableRefObject<ActiveFile | null>;
  editor: Editor | null;
  markdown: string;
  metaHeaderRef: MutableRefObject<string>;
  notifyUser: (title: string, body: string) => Promise<void>;
  pageNameRef: MutableRefObject<string>;
  savedAiSettings: () => AiSettings;
  setEditorBody: (content: string, clean: boolean) => void;
  setStatus: (message: string) => void;
  vaultRoot: string;
  vaultRootRef: MutableRefObject<string>;
}) {
  const [aiSubmitting, setAiSubmitting] = useState(false);
  const [aiSubmittingTitle, setAiSubmittingTitle] = useState("");
  const [aiReview, setAiReview] = useState<AiReviewState | null>(null);
  const [aiPageBuilderOpen, setAiPageBuilderOpen] = useState(false);
  const [aiPageBuilderPrompt, setAiPageBuilderPrompt] = useState("");
  const [aiPageBuilderReplaceTurnId, setAiPageBuilderReplaceTurnId] = useState<string | null>(
    null,
  );
  const [aiPageBuilderAssetReview, setAiPageBuilderAssetReview] =
    useState<AiPageBuilderAssetReviewState | null>(null);
  const [aiPageBuilderImportingAssets, setAiPageBuilderImportingAssets] = useState(false);
  const [aiBuilderHistory, setAiBuilderHistory] = useState<AiBuilderHistoryStore>({
    entries: {},
  });
  const aiBuilderHistoryRef = useRef<AiBuilderHistoryStore>({ entries: {} });

  aiBuilderHistoryRef.current = aiBuilderHistory;

  function aiBuilderHistoryKeyForFile(file: ActiveFile | null) {
    return file?.relativePath ?? null;
  }

  function activeAiBuilderHistoryKey() {
    return aiBuilderHistoryKeyForFile(activeFileRef.current);
  }

  function activeAiBuilderHistoryTurns() {
    const key = activeAiBuilderHistoryKey();

    return key ? (aiBuilderHistory.entries[key] ?? []) : [];
  }

  function aiBuilderHistoryContext() {
    const turns = activeAiBuilderHistoryTurns().slice(0, maxAiBuilderPromptHistoryTurns);

    if (turns.length === 0) {
      return "(none)";
    }

    return turns
      .map((turn, index) =>
        [
          `Turn ${turns.length - index}:`,
          `User: ${turn.prompt}`,
          "Assistant markdown:",
          turn.markdown,
        ].join("\n"),
      )
      .join("\n\n");
  }

  function selectedAiBuilderReplacementTurn() {
    if (!aiPageBuilderReplaceTurnId) {
      return null;
    }

    return (
      activeAiBuilderHistoryTurns().find((turn) => turn.id === aiPageBuilderReplaceTurnId) ?? null
    );
  }

  function aiBuilderMarkedBlockPattern(turnId: string) {
    const escapedTurnId = escapeRegExp(turnId);

    return new RegExp(
      `<!--\\s*glyphary-ai-builder:start\\s+${escapedTurnId}\\s*-->[\\s\\S]*?<!--\\s*glyphary-ai-builder:end\\s+${escapedTurnId}\\s*-->`,
    );
  }

  function hasAiBuilderMarkedBlock(turnId: string) {
    return aiBuilderMarkedBlockPattern(turnId).test(markdown);
  }

  function latestReplaceableAiBuilderTurn() {
    return (
      activeAiBuilderHistoryTurns().find(
        (turn) => turn.applied && !turn.superseded && hasAiBuilderMarkedBlock(turn.id),
      ) ?? null
    );
  }

  function clearActiveAiBuilderHistory() {
    const key = activeAiBuilderHistoryKey();

    if (!key) {
      setStatus("Open a saved vault file before clearing AI Builder history");
      return;
    }

    const nextHistory = {
      entries: {
        ...aiBuilderHistoryRef.current.entries,
        [key]: [],
      },
    };

    persistAiBuilderHistory(nextHistory);
    setAiPageBuilderReplaceTurnId(null);
    setStatus("Cleared AI Builder history for this file");
  }

  async function loadAiBuilderHistory(root: string) {
    try {
      const history = await invoke<AiBuilderHistoryStore>("read_ai_builder_history", { root });
      const normalized = { entries: history.entries ?? {} };

      aiBuilderHistoryRef.current = normalized;
      setAiBuilderHistory(normalized);
    } catch (error) {
      aiBuilderHistoryRef.current = { entries: {} };
      setAiBuilderHistory({ entries: {} });
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  function persistAiBuilderHistory(nextHistory: AiBuilderHistoryStore) {
    const root = vaultRootRef.current;

    if (!root) {
      return;
    }

    aiBuilderHistoryRef.current = nextHistory;
    setAiBuilderHistory(nextHistory);
    void invoke<AiBuilderHistoryStore>("write_ai_builder_history", {
      root,
      history: nextHistory,
    }).catch((error) => {
      setStatus(error instanceof Error ? error.message : String(error));
    });
  }

  function upsertAiBuilderHistoryTurn(key: string, turn: AiBuilderHistoryTurn) {
    const current = aiBuilderHistoryRef.current;
    const currentTurns = current.entries[key] ?? [];
    const nextTurns = [turn, ...currentTurns.filter((entry) => entry.id !== turn.id)].slice(
      0,
      maxAiBuilderHistoryTurnsPerFile,
    );
    const nextHistory = {
      entries: {
        ...current.entries,
        [key]: nextTurns,
      },
    };

    persistAiBuilderHistory(nextHistory);
  }

  function updateAiBuilderHistoryTurn(
    key: string,
    turnId: string,
    patch: Partial<AiBuilderHistoryTurn>,
  ) {
    const current = aiBuilderHistoryRef.current;
    const currentTurns = current.entries[key] ?? [];
    const nextTurns = currentTurns.map((turn) =>
      turn.id === turnId ? { ...turn, ...patch } : turn,
    );
    const nextHistory = {
      entries: {
        ...current.entries,
        [key]: nextTurns,
      },
    };

    persistAiBuilderHistory(nextHistory);
  }

  function moveAiBuilderHistoryKey(previousKey: string, nextKey: string) {
    if (previousKey === nextKey) {
      return;
    }

    const current = aiBuilderHistoryRef.current;
    const previousTurns = current.entries[previousKey] ?? [];

    if (previousTurns.length === 0) {
      return;
    }

    persistAiBuilderHistory({
      entries: {
        ...current.entries,
        [previousKey]: [],
        [nextKey]: previousTurns,
      },
    });
  }

  function createAiBuilderHistoryTurn(
    prompt: string,
    markdown: string,
    assets: AiBuilderHistoryAsset[] = [],
  ): AiBuilderHistoryTurn {
    const timestampMs = Date.now();

    return {
      id: `ai-builder-${timestampMs}-${Math.random().toString(36).slice(2, 8)}`,
      prompt,
      markdown,
      assets,
      timestampMs,
      applied: false,
    };
  }

  function escapeRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function aiBuilderStartMarker(turnId: string) {
    return `<!-- glyphary-ai-builder:start ${turnId} -->`;
  }

  function aiBuilderEndMarker(turnId: string) {
    return `<!-- glyphary-ai-builder:end ${turnId} -->`;
  }

  function wrapAiBuilderMarkdown(turnId: string, output: string) {
    // Plain HTML comments give us invisible anchors in rendered Markdown while
    // remaining portable source text for Obsidian-style tools and sync.
    const normalized = normalizeAiMarkdownForApply(output).trim();

    return `${aiBuilderStartMarker(turnId)}\n\n${normalized}\n\n${aiBuilderEndMarker(turnId)}`;
  }

  function replaceAiBuilderMarkedBlock(
    sourceMarkdown: string,
    replaceTurnId: string,
    nextTurnId: string,
    output: string,
  ) {
    const pattern = aiBuilderMarkedBlockPattern(replaceTurnId);

    if (!pattern.test(sourceMarkdown)) {
      return null;
    }

    return sourceMarkdown.replace(pattern, wrapAiBuilderMarkdown(nextTurnId, output));
  }

  function aiReviewOutputForInsertion(review: AiReviewState, output: string) {
    if (!review.aiBuilderTurnId) {
      return normalizeAiMarkdownForApply(output);
    }

    return wrapAiBuilderMarkdown(review.aiBuilderTurnId, output);
  }

  function markAiBuilderReviewApplied(review: AiReviewState, replaced: boolean) {
    if (!review.aiBuilderHistoryKey || !review.aiBuilderTurnId) {
      return;
    }

    updateAiBuilderHistoryTurn(review.aiBuilderHistoryKey, review.aiBuilderTurnId, {
      applied: true,
    });

    if (replaced && review.aiBuilderReplaceTurnId) {
      updateAiBuilderHistoryTurn(review.aiBuilderHistoryKey, review.aiBuilderReplaceTurnId, {
        superseded: true,
        replacedByTurnId: review.aiBuilderTurnId,
      });
    }
  }

  async function aiBuilderSearchVaultNotes(request: string) {
    if (!vaultRootRef.current || !aiBuilderPromptRequestsVaultContext(request)) {
      return [];
    }

    const queries = aiBuilderVaultQueries(request);
    const groupedResults = new Map<string, SearchResult[]>();

    // The model never receives arbitrary vault access. Glyphary first performs
    // bounded local searches, then sends only the matching snippets/excerpts.
    for (const query of queries) {
      const results = await searchVaultFiles(vaultRootRef.current, escapeRegExp(query), {
        includeContent: true,
        markdownOnly: true,
        excludeDotPaths: true,
      });

      for (const result of results) {
        const current = groupedResults.get(result.relativePath) ?? [];

        if (current.length < maxAiBuilderVaultSnippetsPerFile) {
          current.push(result);
        }

        groupedResults.set(result.relativePath, current);
      }
    }

    const files = Array.from(groupedResults.entries()).slice(0, maxAiBuilderVaultFiles);

    return Promise.all(
      files.map(async ([relativePath, snippets]) => {
        const file = await readVaultFile(vaultRootRef.current, relativePath);
        const parts = splitMetaHeader(file.content);

        return {
          relativePath,
          snippets,
          excerpt: parts.body.trim().slice(0, maxAiBuilderVaultFileChars),
        };
      }),
    );
  }

  async function aiBuilderSearchVaultTasks(request: string, queries: string[]) {
    if (!vaultRootRef.current || !aiBuilderPromptRequestsTaskContext(request)) {
      return [];
    }

    const results = await searchVaultFiles(vaultRootRef.current, taskSearchPattern("incomplete"), {
      includeContent: true,
      markdownOnly: true,
      excludeDotPaths: true,
    });
    const loweredQueries = aiBuilderEffectiveTaskQueries(queries);

    return results
      .filter((result) => result.isContentMatch)
      .filter((result) => {
        if (loweredQueries.length === 0) {
          return true;
        }

        const searchable = `${result.relativePath} ${result.lineText ?? ""}`.toLowerCase();

        return loweredQueries.some((query) => searchable.includes(query));
      })
      .slice(0, maxAiBuilderVaultTasks);
  }

  async function aiBuilderVaultContext(request: string) {
    const queries = aiBuilderVaultQueries(request);
    const [notes, tasks] = await Promise.all([
      aiBuilderSearchVaultNotes(request),
      aiBuilderSearchVaultTasks(request, queries),
    ]);

    return aiBuilderVaultContextText(
      queries,
      notes,
      tasks,
      aiBuilderPromptRequestsVaultContext(request),
    );
  }

  async function runAiTextCommand(
    title: string,
    instruction: string,
    input: string,
    applyMode: AiReviewState["applyMode"],
  ) {
    if (!editor) {
      return false;
    }

    if (!vaultRoot) {
      setStatus("Open a vault before running AI commands");
      return false;
    }

    if (!input) {
      setStatus("Provide text before running this AI command");
      return false;
    }

    const settings = savedAiSettings();

    if (!settings.enabled) {
      setStatus("Enable AI commands in Settings before using this command");
      return false;
    }

    try {
      setAiSubmitting(true);
      setAiSubmittingTitle(title);
      setStatus(`Running ${title}`);
      const response = await invoke<AiTransformResponse>("run_ai_transform", {
        request: {
          settings,
          instruction,
          input,
        },
      });

      setAiReview({
        title,
        output: normalizeAiMarkdownForApply(response.output),
        applyMode,
      });
      setStatus(`Review ${title} result`);
      return true;
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
      return false;
    } finally {
      setAiSubmitting(false);
      setAiSubmittingTitle("");
    }
  }

  async function runAiSelectionCommand(
    title: string,
    instruction: string,
    applyMode: AiReviewState["applyMode"],
  ) {
    const input = currentSelectionText(editor).trim();

    if (!input) {
      setStatus("Select text before running this AI command");
      return;
    }

    await runAiTextCommand(title, instruction, input, applyMode);
  }

  async function runAiSelectionOrDocumentCommand(
    title: string,
    instruction: string,
    applyMode: AiReviewState["applyMode"],
  ) {
    const input = (currentSelectionText(editor).trim() || markdown.trim()).trim();

    if (!input) {
      setStatus("Write or select text before running this AI command");
      return;
    }

    await runAiTextCommand(title, instruction, input, applyMode);
  }

  async function runAiContinueWritingCommand() {
    const input = currentCursorContext(editor);

    await runAiTextCommand(
      "AI: Continue writing",
      "Continue writing from [[CURSOR]] using the surrounding note as context. Return only the Markdown text that should be inserted at the cursor. Do not repeat existing text.",
      input,
      "insert-at-cursor",
    );
  }

  function stripJsonCodeFence(value: string) {
    const trimmed = value.trim();
    const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);

    return fenced ? fenced[1].trim() : trimmed;
  }

  function parseAiPageBuilderResponse(output: string): AiPageBuilderResponse {
    try {
      const parsed = JSON.parse(stripJsonCodeFence(output)) as Partial<AiPageBuilderResponse>;
      const markdown = typeof parsed.markdown === "string" ? parsed.markdown.trim() : "";
      const assets = Array.isArray(parsed.assets)
        ? parsed.assets
            .map((asset, index) => ({
              id:
                typeof asset?.id === "string" && asset.id.trim()
                  ? asset.id.trim()
                  : `asset-${index + 1}`,
              label:
                typeof asset?.label === "string" && asset.label.trim()
                  ? asset.label.trim()
                  : `Asset ${index + 1}`,
              suggestedName:
                typeof asset?.suggestedName === "string" && asset.suggestedName.trim()
                  ? asset.suggestedName.trim()
                  : `AI asset ${index + 1}.png`,
              url: typeof asset?.url === "string" && asset.url.trim() ? asset.url.trim() : null,
              domain:
                typeof asset?.domain === "string" && asset.domain.trim()
                  ? asset.domain.trim()
                  : null,
            }))
            .filter((asset) => asset.id && asset.suggestedName)
        : [];

      if (markdown) {
        return { markdown, assets };
      }
    } catch {
      // Older or noncompliant providers may ignore the JSON format request.
      // Treat their response as plain Markdown so the builder still remains usable.
    }

    return {
      markdown: output.trim(),
      assets: [],
    };
  }

  function pageBuilderAssetDomain(asset: AiPageBuilderAssetRequest) {
    const value = asset.domain?.trim();

    if (!value) {
      return "";
    }

    try {
      return new URL(value.includes("://") ? value : `https://${value}`).hostname;
    } catch {
      return value.replace(/^https?:\/\//i, "").replace(/\/.*$/, "").trim();
    }
  }

  function pageBuilderAssetCandidateUrls(asset: AiPageBuilderAssetRequest) {
    const urls = new Set<string>();

    if (asset.url?.trim()) {
      urls.add(asset.url.trim());
    }

    const domain = pageBuilderAssetDomain(asset);

    if (domain) {
      urls.add(`https://logo.clearbit.com/${encodeURIComponent(domain)}`);
      urls.add(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=256`);
    }

    return Array.from(urls);
  }

  function replaceAiPageBuilderAssetPlaceholders(
    markdown: string,
    replacements: Map<string, SavedAsset>,
  ) {
    const replacedMarkdown = Array.from(replacements.entries()).reduce(
      (nextMarkdown, [id, saved]) => {
        const escapedId = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const vaultImageMarkdown = `![[${saved.fileName}]]`;

        // Models often put asset placeholders in normal image markdown, e.g.
        // `![Logo]({{asset:logo}})`. A vault image token is already complete
        // image syntax, so replace the whole wrapper instead of creating the
        // invalid nested form `![Logo](![[logo.png]])`.
        return nextMarkdown
          .replace(
            new RegExp(
              `!\\[[^\\]\\n]*\\]\\(\\s*\\{\\{asset:${escapedId}\\}\\}\\s*\\)`,
              "g",
            ),
            vaultImageMarkdown,
          )
          .replace(new RegExp(`\\{\\{asset:${escapedId}\\}\\}`, "g"), vaultImageMarkdown);
      },
      markdown,
    );

    return normalizeAiMarkdownForApply(replacedMarkdown);
  }

  function normalizeMalformedVaultImageMarkdown(markdown: string) {
    return markdown.replace(
      /!\[[^\]\n]*\]\(\s*([^)]+?)\s*\)/g,
      (match, rawHref: string) => {
        let decodedHref = rawHref.trim();

        try {
          decodedHref = decodeURIComponent(decodedHref);
        } catch {
          return match;
        }

        const nestedVaultImage = decodedHref.match(/^!\[\[([^\]\n]+)\]\]$/);

        if (!nestedVaultImage) {
          return match;
        }

        const vaultTarget = cleanVaultAssetReference(nestedVaultImage[1]);

        return vaultTarget ? `![[${vaultTarget}]]` : match;
      },
    );
  }

  function normalizeAiMarkdownForApply(markdown: string) {
    // Keep malformed AI-generated vault image markdown out of saved notes.
    // `![Alt](![[image.png]])` may be easy for a model to produce, but the
    // portable vault-image form is the standalone Obsidian/Glyphary token.
    return normalizeMalformedVaultImageMarkdown(markdown);
  }

  function openAiPageBuilder() {
    if (!editor) {
      return;
    }

    if (!vaultRoot) {
      setStatus("Open a vault before using AI Page Builder");
      return;
    }

    if (!savedAiSettings().enabled) {
      setStatus("Enable AI commands in Settings before using AI Page Builder");
      return;
    }

    setAiPageBuilderPrompt("");
    setAiPageBuilderReplaceTurnId(latestReplaceableAiBuilderTurn()?.id ?? null);
    setAiPageBuilderOpen(true);
  }

  function aiPageBuilderContext(
    request: string,
    replacementTurn: AiBuilderHistoryTurn | null,
    vaultContext: string,
  ) {
    const selectedText = currentSelectionText(editor).trim();
    const markdownExcerpt =
      markdown.length > aiPageBuilderMarkdownContextLimit
        ? `${markdown.slice(0, aiPageBuilderMarkdownContextLimit)}\n\n[...note truncated...]`
        : markdown;

    // The builder prompt is intentionally explicit about Glyphary's block
    // dialect. That makes generated sections usable in the editor instead of
    // generic Markdown that loses callouts, columns, galleries, or HTML blocks.
    return [
      "User request:",
      request.trim(),
      "",
      "Current note:",
      `Title: ${pageNameRef.current || "Untitled note"}`,
      `Vault-relative file: ${activeFileRef.current?.relativePath ?? "(unsaved note)"}`,
      "",
      "Frontmatter:",
      metaHeaderRef.current.trim() || "(none)",
      "",
      "Selected text:",
      selectedText || "(none)",
      "",
      "Recent AI Builder conversation for this file:",
      aiBuilderHistoryContext(),
      "",
      "Replacement target:",
      replacementTurn
        ? [
            `Turn id: ${replacementTurn.id}`,
            `Original request: ${replacementTurn.prompt}`,
            "Previously applied markdown:",
            replacementTurn.markdown,
          ].join("\n")
        : "(none)",
      "",
      "Vault retrieval context:",
      vaultContext,
      "",
      "Cursor context:",
      currentCursorContext(editor),
      "",
      "Current Markdown excerpt:",
      markdownExcerpt.trim() || "(empty)",
    ].join("\n");
  }

  async function runAiPageBuilder() {
    const request = aiPageBuilderPrompt.trim();

    if (!request) {
      setStatus("Describe what AI Page Builder should create");
      return;
    }

    const settings = savedAiSettings();

    if (!settings.enabled) {
      setStatus("Enable AI commands in Settings before using AI Page Builder");
      return;
    }

    try {
      const historyKey = activeAiBuilderHistoryKey();
      const replacementTurn = selectedAiBuilderReplacementTurn();
      const replaceTurnId = replacementTurn?.id ?? null;
      setAiSubmitting(true);
      setAiSubmittingTitle("AI: Page Builder");
      setStatus("Gathering vault context for AI: Page Builder");
      const vaultContext = await aiBuilderVaultContext(request);
      setStatus("Running AI: Page Builder");
      const response = await invoke<AiTransformResponse>("run_ai_transform", {
        request: {
          settings,
          instruction: [
            "Build a useful Glyphary page section from the user's request and page context.",
            "Return only valid JSON with this shape: {\"markdown\":\"...\",\"assets\":[{\"id\":\"stable-placeholder-id\",\"label\":\"Human label\",\"suggestedName\":\"file-name.png\",\"url\":\"https://... optional direct image URL\",\"domain\":\"example.com optional brand domain\"}]}",
            "In markdown, reference every generated asset with a placeholder exactly like {{asset:stable-placeholder-id}}. Glyphary will replace those placeholders after importing approved assets.",
            "Prefer Glyphary-native Markdown blocks when they fit: ::: callout, ::: columns, ::: gallery, ::: collapse, ```toc, Markdown tables, task lists, wikilinks like [[Page Name]], and vault images like ![[image.png]].",
            "Use raw HTML only when Markdown or Glyphary block syntax cannot express the requested layout.",
            "When using raw HTML, do not include scripts, iframes, event handlers, external stylesheets, data URLs, or remote executable content.",
            "If the user asks for logos or remote images, add asset entries instead of inventing local file paths. Prefer a direct image URL when known; otherwise include the brand domain.",
            "Do not wrap the JSON in a code fence.",
            "If the request is underspecified, choose a practical structure and keep the result editable.",
            "If a replacement target is provided, produce the complete replacement for that prior block, not a patch or diff.",
            "If vault retrieval context is provided, use it as source material for summaries, task tables, and cross-note answers. Cite source notes with [[Note Name]] links and do not imply a vault-wide search was exhaustive beyond the provided local results.",
          ].join("\n"),
          input: aiPageBuilderContext(request, replacementTurn, vaultContext),
        },
      });
      const builderResponse = parseAiPageBuilderResponse(response.output);
      const normalizedMarkdown = normalizeAiMarkdownForApply(builderResponse.markdown);

      if (builderResponse.assets.length > 0) {
        setAiPageBuilderAssetReview({
          ...builderResponse,
          prompt: request,
          historyKey: historyKey ?? "",
          replaceTurnId: replaceTurnId ?? undefined,
          markdown: normalizedMarkdown,
        });
        setStatus(`Review ${builderResponse.assets.length} requested asset import`);
      } else {
        const turn = historyKey
          ? createAiBuilderHistoryTurn(request, normalizedMarkdown)
          : null;

        if (historyKey && turn) {
          upsertAiBuilderHistoryTurn(historyKey, turn);
        }

        setAiReview({
          title: "AI: Page Builder",
          output: normalizedMarkdown,
          applyMode: "insert-at-cursor",
          aiBuilderHistoryKey: historyKey ?? undefined,
          aiBuilderTurnId: turn?.id,
          aiBuilderReplaceTurnId: replaceTurnId ?? undefined,
        });
        setStatus("Review AI: Page Builder result");
      }

      setAiPageBuilderOpen(false);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setAiSubmitting(false);
      setAiSubmittingTitle("");
    }
  }

  async function importAiPageBuilderAssets() {
    if (!vaultRootRef.current || !aiPageBuilderAssetReview) {
      return;
    }

    try {
      setAiPageBuilderImportingAssets(true);
      setStatus("Importing AI Page Builder assets");
      const replacements = new Map<string, SavedAsset>();
      const importedAssets: AiBuilderHistoryAsset[] = [];

      for (const asset of aiPageBuilderAssetReview.assets) {
        const candidateUrls = pageBuilderAssetCandidateUrls(asset);
        let saved: SavedAsset | null = null;
        let lastError = "No image URL or brand domain was provided";

        // Brand logo resolution is intentionally best-effort and explicit:
        // direct URLs win, domain logo services are fallbacks, and failures keep
        // the placeholder out of the document instead of silently inserting a
        // broken local image reference.
        for (const url of candidateUrls) {
          try {
            saved = await invoke<SavedAsset>("import_remote_vault_image_asset", {
              root: vaultRootRef.current,
              assetDirectory: defaultVaultImageDirectory,
              fileName: asset.suggestedName,
              url,
            });
            break;
          } catch (error) {
            lastError = error instanceof Error ? error.message : String(error);
          }
        }

        if (!saved) {
          throw new Error(`Could not import ${asset.label}: ${lastError}`);
        }

        replacements.set(asset.id, saved);
        importedAssets.push({
          id: asset.id,
          label: asset.label,
          fileName: saved.fileName,
          relativePath: saved.relativePath,
        });
      }
      const output = replaceAiPageBuilderAssetPlaceholders(
        aiPageBuilderAssetReview.markdown,
        replacements,
      );
      const historyKey = aiPageBuilderAssetReview.historyKey || null;
      const turn = historyKey
        ? createAiBuilderHistoryTurn(aiPageBuilderAssetReview.prompt, output, importedAssets)
        : null;

      if (historyKey && turn) {
        upsertAiBuilderHistoryTurn(historyKey, turn);
      }

      setAiReview({
        title: "AI: Page Builder",
        output,
        applyMode: "insert-at-cursor",
        aiBuilderHistoryKey: historyKey ?? undefined,
        aiBuilderTurnId: turn?.id,
        aiBuilderReplaceTurnId: aiPageBuilderAssetReview.replaceTurnId,
      });
      setAiPageBuilderAssetReview(null);
      setStatus(
        `Imported ${replacements.size} AI Page Builder asset${
          replacements.size === 1 ? "" : "s"
        }`,
      );
      void notifyUser(
        "Glyphary import complete",
        `Imported ${replacements.size} AI Page Builder asset${
          replacements.size === 1 ? "" : "s"
        }.`,
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setAiPageBuilderImportingAssets(false);
    }
  }

  function replaceSelectionWithAiOutput(output: string) {
    if (!editor) {
      return;
    }

    const review = aiReview;
    const content = review
      ? aiReviewOutputForInsertion(review, output)
      : normalizeAiMarkdownForApply(output);

    editor
      .chain()
      .focus()
      .insertContent(content, { contentType: "markdown" })
      .run();
    if (review) {
      markAiBuilderReviewApplied(review, false);
    }
    setAiReview(null);
    setStatus("Applied AI result");
  }

  function insertAiOutputBelowSelection(output: string) {
    if (!editor) {
      return;
    }

    const review = aiReview;
    const content = review
      ? aiReviewOutputForInsertion(review, output)
      : normalizeAiMarkdownForApply(output);

    editor
      .chain()
      .focus()
      .setTextSelection(editor.state.selection.to)
      .insertContent(`\n\n${content}`, { contentType: "markdown" })
      .run();
    if (review) {
      markAiBuilderReviewApplied(review, false);
    }
    setAiReview(null);
    setStatus("Inserted AI result");
  }

  function insertAiOutputAtCursor(output: string) {
    if (!editor) {
      return;
    }

    const review = aiReview;
    const content = review
      ? aiReviewOutputForInsertion(review, output)
      : normalizeAiMarkdownForApply(output);

    editor
      .chain()
      .focus()
      .insertContent(content, { contentType: "markdown" })
      .run();
    if (review) {
      markAiBuilderReviewApplied(review, false);
    }
    setAiReview(null);
    setStatus("Inserted AI result");
  }

  function replacePreviousAiBuilderOutput(review: AiReviewState) {
    if (!editor || !review.aiBuilderReplaceTurnId || !review.aiBuilderTurnId) {
      return;
    }

    const nextMarkdown = replaceAiBuilderMarkedBlock(
      editor.getMarkdown(),
      review.aiBuilderReplaceTurnId,
      review.aiBuilderTurnId,
      review.output,
    );

    if (!nextMarkdown) {
      editor
        .chain()
        .focus()
        .insertContent(aiReviewOutputForInsertion(review, review.output), {
          contentType: "markdown",
        })
        .run();
      markAiBuilderReviewApplied(review, false);
      setAiReview(null);
      setStatus("Could not find previous AI Builder block; inserted result at cursor");
      return;
    }

    setEditorBody(nextMarkdown, false);
    markAiBuilderReviewApplied(review, true);
    setAiReview(null);
    setStatus("Replaced AI Builder result");
  }

  async function copyAiOutput(output: string) {
    await window.navigator.clipboard.writeText(output);
    setStatus("Copied AI result");
  }

  return {
    activeAiBuilderHistoryTurns,
    aiBuilderHistory,
    aiBuilderHistoryRef,
    aiPageBuilderAssetReview,
    aiPageBuilderImportingAssets,
    aiPageBuilderOpen,
    aiPageBuilderPrompt,
    aiPageBuilderReplaceTurnId,
    aiReview,
    aiSubmitting,
    aiSubmittingTitle,
    clearActiveAiBuilderHistory,
    copyAiOutput,
    importAiPageBuilderAssets,
    insertAiOutputAtCursor,
    insertAiOutputBelowSelection,
    loadAiBuilderHistory,
    moveAiBuilderHistoryKey,
    openAiPageBuilder,
    pageBuilderAssetCandidateUrls,
    replacePreviousAiBuilderOutput,
    replaceSelectionWithAiOutput,
    runAiContinueWritingCommand,
    runAiPageBuilder,
    runAiSelectionCommand,
    runAiSelectionOrDocumentCommand,
    selectedAiBuilderReplacementTurn,
    setAiPageBuilderAssetReview,
    setAiPageBuilderOpen,
    setAiPageBuilderPrompt,
    setAiPageBuilderReplaceTurnId,
    setAiReview,
  };
}
