import type { Dispatch, FormEvent, SetStateAction } from "react";
import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
import type {
  ActiveFile,
  DocumentTab,
  FolderActionDialogState,
  FolderActionKind,
  FolderContextMenuState,
  OpenedFile,
  RenamedDirectory,
  VaultEntry,
} from "../lib/app-types";
import { folderActionInitialValue, isMoveAction, vaultEntryPath } from "./file-actions";
import { rebasePathAfterDirectoryRename } from "./file-flow";
import {
  createBaseInDirectory,
  createCanvasInDirectory,
  createDirectoryInDirectory,
  createNoteInDirectory,
  deleteVaultFile,
  moveVaultDirectory,
  moveVaultFile,
  renameVaultDirectory,
  renameVaultFile,
} from "./persistence";

// Responsibilities:
// - Implement the vault tree's file and folder mutations (create, rename,
//   move, delete, reveal) plus the folder-action dialog submission flow.
// Contracts:
// - Every mutation keeps open tabs, the wiki link index, starred files, and
//   the AI builder history consistent with the new paths via the context
//   callbacks; nothing here touches that state directly.

export type VaultFileOperationsContext = {
  addFileToWikiLinkIndex: (file: ActiveFile | OpenedFile) => void;
  addTabToGroup: (tab: DocumentTab) => void;
  applyRenamedDirectoryToOpenState: (oldDirectory: VaultEntry, newDirectory: RenamedDirectory) => void;
  confirmDestructiveAction: (
    message: string,
    options?: { okLabel?: string; title?: string },
  ) => Promise<boolean>;
  createDocumentTabFromFile: (file: OpenedFile) => DocumentTab;
  currentDir: string;
  folderActionDialog: FolderActionDialogState | null;
  hydrateDocumentTab: (tab: DocumentTab) => void;
  loadEntries: (root: string, relative: string) => Promise<void>;
  moveAiBuilderHistoryKey: (previousKey: string, nextKey: string) => void;
  persistActiveFile: (file: ActiveFile | null) => void;
  rebuildWikiLinkIndex: (root: string) => Promise<void>;
  removeDeletedFileFromOpenState: (relativePath: string) => void;
  removeFileFromWikiLinkIndex: (relativePath: string) => void;
  replaceFileInWikiLinkIndex: (oldRelativePath: string, file: ActiveFile | OpenedFile) => void;
  replaceOpenFilePath: (oldRelativePath: string, movedFile: ActiveFile) => void;
  setFolderActionDialog: Dispatch<SetStateAction<FolderActionDialogState | null>>;
  setFolderContextMenu: Dispatch<SetStateAction<FolderContextMenuState | null>>;
  setStatus: (message: string) => void;
  snapshotActiveTab: () => void;
  updateStarredFiles: (mapper: (path: string) => string | null) => Promise<void>;
  vaultRoot: string;
};

type ReactFormEvent<T> = FormEvent<T>;

