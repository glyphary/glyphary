/**
 * Glyphary URL scheme parsing helpers.
 *
 * Responsibilities:
 * - Parse Obsidian-style `glyphary://open` and `glyphary://clip` requests into
 *   frontend-safe values, and build the links and bookmarklet that produce them.
 *
 * Contracts:
 * - Only the `open` and `clip` actions are accepted; vault selection, file
 *   opening, and clipping remain App responsibilities.
 */

import type { VaultLibraryEntry } from "./app-types.js";

export type GlypharyOpenRequest = {
  vaultName?: string;
  filePath?: string;
};

export type GlypharyClipRequest = {
  vaultName?: string;
  url: string;
  selection?: string;
};

export type GlypharyUrlRequest =
  | ({ action: "open" } & GlypharyOpenRequest)
  | ({ action: "clip" } & GlypharyClipRequest);

/**
 * A browser bookmarklet that sends the current page, and any selected text, to
 * the running app. It runs inside the page, so it must stay a single
 * expression with no dependencies.
 */
export function glypharyClipBookmarklet() {
  return (
    "javascript:location.href='glyphary://clip?url='+encodeURIComponent(location.href)" +
    "+'&selection='+encodeURIComponent(String(getSelection()))"
  );
}

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

export function parseGlypharyUrl(value: string): GlypharyUrlRequest | null {
  try {
    const url = new URL(value);
    // `glyphary://open` exposes `open` as the URL hostname, while the
    // three-slash form exposes it as the pathname; accept both forms because
    // launchers and copied links do not normalize custom schemes consistently.
    const action = (url.hostname || url.pathname.replace(/^\/+/, "")).toLowerCase();

    if (url.protocol !== "glyphary:") {
      return null;
    }

    const vaultName = url.searchParams.get("vault")?.trim() || undefined;

    if (action === "clip") {
      const pageUrl = url.searchParams.get("url")?.trim();
      const selection = url.searchParams.get("selection")?.trim() || undefined;

      return pageUrl ? { action, vaultName, url: pageUrl, selection } : null;
    }

    if (action !== "open") {
      return null;
    }

    const filePath = url.searchParams.get("file")?.trim() || undefined;

    // A scheme without a target would only reopen the current workspace and
    // makes malformed external links look like successful requests.
    if (!vaultName && !filePath) {
      return null;
    }

    return { action, vaultName, filePath };
  } catch {
    return null;
  }
}

export function parseGlypharyOpenUrl(value: string): GlypharyOpenRequest | null {
  const request = parseGlypharyUrl(value);

  if (request?.action !== "open") {
    return null;
  }

  return { vaultName: request.vaultName, filePath: request.filePath };
}
