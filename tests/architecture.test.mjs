import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import {
  defaultDrawerOpen,
  defaultExcalidrawDirectory,
  defaultFrontmatterPillHeader,
  defaultInspectorDrawerWidth,
  defaultVaultDrawerWidth,
  defaultVaultDrawerOpen,
  defaultVaultAssetDirectory,
  defaultVaultImageDirectory,
  defaultTidbitGlobalShortcut,
  defaultTidbitPathPattern,
  emptyCalloutMarkdown,
  emptyCollapseMarkdown,
  emptyColumnsMarkdown,
  emptyHtmlBlockMarkdown,
  emptyTableMarkdown,
  maxRecentFiles,
} from "../.test-dist/defaults.js";
import {
  createGlypharyMarked,
  splitGfmTableRow,
} from "../.test-dist/markdown-table.js";

test("default drawer and vault asset settings match the current product defaults", () => {
  assert.equal(defaultDrawerOpen, false);
  assert.equal(defaultVaultDrawerOpen, true);
  assert.equal(defaultVaultAssetDirectory, "_assets_");
  assert.equal(defaultVaultImageDirectory, "_assets_/images");
  assert.equal(defaultVaultDrawerWidth, 320);
  assert.equal(defaultInspectorDrawerWidth, 360);
});

test("tauri backend modules document their responsibilities and contracts", () => {
  function rustFilesUnder(directory) {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const path = `${directory}/${entry.name}`;

      if (entry.isDirectory()) {
        return rustFilesUnder(path);
      }

      return entry.name.endsWith(".rs") ? [path] : [];
    });
  }

  const rustFiles = rustFilesUnder("src-tauri/src");
  const backend = readFileSync("src-tauri/src/lib.rs", "utf8");
  const searchBackend = readFileSync("src-tauri/src/search.rs", "utf8");

  for (const file of rustFiles) {
    const source = readFileSync(file, "utf8");

    assert.match(source, /^\/\/! /, `${file} should start with module docs`);
    assert.match(source, /\/\/! Responsibilities:/, `${file} should document responsibilities`);
    assert.match(source, /\/\/! Contracts:/, `${file} should document contracts`);
  }

  assert.match(backend, /mod defaults;/);
  assert.match(backend, /mod models;/);
  assert.match(backend, /#\[cfg\(test\)\]\nmod tests;/);
  assert.doesNotMatch(backend, /mod tests \{/);
  assert.doesNotMatch(rustFiles.join("\n"), /src-tauri\/src\/tests\.rs/);
  assert.ok(rustFiles.includes("src-tauri/src/tests/mod.rs"));
  assert.match(searchBackend, /RegexMatcherBuilder/);
  assert.match(searchBackend, /SearcherBuilder/);
  assert.match(searchBackend, /BinaryDetection::quit/);
  assert.doesNotMatch(searchBackend, /Command::new\("rg"\)/);
});

test("frontend pure logic is split into documented helper modules", () => {
  const helperFiles = readdirSync("src/lib")
    .filter((file) => file.endsWith(".ts"))
    .map((file) => `src/lib/${file}`);
  const app = readFileSync("src/App.tsx", "utf8");
  const paletteDefinitions = readFileSync("src/command-palette/command-definitions.ts", "utf8");

  assert.ok(helperFiles.length >= 8);

  for (const file of helperFiles) {
    const source = readFileSync(file, "utf8");

    assert.match(source, /^\/\*\*/, `${file} should start with a module header`);
    assert.match(source, /Responsibilities:/, `${file} should document responsibilities`);
    assert.match(source, /Contracts:/, `${file} should document contracts`);
  }

  assert.match(app, /from "\.\/lib\/markdown"/);
  assert.match(app, /from "\.\/lib\/settings"/);
  assert.doesNotMatch(app, /from "\.\/logic"/);
});

