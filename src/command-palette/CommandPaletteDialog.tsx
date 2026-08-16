import type { KeyboardEvent as ReactKeyboardEvent, RefObject } from "react";
import type { CommandPaletteCommand, CommandPaletteScope } from "./commands";
import { ModalDialog } from "../ui/ModalDialog";

// Responsibilities:
// - Render the command palette dialog without owning app commands.
// - Keep palette ARIA/listbox wiring out of App.
// Contracts:
// - Parent owns command execution and command list construction.
// - Empty results render a stable no-results state.

export function CommandPaletteDialog({
  anchor = null,
  close,
  commands,
  handleKeyDown,
  inputRef,
  onBack,
  onQueryChange,
  onRunCommand,
  onSelectIndex,
  open,
  placeholder,
  query,
  resultsRef,
  scope,
  scopeTitle,
  selectedCommand,
  selectedIndex,
}: {
  anchor?: { x: number; y: number } | null;
  close: () => void;
  commands: CommandPaletteCommand[];
  handleKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => void;
  inputRef: RefObject<HTMLInputElement | null>;
  onBack: () => void;
  onQueryChange: (query: string) => void;
  onRunCommand: (command: CommandPaletteCommand) => void;
  onSelectIndex: (index: number) => void;
  open: boolean;
  placeholder: string;
  query: string;
  resultsRef: RefObject<HTMLDivElement | null>;
  scope: CommandPaletteScope;
  scopeTitle: string;
  selectedCommand: CommandPaletteCommand | null;
  selectedIndex: number;
}) {
  if (!open) {
    return null;
  }

  // Clamp the caret-anchored card so it stays inside the viewport; the
  // estimates cover the card width and the results max-height.
  const anchorStyle = anchor
    ? {
        position: "fixed" as const,
        left: Math.max(12, Math.min(anchor.x, window.innerWidth - 572)),
        top: Math.max(12, Math.min(anchor.y + 6, window.innerHeight - 452)),
        margin: 0,
      }
    : undefined;

  return (
    <ModalDialog
      className={anchor ? "command-palette-screen anchored" : "command-palette-screen"}
      aria-label="Quick command"
      onRequestClose={close}
    >
      <div
        className="command-palette-card"
        style={anchorStyle}
        onKeyDown={handleKeyDown}
      >
        {scope !== "root" && scope !== "flat" ? (
          <div className="command-palette-scopebar">
            <button type="button" onClick={onBack}>
              Back
            </button>
            <span>{scopeTitle}</span>
          </div>
        ) : null}
        <input
          ref={inputRef}
          aria-activedescendant={
            selectedCommand ? `command-palette-${selectedCommand.id}` : undefined
          }
          aria-autocomplete="list"
          aria-controls="command-palette-results"
          aria-label="Quick command"
          autoComplete="off"
          placeholder={placeholder}
          role="combobox"
          spellCheck="false"
          value={query}
          onChange={(event) => onQueryChange(event.currentTarget.value)}
        />
        <div
          ref={resultsRef}
          className="command-palette-results"
          id="command-palette-results"
          role="listbox"
          aria-label="Matching commands"
        >
          {commands.length > 0 ? (
            commands.map((command, index) => (
              <button
                className={index === selectedIndex ? "active" : ""}
                id={`command-palette-${command.id}`}
                key={command.id}
                role="option"
                aria-selected={index === selectedIndex}
                type="button"
                onClick={() => onRunCommand(command)}
                onMouseEnter={() => onSelectIndex(index)}
              >
                <span>{command.title}</span>
                <small>{command.description}</small>
              </button>
            ))
          ) : (
            <p>No commands found</p>
          )}
        </div>
      </div>
    </ModalDialog>
  );
}
