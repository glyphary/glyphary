// Responsibilities:
// - The value control for an image-valued frontmatter row: a thumbnail, the
//   editable text, and a picker button. The row is marked so a native file
//   drop can find it and App can write the property.
// Contracts:
// - The thumbnail shows the first candidate source; a load error bubbles to
//   the pane, whose image fallback walks the other vault image folders the
//   way it does for editor images.

type FrontmatterImageFieldProps = {
  entryKey: string;
  groupId: string;
  value: string;
  source: string | null;
  disabled: boolean;
  onChange: (value: string) => void;
  onPick: () => void;
};

export function FrontmatterImageField({
  entryKey,
  groupId,
  value,
  source,
  disabled,
  onChange,
  onPick,
}: FrontmatterImageFieldProps) {
  return (
    <div
      className="frontmatter-image-field"
      data-frontmatter-image-key={entryKey}
      data-frontmatter-group={groupId}
      title="Drop a picture here, or choose one"
    >
      {source ? (
        // Remounted per value: the pane's error fallback rewrites `src` and its
        // candidate index on the element itself, which a prop diff would not reset.
        <img
          className="frontmatter-image-thumb"
          src={source}
          alt=""
          key={value}
          data-vault-target={value}
        />
      ) : (
        <span className="frontmatter-image-thumb frontmatter-image-empty" aria-hidden="true" />
      )}
      <input
        aria-label={`${entryKey} value`}
        disabled={disabled}
        spellCheck="false"
        value={value.replace(/\s*\n\s*/g, " ")}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
      <button className="frontmatter-image-pick" type="button" disabled={disabled} onClick={onPick}>
        Choose...
      </button>
    </div>
  );
}
