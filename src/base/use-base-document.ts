import { useEffect, useRef, useState } from "react";
import type { BaseDefinition, BaseQueryResult } from "../lib/app-types";
import { stripEmptyBaseConditions } from "../lib/base-definition";
import { queryBase, renderBaseDefinition } from "../vault/persistence";

// Responsibilities:
// - Load a base's query result, own the editable draft definition, and turn
//   draft changes into unsaved tab content.
// Contracts:
// - Rows reload only when the tab is clean and its content moved past what was
//   last queried, meaning a save landed; a dirty tab keeps the saved rows.
// - `applyDraft` renders through Rust so the file grammar lives in one place;
//   stale renders and reloads are dropped by request counters.

export function useBaseDocument({
  content,
  dirty,
  onChange,
  relativePath,
  vaultRoot,
}: {
  content: string;
  dirty: boolean;
  onChange: (nextContent: string, dirty: boolean) => void;
  relativePath: string;
  vaultRoot: string;
}) {
  const [result, setResult] = useState<BaseQueryResult | null>(null);
  const [draft, setDraft] = useState<BaseDefinition | null>(null);
  const [error, setError] = useState("");
  const [editError, setEditError] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeViewIndex, setActiveViewIndex] = useState(0);
  const [editing, setEditing] = useState(false);
  const loadedRef = useRef<{ path: string; content: string } | null>(null);
  const loadRequestRef = useRef(0);
  const renderRequestRef = useRef(0);

  useEffect(() => {
    if (!vaultRoot || !relativePath) {
      setResult(null);
      setDraft(null);
      return;
    }

    const loaded = loadedRef.current;
    const samePath = loaded?.path === relativePath;

    if (samePath && (dirty || loaded?.content === content)) {
      return;
    }

    const request = loadRequestRef.current + 1;
    const renderAtLoad = renderRequestRef.current;

    loadRequestRef.current = request;
    loadedRef.current = { path: relativePath, content };
    setLoading(true);
    setError("");
    queryBase(vaultRoot, relativePath)
      .then((nextResult) => {
        if (request !== loadRequestRef.current) {
          return;
        }

        setResult(nextResult);
        // An edit made while the reload was in flight already owns the draft.
        setDraft((current) =>
          renderRequestRef.current === renderAtLoad ? nextResult.definition : current,
        );
        setActiveViewIndex((index) =>
          samePath ? Math.min(index, nextResult.views.length - 1) : 0,
        );
        setEditError("");

        if (!samePath) {
          setEditing(false);
        }
      })
      .catch((nextError) => {
        if (request !== loadRequestRef.current) {
          return;
        }

        setError(errorMessage(nextError));
        setResult(null);
        setDraft(null);
      })
      .finally(() => {
        if (request === loadRequestRef.current) {
          setLoading(false);
        }
      });
  }, [content, dirty, relativePath, vaultRoot]);

  function applyDraft(next: BaseDefinition, nextViewIndex = activeViewIndex) {
    const request = renderRequestRef.current + 1;

    renderRequestRef.current = request;
    setDraft(next);
    setActiveViewIndex(Math.min(nextViewIndex, next.views.length - 1));
    setEditError("");
    renderBaseDefinition(stripEmptyBaseConditions(next))
      .then((text) => {
        if (request === renderRequestRef.current) {
          onChange(text, text !== loadedRef.current?.content);
        }
      })
      .catch((nextError) => {
        if (request === renderRequestRef.current) {
          setEditError(errorMessage(nextError));
        }
      });
  }

  function discardDraft() {
    if (!result) {
      return;
    }

    renderRequestRef.current += 1;
    setDraft(result.definition);
    setActiveViewIndex((index) => Math.min(index, result.views.length - 1));
    setEditError("");
    onChange(loadedRef.current?.content ?? content, false);
  }

  return {
    activeViewIndex,
    applyDraft,
    discardDraft,
    draft,
    editError,
    editing,
    error,
    loading,
    result,
    setActiveViewIndex,
    setEditing,
  };
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
