import { parsePluginPanel } from "../lib/plugin-host";

// Responsibilities:
// - Turn the Markdown subset a plugin returns into DOM, for both drawer panels
//   and rendered code blocks.
// Contracts:
// - Output is built from text nodes and buttons only. Plugin text never passes
//   through innerHTML, so it cannot inject markup, images, or script.

export type PluginBlockHandlers = {
  onOpenNote: (target: string) => void;
  onCommand: (commandId: string) => void;
};

export function renderPluginBlocks(
  container: HTMLElement,
  markdown: string,
  headingTag: "h3" | "h4",
  handlers: PluginBlockHandlers,
) {
  container.replaceChildren(
    ...parsePluginPanel(markdown).map((block) => {
      const element = document.createElement(block.kind === "heading" ? headingTag : "p");

      if (block.kind === "bullet") {
        element.className = "plugin-panel-bullet";
      }

      for (const part of block.parts) {
        if (!("note" in part) && !("command" in part)) {
          element.append(part.text);
          continue;
        }

        const button = document.createElement("button");

        button.type = "button";
        button.className = "note" in part ? "plugin-panel-link" : "inline-action";
        button.textContent = part.text;
        button.addEventListener("click", () =>
          "note" in part ? handlers.onOpenNote(part.note) : handlers.onCommand(part.command),
        );
        element.append(button);
      }

      return element;
    }),
  );
}
