import { Suspense, lazy, useEffect, useState } from "react";
import type { RefObject } from "react";
import { mergeAttributes, Node } from "@tiptap/core";
import type { JSONContent, MarkdownToken, NodeViewProps } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import type {
  AppState,
  BinaryFiles,
  ExcalidrawImperativeAPI,
} from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { cleanVaultAssetReference } from "../lib/paths";
import { ModalDialog } from "../ui/ModalDialog";

// Responsibilities:
// - Own Excalidraw scene parsing, preview rendering, and Markdown embed syntax.
// Contracts:
// - Invalid or empty scene data renders as an empty drawing, not a crash.
// - Only safe `.excalidraw` vault references become embed nodes.

export type ExcalidrawSceneData = {
  type?: string;
  elements?: readonly ExcalidrawElement[];
  appState?: Partial<AppState>;
  files?: BinaryFiles;
};

export type ExcalidrawEmbedOptions = {
  openDrawing: (target: string) => void;
  loadPreview: (target: string) => Promise<string>;
};

export type ExcalidrawDialogState = {
  relativePath: string;
  name: string;
  initialData: {
    elements: readonly ExcalidrawElement[];
    appState: Partial<AppState>;
    files: BinaryFiles;
  };
};

export const ExcalidrawCanvas = lazy(async () => {
  const module = await import("@excalidraw/excalidraw");

  return { default: module.Excalidraw };
});

export const excalidrawPreviewRefreshEvent = "glyphary-excalidraw-preview-refresh";

export function emptyExcalidrawScene(): ExcalidrawSceneData {
  return {
    type: "excalidraw",
    elements: [],
    appState: {},
    files: {},
  };
}

export function parseExcalidrawScene(content: string): ExcalidrawSceneData {
  if (!content.trim()) {
    return emptyExcalidrawScene();
  }

  try {
    const parsed = JSON.parse(content) as ExcalidrawSceneData;

    return {
      type: parsed.type || "excalidraw",
      elements: Array.isArray(parsed.elements) ? parsed.elements : [],
      appState:
        parsed.appState && typeof parsed.appState === "object" ? parsed.appState : {},
      files: parsed.files && typeof parsed.files === "object" ? parsed.files : {},
    };
  } catch {
    return emptyExcalidrawScene();
  }
}

export async function restoredExcalidrawScene(scene: ExcalidrawSceneData) {
  const { restore } = await import("@excalidraw/excalidraw");

  return restore(
    {
      elements: scene.elements ?? [],
      appState: scene.appState ?? {},
      files: scene.files ?? {},
    },
    null,
    null,
  );
}

export async function excalidrawSceneToSvgMarkup(scene: ExcalidrawSceneData) {
  const { exportToSvg } = await import("@excalidraw/excalidraw");
  const restored = await restoredExcalidrawScene(scene);
  const visibleElements = restored.elements.filter((element) => !element.isDeleted);

  if (visibleElements.length === 0) {
    return "";
  }

  const svg = await exportToSvg({
    elements: visibleElements,
    appState: {
      ...restored.appState,
      exportWithDarkMode: false,
    },
    files: restored.files,
    exportPadding: 18,
  });

  return new XMLSerializer().serializeToString(svg);
}

export function isExcalidrawTarget(target: string) {
  return target.toLowerCase().endsWith(".excalidraw");
}

// One cached outcome per target - either exported SVG markup or the failure
// message. Node views remount on every tab rehydrate; the cache keeps
// remounts from flashing "Loading drawing..." (and failures from alternating
// with it, which is how the Windows missing-file bug presented).
type ExcalidrawPreviewOutcome = { svg: string } | { failure: string };
const excalidrawPreviewCache = new Map<string, ExcalidrawPreviewOutcome>();

type ExcalidrawPreviewDisplay =
  | { kind: "loading" }
  | { kind: "ready"; svg: string }
  | { kind: "empty" }
  | { kind: "error"; message: string };

function previewDisplay(
  outcome: ExcalidrawPreviewOutcome | undefined,
): ExcalidrawPreviewDisplay {
  if (!outcome) {
    return { kind: "loading" };
  }

  if ("failure" in outcome) {
    return { kind: "error", message: outcome.failure };
  }

  return outcome.svg ? { kind: "ready", svg: outcome.svg } : { kind: "empty" };
}