test("documentation website introduces core Glyphary workflows", () => {
  const html = readFileSync("docs-site/glyphary.html", "utf8");
  const redirect = readFileSync("docs-site/index.html", "utf8");
  const manualHtml = readFileSync("docs-manual/index.html", "utf8");
  const manualTheming = readFileSync("docs-manual/theming.html", "utf8");
  const manualPlugins = readFileSync("docs-manual/plugins.html", "utf8");
  const manualCss = readFileSync("docs-manual/styles.css", "utf8");
  const manualScript = readFileSync("docs-manual/script.js", "utf8");
  const css = readFileSync("docs-site/styles.css", "utf8");
  const script = readFileSync("docs-site/script.js", "utf8");
  const screenshots = readFileSync("docs-site/screenshots.md", "utf8");
  const makefile = readFileSync("Makefile", "utf8");

  assert.match(html, /Glyphary \| VoilaWeb/);
  assert.match(html, /Your vault, made visible/);
  assert.match(html, /VoilaWeb/);
  assert.match(html, /Three steps from folder to workspace/);
  assert.match(html, /Rich editing without giving up Markdown/);
  assert.match(html, /Base views/);
  assert.match(html, /Reveal in Finder/);
  assert.match(html, /YouTube thumbnails/);
  assert.match(html, /page\s+banners/);
  assert.match(html, /Configure Cmd\+T to open a chosen note/);
  assert.match(html, /View mode hides editor chrome/);
  assert.match(html, /⌘P/);
  assert.match(html, /⌘T/);
  assert.match(html, /⌘⇧V/);
  assert.match(html, /assets\/screenshots\/main-workspace\.png/);
  assert.match(html, /assets\/screenshots\/split-editing\.png/);
  assert.match(css, /\.navbar/);
  assert.match(css, /\.glass-card/);
  assert.match(css, /\.masonry/);
  assert.match(css, /@media \(max-width: 960px\)/);
  assert.match(script, /screenshotImages/);
  assert.match(redirect, /url=\.\/glyphary\.html/);
  assert.match(manualHtml, /Glyphary User Manual/);
  assert.match(manualHtml, /href="https:\/\/github\.com\/glyphary\/glyphary"/);
  assert.match(manualHtml, /href="\.\/theming\.html"/);
  assert.match(manualHtml, /href="\.\/plugins\.html"/);
  assert.doesNotMatch(manualHtml, /href="\.\.\/docs-site\/glyphary\.html"/);
  assert.doesNotMatch(manualHtml, /href="\.\.\/docs\/theming\.md"/);
  assert.doesNotMatch(manualHtml, /href="\.\.\/docs\/plugins\.md"/);
  assert.match(manualHtml, /Open A Vault/);
  assert.match(manualHtml, /Install Glyphary/);
  assert.match(manualHtml, /https:\/\/github\.com\/glyphary\/glyphary\/releases/);
  assert.match(manualHtml, /Download the macOS <code>\.dmg<\/code>/);
  assert.match(manualHtml, /Download the Windows installer/);
  assert.match(manualHtml, /Windows SmartScreen/);
  assert.match(manualHtml, /File And Folder Actions/);
  assert.match(manualHtml, /Create canvas/);
  assert.match(manualHtml, /Rename file or canvas/);
  assert.match(manualHtml, /Reveal in Finder/);
  assert.match(manualHtml, /Base Files/);
  assert.match(manualHtml, /database-style views/);
  assert.match(manualHtml, /YouTube URLs used\s+as Markdown images render as thumbnails/);
  assert.match(manualHtml, /Search results are grouped by file/);
  assert.match(manualHtml, /count, and are sorted from the most recently modified page/);
  assert.match(manualHtml, /Command Palette/);
  assert.match(manualHtml, /Wrap selected text as keyboard keys, strikethrough, highlight, superscript, or subscript Markdown/);
  assert.match(manualHtml, /AI Actions/);
  assert.match(manualHtml, /OpenAI-compatible backend/);
  assert.match(manualHtml, /Refresh Models/);
  assert.match(manualHtml, /Test API/);
  assert.match(manualHtml, /Improve writing/);
  assert.match(manualHtml, /Fix spelling and grammar/);
  assert.match(manualHtml, /Replace Selection/);
  assert.match(manualHtml, /Insert Below/);
  assert.match(manualHtml, /AI Builder/);
  assert.match(manualHtml, /\.\/assets\/screenshots\/ai-builder\.png/);
  assert.match(manualHtml, /Summarize all pages pertaining to opensips/);
  assert.match(manualHtml, /local bounded retrieval/);
  assert.match(manualHtml, /does not send the whole vault/);
  assert.match(manualHtml, /Metadata And Frontmatter/);
  assert.match(manualHtml, /banner: '!\[\[Pasted image 20230521183520\.png\]\]'/);
  assert.match(manualHtml, /View\/Edit icon selector/);
  assert.match(manualHtml, /Configure <strong>New Tab<\/strong>/);
  assert.match(manualHtml, /Markdown Reference/);
  assert.match(manualHtml, /Glyphary Markdown support is extension-driven/);
  assert.match(manualHtml, /<code>~~strikethrough~~<\/code>/);
  assert.match(manualHtml, /<code>==highlight==<\/code>/);
  assert.match(manualHtml, /<code>\^superscript\^<\/code>/);
  assert.match(manualHtml, /<code>~subscript~<\/code>/);
  assert.match(manualHtml, /<code>&lt;kbd&gt;Cmd&lt;\/kbd&gt;<\/code>/);
  assert.match(manualHtml, /\| :--- \| -----: \|/);
  assert.match(manualHtml, /right-click a table to use the same row\s+and column commands/);
  assert.match(manualHtml, /<strong>Align column\.\.\.<\/strong>/);
  assert.match(manualHtml, /rendered Mermaid diagrams from <code>mermaid<\/code> fences/);
  assert.match(manualHtml, /\[\[Page Name\|Display text\]\]/);
  assert.match(manualHtml, /attribute-list syntax such as <code>\{align=right\}<\/code>/);
  assert.match(manualHtml, /::: gallery/);
  assert.match(manualHtml, /::: rich-link/);
  assert.match(manualHtml, /Excalidraw drawings/);
  assert.match(manualHtml, /Tidbits/);
  assert.match(manualHtml, /Global tidbit capture/);
  assert.match(manualHtml, /Tasks scans visible Markdown files/);
  assert.match(manualHtml, /same grep crates that power ripgrep-style matching/);
  assert.match(manualHtml, /The results list shows one\s+row per file, reports how many matches/);
  assert.match(manualHtml, /HTML blocks/);
  assert.match(manualHtml, /renders a sanitized preview/);
  assert.match(manualHtml, /Canvas Files/);
  assert.match(manualHtml, /\.\/assets\/screenshots\/canvas\.png/);
  assert.match(manualHtml, /connected-node file icon/);
  assert.match(manualHtml, /Add Note From Vault/);
  assert.match(manualHtml, /Cmd\+Enter/);
  assert.match(manualHtml, /Delete Node/);
  assert.match(manualHtml, /unknown JSON Canvas\s+fields/);
  assert.match(manualHtml, /AI Builder keeps a per-file conversation history/);
  assert.match(manualHtml, /Generated images and assets/);
  assert.match(manualHtml, /Double-click an image/);
  assert.match(
    manualHtml,
    /asks for accessibility permission only when this\s+feature is enabled/,
  );
  assert.match(manualHtml, /Settings tabs/);
  assert.match(manualHtml, /New Tab file/);
  assert.match(manualHtml, /Cmd\+Shift\+V/);
  assert.match(manualHtml, /glass opacity/);
  assert.match(manualHtml, /Optional editor treatments/);
  assert.match(manualHtml, /Theme Builder groups/);
  assert.match(manualHtml, /CSS snippets/);
  assert.match(manualHtml, /Minimal manifest/);
  assert.match(manualHtml, /glyphary-wasm-transform@1/);
  assert.match(manualHtml, /About And Debug/);
  assert.match(manualHtml, /Developers/);
  assert.match(manualHtml, /git clone https:\/\/github\.com\/glyphary\/glyphary\.git/);
  assert.match(manualHtml, /make install/);
  assert.match(manualHtml, /make dev/);
  assert.match(manualHtml, /make check/);
  assert.match(manualHtml, /Vim Mode/);
  assert.match(manualHtml, /Troubleshooting/);
  assert.match(manualHtml, /\.\/assets\/screenshots\/main-workspace\.png/);
  assert.match(manualHtml, /\.\/assets\/screenshots\/columns\.png/);
  assert.match(manualHtml, /\.\/assets\/screenshots\/callouts\.png/);
  assert.match(manualHtml, /\.\/assets\/screenshots\/collapse\.png/);
  assert.match(manualHtml, /\.\/assets\/screenshots\/rich-links\.png/);
  assert.match(manualHtml, /Plain text, Python, Shell, JavaScript, TypeScript/);
  assert.match(manualHtml, /Insert table of contents/);
  assert.match(manualHtml, /_assets_\/drawings/);
  assert.match(manualHtml, /_assets_\/images/);
  assert.match(manualHtml, /_snippets_/);
  assert.doesNotMatch(manualHtml, /not for rendering live embedded HTML inside the note/);
  assert.doesNotMatch(manualHtml, /\.\.\/docs-site\/assets/);
  assert.match(manualTheming, /Glyphary Theming Reference/);
  assert.match(manualTheming, /Loading Snippets/);
  assert.match(manualTheming, /Stable Glyphary Variables/);
  assert.match(manualTheming, /Obsidian Compatibility Variables/);
  assert.match(manualTheming, /Supported Editor Selectors/);
  assert.match(manualTheming, /--glyphary-editor-max-width/);
  assert.match(manualTheming, /href="https:\/\/github\.com\/glyphary\/glyphary"/);
  assert.match(manualTheming, /href="\.\/plugins\.html"/);
  assert.match(manualTheming, /href="\.\/index\.html"/);
  assert.match(manualPlugins, /Glyphary Plugin Authoring/);
  assert.match(manualPlugins, /Plugin Location/);
  assert.match(manualPlugins, /Manifest/);
  assert.match(manualPlugins, /WASM Transform ABI/);
  assert.match(manualPlugins, /glyphary-wasm-transform@1/);
  assert.match(manualPlugins, /examples\/plugins\/uppercase_selection_rust/);
  assert.match(manualPlugins, /href="https:\/\/github\.com\/glyphary\/glyphary"/);
  assert.match(manualPlugins, /href="\.\/theming\.html"/);
  assert.match(manualPlugins, /href="\.\/index\.html"/);
  assert.match(manualCss, /\.manual-sidebar/);
  assert.match(manualCss, /\.feature-table/);
  assert.match(manualCss, /\.manual-toplinks a\.current/);
  assert.match(manualScript, /filterManualSections/);
  assert.match(screenshots, /Main workspace/);
  assert.match(screenshots, /Settings main tab/);
  assert.match(screenshots, /New Tab selector/);
  assert.match(screenshots, /docs-site\/assets\/screenshots\/main-workspace\.png/);
  assert.match(makefile, /^docs:/m);
  assert.match(makefile, /^docs-open:/m);
  assert.match(makefile, /^manual:/m);
  assert.match(makefile, /^manual-open:/m);
});

