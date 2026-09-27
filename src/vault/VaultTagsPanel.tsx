import { useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from "react";
import type { VaultTag } from "../lib/app-types";
import { type TagColors, tagOverride, tagStyle } from "../lib/tag-colors";
import { renderToolbarIcon } from "../toolbar-icons";

// Responsibilities:
// - Present the Tags drawer: filter box, refresh, and an expandable list of
//   tags with the notes carrying each one.
// - Let the user pick a colour per tag with the native colour input, or
//   clear a pick so the tag goes back to the neutral look.
// Contracts:
// - Filter text and the expanded tag are local UI state; the tag data and its
//   loading come from the caller so the scan is shared with the graph.
// - Colour picks are reported upward; the caller persists them in the vault.

type VaultTagsPanelProps = {
  hasVault: boolean;
  tags: VaultTag[];
  tagColors: TagColors;
  loading: boolean;
  onRefresh: () => void;
  onSetTagColor: (tag: string, color: string | null) => void;
  onOpenFile: (relativePath: string, event: ReactMouseEvent<HTMLButtonElement>) => void;
};

const UNSET_SWATCH_VALUE = "#888888";

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

export function VaultTagsPanel({
  hasVault,
  tags,
  tagColors,
  loading,
  onRefresh,
  onSetTagColor,
  onOpenFile,
}: VaultTagsPanelProps) {
  const [query, setQuery] = useState("");
  const [expandedTag, setExpandedTag] = useState<string | null>(null);
  const pendingPickRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The picker fires a change per drag tick; coalescing them keeps the vault
  // config from being rewritten and the editors redrawn continuously.
  function schedulePick(tag: string, value: string) {
    if (pendingPickRef.current) {
      clearTimeout(pendingPickRef.current);
    }
    pendingPickRef.current = setTimeout(() => onSetTagColor(tag, value), 250);
  }

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
            const picked = tagOverride(entry.tag, tagColors);
            const own = tagColors[entry.tag] ?? null;
            const style = tagStyle(entry.tag, tagColors) as CSSProperties | undefined;
            return (
              <div key={entry.tag} className="tag-group" role="listitem">
                <div className="tag-row-line">
                  <input
                    // A colour input is the swatch itself, so WebKit anchors
                    // its picker popover to the click. Uncontrolled and never
                    // remounted, so a persisted pick cannot close the picker
                    // mid-drag.
                    type="color"
                    className={style ? "tag-color-swatch tag-tinted" : "tag-color-swatch"}
                    style={style}
                    defaultValue={picked ?? UNSET_SWATCH_VALUE}
                    title={picked ? `Colour ${picked}; click to change` : "Pick a colour for this tag"}
                    aria-label={`Pick a colour for #${entry.tag}`}
                    onChange={(event) => schedulePick(entry.tag, event.currentTarget.value.toLowerCase())}
                  />
                  <button
                    type="button"
                    className={expanded ? "tag-row active" : "tag-row"}
                    aria-expanded={expanded}
                    onClick={() => setExpandedTag(expanded ? null : entry.tag)}
                  >
                    <strong className={style ? "tag-tinted" : undefined} style={style}>
                      #{entry.tag}
                    </strong>
                  </button>
                  {own ? (
                    <button
                      type="button"
                      className="tag-color-clear"
                      title="Clear this colour"
                      aria-label={`Clear the colour of #${entry.tag}`}
                      onClick={(event) => {
                        // The uncontrolled input still holds the cleared
                        // colour; without a reset, picking that same colour
                        // again fires no change event.
                        const swatch = event.currentTarget.parentElement?.querySelector("input");

                        if (swatch) {
                          swatch.value = UNSET_SWATCH_VALUE;
                        }
                        onSetTagColor(entry.tag, null);
                      }}
                    >
                      ×
                    </button>
                  ) : null}
                  <span className="tag-count">{entry.files.length}</span>
                </div>
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