function ExcalidrawEmbedView(props: NodeViewProps) {
  const target = String(props.node.attrs.target ?? "");
  const [preview, setPreview] = useState<ExcalidrawPreviewDisplay>(() =>
    previewDisplay(excalidrawPreviewCache.get(target)),
  );
  const options = props.extension.options as ExcalidrawEmbedOptions;

  useEffect(() => {
    if (!isExcalidrawTarget(target)) {
      return;
    }

    let cancelled = false;
    const loadPreview = () => {
      // While an outcome is cached, refresh silently: the old preview stays
      // visible until the new one is ready instead of flashing empty.
      if (!excalidrawPreviewCache.has(target)) {
        setPreview({ kind: "loading" });
      }
      options
        .loadPreview(target)
        .then((markup) => {
          excalidrawPreviewCache.set(target, { svg: markup });

          if (!cancelled) {
            setPreview(previewDisplay({ svg: markup }));
          }
        })
        .catch((error: unknown) => {
          // Keep the real failure text; a generic label made the Windows
          // missing-file bug undiagnosable.
          const message = error instanceof Error ? error.message : String(error);

          excalidrawPreviewCache.set(target, { failure: message });

          if (!cancelled) {
            setPreview({ kind: "error", message });
          }
        });
    };
    const refreshPreview = (event: Event) => {
      if (!(event instanceof CustomEvent) || event.detail?.target !== target) {
        return;
      }

      // A cached failure must not suppress the retry's loading state, while a
      // cached success should keep rendering during the silent refresh.
      const cached = excalidrawPreviewCache.get(target);

      if (cached && "failure" in cached) {
        excalidrawPreviewCache.delete(target);
      }

      loadPreview();
    };

    loadPreview();
    window.addEventListener(excalidrawPreviewRefreshEvent, refreshPreview);

    return () => {
      cancelled = true;
      window.removeEventListener(excalidrawPreviewRefreshEvent, refreshPreview);
    };
  }, [options, target]);

  if (!isExcalidrawTarget(target)) {
    return <NodeViewWrapper as="span" className="excalidraw-embed-invalid" />;
  }

  return (
    <NodeViewWrapper
      as="figure"
      className="excalidraw-embed"
      data-excalidraw-target={target}
      onDoubleClick={() => options.openDrawing(target)}
    >
      <div className="excalidraw-embed-preview">
        {preview.kind === "ready" ? (
          <div
            className="excalidraw-embed-svg"
            dangerouslySetInnerHTML={{ __html: preview.svg }}
          />
        ) : (
          <div className="excalidraw-embed-empty">
            {preview.kind === "loading"
              ? "Loading drawing..."
              : preview.kind === "error"
                ? `Drawing preview unavailable: ${preview.message || "unknown error"}`
                : "No saved drawing elements"}
          </div>
        )}
      </div>
      <figcaption>
        <span>{target.split("/").pop() ?? target}</span>
        <small>Double-click to edit</small>
      </figcaption>
    </NodeViewWrapper>
  );
}

export function createExcalidrawEmbedExtension(options: ExcalidrawEmbedOptions) {
  return Node.create({
    name: "excalidrawEmbed",
    priority: 1100,
    group: "block",
    atom: true,
    draggable: true,

    addOptions() {
      return options;
    },

    addAttributes() {
      return {
        target: {
          // Required on purpose: priority 1100 places this node before
          // Paragraph in the schema, so an auto-creatable atom became
          // ProseMirror's createAndFill filler and every parsed document
          // gained a phantom empty embed at the end. A required attribute
          // keeps the node out of automatic filling.
          isRequired: true,
          parseHTML: (element) => element.getAttribute("data-excalidraw-target") ?? "",
        },
      };
    },

    parseHTML() {
      return [{ tag: "figure[data-excalidraw-target]" }];
    },

    renderHTML({ HTMLAttributes }) {
      return [
        "figure",
        mergeAttributes(HTMLAttributes, {
          "data-excalidraw-target": HTMLAttributes.target,
          class: "excalidraw-embed",
        }),
      ];
    },

    addNodeView() {
      return ReactNodeViewRenderer(ExcalidrawEmbedView);
    },

    markdownTokenName: "excalidrawEmbed",

    markdownTokenizer: {
      name: "excalidrawEmbed",
      level: "block",
      start: (src: string) => {
        const index = src.search(/!\[\[[^\]\n]+\.excalidraw\]\]/i);

        return index >= 0 ? index : src.length;
      },
      tokenize: (src: string) => {
        const match = src.match(/^!\[\[([^\]\n]+\.excalidraw)\]\][ \t]*(?:\n|$)/i);

        if (!match) {
          return undefined;
        }

        const target = cleanVaultAssetReference(match[1]);

        if (!target || !isExcalidrawTarget(target)) {
          return undefined;
        }

        return {
          type: "excalidrawEmbed",
          raw: match[0],
          target,
        };
      },
    },

    parseMarkdown: (token: MarkdownToken, helpers) => {
      const target = cleanVaultAssetReference(String(token.target ?? ""));

      if (!target || !isExcalidrawTarget(target)) {
        return [];
      }

      return helpers.createNode("excalidrawEmbed", { target });
    },

    renderMarkdown: (node: JSONContent) => {
      const target =
        typeof node.attrs?.target === "string"
          ? cleanVaultAssetReference(node.attrs.target)
          : null;

      return target && isExcalidrawTarget(target) ? `![[${target}]]` : "";
    },
  });
}