test("vault plugins are settings-gated and run commands through safe host paths", () => {
  const app = readFileSync("src/App.tsx", "utf8");
  const paletteDefinitions = readFileSync("src/command-palette/command-definitions.ts", "utf8");
  const settingsDialog = readFileSync("src/settings/SettingsDialog.tsx", "utf8");
  const appTypes = readFileSync("src/lib/app-types.ts", "utf8");
  const settings = readFileSync("src/lib/settings.ts", "utf8");
  const css = readFileSync("src/App.css", "utf8");
  const backend = readFileSync("src-tauri/src/lib.rs", "utf8");
  const defaultsBackend = readFileSync("src-tauri/src/defaults.rs", "utf8");
  const modelsBackend = readFileSync("src-tauri/src/models.rs", "utf8");
  const pathsBackend = readFileSync("src-tauri/src/paths.rs", "utf8");
  const pluginsBackend = readFileSync("src-tauri/src/plugins.rs", "utf8");
  const pluginTestsBackend = readFileSync("src-tauri/src/tests/plugins.rs", "utf8");
  const worker = readFileSync("src/pluginWorker.ts", "utf8");

  assert.match(appTypes, /export type PluginManifest/);
  assert.match(appTypes, /runtime: "glyphary-wasm-transform@1"/);
  assert.match(appTypes, /export type PluginWasmCommand/);
  assert.match(appTypes, /export type SettingsTab = "main" \| "appearance" \| "canvas" \| "plugins" \| "ai" \| "debug"/);
  assert.match(appTypes, /export type DebugSettings/);
  assert.match(appTypes, /debug\?: DebugSettings \| null/);
  assert.match(settings, /defaultDebugSettings: DebugSettings = \{\s*enabled: false,/);
  assert.match(settings, /function normalizeDebugSettings/);
  assert.match(settings, /function sameDebugSettings/);
  assert.match(app, /defaultPluginSettings/);
  assert.match(appTypes, /plugins\?: PluginSettings \| null/);
  assert.match(settings, /normalizePluginSettings/);
  assert.match(app, /refreshPlugins/);
  assert.match(app, /list_vault_plugins/);
  assert.match(app, /read_plugin_styles/);
  assert.match(app, /read_plugin_template/);
  assert.match(app, /read_plugin_wasm/);
  assert.match(app, /new Worker\(new URL\("\.\/pluginWorker\.ts", import\.meta\.url\)/);
  assert.match(app, /setTimeout\(\(\) => \{/);
  assert.match(app, /runWasmPluginTransform/);
  assert.match(paletteDefinitions, /pluginCommandPaletteCommands/);
  assert.match(paletteDefinitions, /id: `plugin:\$\{plugin\.id\}:\$\{command\.id\}`/);
  assert.match(app, /Open a vault before running plugin commands/);
  assert.match(settingsDialog, /settingsTab === "plugins"/);
  assert.match(settingsDialog, /settingsTab === "ai"/);
  assert.match(settingsDialog, /settingsTab === "debug"/);
  assert.match(settingsDialog, /Enable debug mode/);
  assert.match(settingsDialog, /Global Shortcut Diagnostics/);
  assert.match(settingsDialog, /aria-label="Plugin settings"/);
  assert.match(settingsDialog, /Enable vault plugins discovered under \.glyphary\/plugins/);
  assert.match(app, /data-glyphary-plugin-style/);
  assert.match(css, /\.plugin-list/);
  assert.match(css, /\.plugin-errors/);
  assert.match(modelsBackend, /pub\(crate\) struct PluginManifest/);
  assert.match(defaultsBackend, /PLUGIN_RUNTIME_WASM_TRANSFORM_V1: &str = "glyphary-wasm-transform@1"/);
  assert.match(pluginsBackend, /Unsupported plugin runtime/);
  assert.match(modelsBackend, /pub\(crate\) struct PluginWasmCommand/);
  assert.match(pluginsBackend, /pub\(crate\) fn list_vault_plugins/);
  assert.match(pluginsBackend, /pub\(crate\) fn read_plugin_styles/);
  assert.match(pluginsBackend, /pub\(crate\) fn read_plugin_template/);
  assert.match(pluginsBackend, /pub\(crate\) fn read_plugin_wasm/);
  assert.match(defaultsBackend, /PLUGIN_DIRECTORY: &str = "\.glyphary\/plugins"/);
  assert.match(defaultsBackend, /SETTINGS_DIRECTORY_NAME: &str = "\.glyphary"/);
  assert.match(defaultsBackend, /SETTINGS_CONFIG_FILE_NAME: &str = "config\.json"/);
  assert.match(pathsBackend, /pub\(crate\) fn vault_settings_path/);
  assert.match(pluginsBackend, /Unsupported plugin permission/);
  assert.match(pluginTestsBackend, /lists_plugins_and_reads_only_declared_plugin_assets/);
  assert.match(worker, /WASM plugin must export memory/);
  assert.match(worker, /WASM plugin must export alloc\(length\)/);
  assert.match(worker, /WASM plugin must export transform\(pointer, length\)/);
});

test("wikilinks use the vault filename index for navigation and insertion", () => {
  const app = readFileSync("src/App.tsx", "utf8");
  const paletteDefinitions = readFileSync("src/command-palette/command-definitions.ts", "utf8");
  const wikilinks = readFileSync("src/editor/wikilinks.ts", "utf8");
  const editorOptions = readFileSync("src/editor/editor-options.ts", "utf8");
  const tidbitCapture = readFileSync("src/TidbitCapture.tsx", "utf8");
  const wikiLinkState = readFileSync("src/app-state/wikilinks.ts", "utf8");
  const vaultPersistence = readFileSync("src/vault/persistence.ts", "utf8");
  const appTypes = readFileSync("src/lib/app-types.ts", "utf8");
  const css = readFileSync("src/App.css", "utf8");
  const backend = readFileSync("src-tauri/src/lib.rs", "utf8");
  const modelsBackend = readFileSync("src-tauri/src/models.rs", "utf8");
  const vaultTestsBackend = readFileSync("src-tauri/src/tests/vault.rs", "utf8");
  const vaultBackend = readFileSync("src-tauri/src/vault.rs", "utf8");

  assert.match(modelsBackend, /pub\(crate\) struct VaultIndexedFile/);
  assert.match(vaultBackend, /pub\(crate\) fn list_vault_markdown_files/);
  assert.match(vaultBackend, /pub\(crate\) fn walk_note_files/);
  assert.match(backend, /list_vault_markdown_files,/);
  assert.match(vaultTestsBackend, /lists_vault_markdown_files_for_wikilink_index/);
  assert.match(appTypes, /export type VaultIndexedFile/);
  assert.match(appTypes, /export type WikiLinkPickerState/);
  assert.match(editorOptions, /createWikiLinkExtension/);
  assert.match(editorOptions, /marked: createGlypharyMarked\(\)/);
  assert.match(tidbitCapture, /marked: createGlypharyMarked\(\)/);
  assert.match(wikilinks, /Responsibilities:/);
  assert.match(wikilinks, /Contracts:/);
  assert.match(wikilinks, /wikiLinkTokenPattern/);
  assert.match(wikilinks, /state\.selection\.\$from\.parent !== parent/);
  assert.match(wikilinks, /wikilink-hidden-syntax/);
  assert.match(wikilinks, /markup\.indexOf\("\|"\)/);
  assert.match(wikilinks, /\[\[Actual Page\|Shown Text\]\] -> Shown Text/);
  assert.match(wikilinks, /data-wikilink-target/);
  assert.match(wikiLinkState, /Responsibilities:/);
  assert.match(wikiLinkState, /Contracts:/);
  assert.match(wikiLinkState, /export function useWikiLinkState/);
  assert.match(wikiLinkState, /wikiLinkSearchSelectedIndex/);
  assert.match(wikiLinkState, /function addIndexedFile/);
  assert.match(wikiLinkState, /function replaceIndexedFile/);
  assert.match(wikiLinkState, /function removeIndexedFile/);
  assert.match(wikiLinkState, /function resolveWikiLinkTarget/);
  assert.match(app, /useWikiLinkState\(\)/);
  assert.match(app, /resolveWikiLinkTarget/);
  assert.match(app, /rebuildWikiLinkIndex/);
  assert.match(app, /setStatus\("Indexing\.\.\."\)/);
  assert.match(app, /listVaultMarkdownFiles\(root\)/);
  assert.match(vaultPersistence, /list_vault_markdown_files/);
  assert.match(app, /openWikiLinkSearchRef/);
  assert.match(app, /wikiLinkSearchOpen/);
  assert.match(app, /handleWikiLinkSearchKeyDown/);
  assert.match(app, /moveSelectableIndex\(index, filteredWikiLinkFiles\.length, 1\)/);
  assert.match(app, /moveSelectableIndex\(index, filteredWikiLinkFiles\.length, -1\)/);
  assert.match(app, /insertWikiLinkSelection/);
  assert.match(app, /tr\.insertText\(insertion\)/);
  assert.match(app, /setWikiLinkPicker/);
  assert.match(app, /wikiLinkPickerSelectedIndex/);
  assert.match(app, /openWikiLinkPickerSelection/);
  assert.match(app, /addFileToWikiLinkIndex/);
  assert.match(app, /replaceFileInWikiLinkIndex/);
  assert.match(app, /removeFileFromWikiLinkIndex/);
  assert.match(css, /\.editor-surface \.wikilink/);
  assert.match(css, /\.editor-surface \.wikilink-hidden-syntax/);
  assert.match(css, /\.wikilink-search-screen/);
  assert.match(css, /\.wikilink-picker/);
});

test("sample uppercase WASM plugin follows the transform ABI", async () => {
  const manifest = JSON.parse(
    readFileSync("examples/plugins/uppercase_selection/plugin.json", "utf8"),
  );
  const wasm = readFileSync("examples/plugins/uppercase_selection/plugin.wasm");
  const { instance } = await WebAssembly.instantiate(wasm, {});
  const exports = instance.exports;
  const input = new TextEncoder().encode("Hello, Glyphary plugin!");
  const inputPointer = exports.alloc(input.length);

  new Uint8Array(exports.memory.buffer, inputPointer, input.length).set(input);

  const outputPointer = exports.transform(inputPointer, input.length);
  const outputLength = new DataView(exports.memory.buffer).getUint32(outputPointer, true);
  const outputBytes = new Uint8Array(exports.memory.buffer, outputPointer + 4, outputLength);
  const output = new TextDecoder().decode(outputBytes);

  assert.equal(manifest.id, "uppercase_selection");
  assert.equal(manifest.runtime, "glyphary-wasm-transform@1");
  assert.equal(manifest.commands[0].wasm.module, "plugin.wasm");
  assert.equal(manifest.commands[0].wasm.input, "selection");
  assert.equal(manifest.commands[0].wasm.output, "replaceSelection");
  assert.equal(output, "HELLO, GLYPHARY PLUGIN!");
});

test("sample Rust WASM plugin follows the transform ABI", async () => {
  const manifest = JSON.parse(
    readFileSync("examples/plugins/uppercase_selection_rust/plugin.json", "utf8"),
  );
  const wasm = readFileSync("examples/plugins/uppercase_selection_rust/plugin.wasm");
  const { instance } = await WebAssembly.instantiate(wasm, {});
  const exports = instance.exports;
  const input = new TextEncoder().encode("Hello, Rust plugin!");
  const inputPointer = exports.alloc(input.length);

  new Uint8Array(exports.memory.buffer, inputPointer, input.length).set(input);

  const outputPointer = exports.transform(inputPointer, input.length);
  const outputLength = new DataView(exports.memory.buffer).getUint32(outputPointer, true);
  const outputBytes = new Uint8Array(exports.memory.buffer, outputPointer + 4, outputLength);
  const output = new TextDecoder().decode(outputBytes);

  assert.equal(manifest.id, "uppercase_selection_rust");
  assert.equal(manifest.runtime, "glyphary-wasm-transform@1");
  assert.equal(manifest.commands[0].wasm.module, "plugin.wasm");
  assert.equal(manifest.commands[0].wasm.input, "selection");
  assert.equal(manifest.commands[0].wasm.output, "replaceSelection");
  assert.equal(output, "HELLO, RUST PLUGIN!");
});
