import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from "react";
import type { Editor } from "@tiptap/core";
import type { CanvasCommandAction, CanvasCommandRequest } from "../CanvasView";
import type { AiReviewState } from "../ai/use-ai-commands";
import type {
  AiSettings,
  DocumentTab,
  PluginCatalog,
  PluginCommandManifest,
  PluginManifest,
  PluginSettings,
} from "../lib/app-types";
import type { CommandPaletteCommand, CommandPaletteScope } from "./commands";

// Responsibilities:
// - Declare every command palette entry: ids, titles, and which App action
//   each one runs.
// Contracts:
// - Pure declaration over the provided context; no state lives here. App
//   rebuilds the catalog each render and destructures the historical names.

type AiApplyMode = AiReviewState["applyMode"];

export type CommandPaletteContext = {
  activeDocumentIsCanvas: boolean;
  activeDocumentIsMarkdown: boolean;
  activeDocumentTab: DocumentTab | null;
  activeFileBackedPath: string | null;
  activeFileStarred: boolean;
  appendCallout: () => void;
  appendColumns: () => void;
  appendTableOfContentsBlock: () => void;
  canvasCommandRequestIdRef: MutableRefObject<number>;
  commandPaletteInputRef: RefObject<HTMLInputElement | null>;
  createTidbit: () => void;
  cursorInsideTable: boolean;
  editor: Editor | null;
  excalidraw: { openCreateDialog: () => void };
  focusMode: boolean;
  formatSelectionAsKeyboardKey: () => void;
  formatSelectionWithMark: (
    editor: Editor | null,
    mark: string,
    label: string,
    setStatus: (message: string) => void,
  ) => void;
  insertCollapseBlock: () => void;
  insertHtmlBlock: () => void;
  insertMermaidDiagram: () => void;
  openAiPageBuilder: () => void;
  openRichLinkDialog: () => void;
  pluginCatalog: PluginCatalog;
  pluginDraft: PluginSettings;
  runAiContinueWritingCommand: () => Promise<void>;
  runAiSelectionCommand: (title: string, instruction: string, applyMode: AiApplyMode) => Promise<void>;
  runAiSelectionOrDocumentCommand: (
    title: string,
    instruction: string,
    applyMode: AiApplyMode,
  ) => Promise<void>;
  runPluginCommand: (plugin: PluginManifest, command: PluginCommandManifest) => Promise<void>;
  savedAiSettings: () => AiSettings;
  setCanvasCommandRequest: (request: CanvasCommandRequest | null) => void;
  setCommandPaletteQuery: Dispatch<SetStateAction<string>>;
  setCommandPaletteScope: Dispatch<SetStateAction<CommandPaletteScope>>;
  setCommandPaletteSelectedIndex: Dispatch<SetStateAction<number>>;
  setStatus: (message: string) => void;
  toggleActiveFileStar: () => void;
  toggleFocusMode: () => void;
  wrapSelectedImagesInGallery: () => void;
};

