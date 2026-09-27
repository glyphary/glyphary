import { useCallback, useMemo, useRef, useState, type MutableRefObject } from "react";
import type { Editor } from "@tiptap/core";
import { dismissInlineSuggest, inlineSuggestKey, type InlineSuggestSession } from "../editor/inline-suggest";
import type { VaultIndexedFile, VaultTag } from "../lib/app-types";
import {
  type InlineSuggestItem,
  inlineSuggestInsertion,
  personSuggestions,
  tagSuggestions,
} from "../lib/inline-suggest-items";
import { readVaultTags } from "../vault/persistence";

// Responsibilities:
// - Own the "#"/"@" completion session App renders: the candidate rows, the
//   highlighted row, acceptance, and the keys the editor forwards.
// Contracts:
// - `onSessionChange` and `onKey` are stable, so the editor extension can
//   capture them once; they read the latest state through refs.
// - Accepting replaces [trigger, caret] and clears the plugin session in the
//   same transaction, so the menu cannot reopen on the text it wrote.
// - A tag session rescans the vault's tags when it starts, so a tag added a
//   moment ago is offered; the previous list stays until the scan returns.

type InlineSuggestDeps = {
  editorRef: MutableRefObject<Editor | null>;
  vaultRootRef: MutableRefObject<string>;
  wikiLinkIndex: VaultIndexedFile[];
};

export function useInlineSuggest({ editorRef, vaultRootRef, wikiLinkIndex }: InlineSuggestDeps) {
  const [session, setSession] = useState<InlineSuggestSession | null>(null);
  const [index, setIndex] = useState(0);
  const [tagIndex, setTagIndex] = useState<VaultTag[]>([]);
  const keyHandlerRef = useRef<(key: string) => boolean>(() => false);

  const items = useMemo<InlineSuggestItem[]>(() => {
    if (!session) {
      return [];
    }

    return session.kind === "tag" ? tagSuggestions(tagIndex, session.query) : personSuggestions(wikiLinkIndex, session.query);
  }, [session, tagIndex, wikiLinkIndex]);

  const highlighted = Math.min(index, Math.max(0, items.length - 1));

  function accept(item: InlineSuggestItem) {
    const editor = editorRef.current;

    if (!session || !editor || editor.isDestroyed) {
      return;
    }

    const to = editor.state.selection.from;
    const text = inlineSuggestInsertion(session.kind, item);

    editor
      .chain()
      .focus()
      .command(({ tr, dispatch }) => {
        dispatch?.(tr.insertText(text, session.from, to).setMeta(inlineSuggestKey, null));
        return true;
      })
      .run();
  }

  keyHandlerRef.current = (key) => {
    const editor = editorRef.current;

    if (!session) {
      return false;
    }

    if (key === "Escape") {
      if (editor) {
        dismissInlineSuggest(editor.view);
      }

      return true;
    }

    if (key === "ArrowDown" || key === "ArrowUp") {
      if (items.length > 0) {
        setIndex((current) => (current + (key === "ArrowDown" ? 1 : -1) + items.length) % items.length);
      }

      return true;
    }

    if (key !== "Enter" && key !== "Tab") {
      return false;
    }

    if (items[highlighted]) {
      accept(items[highlighted]);
      return true;
    }

    // A tag nobody used yet is still a tag: keep what was typed.
    if (session.kind === "tag" && session.query) {
      accept({ id: session.query, label: `#${session.query}`, detail: "" });
      return true;
    }

    return false;
  };

  const onSessionChange = useCallback(
    (next: InlineSuggestSession | null) => {
      setSession(next);
      setIndex(0);

      const root = vaultRootRef.current;

      if (next?.kind !== "tag" || next.query !== "" || !root) {
        return;
      }

      void readVaultTags(root)
        .then((tags) => {
          if (vaultRootRef.current === root) {
            setTagIndex(tags);
          }
        })
        .catch(() => undefined);
    },
    [vaultRootRef],
  );
  const onKey = useCallback((key: string) => keyHandlerRef.current(key), []);

  const emptyText = !session
    ? ""
    : session.kind === "person"
      ? "No matching notes under People/"
      : session.query
        ? `New tag #${session.query}: press Enter`
        : "No tags yet";

  return { session, items, index: highlighted, setIndex, accept, emptyText, onSessionChange, onKey };
}
