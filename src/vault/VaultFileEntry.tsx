import type { MouseEvent as ReactMouseEvent } from "react";
import { baseName, fileNameWithoutMarkdownExtension } from "../lib/paths";
import { VaultFileIcon } from "./VaultIcons";

// Responsibilities:
// - Render one clickable vault file row (icon, title, relative path) as used
//   by the Recent list and the activity day list.
// Contracts:
// - Click handling is the caller's: it decides single versus double click.

type VaultFileEntryProps = {
  relativePath: string;
  /** Display name; defaults to the file name without its Markdown extension. */
  name?: string;
  active?: boolean;
  onClick: (event: ReactMouseEvent<HTMLButtonElement>) => void;
};

export function VaultFileEntry({ relativePath, name, active = false, onClick }: VaultFileEntryProps) {
  return (
    <button
      className={active ? "vault-entry recent-entry active" : "vault-entry recent-entry"}
      type="button"
      onClick={onClick}
    >
      <VaultFileIcon relativePath={relativePath} />
      <span className="recent-entry-text">
        <strong>{name ?? fileNameWithoutMarkdownExtension(baseName(relativePath))}</strong>
        <em>{relativePath}</em>
      </span>
    </button>
  );
}
