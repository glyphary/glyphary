import { renderToolbarIcon } from "../toolbar-icons";

type VaultTitlebarActionsProps = {
  canGoBack: boolean;
  onBack: () => void;
  onCreateFolder: () => void;
  onCreateNote: () => void;
  showCreateFolder: boolean;
  showCreateNote: boolean;
};

export function VaultTitlebarActions({
  canGoBack,
  onBack,
  onCreateFolder,
  onCreateNote,
  showCreateFolder,
  showCreateNote,
}: VaultTitlebarActionsProps) {
  return (
    <div className="titlebar-vault-actions">
      <button
        className="quiet-icon-action"
        disabled={!canGoBack}
        type="button"
        aria-label="Back"
        title="Back"
        onClick={onBack}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="m15 6-6 6 6 6" />
        </svg>
      </button>
      {showCreateNote ? (
        <button
          className="quiet-icon-action"
          type="button"
          aria-label="New note"
          title="New Note"
          onClick={onCreateNote}
        >
          {renderToolbarIcon("file-plus")}
        </button>
      ) : null}
      {showCreateFolder ? (
        <button
          className="quiet-icon-action"
          type="button"
          aria-label="New folder"
          title="New Folder"
          onClick={onCreateFolder}
        >
          {renderToolbarIcon("folder-plus")}
        </button>
      ) : null}
    </div>
  );
}