export function createVaultFileOperations(context: VaultFileOperationsContext) {
  const {
    addFileToWikiLinkIndex,
    addTabToGroup,
    applyRenamedDirectoryToOpenState,
    confirmDestructiveAction,
    createDocumentTabFromFile,
    currentDir,
    folderActionDialog,
    hydrateDocumentTab,
    loadEntries,
    moveAiBuilderHistoryKey,
    persistActiveFile,
    rebuildWikiLinkIndex,
    removeDeletedFileFromOpenState,
    removeFileFromWikiLinkIndex,
    replaceFileInWikiLinkIndex,
    replaceOpenFilePath,
    setFolderActionDialog,
    setFolderContextMenu,
    setStatus,
    snapshotActiveTab,
    updateStarredFiles,
    vaultRoot,
  } = context;

  function openFolderActionDialog(action: FolderActionKind, entry: VaultEntry) {
    setFolderContextMenu(null);
    if (action === "delete-file") {
      void confirmAndDeleteFileFromContextMenu(entry);
      return;
    }

    setFolderActionDialog({
      action,
      entry,
      value: folderActionInitialValue(action, entry),
    });
  }

  async function confirmAndDeleteFileFromContextMenu(entry: VaultEntry) {
    setFolderContextMenu(null);
    setFolderActionDialog(null);

    const confirmed = await confirmDestructiveAction(
      `Delete ${entry.relativePath} from the vault? This cannot be undone.`,
      { okLabel: "Delete", title: "Delete File" },
    );

    if (confirmed) {
      await deleteFileFromContextMenu(entry);
    }
  }

  async function createNoteFromFolderMenu(entry: VaultEntry, noteName: string) {
    if (!vaultRoot) {
      return;
    }

    if (!noteName?.trim()) {
      return;
    }

    try {
      const file = await createNoteInDirectory(vaultRoot, entry.relativePath, noteName);
      const tab = createDocumentTabFromFile(file);

      snapshotActiveTab();
      addTabToGroup(tab);
      hydrateDocumentTab(tab);
      persistActiveFile(tab.activeFile);
      addFileToWikiLinkIndex(file);
      await loadEntries(vaultRoot, currentDir);
      setStatus(`Created note ${file.relativePath}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function createCanvasFromFolderMenu(entry: VaultEntry, canvasName: string) {
    await createFileFromFolderMenu(entry, canvasName, createCanvasInDirectory, "canvas");
  }

  async function createBaseFromFolderMenu(entry: VaultEntry, baseName: string) {
    await createFileFromFolderMenu(entry, baseName, createBaseInDirectory, "base");
  }

  async function createFileFromFolderMenu(
    entry: VaultEntry,
    fileName: string,
    create: (root: string, relative: string, name: string) => Promise<OpenedFile>,
    label: string,
  ) {
    if (!vaultRoot || !fileName?.trim()) {
      return;
    }

    try {
      const file = await create(vaultRoot, entry.relativePath, fileName);
      const tab = createDocumentTabFromFile(file);

      snapshotActiveTab();
      addTabToGroup(tab);
      hydrateDocumentTab(tab);
      persistActiveFile(tab.activeFile);
      await loadEntries(vaultRoot, currentDir);
      setStatus(`Created ${label} ${file.relativePath}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function createFolderFromFolderMenu(entry: VaultEntry, directoryName: string) {
    if (!vaultRoot) {
      return;
    }

    if (!directoryName?.trim()) {
      return;
    }

    try {
      const directory = await createDirectoryInDirectory(
        vaultRoot,
        entry.relativePath,
        directoryName,
      );

      await loadEntries(vaultRoot, currentDir);
      setStatus(`Created folder ${directory.relativePath}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function renameFolderFromFolderMenu(entry: VaultEntry, nextName: string) {
    if (!vaultRoot) {
      return;
    }

    if (!nextName?.trim()) {
      return;
    }

    try {
      const renamed = await renameVaultDirectory(vaultRoot, entry.relativePath, nextName);

      applyRenamedDirectoryToOpenState(entry, renamed);
      await updateStarredFiles((path) =>
        path === entry.relativePath || path.startsWith(`${entry.relativePath}/`)
          ? `${renamed.relativePath}${path.slice(entry.relativePath.length)}`
          : path,
      );
      await loadEntries(
        vaultRoot,
        rebasePathAfterDirectoryRename(currentDir, entry, renamed),
      );
      await rebuildWikiLinkIndex(vaultRoot);
      setStatus(`Renamed folder ${entry.name} to ${renamed.name}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function renameFileFromContextMenu(entry: VaultEntry, nextName: string) {
    if (!vaultRoot || entry.isDir) {
      return;
    }

    if (!nextName?.trim()) {
      return;
    }

    try {
      snapshotActiveTab();
      const renamed = await renameVaultFile(vaultRoot, entry.relativePath, nextName);
      const renamedFile = {
        name: renamed.name,
        relativePath: renamed.relativePath,
      };

      replaceOpenFilePath(entry.relativePath, renamedFile);
      replaceFileInWikiLinkIndex(entry.relativePath, renamedFile);
      moveAiBuilderHistoryKey(entry.relativePath, renamedFile.relativePath);
      await updateStarredFiles((path) =>
        path === entry.relativePath ? renamedFile.relativePath : path,
      );
      await loadEntries(vaultRoot, currentDir);
      setStatus(`Renamed ${entry.name} to ${renamed.name}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function moveFolderFromContextMenu(entry: VaultEntry, destinationDirectory: string) {
    if (!vaultRoot || !entry.isDir) {
      return;
    }

    if (!destinationDirectory?.trim()) {
      return;
    }

    try {
      snapshotActiveTab();
      const moved = await moveVaultDirectory(
        vaultRoot,
        entry.relativePath,
        destinationDirectory,
      );
      const nextCurrentDir = rebasePathAfterDirectoryRename(currentDir, entry, moved);

      applyRenamedDirectoryToOpenState(entry, moved);
      await updateStarredFiles((path) =>
        path === entry.relativePath || path.startsWith(`${entry.relativePath}/`)
          ? `${moved.relativePath}${path.slice(entry.relativePath.length)}`
          : path,
      );
      await loadEntries(vaultRoot, nextCurrentDir);
      await rebuildWikiLinkIndex(vaultRoot);
      setStatus(`Moved folder ${entry.name} to ${moved.relativePath}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function moveFileFromContextMenu(entry: VaultEntry, destinationDirectory: string) {
    if (!vaultRoot || entry.isDir) {
      return;
    }

    try {
      snapshotActiveTab();
      const moved = await moveVaultFile(vaultRoot, entry.relativePath, destinationDirectory);
      const movedFile = {
        name: moved.name,
        relativePath: moved.relativePath,
      };

      replaceOpenFilePath(entry.relativePath, movedFile);
      replaceFileInWikiLinkIndex(entry.relativePath, movedFile);
      await updateStarredFiles((path) =>
        path === entry.relativePath ? movedFile.relativePath : path,
      );
      await loadEntries(vaultRoot, currentDir);
      setStatus(`Moved ${entry.name} to ${moved.relativePath}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function deleteFileFromContextMenu(entry: VaultEntry) {
    if (!vaultRoot || entry.isDir) {
      return;
    }

    try {
      snapshotActiveTab();
      await deleteVaultFile(vaultRoot, entry.relativePath);

      removeDeletedFileFromOpenState(entry.relativePath);
      removeFileFromWikiLinkIndex(entry.relativePath);
      await updateStarredFiles((path) => (path === entry.relativePath ? null : path));
      await loadEntries(vaultRoot, currentDir);
      setStatus(`Deleted ${entry.relativePath}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function revealEntryFromContextMenu(entry: VaultEntry) {
    if (!vaultRoot) {
      return;
    }

    setFolderContextMenu(null);

    try {
      await revealItemInDir(vaultEntryPath(vaultRoot, entry.relativePath));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function openEntryFromContextMenu(entry: VaultEntry) {
    if (!vaultRoot) {
      return;
    }

    setFolderContextMenu(null);

    try {
      await openPath(vaultEntryPath(vaultRoot, entry.relativePath));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function submitFolderActionDialog(event: ReactFormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!folderActionDialog) {
      return;
    }

    const value = folderActionDialog.value.trim();

    if (
      folderActionDialog.action !== "delete-file" &&
      !isMoveAction(folderActionDialog.action) &&
      !value
    ) {
      return;
    }

    const { action, entry } = folderActionDialog;

    setFolderActionDialog(null);

    if (action === "create-note") {
      await createNoteFromFolderMenu(entry, value);
    } else if (action === "create-canvas") {
      await createCanvasFromFolderMenu(entry, value);
    } else if (action === "create-base") {
      await createBaseFromFolderMenu(entry, value);
    } else if (action === "create-folder") {
      await createFolderFromFolderMenu(entry, value);
    } else if (action === "move-folder") {
      await moveFolderFromContextMenu(entry, value);
    } else if (action === "rename-file") {
      await renameFileFromContextMenu(entry, value);
    } else if (action === "move-file") {
      await moveFileFromContextMenu(entry, value);
    } else if (action === "delete-file") {
      await deleteFileFromContextMenu(entry);
    } else {
      await renameFolderFromFolderMenu(entry, value);
    }
  }

  return {
    confirmAndDeleteFileFromContextMenu,
    openEntryFromContextMenu,
    openFolderActionDialog,
    revealEntryFromContextMenu,
    submitFolderActionDialog,
  };
}
