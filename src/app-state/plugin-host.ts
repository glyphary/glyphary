import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import type { Editor } from "@tiptap/core";
import type { ActiveFile } from "../lib/app-types";
import type {
  PluginCatalog,
  PluginCommandManifest,
  PluginManifest,
  PluginSettings,
  PluginStyleContent,
} from "../lib/app-types";
import { normalizePluginSettings } from "../lib/settings";
import { currentSelectionText, insertMarkdownAtCursor } from "../editor/commands";
import type { PluginCodeBlockRendering } from "../editor/code-block-renderers";
import { splitMetaHeader } from "../lib/markdown";
import { noteLocked } from "../lib/note-lock";
import {
  isPluginNotePath,
  pluginHostNote,
  pluginHostRuntime,
  pluginSettingValues,
  runPluginHostCall,
  type PluginHostAction,
  type PluginHostEvent,
  type PluginHostRequest,
} from "../lib/plugin-host";
import { runWasmTransform } from "../plugins/run-wasm";
import {
  listVaultMarkdownFiles,
  readVaultFile,
  searchVaultFiles,
  writeVaultFile,
} from "../vault/persistence";

// Responsibilities:
// - Own everything plugins do at runtime: discovery and stylesheets, palette
//   commands of both runtimes, and for `glyphary-wasm-host@1` the calls into
//   the module, vault requests, save/open events, drawer panels, and rendered
//   code blocks.
// Contracts:
// - `lib/plugin-host` has already checked every host request and action
//   against the manifest permissions. This module only carries them out.
// - App supplies editor and tab access through `deps`; nothing here reaches
//   into App state directly.

type PluginHostDeps = {
  /** False in the Settings and task board windows, which host no plugins. */
  active: boolean;
  pluginCatalog: PluginCatalog;
  /** The unsaved Settings draft, so enabling a plugin previews it before Save. */
  pluginDraft: PluginSettings;
  vaultRootRef: MutableRefObject<string>;
  activeFileRef: MutableRefObject<ActiveFile | null>;
  /** The editor of the active tab, or null when that tab is not Markdown. */
  getActiveMarkdownEditor: () => Editor | null;
  getEditors: () => Editor[];
  hasUnsavedEdits: (relativePath: string) => boolean;
  reloadOpenTab: (relativePath: string) => Promise<void>;
  notifyVaultChanged: (root: string) => void;
  openFile: (relativePath: string) => void;
  openWikiLinkTarget: (target: string) => void;
  replaceDocument: (markdown: string) => void;
  setPluginCatalog: (catalog: PluginCatalog) => void;
  setPluginStyles: (styles: PluginStyleContent[]) => void;
  setStatus: (message: string) => void;
};

async function fulfilRequest(root: string, request: PluginHostRequest) {
  if (request.type === "readNote") {
    const file = await readVaultFile(root, request.path);

    return { path: file.relativePath, markdown: file.content };
  }

  if (request.type === "listNotes") {
    return (await listVaultMarkdownFiles(root))
      .filter((file) => isPluginNotePath(file.relativePath))
      .map((file) => ({ path: file.relativePath, name: file.name }));
  }

  // The backend search takes a regular expression; plugins get a literal one.
  const literal = request.query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const results = await searchVaultFiles(root, literal, {
    includeContent: true,
    markdownOnly: true,
    excludeDotPaths: true,
  });

  return results
    .filter((result) => isPluginNotePath(result.relativePath))
    .slice(0, 200)
    .map((result) => ({
      path: result.relativePath,
      line: result.lineNumber ?? null,
      text: result.lineText ?? "",
    }));
}