export function buildCommandPaletteCommands(context: CommandPaletteContext) {
  const {
    activeDocumentIsCanvas,
    activeDocumentIsMarkdown,
    activeDocumentTab,
    activeFileBackedPath,
    activeFileStarred,
    appendCallout,
    appendColumns,
    appendTableOfContentsBlock,
    canvasCommandRequestIdRef,
    commandPaletteInputRef,
    createTidbit,
    cursorInsideTable,
    editor,
    excalidraw,
    focusMode,
    formatSelectionAsKeyboardKey,
    formatSelectionWithMark,
    insertCollapseBlock,
    insertHtmlBlock,
    insertMermaidDiagram,
    openAiPageBuilder,
    openRichLinkDialog,
    pluginCatalog,
    pluginDraft,
    runAiContinueWritingCommand,
    runAiSelectionCommand,
    runAiSelectionOrDocumentCommand,
    runPluginCommand,
    savedAiSettings,
    setCanvasCommandRequest,
    setCommandPaletteQuery,
    setCommandPaletteScope,
    setCommandPaletteSelectedIndex,
    setStatus,
    toggleActiveFileStar,
    toggleFocusMode,
    wrapSelectedImagesInGallery,
  } = context;

  const tableCommandPaletteCommands: CommandPaletteCommand[] =
    cursorInsideTable && editor
    ? [
        {
          id: "table-add-row-after",
          title: "Add row after",
          description: "Insert a table row below the current row",
          run: () => {
            editor.chain().focus().addRowAfter().run();
          },
        },
        {
          id: "table-delete-row",
          title: "Delete row",
          description: "Remove the current table row",
          run: () => {
            editor.chain().focus().deleteRow().run();
          },
        },
        {
          id: "table-add-column-after",
          title: "Add column after",
          description: "Insert a table column to the right",
          run: () => {
            editor.chain().focus().addColumnAfter().run();
          },
        },
        {
          id: "table-delete-column",
          title: "Delete column",
          description: "Remove the current table column",
          run: () => {
            editor.chain().focus().deleteColumn().run();
          },
        },
        {
          id: "table-delete-table",
          title: "Delete table",
          description: "Remove the current table",
          run: () => {
            editor.chain().focus().deleteTable().run();
          },
        },
      ]
    : [];
  const enabledPluginIds = new Set(pluginDraft.enabled);
  // Palette entries are derived from the validated catalog but gated by the
  // unsaved draft, so enabling a plugin previews its commands before Save.
  const pluginCommandPaletteCommands: CommandPaletteCommand[] = pluginCatalog.plugins
    .filter((plugin) => enabledPluginIds.has(plugin.id))
    .flatMap((plugin) =>
      plugin.commands.map((command) => ({
        id: `plugin:${plugin.id}:${command.id}`,
        title: command.title,
        description: command.description || `${plugin.name} plugin command`,
        run: () => runPluginCommand(plugin, command),
      })),
    );
  // AI commands use saved vault settings, not the unsaved settings draft. That
  // prevents palette actions from using an API key or model the user has not
  // explicitly saved for this vault.
  const aiCommandPaletteCommands: CommandPaletteCommand[] = savedAiSettings().enabled
    ? [
        {
          id: "ai-page-builder",
          title: "AI: Page Builder",
          description: "Build a note section from a prompt and current context",
          run: openAiPageBuilder,
        },
        {
          id: "ai-improve-writing-selection",
          title: "AI: Improve writing",
          description: "Clean up grammar, clarity, and flow while preserving meaning",
          run: () =>
            runAiSelectionCommand(
              "AI: Improve writing",
              "Improve the selected Markdown for grammar, clarity, and flow while preserving its meaning, tone, structure, and important details. Return only the improved Markdown.",
              "replace-selection",
            ),
        },
        {
          id: "ai-fix-spelling-grammar-selection",
          title: "AI: Fix spelling and grammar",
          description: "Apply a light spelling and grammar edit to the selection",
          run: () =>
            runAiSelectionCommand(
              "AI: Fix spelling and grammar",
              "Fix spelling, punctuation, and grammar in the selected Markdown. Keep wording changes minimal and preserve the original structure. Return only the corrected Markdown.",
              "replace-selection",
            ),
        },
        {
          id: "ai-shorten-selection",
          title: "AI: Shorten selection",
          description: "Compress the selected text without losing key points",
          run: () =>
            runAiSelectionCommand(
              "AI: Shorten selection",
              "Shorten the selected Markdown while preserving the essential meaning and important details. Return only the shortened Markdown.",
              "replace-selection",
            ),
        },
        {
          id: "ai-expand-selection",
          title: "AI: Expand selection",
          description: "Elaborate terse notes into fuller Markdown prose",
          run: () =>
            runAiSelectionCommand(
              "AI: Expand selection",
              "Expand the selected Markdown into clearer, fuller writing. Preserve the original meaning, avoid inventing unsupported facts, and return only the expanded Markdown.",
              "replace-selection",
            ),
        },
        {
          id: "ai-tone-formal-selection",
          title: "AI: Make selection more formal",
          description: "Rewrite the selection in a more formal tone",
          run: () =>
            runAiSelectionCommand(
              "AI: Make selection more formal",
              "Rewrite the selected Markdown in a more formal tone while preserving meaning, structure, and important details. Return only the rewritten Markdown.",
              "replace-selection",
            ),
        },
        {
          id: "ai-tone-casual-selection",
          title: "AI: Make selection more casual",
          description: "Rewrite the selection in a more casual tone",
          run: () =>
            runAiSelectionCommand(
              "AI: Make selection more casual",
              "Rewrite the selected Markdown in a more casual, natural tone while preserving meaning, structure, and important details. Return only the rewritten Markdown.",
              "replace-selection",
            ),
        },
        {
          id: "ai-tone-direct-selection",
          title: "AI: Make selection more direct",
          description: "Rewrite the selection to be clearer and more direct",
          run: () =>
            runAiSelectionCommand(
              "AI: Make selection more direct",
              "Rewrite the selected Markdown to be more direct and concise while preserving meaning and important details. Return only the rewritten Markdown.",
              "replace-selection",
            ),
        },
        {
          id: "ai-tone-polished-selection",
          title: "AI: Polish selection",
          description: "Rewrite the selection with a more polished tone",
          run: () =>
            runAiSelectionCommand(
              "AI: Polish selection",
              "Rewrite the selected Markdown with a polished, professional tone while preserving meaning, structure, and important details. Return only the rewritten Markdown.",
              "replace-selection",
            ),
        },
        {
          id: "ai-summarize-selection",
          title: "AI: Summarize selection",
          description: "Create a concise Markdown summary of the selected text",
          run: () =>
            runAiSelectionCommand(
              "AI: Summarize selection",
              "Summarize the selected Markdown concisely. Use Markdown bullets if that makes the result easier to scan.",
              "insert-below-selection",
            ),
        },
        {
          id: "ai-extract-tasks-selection",
          title: "AI: Extract tasks from selection",
          description: "Turn the selected text into Markdown task items",
          run: () =>
            runAiSelectionCommand(
              "AI: Extract tasks from selection",
              "Extract concrete action items from the selected Markdown. Return only Markdown task list items using '- [ ]'.",
              "insert-below-selection",
            ),
        },
        {
          id: "ai-create-outline-selection",
          title: "AI: Create outline",
          description: "Turn the selected text into Markdown headings and bullets",
          run: () =>
            runAiSelectionCommand(
              "AI: Create outline",
              "Turn the selected Markdown into a useful outline with Markdown headings and bullets. Preserve important ideas and ordering. Return only the outline.",
              "insert-below-selection",
            ),
        },
        {
          id: "ai-diagram-selection",
          title: "AI: Diagram from selection or note",
          description: "Draw the selection or whole note as an inline Mermaid diagram",
          run: () =>
            runAiSelectionOrDocumentCommand(
              "AI: Diagram from selection or note",
              // Mermaid instead of an image model: the diagram stays editable,
              // renders natively, and text labels never garble.
              "Draw the structure of the selected Markdown as a Mermaid diagram. Pick the most fitting type: flowchart for processes and decisions, sequenceDiagram for interactions between parties, stateDiagram-v2 for states and transitions. Wrap every node label in double quotes so punctuation cannot break the syntax. Return only one fenced ```mermaid code block with valid Mermaid inside, and nothing else.",
              "insert-below-selection",
            ),
        },
        {
          id: "ai-generate-title",
          title: "AI: Generate title",
          description: "Suggest a concise title from the selection or current note",
          run: () =>
            runAiSelectionOrDocumentCommand(
              "AI: Generate title",
              "Suggest one concise, specific title for this note or selected Markdown. Return only the title text with no quotes, prefix, or explanation.",
              "insert-below-selection",
            ),
        },
        {
          id: "ai-continue-writing",
          title: "AI: Continue writing",
          description: "Continue from the cursor using the surrounding note as context",
          run: runAiContinueWritingCommand,
        },
        {
          id: "ai-explain-selection",
          title: "AI: Explain selection",
          description: "Explain the selected concept in simpler terms",
          run: () =>
            runAiSelectionCommand(
              "AI: Explain selection",
              "Explain the selected Markdown in simpler terms for a reader who is new to the topic. Preserve important nuance and return only Markdown.",
              "insert-below-selection",
            ),
        },
      ]
    : [];
  function requestCanvasCommand(action: CanvasCommandAction) {
    canvasCommandRequestIdRef.current += 1;
    setCanvasCommandRequest({
      id: canvasCommandRequestIdRef.current,
      action,
    });
  }

  const canvasInsertCommandPaletteCommands: CommandPaletteCommand[] = [
    {
      id: "canvas-add-card",
      title: "Add Card",
      description: "Insert a new editable canvas card",
      run: () => requestCanvasCommand("card"),
    },
    {
      id: "canvas-add-note-from-vault",
      title: "Add Note From Vault",
      description: "Insert a Markdown note node selected from the vault",
      run: () => requestCanvasCommand("note"),
    },
    {
      id: "canvas-add-media-from-vault",
      title: "Add Media From Vault",
      description: "Insert an image, video, or audio node selected from the vault",
      run: () => requestCanvasCommand("media"),
    },
    {
      id: "canvas-add-web-page",
      title: "Add Web Page",
      description: "Insert a web page node",
      run: () => requestCanvasCommand("web"),
    },
    {
      id: "canvas-create-group",
      title: "Create Group",
      description: "Insert a visual grouping region",
      run: () => requestCanvasCommand("group"),
    },
  ];
  // Insert commands are grouped for density, but they remain ordinary commands
  // once the user enters the submenu so fuzzy search and keyboard behavior stay
  // identical to the root palette.
  const insertCommandPaletteCommands: CommandPaletteCommand[] = [
    {
      id: "insert-rich-link",
      title: "Insert rich link",
      description: "Fetch a URL preview and insert a rich link card",
      run: openRichLinkDialog,
    },
    {
      id: "insert-excalidraw",
      title: "Insert Excalidraw drawing",
      description: "Create and embed an editable vault drawing",
      run: excalidraw.openCreateDialog,
    },
    {
      id: "insert-columns",
      title: "Insert columns",
      description: "Add a two-column Markdown container",
      run: appendColumns,
    },
    {
      id: "gallery-layout",
      title: "Gallery layout",
      description: "Arrange selected images into a visual gallery",
      run: wrapSelectedImagesInGallery,
    },
    {
      id: "insert-callout",
      title: "Insert callout",
      description: "Add a note callout block",
      run: appendCallout,
    },
    {
      id: "insert-collapse",
      title: "Insert collapse",
      description: "Add an expandable details block",
      run: insertCollapseBlock,
    },
    {
      id: "insert-html-block",
      title: "Insert HTML block",
      description: "Add a sanitized raw HTML block",
      run: insertHtmlBlock,
    },
    {
      id: "insert-mermaid-diagram",
      title: "Insert Mermaid diagram",
      description: "Add a rendered Mermaid diagram block",
      run: insertMermaidDiagram,
    },
    {
      id: "insert-table-of-contents",
      title: "Insert table of contents",
      description: "Add a rendered table of contents block",
      run: appendTableOfContentsBlock,
    },
  ];
  const activeInsertCommandPaletteCommands = activeDocumentIsCanvas
    ? canvasInsertCommandPaletteCommands
    : activeDocumentIsMarkdown
      ? insertCommandPaletteCommands
      : [];
  const openInsertCommandPalette = () => {
    setCommandPaletteScope("insert");
    setCommandPaletteQuery("");
    setCommandPaletteSelectedIndex(0);
    window.setTimeout(() => commandPaletteInputRef.current?.focus(), 0);
  };
  const formatCommandPaletteCommands: CommandPaletteCommand[] = [
    {
      id: "format-strikethrough",
      title: "Strikethrough",
      description: "Wrap selected text in ~~ delimiters",
      run: () => formatSelectionWithMark(editor, "strike", "strikethrough", setStatus),
    },
    {
      id: "format-highlight",
      title: "Highlight",
      description: "Wrap selected text in == delimiters",
      run: () => formatSelectionWithMark(editor, "highlight", "a highlight", setStatus),
    },
    {
      id: "format-superscript",
      title: "Superscript",
      description: "Wrap selected text in ^ delimiters",
      run: () => formatSelectionWithMark(editor, "superscript", "superscript", setStatus),
    },
    {
      id: "format-subscript",
      title: "Subscript",
      description: "Wrap selected text in ~ delimiters",
      run: () => formatSelectionWithMark(editor, "subscript", "subscript", setStatus),
    },
    {
      id: "format-keyboard",
      title: "Keyboard",
      description: "Wrap selected text in <kbd> tags",
      run: formatSelectionAsKeyboardKey,
    },
  ];
  const openFormatCommandPalette = () => {
    setCommandPaletteScope("format");
    setCommandPaletteQuery("");
    setCommandPaletteSelectedIndex(0);
    window.setTimeout(() => commandPaletteInputRef.current?.focus(), 0);
  };
  const canvasCommandPaletteCommands: CommandPaletteCommand[] = [
    {
      id: "insert-menu",
      title: "Insert ...",
      description: "Open canvas insert commands",
      run: openInsertCommandPalette,
    },
  ];
  const activeFileCommandPaletteCommands: CommandPaletteCommand[] = activeFileBackedPath
    ? [
        {
          id: activeFileStarred ? "unstar-file" : "star-file",
          title: activeFileStarred ? "Unstar File" : "Star File",
          description: activeFileStarred
            ? "Remove the current file from Starred"
            : "Add the current file to Starred",
          run: toggleActiveFileStar,
        },
      ]
    : [];
  const editorCommandPaletteCommands: CommandPaletteCommand[] = [
    // Table editing is contextual enough that the palette keeps it close to
    // the cursor state instead of permanently crowding the formatting toolbar.
    ...(tableCommandPaletteCommands.length > 0
      ? [
          {
            id: "table-menu",
            title: "Table ...",
            description: "Open table editing commands",
            run: () => {
              setCommandPaletteScope("table");
              setCommandPaletteQuery("");
              setCommandPaletteSelectedIndex(0);
              window.setTimeout(() => commandPaletteInputRef.current?.focus(), 0);
            },
          },
        ]
      : []),
    {
      id: "create-tidbit",
      title: "Create Tidbit",
      description: "Create a fast note from the vault tidbit path pattern",
      run: createTidbit,
    },
    {
      id: "toggle-focus-mode",
      title: focusMode ? "Exit Focus Mode" : "Enter Focus Mode",
      description: "Show only the note editing area",
      run: toggleFocusMode,
    },
    ...(aiCommandPaletteCommands.length > 0
      ? [
          {
            id: "ai-menu",
            title: "AI ...",
            description: "Open AI writing commands",
            run: () => {
              setCommandPaletteScope("ai");
              setCommandPaletteQuery("");
              setCommandPaletteSelectedIndex(0);
              window.setTimeout(() => commandPaletteInputRef.current?.focus(), 0);
            },
          },
        ]
      : []),
    {
      id: "insert-menu",
      title: "Insert ...",
      description: "Open insert commands",
      run: openInsertCommandPalette,
    },
    {
      id: "format-menu",
      title: "Format ...",
      description: "Open selection formatting commands",
      run: openFormatCommandPalette,
    },
    ...pluginCommandPaletteCommands,
  ];
  const commandPaletteCommands = activeDocumentTab
    ? [
        ...(activeDocumentIsCanvas
          ? canvasCommandPaletteCommands
          : activeDocumentIsMarkdown
            ? editorCommandPaletteCommands
            : []),
        ...activeFileCommandPaletteCommands,
      ]
    : [];
  // The slash menu shows one filterable list of the writing-insertion groups
  // only: the AI and Insert children, flattened.
  const flatCommandPaletteCommands = [
    ...aiCommandPaletteCommands,
    ...activeInsertCommandPaletteCommands,
  ];

  return {
    activeFileCommandPaletteCommands,
    activeInsertCommandPaletteCommands,
    aiCommandPaletteCommands,
    canvasCommandPaletteCommands,
    canvasInsertCommandPaletteCommands,
    commandPaletteCommands,
    editorCommandPaletteCommands,
    flatCommandPaletteCommands,
    formatCommandPaletteCommands,
    insertCommandPaletteCommands,
    pluginCommandPaletteCommands,
    tableCommandPaletteCommands,
  };
}
