import { useEffect, useMemo, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emitTo, listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";
import { TaskItem } from "@tiptap/extension-task-item";
import { TaskList } from "@tiptap/extension-task-list";
import { defaultTidbitPathPattern } from "./lib/defaults";
import { expandDateTemplate } from "./lib/dates";
import { normalizeVaultAppearanceSettings } from "./lib/settings";
import type { VaultAppearanceSettings } from "./lib/app-types";

type AppearanceMode = "auto" | "light" | "dark";

type OpenedFile = {
  name: string;
  relativePath: string;
  content: string;
};

type TidbitCaptureContext = {
  root: string;
  pathPattern: string;
};

type VaultSettings = {
  appearance?: {
    glassEffect?: boolean | null;
    glassOpacity?: number | null;
  } | null;
  theme?: {
    tokens?: Record<string, string> | null;
  } | null;
};

const appearanceStorageKey = "glyphary.appearance";
const allowedThemeTokenPrefixes = ["--glyphary-", "--syntax-"];

function contextFromUrl(): TidbitCaptureContext {
  const params = new URLSearchParams(window.location.search);

  return {
    root: params.get("root") ?? "",
    pathPattern: params.get("pathPattern") ?? defaultTidbitPathPattern,
  };
}

function readPersistedAppearance(): AppearanceMode {
  const stored = window.localStorage.getItem(appearanceStorageKey);

  return stored === "light" || stored === "dark" || stored === "auto" ? stored : "auto";
}

function resolveAppearance(appearance: AppearanceMode): Exclude<AppearanceMode, "auto"> {
  if (appearance !== "auto") {
    return appearance;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function normalizeCaptureThemeTokens(tokens: Record<string, string> | undefined | null) {
  const normalized: Record<string, string> = {};

  for (const [token, value] of Object.entries(tokens ?? {})) {
    const cleanValue = value.trim();

    if (
      allowedThemeTokenPrefixes.some((prefix) => token.startsWith(prefix)) &&
      cleanValue
    ) {
      normalized[token] = cleanValue;
    }
  }

  return normalized;
}

function applyCaptureAppearance(appearance: AppearanceMode) {
  const resolvedAppearance = resolveAppearance(appearance);
  const targets = [document.documentElement, document.body];

  document.documentElement.dataset.theme = appearance;
  document.documentElement.dataset.resolvedTheme = resolvedAppearance;
  document.documentElement.style.colorScheme =
    appearance === "auto" ? "light dark" : appearance;

  for (const target of targets) {
    target.classList.toggle("theme-light", resolvedAppearance === "light");
    target.classList.toggle("theme-dark", resolvedAppearance === "dark");
  }

  void getCurrentWindow().setTheme(resolvedAppearance);
}

function applyCaptureGlassSettings(settings: VaultSettings["appearance"] | undefined | null) {
  // The Rust settings payload only persists the glass fields today. The shared
  // normalizer still supplies defaults for the broader appearance shape used by
  // the main window settings panel.
  const appearance = normalizeVaultAppearanceSettings(
    settings as VaultAppearanceSettings | null | undefined,
  );

  document.documentElement.dataset.windowGlass = appearance.glassEffect ? "enabled" : "disabled";
  document.documentElement.style.setProperty(
    "--glyphary-glass-opacity",
    String(appearance.glassOpacity),
  );
}

function tidbitDirectory(relativePath: string) {
  const slashIndex = relativePath.lastIndexOf("/");

  return slashIndex >= 0 ? relativePath.slice(0, slashIndex) : "";
}

function tidbitFileName(relativePath: string) {
  const slashIndex = relativePath.lastIndexOf("/");

  return slashIndex >= 0 ? relativePath.slice(slashIndex + 1) : relativePath;
}

function tidbitDisplayName(relativePath: string) {
  return tidbitFileName(relativePath).replace(/\.md$/i, "");
}

function normalizeTidbitNameDraft(nameDraft: string, fallbackName: string) {
  const draftFileName = tidbitFileName(nameDraft.trim());
  const fallbackFileName = tidbitFileName(fallbackName);
  const fileName =
    draftFileName.replace(/\.md$/i, "").trim() ? draftFileName : fallbackFileName;

  return fileName.toLowerCase().endsWith(".md") ? fileName : `${fileName}.md`;
}

function tidbitRelativePathFromName(relativePath: string, nameDraft: string) {
  const directory = tidbitDirectory(relativePath);
  const fileName = normalizeTidbitNameDraft(nameDraft, tidbitFileName(relativePath));

  return directory ? `${directory}/${fileName}` : fileName;
}

export default function TidbitCapture() {
  const [context, setContext] = useState(contextFromUrl);
  const [status, setStatus] = useState("Ready");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [nameEditing, setNameEditing] = useState(false);
  const relativePath = useMemo(
    () => expandDateTemplate(context.pathPattern || defaultTidbitPathPattern),
    [context.pathPattern],
  );
  const [nameDraft, setNameDraft] = useState(() => tidbitDisplayName(relativePath));
  const saveRelativePath = tidbitRelativePathFromName(relativePath, nameDraft);
  const editor = useEditor({
    extensions: [
      StarterKit,
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
      Markdown.configure({
        markedOptions: { gfm: true },
      }),
    ],
    content: "",
    contentType: "markdown",
    editorProps: {
      attributes: {
        "aria-label": "Tidbit capture editor",
        spellcheck: "false",
      },
    },
    onUpdate: () => setDirty(true),
  });

  useEffect(() => {
    let removeListener: (() => void) | null = null;
    let cancelled = false;

    void listen<TidbitCaptureContext>("tidbit-capture-context", (event) => {
      setContext({
        root: event.payload.root,
        pathPattern: event.payload.pathPattern || defaultTidbitPathPattern,
      });
    }).then((unlisten) => {
      if (cancelled) {
        unlisten();
        return;
      }

      removeListener = unlisten;
    });

    return () => {
      cancelled = true;
      removeListener?.();
    };
  }, []);

  useEffect(() => {
    editor?.commands.focus("end");
  }, [editor]);

  useEffect(() => {
    setNameDraft(tidbitDisplayName(relativePath));
    setNameEditing(false);
  }, [relativePath]);

  useEffect(() => {
    const appearance = readPersistedAppearance();
    const colorSchemeQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const syncAppearance = () => applyCaptureAppearance(appearance);

    syncAppearance();

    if (appearance !== "auto") {
      return;
    }

    colorSchemeQuery.addEventListener("change", syncAppearance);

    return () => {
      colorSchemeQuery.removeEventListener("change", syncAppearance);
    };
  }, []);

  useEffect(() => {
    if (!context.root) {
      return;
    }

    let cancelled = false;
    const appliedTokens = new Set<string>();

    async function applyVaultTheme() {
      try {
        const settings = await invoke<VaultSettings>("read_vault_settings", {
          root: context.root,
        });
        const tokens = normalizeCaptureThemeTokens(settings.theme?.tokens);

        if (cancelled) {
          return;
        }

        applyCaptureGlassSettings(settings.appearance);

        for (const [token, value] of Object.entries(tokens)) {
          document.documentElement.style.setProperty(token, value);
          appliedTokens.add(token);
        }
      } catch (error) {
        if (!cancelled) {
          setStatus(error instanceof Error ? error.message : String(error));
        }
      }
    }

    void applyVaultTheme();

    return () => {
      cancelled = true;

      for (const token of appliedTokens) {
        document.documentElement.style.removeProperty(token);
      }
    };
  }, [context.root]);

  async function closeWindow() {
    if (dirty && !window.confirm("Close this tidbit without saving?")) {
      return;
    }

    try {
      await getCurrentWindow().close();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function saveTidbit() {
    if (!context.root || !editor || saving) {
      return;
    }

    try {
      setSaving(true);
      setStatus("Saving...");
      const file = await invoke<OpenedFile>("create_vault_markdown_file", {
        root: context.root,
        relative: saveRelativePath,
      });
      const content = editor.getMarkdown();

      await invoke("write_vault_file", {
        root: context.root,
        relative: file.relativePath,
        content,
      });
      const savedFile = {
        ...file,
        content,
      };

      await emitTo("main", "tidbit-capture-created", savedFile);
      try {
        await getCurrentWindow().close();
      } catch (error) {
        setStatus(error instanceof Error ? error.message : String(error));
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();

      if (nameEditing) {
        setNameDraft(tidbitDisplayName(relativePath));
        setNameEditing(false);
        return;
      }

      void closeWindow();
      return;
    }

    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void saveTidbit();
    }
  }

  return (
    <main className="tidbit-capture" onKeyDownCapture={handleKeyDown}>
      <header className="tidbit-capture-header">
        <div>
          <h1>New Tidbit</h1>
          {nameEditing ? (
            <input
              aria-label="Tidbit name"
              autoFocus
              disabled={!context.root || saving}
              spellCheck="false"
              value={nameDraft}
              onBlur={() => {
                setNameDraft((currentName) =>
                  normalizeTidbitNameDraft(currentName, tidbitDisplayName(relativePath)).replace(
                    /\.md$/i,
                    "",
                  ),
                );
                setNameEditing(false);
              }}
              onChange={(event) => {
                setNameDraft(event.currentTarget.value);
                setDirty(true);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.currentTarget.blur();
                }
              }}
            />
          ) : (
            <button
              className="tidbit-capture-path"
              disabled={!context.root || saving}
              type="button"
              title="Double-click to rename before saving"
              onDoubleClick={() => setNameEditing(true)}
            >
              {context.root ? tidbitDisplayName(saveRelativePath) : "No vault available"}
            </button>
          )}
        </div>
      </header>
      <section className="tidbit-capture-editor" aria-label="Tidbit editor">
        <EditorContent editor={editor} />
      </section>
      <footer className="tidbit-capture-footer">
        <span>{status}</span>
        <div className="tidbit-capture-actions">
          <button type="button" onClick={() => void closeWindow()}>
            Cancel
          </button>
          <button
            type="button"
            className="primary"
            disabled={!context.root || !editor || saving}
            onClick={() => void saveTidbit()}
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </footer>
    </main>
  );
}
