/**
 * Glyphary URL scheme parsing helpers.
 *
 * Responsibilities:
 * - Parse Obsidian-style `glyphary://open` requests into frontend-safe values.
 *
 * Contracts:
 * - Only the `open` action is accepted; vault selection and file opening remain App responsibilities.
 */

import type { VaultLibraryEntry } from "./app-types.js";

export type GlypharyOpenRequest = {
  vaultName?: string;
  filePath?: string;
};

export function glypharyOpenUrl(vaultName: string, filePath: string) {
  const query = new URLSearchParams({ vault: vaultName, file: filePath });

  return `glyphary://open?${query.toString()}`;
}

export function resolveDeepLinkVaultRoot(
  vaultName: string,
  currentRoot: string,
  vaultLibrary: VaultLibraryEntry[],
) {
  const entry = vaultLibrary.find(
    (candidate) =>
      candidate.name.localeCompare(vaultName, undefined, { sensitivity: "base" }) === 0,
  );

  if (entry) {
    return entry.root;
  }

  const currentName = currentRoot.split(/[\\/]/).filter(Boolean).at(-1);

  return currentName?.localeCompare(vaultName, undefined, { sensitivity: "base" }) === 0
    ? currentRoot
    : undefined;
}

export function parseGlypharyOpenUrl(value: string): GlypharyOpenRequest | null {
  try {
    const url = new URL(value);
    // `glyphary://open` exposes `open` as the URL hostname, while the
    // three-slash form exposes it as the pathname; accept both forms because
    // launchers and copied links do not normalize custom schemes consistently.
    const action = (url.hostname || url.pathname.replace(/^\/+/, "")).toLowerCase();

    if (url.protocol !== "glyphary:" || action !== "open") {
      return null;
    }

    const vaultName = url.searchParams.get("vault")?.trim() || undefined;
    const filePath = url.searchParams.get("file")?.trim() || undefined;

    // A scheme without a target would only reopen the current workspace and
    // makes malformed external links look like successful requests.
    if (!vaultName && !filePath) {
      return null;
    }

    return { vaultName, filePath };
  } catch {
    return null;
  }
}