export function usePluginHost(deps: PluginHostDeps) {
  const [panelRevision, setPanelRevision] = useState(0);
  const [panelKey, setPanelKey] = useState("");
  const renderRevisionRef = useRef(0);
  // The editor and deferred callbacks outlive the render that created them,
  // so they reach the current plugin list and deps through these refs.
  const codeBlocksRef = useRef<PluginCodeBlockRendering | null>(null);
  const emitRef = useRef<(event: "save" | "open") => void>(() => undefined);
  const stable = useRef({
    emit: (event: "save" | "open") => emitRef.current(event),
    codeBlocks: () => codeBlocksRef.current,
  }).current;

  const hostPlugins = deps.active
    ? deps.pluginCatalog.plugins.filter(
        (plugin) =>
          plugin.runtime === pluginHostRuntime && deps.pluginDraft.enabled.includes(plugin.id),
      )
    : [];
  const panels = hostPlugins.flatMap((plugin) =>
    (plugin.panels ?? []).map((panel) => ({ key: `${plugin.id}:${panel.id}`, plugin, panel })),
  );
  const activePanel = panels.find((entry) => entry.key === panelKey) ?? panels[0] ?? null;
  const rendererFor = (language: string) =>
    hostPlugins.find((plugin) => plugin.renderers?.includes(language));

  function openNote(target: string) {
    if (isPluginNotePath(target)) {
      deps.openFile(target);
    } else {
      deps.openWikiLinkTarget(target);
    }
  }

  async function runCommandById(plugin: PluginManifest | undefined, commandId: string) {
    const command = plugin?.commands.find((candidate) => candidate.id === commandId);

    if (plugin && command) {
      await runCommand(plugin, command);
    }
  }

  async function writeNote(root: string, plugin: PluginManifest, path: string, markdown: string) {
    const existing = await readVaultFile(root, path).catch(() => null);
    const parts = existing ? splitMetaHeader(existing.content) : null;

    // A plugin gets no more say over a note than the editor would: locked
    // notes stay locked, and unsaved edits in a tab are never overwritten.
    if (parts && noteLocked(parts.metaHeader, parts.metaDelimiter)) {
      throw new Error(`Plugin ${plugin.name} cannot write locked note ${path}`);
    }

    if (deps.hasUnsavedEdits(path)) {
      throw new Error(`Plugin ${plugin.name} cannot write ${path}: unsaved edits`);
    }

    await writeVaultFile(root, path, markdown);
    deps.notifyVaultChanged(root);
    await deps.reloadOpenTab(path);
  }

  function applyToEditor(
    editor: Editor,
    mode: "replaceSelection" | "insertAtCursor" | "replaceDocument",
    markdown: string,
  ) {
    if (mode === "replaceDocument") {
      deps.replaceDocument(markdown);
      return;
    }

    if (mode === "insertAtCursor") {
      // Collapse to the end so the insertion follows a selection instead of
      // replacing it.
      editor.chain().focus().setTextSelection(editor.state.selection.to).run();
    }

    insertMarkdownAtCursor(editor, markdown);
  }

  async function applyAction(
    root: string,
    plugin: PluginManifest,
    action: PluginHostAction,
    editor: Editor | null,
  ) {
    switch (action.type) {
      case "status":
        deps.setStatus(action.message);
        return;
      case "openNote":
        deps.openFile(action.path);
        return;
      case "writeNote":
        await writeNote(root, plugin, action.path, action.markdown);
        return;
      default:
        if (editor) {
          applyToEditor(editor, action.type, action.markdown);
        }
    }
  }

  /** One call into a plugin. Returns the panel Markdown, when it produced any. */
  async function run(plugin: PluginManifest, event: PluginHostEvent, id: string, source?: string) {
    const root = deps.vaultRootRef.current;

    if (!root || !plugin.module) {
      return null;
    }

    const bytes = new Uint8Array(
      await invoke<number[]>("read_plugin_wasm", {
        root,
        pluginId: plugin.id,
        module: plugin.module,
      }),
    );
    // Read after the await and through refs: an open event arrives before React
    // has re-rendered, when render-time values still describe the previous note.
    const file = deps.activeFileRef.current;
    const editor = deps.getActiveMarkdownEditor();
    const note = pluginHostNote(
      plugin.permissions,
      file && editor
        ? {
            path: file.relativePath,
            markdown: editor.getMarkdown(),
            selection: currentSelectionText(editor),
          }
        : null,
    );
    const { actions, panel } = await runPluginHostCall({
      permissions: plugin.permissions,
      event,
      id,
      note,
      source,
      settings: pluginSettingValues(plugin.settings, deps.pluginDraft.values?.[plugin.id]),
      transform: (input) =>
        runWasmTransform(plugin.id, id, plugin.timeoutMs ?? 750, bytes, input),
      fulfil: (request) => fulfilRequest(root, request),
    });

    for (const action of actions) {
      await applyAction(root, plugin, action, note ? editor : null);
    }

    return panel;
  }

  async function runTransformCommand(
    root: string,
    plugin: PluginManifest,
    command: PluginCommandManifest,
    editor: Editor,
  ) {
    const wasm = command.wasm;

    if (!wasm) {
      return;
    }

    const bytes = await invoke<number[]>("read_plugin_wasm", {
      root,
      pluginId: plugin.id,
      module: wasm.module,
    });
    const input = wasm.input === "document" ? editor.getMarkdown() : currentSelectionText(editor);

    applyToEditor(
      editor,
      wasm.output,
      await runWasmTransform(plugin.id, command.id, wasm.timeoutMs, new Uint8Array(bytes), input),
    );
  }

  /** Runs a palette command. A manifest action wins over the host module. */
  async function runCommand(plugin: PluginManifest, command: PluginCommandManifest) {
    const root = deps.vaultRootRef.current;
    const editor = deps.getActiveMarkdownEditor();

    if (!editor) {
      return;
    }

    if (!root) {
      deps.setStatus("Open a vault before running plugin commands");
      return;
    }

    try {
      if (command.insertMarkdown) {
        insertMarkdownAtCursor(editor, command.insertMarkdown);
        deps.setStatus(`Ran plugin command: ${command.title}`);
        return;
      }

      if (command.template) {
        const template = await invoke<string>("read_plugin_template", {
          root,
          pluginId: plugin.id,
          template: command.template,
        });

        insertMarkdownAtCursor(editor, template);
        deps.setStatus(`Inserted template from ${plugin.name}`);
        return;
      }

      if (command.wasm) {
        await runTransformCommand(root, plugin, command, editor);
        deps.setStatus(`Ran WASM plugin command: ${command.title}`);
        return;
      }

      if (plugin.runtime === pluginHostRuntime) {
        deps.setStatus(`Ran plugin command: ${command.title}`);
        await run(plugin, "command", command.id);
      }
    } catch (error) {
      deps.setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  /** Reloads the plugin list and the stylesheets of the enabled plugins. */
  async function refresh(root: string, settings: PluginSettings) {
    if (!root || !isTauri()) {
      deps.setPluginCatalog({ plugins: [], errors: [] });
      deps.setPluginStyles([]);
      return;
    }

    // Discovery and style loading are separate backend calls by design: invalid
    // plugins remain visible as catalog errors, while only enabled plugins may
    // inject CSS into the running editor.
    const [catalog, styles] = await Promise.all([
      invoke<PluginCatalog>("list_vault_plugins", { root }),
      invoke<PluginStyleContent[]>("read_plugin_styles", {
        root,
        enabled: normalizePluginSettings(settings).enabled,
      }),
    ]);

    deps.setPluginCatalog(catalog);
    deps.setPluginStyles(styles);
  }

  function redrawCodeBlocks() {
    // Rendered code blocks are keyed by this revision. An empty transaction
    // makes each editor recompute its decorations, which rebuilds the widgets.
    renderRevisionRef.current += 1;

    for (const editor of deps.getEditors()) {
      editor.view.dispatch(editor.state.tr.setMeta("pluginRender", true));
    }
  }

  /** Tells subscribed plugins about a save or a note switch and redraws their output. */
  function emit(event: "save" | "open") {
    if (hostPlugins.length === 0) {
      return;
    }

    for (const plugin of hostPlugins) {
      if (plugin.events?.includes(event) && deps.activeFileRef.current) {
        // A failing plugin is reported and never blocks the save or the switch.
        run(plugin, event, event).catch((error) =>
          deps.setStatus(error instanceof Error ? error.message : String(error)),
        );
      }
    }

    setPanelRevision((revision) => revision + 1);
    redrawCodeBlocks();
  }

  emitRef.current = emit;
  codeBlocksRef.current = {
    languages: () => hostPlugins.flatMap((plugin) => plugin.renderers ?? []),
    revision: () => renderRevisionRef.current,
    render: async (language, source) => {
      const plugin = rendererFor(language);

      return plugin ? ((await run(plugin, "render", language, source)) ?? "") : "";
    },
    onOpenNote: openNote,
    onCommand: (language, commandId) => void runCommandById(rendererFor(language), commandId),
  };

  // A plugin that was just enabled, or whose settings changed, is shown the
  // note that is already open.
  const signature = JSON.stringify([
    hostPlugins.map((plugin) => [plugin.id, plugin.version]),
    deps.pluginDraft.values,
  ]);

  useEffect(() => {
    emitRef.current("open");
  }, [signature]);

  return {
    panels,
    activePanel,
    panelRevision,
    selectPanel: setPanelKey,
    loadActivePanel: () =>
      activePanel ? run(activePanel.plugin, "panel", activePanel.panel.id) : Promise.resolve(null),
    runActivePanelCommand: (commandId: string) => runCommandById(activePanel?.plugin, commandId),
    runCommand,
    refresh,
    openNote,
    /** Stable across renders, safe to hand to the editor and to deferred callbacks. */
    emit: stable.emit,
    codeBlocks: stable.codeBlocks,
  };
}
