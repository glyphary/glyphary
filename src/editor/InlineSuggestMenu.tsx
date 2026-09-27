// Responsibilities:
// - Draw the inline completion list under the caret for "#" and "@".
// Contracts:
// - Focus stays in the editor: keys are handled there, so this menu only
//   reflects the selected row and takes clicks. Choosing on pointerdown, with
//   the default prevented, keeps the editor from blurring first.

import type { InlineSuggestItem } from "../lib/inline-suggest-items";

type InlineSuggestMenuProps = {
  x: number;
  y: number;
  items: readonly InlineSuggestItem[];
  index: number;
  emptyText: string;
  onChoose: (item: InlineSuggestItem) => void;
  onHover: (index: number) => void;
};

export function InlineSuggestMenu({ x, y, items, index, emptyText, onChoose, onHover }: InlineSuggestMenuProps) {
  return (
    <div className="task-quick-menu inline-suggest" style={{ left: x, top: y }} role="listbox" aria-label="Suggestions">
      {items.length === 0 ? (
        <p className="inline-suggest-empty">{emptyText}</p>
      ) : (
        items.map((item, itemIndex) => (
          <button
            key={item.id}
            className={itemIndex === index ? "active" : ""}
            type="button"
            role="option"
            aria-selected={itemIndex === index}
            tabIndex={-1}
            onPointerDown={(event) => {
              event.preventDefault();
              onChoose(item);
            }}
            onMouseEnter={() => onHover(itemIndex)}
          >
            {item.label}
            <small>{item.detail}</small>
          </button>
        ))
      )}
    </div>
  );
}
