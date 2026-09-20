import { useMemo, useState, type MouseEvent as ReactMouseEvent } from "react";
import type { VaultTag } from "../lib/app-types";
import { renderToolbarIcon } from "../toolbar-icons";

// Responsibilities:
// - Present the Tags drawer: filter box, refresh, and an expandable list of
//   tags with the notes carrying each one.
// Contracts:
// - Filter text and the expanded tag are local UI state; the tag data and its
//   loading come from the caller so the scan is shared with the graph.

type VaultTagsPanelProps = {
  hasVault: boolean;
  tags: VaultTag[];
  loading: boolean;
  onRefresh: () => void;
  onOpenFile: (relativePath: string, event: ReactMouseEvent<HTMLButtonElement>) => void;
};

function emptyMessage(hasVault: boolean, loading: boolean, totalTags: number) {
  if (!hasVault) {
    return "Open a vault to list tags.";
  }
  if (loading) {
    return "Scanning tags...";
  }
  if (totalTags > 0) {
    return "No tags match this filter.";
  }
  return "No tags found in this vault.";
}

export function VaultTagsPanel({ hasVault, tags, loading, onRefresh, onOpenFile }: VaultTagsPanelProps) {
  const [query, setQuery] = useState("");
  const [expandedTag, setExpandedTag] = useState<string | null>(null);

  const visibleTags = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle ? tags.filter((entry) => entry.tag.includes(needle)) : tags;
  }, [query, tags]);

  return (
    <div className="vault-tags" role="region" aria-label="Vault tags">
      <div className="task-list-tools tag-list-tools">
        <label>
          <span>Find</span>
          <input
            disabled={!hasVault}
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder="Filter tags"
          />
        </label>
        <button
          className="task-refresh-button"
          disabled={!hasVault || loading}
          type="button"
          title="Refresh tags"
          aria-label="Refresh tags"
          onClick={onRefresh}
        >
          {loading ? "..." : renderToolbarIcon("refresh")}
        </button>
      </div>
      {visibleTags.length === 0 ? (
        <p className="empty-vault">{emptyMessage(hasVault, loading, tags.length)}</p>
      ) : (
        <div className="task-results tag-results" role="list" aria-label="Tags">
          {visibleTags.map((entry) => {
            const expanded = expandedTag === entry.tag;
            return (
              <div key={entry.tag} className="tag-group" role="listitem">
                <button
                  type="button"
                  className={expanded ? "tag-row active" : "tag-row"}
                  aria-expanded={expanded}
                  onClick={() => setExpandedTag(expanded ? null : entry.tag)}
                >
                  <strong>#{entry.tag}</strong>
                  <span className="tag-count">{entry.files.length}</span>
                </button>
                {expanded
                  ? entry.files.map((relativePath) => (
                      <button
                        key={relativePath}
                        type="button"
                        className="tag-file"
                        onClick={(event) => onOpenFile(relativePath, event)}
                      >
                        {relativePath}
                      </button>
                    ))
                  : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
