/**
 * Cross-window notices over localStorage.
 *
 * Responsibilities:
 * - Name the keys the main window and its auxiliary windows (settings, task
 *   board) use to talk, and read and write their payloads.
 *
 * Contracts:
 * - Writes are synchronous localStorage writes, so a notice survives the
 *   sending window closing right after; the peer sees it as a `storage`
 *   event. Every payload carries `updatedAt` so identical notices still
 *   fire.
 * - Payloads are data from another window: they are validated, never
 *   trusted, and a malformed one is dropped.
 */

export const peerStorageKeys = {
  /** Main -> peers: vault-relative paths of tabs with unsaved edits. */
  dirtyFiles: "glyphary.dirtyFiles",
  /** Peer -> main: open this note. */
  openRequest: "glyphary.openRequest",
  /** Peer -> main: this note changed on disk, reload it if open and clean. */
  fileRevision: "glyphary.fileRevision",
  /** Main -> peers: something in the vault changed (save, tree change). */
  vaultRevision: "glyphary.vaultRevision",
} as const;

export type PeerNotice = { root: string; relativePath: string | null };

type DirtyAwareGroups = Record<string, { tabs: { dirty: boolean; activeFile: { relativePath: string } | null }[] }>;

export function dirtyFilePaths(groups: DirtyAwareGroups) {
  return Object.values(groups).flatMap((group) =>
    group.tabs.flatMap((tab) => (tab.dirty && tab.activeFile ? [tab.activeFile.relativePath] : [])),
  );
}

export function writeDirtyFilesMirror(files: readonly string[], storage: Storage = window.localStorage) {
  storage.setItem(peerStorageKeys.dirtyFiles, JSON.stringify(files));
}

export function readDirtyFilesMirror(storage: Storage = window.localStorage): string[] {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(peerStorageKeys.dirtyFiles) ?? "[]");

    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function writePeerNotice(
  key: string,
  notice: { root: string; relativePath?: string },
  storage: Storage = window.localStorage,
) {
  storage.setItem(key, JSON.stringify({ ...notice, updatedAt: Date.now() }));
}

export function parsePeerNotice(value: string | null): PeerNotice | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as { root?: unknown; relativePath?: unknown };

    if (typeof parsed.root !== "string") {
      return null;
    }

    return { root: parsed.root, relativePath: typeof parsed.relativePath === "string" ? parsed.relativePath : null };
  } catch {
    return null;
  }
}

export function subscribePeerNotices(
  keys: readonly string[],
  handler: (key: string, notice: PeerNotice) => void,
) {
  const listener = (event: StorageEvent) => {
    if (!event.key || !keys.includes(event.key)) {
      return;
    }

    const notice = parsePeerNotice(event.newValue);

    if (notice) {
      handler(event.key, notice);
    }
  };

  window.addEventListener("storage", listener);

  return () => window.removeEventListener("storage", listener);
}
