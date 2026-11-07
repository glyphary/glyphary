import type { Editor } from "@tiptap/core";
import { convertFileSrc } from "@tauri-apps/api/core";
import { baseTitle, isBasePath } from "../lib/base";
import { canvasTitle, isCanvasPath } from "../CanvasView";
import type { DocumentTab, EditorGroupId, EditorGroupState } from "../lib/app-types";
import { defaultMetaDelimiter } from "../lib/markdown";
import { hydrateMeta } from "../editor/note-lock";
import {
  defaultVaultAssetDirectory,
  defaultVaultImageDirectory,
  initialMarkdown,
} from "../lib/defaults";
import {
  cleanVaultAssetReference,
  fileNameWithoutMarkdownExtension,
  parentDirectory,
} from "../lib/paths";

// Responsibilities:
// - Own document tab/group factories and editor content hydration helpers.
// - Resolve vault-relative media references into webview-displayable asset URLs.
// Contracts:
// - Empty Markdown hydrates as a valid editor document without changing saved content.
// - Asset path helpers return an empty string for missing roots or unsafe references.

export function tabTitle(tab: DocumentTab) {
  return tab.pageName || tab.activeFile?.name || "Untitled note";
}

export function pageNameForFileName(name: string) {
  if (isCanvasPath(name)) {
    return canvasTitle(name);
  }

  return isBasePath(name) ? baseTitle(name) : fileNameWithoutMarkdownExtension(name);
}

export function createUntitledTab(markdown = initialMarkdown): DocumentTab {
  return {
    id: `untitled:${Date.now()}:${Math.random().toString(36).slice(2)}`,
    kind: "markdown",
    activeFile: null,
    pageName: "Untitled note",
    metaHeader: "",
    metaDelimiter: defaultMetaDelimiter,
    markdown,
    markdownDraft: markdown,
    dirty: false,
  };
}

export function createEditorGroups(
  tab = createUntitledTab(),
): Record<EditorGroupId, EditorGroupState> {
  return {
    primary: {
      id: "primary",
      tabs: [tab],
      activeTabId: tab.id,
    },
    secondary: {
      id: "secondary",
      tabs: [],
      activeTabId: "",
    },
  };
}

export function createEmptyEditorGroups(): Record<EditorGroupId, EditorGroupState> {
  return {
    primary: {
      id: "primary",
      tabs: [],
      activeTabId: "",
    },
    secondary: {
      id: "secondary",
      tabs: [],
      activeTabId: "",
    },
  };
}

export function setEditorMarkdownContent(targetEditor: Editor, markdown: string) {
  // Calendar notes and newly created files are allowed to be truly empty on
  // disk. Tiptap still needs a valid ProseMirror document to render and focus,
  // so empty Markdown is hydrated as one empty paragraph without changing the
  // saved Markdown value. The meta lets the change through a locked editor.
  const chain = targetEditor.chain().setMeta(hydrateMeta, true);

  if (markdown.trim()) {
    chain.setContent(markdown, { contentType: "markdown" }).run();
  } else {
    chain.setContent({ type: "doc", content: [{ type: "paragraph" }] }).run();
  }

  dropStaleDomSelection(targetEditor);
}

// Swapping the document while the editor is blurred (a click on a calendar
// day or tree row) leaves WebKit's DOM selection parked on the editor root,
// since the nodes it sat in are gone. ProseMirror only syncs the selection of
// a focused view, so the later focus() inherits that root selection and
// WebKit paints a caret at the container origin. With no range left, focus
// starts at the first paragraph instead.
function dropStaleDomSelection(targetEditor: Editor) {
  const root = targetEditor.view.dom;
  const selection = root.ownerDocument.getSelection();

  if (!targetEditor.view.hasFocus() && selection?.anchorNode && root.contains(selection.anchorNode)) {
    selection.removeAllRanges();
  }
}

export function clearEditorContent(targetEditor: Editor | null) {
  if (targetEditor) {
    setEditorMarkdownContent(targetEditor, "");
  }
}

export function hasNoOpenDocumentTabs(groups: Record<EditorGroupId, EditorGroupState>) {
  return groups.primary.tabs.length === 0 && groups.secondary.tabs.length === 0;
}

export function joinVaultAssetPath(
  root: string,
  assetDirectory: string,
  reference: string,
) {
  const cleanReference = cleanVaultAssetReference(reference);

  if (!root || !cleanReference) {
    return "";
  }

  return convertFileSrc(`${root}/${assetDirectory || defaultVaultAssetDirectory}/${cleanReference}`);
}

export function joinVaultImagePath(root: string, reference: string) {
  const cleanReference = cleanVaultAssetReference(reference);

  if (!root || !cleanReference) {
    return "";
  }

  return convertFileSrc(`${root}/${defaultVaultImageDirectory}/${cleanReference}`);
}

export function vaultImagePathCandidates(
  root: string,
  reference: string,
  options: { assetDirectory?: string; relativePath?: string } = {},
) {
  // Obsidian image properties are bare wikilinks (`[[photo.jpg]]`), usually
  // quoted; embeds in note text carry the leading bang. All name the same file.
  const unquoted = reference.trim().replace(/^["']|["']$/g, "");
  const wikilinkMatch = unquoted.match(/^!?\[\[([^\]\n]+)\]\]$/);
  const cleanReference = cleanVaultAssetReference(wikilinkMatch?.[1] ?? unquoted);

  if (!root || !cleanReference) {
    return [];
  }

  if (cleanReference.includes("/")) {
    return [convertFileSrc(`${root}/${cleanReference}`)];
  }

  const assetDirectory = options.assetDirectory || defaultVaultImageDirectory;
  const noteDirectory = options.relativePath ? parentDirectory(options.relativePath) : "";
  const sources = [
    convertFileSrc(`${root}/${assetDirectory}/${cleanReference}`),
    convertFileSrc(`${root}/${defaultVaultImageDirectory}/${cleanReference}`),
    convertFileSrc(`${root}/${defaultVaultAssetDirectory}/${cleanReference}`),
    // Obsidian's default attachment folder, so shared vaults resolve.
    convertFileSrc(`${root}/Attachments/${cleanReference}`),
    noteDirectory ? convertFileSrc(`${root}/${noteDirectory}/${cleanReference}`) : "",
  ];

  return Array.from(new Set(sources.filter(Boolean)));
}

export function joinVaultRelativeImagePath(root: string, reference: string) {
  const candidates = vaultImagePathCandidates(root, reference);

  return candidates[0] ?? "";
}
