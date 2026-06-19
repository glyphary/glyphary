/**
 * Canvas modal and progressive vault-picker presentation.
 *
 * Responsibilities:
 * - Render add-web/add-group prompt dialogs for the canvas context menu.
 * - Render the tree picker used to attach vault notes and media to a canvas.
 * - Keep dialog markup outside the graph orchestrator so `CanvasView` can focus
 *   on React Flow state and persistence.
 *
 * Contracts:
 * - Directory entries are provided by the graph owner; this module never calls
 *   Tauri commands or performs vault traversal.
 * - The picker displays only one loaded branch at a time as directed by state,
 *   preserving progressive disclosure for large vaults.
 * - Backdrop mouse down requests close, while inner dialog mouse down stops
 *   propagation so normal form and tree interaction remains possible.
 */

import type { FormEvent } from "react";
import type { VaultEntry } from "../lib/app-types.js";
import { canvasVaultPickerFileVisible } from "../lib/canvas.js";

export type CanvasFlowPosition = {
  flowX: number;
  flowY: number;
};

export type CanvasPromptDialogState = {
  kind: "web" | "group";
  position: CanvasFlowPosition;
  value: string;
};

export type CanvasVaultPickerDirectoryState = {
  entries: VaultEntry[];
  loading: boolean;
  error: string;
  expanded: boolean;
  loaded: boolean;
};

export type CanvasVaultPickerDialogState = {
  kind: "note" | "media";
  position: CanvasFlowPosition;
  directories: Record<string, CanvasVaultPickerDirectoryState>;
};

type CanvasDialogsProps = {
  promptDialog: CanvasPromptDialogState | null;
  vaultPickerDialog: CanvasVaultPickerDialogState | null;
  rootDirectoryPath: string;
  onClose: () => void;
  onPromptValueChange: (value: string) => void;
  onSubmitPrompt: (event?: FormEvent) => void;
  onSelectVaultFile: (entry: VaultEntry) => void;
  onToggleVaultDirectory: (relativePath: string) => void;
};

function CanvasVaultPickerTree({
  depth = 0,
  dialog,
  directoryPath,
  onSelectFile,
  onToggleDirectory,
}: {
  depth?: number;
  dialog: CanvasVaultPickerDialogState;
  directoryPath: string;
  onSelectFile: (entry: VaultEntry) => void;
  onToggleDirectory: (relativePath: string) => void;
}) {
  const directory = dialog.directories[directoryPath];

  if (!directory) {
    return null;
  }

  const visibleEntries = directory.entries.filter((entry) =>
    canvasVaultPickerFileVisible(dialog.kind, entry),
  );

  return (
    <div className="canvas-vault-tree-branch" role={depth === 0 ? "tree" : "group"}>
      {directory.expanded ? (
        <div className="canvas-vault-tree-children">
          {directory.loading ? (
            <p className="canvas-dialog-status" style={{ paddingLeft: 10 + (depth + 1) * 14 }}>
              Loading folder...
            </p>
          ) : null}
          {directory.error ? (
            <p className="canvas-dialog-status error" style={{ paddingLeft: 10 + (depth + 1) * 14 }}>
              {directory.error}
            </p>
          ) : null}
          {!directory.loading && !directory.error && visibleEntries.length === 0 ? (
            <p className="canvas-dialog-status" style={{ paddingLeft: 10 + (depth + 1) * 14 }}>
              No matching files in this folder.
            </p>
          ) : null}
          {visibleEntries.map((entry) =>
            entry.isDir ? (
              <div className="canvas-vault-tree-branch" key={entry.relativePath}>
                <button
                  className="canvas-vault-tree-row folder"
                  type="button"
                  aria-expanded={Boolean(dialog.directories[entry.relativePath]?.expanded)}
                  onClick={() => onToggleDirectory(entry.relativePath)}
                  style={{ paddingLeft: 10 + (depth + 1) * 14 }}
                >
                  <span aria-hidden="true">
                    {dialog.directories[entry.relativePath]?.expanded ? "▾" : "▸"}
                  </span>
                  <strong>{entry.name}</strong>
                </button>
                {dialog.directories[entry.relativePath]?.expanded ? (
                  <CanvasVaultPickerTree
                    depth={depth + 1}
                    dialog={dialog}
                    directoryPath={entry.relativePath}
                    onSelectFile={onSelectFile}
                    onToggleDirectory={onToggleDirectory}
                  />
                ) : null}
              </div>
            ) : (
              <button
                className="canvas-vault-tree-row file"
                key={entry.relativePath}
                type="button"
                role="treeitem"
                onClick={() => onSelectFile(entry)}
                style={{ paddingLeft: 10 + (depth + 1) * 14 }}
              >
                <span aria-hidden="true">{dialog.kind === "note" ? "◇" : "□"}</span>
                <strong>{entry.name}</strong>
                <small>{entry.relativePath}</small>
              </button>
            ),
          )}
        </div>
      ) : null}
    </div>
  );
}

export function CanvasDialogs({
  promptDialog,
  rootDirectoryPath,
  vaultPickerDialog,
  onClose,
  onPromptValueChange,
  onSelectVaultFile,
  onSubmitPrompt,
  onToggleVaultDirectory,
}: CanvasDialogsProps) {
  return (
    <>
      {promptDialog ? (
        <div className="canvas-dialog-screen" role="presentation" onMouseDown={onClose}>
          <form
            className="canvas-dialog"
            onMouseDown={(event) => event.stopPropagation()}
            onSubmit={onSubmitPrompt}
          >
            <h2>{promptDialog.kind === "web" ? "Add Web Page" : "Create Group"}</h2>
            <label>
              <span>{promptDialog.kind === "web" ? "URL" : "Group name"}</span>
              <input
                autoFocus
                value={promptDialog.value}
                onChange={(event) => onPromptValueChange(event.currentTarget.value)}
              />
            </label>
            <div className="canvas-dialog-actions">
              <button type="button" onClick={onClose}>
                Cancel
              </button>
              <button type="submit">
                {promptDialog.kind === "web" ? "Add Link" : "Create Group"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
      {vaultPickerDialog ? (
        <div className="canvas-dialog-screen" role="presentation" onMouseDown={onClose}>
          <section
            className="canvas-dialog canvas-vault-picker"
            aria-label={vaultPickerDialog.kind === "note" ? "Add note from vault" : "Add media from vault"}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <h2>
              {vaultPickerDialog.kind === "note" ? "Add Note From Vault" : "Add Media From Vault"}
            </h2>
            <p className="canvas-dialog-status">
              Expand folders to load their contents, then select a
              {vaultPickerDialog.kind === "note" ? " Markdown note." : " media file."}
            </p>
            <div className="canvas-vault-picker-list">
              <CanvasVaultPickerTree
                dialog={vaultPickerDialog}
                directoryPath={rootDirectoryPath}
                onSelectFile={onSelectVaultFile}
                onToggleDirectory={onToggleVaultDirectory}
              />
            </div>
            <div className="canvas-dialog-actions">
              <button type="button" onClick={onClose}>
                Cancel
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
