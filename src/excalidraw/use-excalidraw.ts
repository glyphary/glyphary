import { useEffect, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import type {
  AppState,
  BinaryFiles,
  ExcalidrawImperativeAPI,
} from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { Editor } from "@tiptap/core";
import { excalidrawFileNameForTitle } from "../lib/assets";
import type { VaultSettings } from "../lib/app-types";
import {
  defaultExcalidrawDirectory,
  defaultVaultAssetDirectory,
} from "../lib/defaults";
import { insertMarkdownAtCursor } from "../editor/commands";
import {
  createExcalidrawFile,
  readVaultFile,
  writeVaultFile,
} from "../vault/persistence";
import {
  emptyExcalidrawScene,
  excalidrawPreviewRefreshEvent,
  excalidrawSceneToSvgMarkup,
  isExcalidrawTarget,
  parseExcalidrawScene,
  restoredExcalidrawScene,
  type ExcalidrawDialogState,
} from "./editor";

// Responsibilities:
// - Own all Excalidraw session state: create/edit dialogs, dirty tracking,
//   scene refs, previews, and vault file persistence for drawings.
// Contracts:
// - Dirty means "element versions differ from the saved baseline", never a
//   raw onChange flag (onChange also fires for pan/zoom and re-renders).
// - `openDrawing`/`loadPreview` are referentially stable so editor extension
//   closures created once can always reach the latest implementations.

// Mirrors excalidraw's getSceneVersion; the package is lazy-loaded, so it
// must not be imported just for this sum.
function excalidrawSceneVersion(elements: readonly ExcalidrawElement[]) {
  return elements.reduce((version, element) => version + element.version, 0);
}

export function useExcalidraw({
  confirmDestructiveAction,
  getEditor,
  refreshEntries,
  setStatus,
  vaultRoot,
  vaultRootRef,
  vaultSettingsRef,
}: {
  confirmDestructiveAction: (
    message: string,
    options?: { okLabel?: string; title?: string },
  ) => Promise<boolean>;
  getEditor: () => Editor | null;
  refreshEntries: () => Promise<void>;
  setStatus: (message: string) => void;
  vaultRoot: string;
  vaultRootRef: MutableRefObject<string>;
  vaultSettingsRef: MutableRefObject<VaultSettings>;
}) {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createNameDraft, setCreateNameDraft] = useState("Drawing");
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [dialog, setDialog] = useState<ExcalidrawDialogState | null>(null);
  const [dirty, setDirty] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const savedSceneVersionRef = useRef(0);
  const createInputRef = useRef<HTMLInputElement | null>(null);
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const sceneRef = useRef<{
    elements: readonly ExcalidrawElement[];
    appState: AppState | Partial<AppState>;
    files: BinaryFiles;
  }>({
    elements: [],
    appState: {},
    files: {},
  });

  useEffect(() => {
    if (!createDialogOpen) {
      return;
    }

    createInputRef.current?.focus();
    createInputRef.current?.select();
  }, [createDialogOpen]);

  function drawingDirectory() {
    const assetDirectory =
      vaultSettingsRef.current.assetDirectory.trim() || defaultVaultAssetDirectory;

    if (assetDirectory === defaultVaultAssetDirectory) {
      return defaultExcalidrawDirectory;
    }

    return `${assetDirectory.replace(/\/+$/, "")}/drawings`;
  }

  function handleSceneChange(
    elements: readonly ExcalidrawElement[],
    appState: AppState,
    files: BinaryFiles,
  ) {
    sceneRef.current = { elements, appState, files };
    const nextDirty = excalidrawSceneVersion(elements) !== savedSceneVersionRef.current;

    setDirty(nextDirty);
    if (nextDirty) {
      setSavedNotice(false);
    }
  }

  async function loadPreview(target: string) {
    const root = vaultRootRef.current;

    if (!root || !isExcalidrawTarget(target)) {
      return "";
    }

    const file = await readVaultFile(root, target);

    return excalidrawSceneToSvgMarkup(parseExcalidrawScene(file.content));
  }

  async function openDrawing(target: string) {
    const root = vaultRootRef.current;

    if (!root || !isExcalidrawTarget(target)) {
      setStatus("Open a vault before editing drawings");
      return;
    }

    try {
      const file = await readVaultFile(root, target);
      const scene = parseExcalidrawScene(file.content);
      const restored = await restoredExcalidrawScene(scene);

      apiRef.current = null;
      sceneRef.current = {
        elements: restored.elements,
        appState: restored.appState,
        files: restored.files,
      };
      savedSceneVersionRef.current = excalidrawSceneVersion(restored.elements);
      setDirty(false);
      setSavedNotice(false);
      setDialog({
        relativePath: file.relativePath,
        name: file.name,
        initialData: {
          elements: restored.elements,
          appState: restored.appState,
          files: restored.files,
        },
      });
      setStatus(`Editing drawing ${file.relativePath}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function saveDrawing() {
    if (!vaultRootRef.current || !dialog) {
      return;
    }

    try {
      const { serializeAsJSON } = await import("@excalidraw/excalidraw");
      const api = apiRef.current;
      const elements = api?.getSceneElementsIncludingDeleted() ?? sceneRef.current.elements;
      const visibleElementCount =
        api?.getSceneElements().length ?? elements.filter((element) => !element.isDeleted).length;
      const appState = api?.getAppState() ?? sceneRef.current.appState;
      const files = api?.getFiles() ?? sceneRef.current.files;
      const content = serializeAsJSON(elements, appState, files, "local");

      await writeVaultFile(vaultRootRef.current, dialog.relativePath, content);
      window.dispatchEvent(
        new CustomEvent(excalidrawPreviewRefreshEvent, {
          detail: { target: dialog.relativePath },
        }),
      );
      // Do not rewrite dialog initialData here: that re-render made Excalidraw
      // fire onChange and mark the freshly saved drawing dirty again.
      savedSceneVersionRef.current = excalidrawSceneVersion(elements);
      setDirty(false);
      setSavedNotice(true);
      setStatus(
        `Saved drawing ${dialog.relativePath} (${visibleElementCount} visible element${
          visibleElementCount === 1 ? "" : "s"
        })`,
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function closeDialog() {
    if (dirty) {
      const confirmed = await confirmDestructiveAction(
        "Close drawing without saving changes?",
        { okLabel: "Close", title: "Close Drawing" },
      );

      if (!confirmed) {
        return;
      }
    }

    apiRef.current = null;
    setDialog(null);
    setDirty(false);
    setSavedNotice(false);
  }

  function openCreateDialog() {
    if (!vaultRoot || !getEditor()) {
      setStatus("Open a vault file before inserting a drawing");
      return;
    }

    setCreateNameDraft("Drawing");
    setCreateDialogOpen(true);
  }

  async function insertDrawing() {
    const editor = getEditor();

    if (!vaultRoot || !editor || createSubmitting) {
      return;
    }

    try {
      setCreateSubmitting(true);
      const relative = `${drawingDirectory()}/${excalidrawFileNameForTitle(createNameDraft)}`;
      const file = await createExcalidrawFile(
        vaultRoot,
        relative,
        JSON.stringify(emptyExcalidrawScene(), null, 2),
      );

      insertMarkdownAtCursor(editor, `![[${file.relativePath}]]`);
      await refreshEntries();
      setCreateDialogOpen(false);
      await openDrawing(file.relativePath);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setCreateSubmitting(false);
    }
  }

  // Editor extensions capture their options once at creation, so they get
  // never-changing wrappers that always dispatch to this render's closures.
  const latestRef = useRef({ loadPreview, openDrawing });
  latestRef.current = { loadPreview, openDrawing };
  const stable = useRef({
    loadPreview: (target: string) => latestRef.current.loadPreview(target),
    openDrawing: (target: string) => {
      void latestRef.current.openDrawing(target);
    },
  }).current;

  return {
    apiRef,
    closeDialog,
    createDialogOpen,
    createInputRef,
    createNameDraft,
    createSubmitting,
    dialog,
    dirty,
    handleSceneChange,
    insertDrawing,
    openCreateDialog,
    saveDrawing,
    savedNotice,
    setCreateDialogOpen,
    setCreateNameDraft,
    stable,
  };
}
