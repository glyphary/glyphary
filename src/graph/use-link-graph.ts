import { useEffect, useState } from "react";
import type { LinkGraph } from "../lib/app-types";
import { readLinkGraph } from "../vault/persistence";

// Responsibilities:
// - Load the vault link graph for a root and expose the result or the error.
// Contracts:
// - A stale response from a previous root is discarded.
// - Rescans only when the root changes; callers remount to force a refresh.

export function useLinkGraph(root: string) {
  const [graph, setGraph] = useState<LinkGraph | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Clear eagerly so a vault switch shows the scanning state rather than the
    // previous vault's graph until the new scan lands.
    setGraph(null);
    setError(null);

    readLinkGraph(root)
      .then((result) => {
        if (!cancelled) {
          setGraph(result);
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [root]);

  return { graph, error };
}