export function ExcalidrawDialog({
  dialog,
  dirty,
  onApi,
  onChange,
  onClose,
  onSave,
  savedNotice,
}: {
  dialog: ExcalidrawDialogState | null;
  dirty: boolean;
  onApi: (api: ExcalidrawImperativeAPI) => void;
  onChange: (
    elements: readonly ExcalidrawElement[],
    appState: AppState,
    files: BinaryFiles,
  ) => void;
  onClose: () => void;
  onSave: () => void;
  savedNotice: boolean;
}) {
  if (!dialog) {
    return null;
  }

  return (
    <ModalDialog
      className="excalidraw-dialog-screen"
      aria-label={`Edit drawing ${dialog.name}`}
      onRequestClose={onClose}
    >
      <section
        className="excalidraw-dialog-card"
      >
        <header className="excalidraw-dialog-header">
          <div>
            <h2>{dialog.name}</h2>
            <p>{dialog.relativePath}</p>
          </div>
          <div className="excalidraw-dialog-actions">
            {savedNotice && !dirty ? (
              <span className="excalidraw-save-note" role="status">
                Saved
              </span>
            ) : null}
            <button
              className="inline-action"
              disabled={!dirty}
              type="button"
              onClick={onSave}
            >
              Save Drawing
            </button>
            <button className="inline-action" type="button" onClick={onClose}>
              Close
            </button>
          </div>
        </header>
        <div className="excalidraw-editor-shell">
          <Suspense fallback={<div className="excalidraw-loading">Loading drawing editor...</div>}>
            <ExcalidrawCanvas
              key={dialog.relativePath}
              initialData={dialog.initialData}
              name={dialog.name}
              excalidrawAPI={onApi}
              onChange={onChange}
            />
          </Suspense>
        </div>
      </section>
    </ModalDialog>
  );
}

export function ExcalidrawCreateDialog({
  inputRef,
  name,
  onCancel,
  onCreate,
  onNameChange,
  open,
  submitting,
}: {
  inputRef: RefObject<HTMLInputElement | null>;
  name: string;
  onCancel: () => void;
  onCreate: () => void;
  onNameChange: (name: string) => void;
  open: boolean;
  submitting: boolean;
}) {
  if (!open) {
    return null;
  }

  return (
    <ModalDialog
      className="excalidraw-create-dialog-screen"
      aria-label="Insert Excalidraw drawing"
      onRequestClose={() => {
        if (!submitting) {
          onCancel();
        }
      }}
    >
      <form
        className="excalidraw-create-dialog-card"
        onSubmit={(event) => {
          event.preventDefault();
          onCreate();
        }}
      >
        <div className="excalidraw-create-dialog-header">
          <h2>New Drawing</h2>
          <span>Name the vault drawing file to embed in this note.</span>
        </div>
        <label>
          <span>Name</span>
          <input
            ref={inputRef}
            disabled={submitting}
            spellCheck="false"
            value={name}
            onChange={(event) => onNameChange(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape" && !submitting) {
                event.preventDefault();
                onCancel();
              }
            }}
          />
        </label>
        <div className="excalidraw-create-dialog-actions">
          <button
            className="inline-action"
            disabled={submitting}
            type="button"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            className="inline-action"
            disabled={submitting || !name.trim()}
            type="submit"
          >
            {submitting ? "Creating..." : "Create"}
          </button>
        </div>
      </form>
    </ModalDialog>
  );
}
