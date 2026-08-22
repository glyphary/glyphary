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
  defaultFileDisplaySettings,
  normalizeFileDisplaySettings,
  normalizeStarredFiles,
  readPersistedVaultLibrary,
  readPersistedWorkspace,
  readPersistedWorkspaceForVault,
  removePersistedVaultLibraryEntry,
  updatePersistedVaultLibraryEntry,
  upsertPersistedVaultLibrary,
  vaultLibraryStorageKey,
  workspaceSessionsStorageKey,
  workspaceStorageKey,
  writePersistedWorkspace,
  shouldOpenDocumentOnClick,
} from "../.test-dist/settings.js";

test("motion layer keeps interface animations short and reduced-motion aware", () => {
  const app = readFileSync("src/App.tsx", "utf8");
  const css = readFileSync("src/App.css", "utf8");

  assert.match(css, /--glyphary-motion-duration-fast: 120ms/);
  assert.match(css, /--glyphary-motion-duration-base: 160ms/);
  assert.match(css, /--glyphary-motion-duration-slow: 180ms/);
  assert.match(css, /--glyphary-sidebar-motion-duration: 240ms/);
  assert.match(css, /--glyphary-sidebar-motion-ease: cubic-bezier\(0\.25, 0\.1, 0\.25, 1\)/);
  assert.match(css, /transition: grid-template-columns var\(--sidebar-motion-duration\) var\(--sidebar-motion-ease\)/);
  assert.match(css, /opacity var\(--sidebar-motion-duration\) var\(--sidebar-motion-ease\)/);
  assert.match(css, /animation: glyphary-pop-in var\(--motion-duration-base\) var\(--motion-ease\)/);
  assert.match(css, /@keyframes glyphary-status-update/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(app, /key=\{`\$\{calendarMonth\.getFullYear\(\)\}-\$\{calendarMonth\.getMonth\(\)\}`\}/);
  assert.match(app, /normalizedVaultAppearanceDraft\.statusBarVisible \? \(/);
  assert.match(app, /<footer className="statusbar" key=\{status\}>/);
  assert.match(css, /min-height: 14px/);
  assert.match(css, /--glyphary-shell-gap: 4px/);
  assert.doesNotMatch(css, /--glyphary-shell-gap: 20px/);
});

test("app css exposes the Obsidian theme compatibility surface", () => {
  const css = readFileSync("src/App.css", "utf8");
  const app = readFileSync("src/App.tsx", "utf8");
  const documentsState = readFileSync("src/app-state/documents.ts", "utf8");
  const editorPane = readFileSync("src/editor/EditorPane.tsx", "utf8");
  const editorOptions = readFileSync("src/editor/editor-options.ts", "utf8");
  const vaultImages = readFileSync("src/editor/vault-images.ts", "utf8");
  const appTypes = readFileSync("src/lib/app-types.ts", "utf8");
  const settings = readFileSync("src/lib/settings.ts", "utf8");
  const settingsDialog = readFileSync("src/settings/SettingsDialog.tsx", "utf8");
  const themeBuilderPanel = readFileSync("src/settings/ThemeBuilderPanel.tsx", "utf8");
  const themeOptions = readFileSync("src/settings/theme-options.ts", "utf8");
  const config = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8"));
  const backend = readFileSync("src-tauri/src/lib.rs", "utf8");
  const defaultsBackend = readFileSync("src-tauri/src/defaults.rs", "utf8");
  const modelsBackend = readFileSync("src-tauri/src/models.rs", "utf8");
  const nativeMenuBackend = readFileSync("src-tauri/src/native_menu.rs", "utf8");
  const snippetsBackend = readFileSync("src-tauri/src/snippets.rs", "utf8");
  const settingsTestsBackend = readFileSync("src-tauri/src/tests/settings.rs", "utf8");
  const themesBackend = readFileSync("src-tauri/src/themes.rs", "utf8");
  const windowingBackend = readFileSync("src-tauri/src/windowing.rs", "utf8");
  const cargo = readFileSync("src-tauri/Cargo.toml", "utf8");

  assert.match(css, /--background-primary:/);
  assert.match(css, /--font-editor: var\(--glyphary-font-editor\)/);
  assert.match(css, /max-width: var\(--glyphary-editor-max-width\)/);
  assert.match(css, /font-size: var\(--glyphary-editor-font-size\)/);
  assert.match(css, /line-height: var\(--glyphary-editor-line-height\)/);
  assert.match(css, /margin-top: var\(--glyphary-block-gap\)/);
  assert.match(css, /border-radius: var\(--radius-md\)/);
  assert.match(css, /tab-size: var\(--glyphary-code-tab-size\)/);
  assert.match(css, /--interactive-accent:/);
  assert.match(css, /--text-normal:/);
  assert.match(css, /--code-background:/);
  assert.match(css, /--blockquote-border-color:/);
  assert.match(app, /theme-dark/);
  assert.match(app, /theme-light/);
  assert.match(editorPane, /markdown-preview-view/);
  assert.match(settingsDialog, /<ThemeBuilderPanel/);
  assert.match(themeBuilderPanel, /Theme Builder/);
  assert.match(appTypes, /kind\?: "color" \| "value"/);
  assert.match(themeOptions, /defaultThemeLevelOneTokens/);
  assert.match(appTypes, /export type ThemePreset/);
  assert.match(themeOptions, /export const themePresets: ThemePreset\[\]/);
  const presetBlock = themeOptions.match(/export const themePresets: ThemePreset\[\] = \[([\s\S]*?)\];/)?.[1] ?? "";
  assert.equal((presetBlock.match(/id: "[a-z-]+"/g) ?? []).length, 14);
  // Every preset declares its light/dark base so applying it can switch the
  // appearance mode to match the palette.
  assert.equal((presetBlock.match(/base: "(?:light|dark)"/g) ?? []).length, 14);
  assert.match(app, /setAppearance\(preset\.base\)/);
  // Cupertino ships as a light/dark pair sharing one accent and typography.
  assert.match(themeOptions, /id: "cupertino"/);
  assert.match(themeOptions, /id: "cupertino-dark"/);
  // Shadow, highlight, and list-marker tokens are theme-editable, so presets
  // can actually restyle them instead of normalizeThemeTokens stripping them.
  assert.match(themeOptions, /token: "--glyphary-shadow"/);
  assert.match(themeOptions, /token: "--glyphary-shadow-strong"/);
  assert.match(themeOptions, /token: "--glyphary-mark-bg"/);
  assert.match(themeOptions, /token: "--glyphary-list-marker"/);
  assert.match(css, /\.editor-surface mark \{[^}]*background: var\(--glyphary-mark-bg\)/);
  assert.match(css, /\.editor-surface li::marker \{[^}]*color: var\(--glyphary-list-marker\)/);
  // Every theme-builder token must be accepted by the backend allowlist, or
  // saving a theme that uses it fails ("Unsupported theme token").
  const rustDefaults = readFileSync("src-tauri/src/defaults.rs", "utf8");
  const allowlistBlock =
    rustDefaults.match(/THEME_TOKEN_ALLOWLIST: &\[&str\] = &\[([\s\S]*?)\];/)?.[1] ?? "";
  const allowedTokens = new Set(allowlistBlock.match(/"(--[a-z-]+)"/g)?.map((token) => token.slice(1, -1)) ?? []);
  const editableTokens = themeOptions.match(/token: "(--[a-z-]+)"/g)?.map((token) => token.slice(8, -1)) ?? [];
  assert.ok(editableTokens.length > 40);
  for (const token of editableTokens) {
    assert.ok(allowedTokens.has(token), `backend allowlist missing ${token}`);
  }
  // Save failures render inside the dialog; the settings window has no status bar.
  assert.match(app, /setSettingsSaveError\(message\)/);
  assert.match(settingsDialog, /settings-save-error/);
  // Successful saves dismiss the dialog directly — the closeSettings revert
  // guard reads stale drafts in the same tick and would undo the saved theme.
  assert.match(app, /setStatus\("Saved vault settings"\);[\s\S]{0,400}?dismissSettingsSurface\(\);/);
  assert.match(app, /function dismissSettingsSurface/);
  assert.match(themeOptions, /for \(const preset of themePresets\)/);
  assert.match(themeBuilderPanel, /Theme Templates/);
  assert.match(themeBuilderPanel, /Theme Options/);
  assert.match(appTypes, /export type VaultThemeOptions/);
  assert.match(appTypes, /export type VaultThemeCalloutSettings/);
  assert.match(appTypes, /export type CssSnippetSettings/);
  assert.match(appTypes, /export type CalloutStyle = "plain" \| "striped" \| "card" \| "compact" \| "obsidian"/);
  assert.match(themeOptions, /defaultThemeOptions/);
  assert.match(themeOptions, /defaultThemeCalloutSettings/);
  assert.match(themeOptions, /normalizeThemeCalloutSettings/);
  assert.match(themeOptions, /sameThemeCalloutSettings/);
  assert.match(themeOptions, /normalizeThemeOptions/);
  assert.match(themeOptions, /sameThemeOptions/);
  assert.match(app, /themeOptionsDraft/);
  assert.match(app, /themeCalloutDraft/);
  assert.match(app, /cssSnippetDraft/);
  assert.match(settingsDialog, /CSS Snippets/);
  assert.match(settingsDialog, /Load only approved \.css files from a vault-relative directory/);
  assert.match(app, /data-glyphary-css-snippet/);
  assert.match(app, /list_css_snippets/);
  assert.match(app, /read_css_snippets/);
  assert.match(settings, /normalizeCssSnippetSettings/);
  assert.match(themeBuilderPanel, /Apply optional editor treatments on top of the selected theme/);
  assert.match(themeBuilderPanel, /Callout Rendering/);
  assert.match(themeBuilderPanel, /Choose a structured callout layout and icons for this vault theme/);
  assert.match(app, /callout-style-/);
  assert.match(app, /--glyphary-callout-note-icon/);
  assert.match(app, /const appShellClassName = \[/);
  assert.match(app, /theme-colorful-headings/);
  assert.match(app, /theme-heading-underlines/);
  assert.match(app, /theme-heading-anchors/);
  assert.match(app, /theme-rich-callouts/);
  assert.doesNotMatch(app, /dataset\.glypharyColorfulHeadings/);
  assert.doesNotMatch(app, /dataset\.glypharyHeadingUnderlines/);
  assert.doesNotMatch(app, /dataset\.glypharyHeadingAnchors/);
  assert.doesNotMatch(app, /dataset\.glypharyRichCallouts/);
  // Option checkboxes render from one table, so every flag gets a toggle.
  for (const optionKey of [
    "colorfulHeadings", "headingUnderlines", "headingAnchors", "richCallouts",
    "plainEditorFrame", "drawerShadow",
  ]) {
    assert.match(themeBuilderPanel, new RegExp(`key: "${optionKey}", label: "`));
  }
  assert.match(themeBuilderPanel, /themeOptionToggles\.map/);
  assert.match(app, /theme-plain-editor-frame/);
  assert.match(app, /theme-drawer-shadow/);
  assert.match(css, /\.app-shell\.theme-plain-editor-frame \.editor-pane-shell\.active-group/);
  assert.match(css, /\.app-shell\.theme-drawer-shadow \.vault-pane/);
  assert.match(modelsBackend, /plain_editor_frame/);
  assert.match(modelsBackend, /drawer_shadow/);
  // The active file row is the accent pill from the reference design.
  assert.match(css, /\.folder-tree-file\.active \{\s*background: var\(--accent\)/);
  assert.match(themeBuilderPanel, /Use colorful heading levels/);
  assert.match(themeBuilderPanel, /Add heading underlines/);
  assert.match(themeBuilderPanel, /Show heading anchor markers/);
  assert.match(themeBuilderPanel, /Use rich callout styling and icons/);
  assert.match(themeBuilderPanel, /Callout layout/);
  assert.match(themeOptions, /export const calloutKinds/);
  assert.match(themeBuilderPanel, /\{kind\.label\} icon/);
  assert.match(app, /applyThemePreset/);
  assert.match(appTypes, /presetId\?: string \| null/);
  assert.match(app, /selectedThemePresetIdDraft/);
  assert.match(app, /normalizeThemePresetId/);
  assert.match(themeOptions, /--glyphary-accent/);
  assert.match(themeOptions, /--glyphary-font-editor/);
  assert.match(themeOptions, /--glyphary-editor-max-width/);
  assert.match(themeOptions, /--glyphary-radius-md/);
  assert.match(themeOptions, /--glyphary-callout-padding/);
  assert.match(themeOptions, /--glyphary-callout-warning-color/);
  assert.match(themeOptions, /--glyphary-code-tab-size/);
  assert.match(themeOptions, /--syntax-purple/);
  assert.match(themeBuilderPanel, /rawThemeTokenValue/);
  assert.match(themeBuilderPanel, /type="text"/);
  assert.match(themeBuilderPanel, /Reset Theme/);
  assert.match(appTypes, /export type VaultAppearanceSettings/);
  assert.match(appTypes, /export type FileDisplaySettings/);
  assert.match(appTypes, /export type AutosaveSettings/);
  assert.match(appTypes, /export type TidbitSettings/);
  assert.doesNotMatch(app, /attachmentDirectory: string/);
  assert.doesNotMatch(app, /defaultVaultAttachmentDirectory/);
  assert.match(documentsState, /Responsibilities:/);
  assert.match(documentsState, /Contracts:/);
  assert.match(documentsState, /function joinVaultImagePath/);
  assert.match(documentsState, /function vaultImagePathCandidates/);
  assert.match(documentsState, /function joinVaultRelativeImagePath/);
  assert.match(documentsState, /if \(cleanReference\.includes\("\/"\)\) \{/);
  assert.match(documentsState, /const candidates = vaultImagePathCandidates\(root, reference\)/);
  assert.match(documentsState, /defaultVaultImageDirectory/);
  assert.match(documentsState, /convertFileSrc\(`\$\{root\}\/\$\{defaultVaultImageDirectory\}\/\$\{cleanReference\}`\)/);
  assert.match(editorOptions, /createVaultImageExtension\(resolveVaultImageSrc, resolveVaultAssetSrc\)/);
  assert.match(vaultImages, /function youtubeThumbnailUrl/);
  assert.match(vaultImages, /https:\/\/img\.youtube\.com\/vi\/\$\{videoId\}\/hqdefault\.jpg/);
  assert.match(vaultImages, /remoteSource/);
  assert.match(vaultImages, /youtubeThumbnailUrl\(href\) \?\? href/);
  assert.match(app, /import \{ openPath, openUrl, revealItemInDir \} from "@tauri-apps\/plugin-opener"/);
  assert.match(app, /function openRemoteImageSourceFromEditor/);
  assert.match(editorPane, /onClick=\{onOpenRemoteImageSource\}/);
  assert.match(css, /img\[data-remote-source\]/);
  assert.match(app, /assetDirectory: defaultVaultImageDirectory/);
  assert.match(settings, /defaultFileDisplaySettings/);
  assert.match(settings, /showDotfiles: false/);
  assert.match(settings, /showFilesInFolderTree: false/);
  assert.match(settings, /showFolderTreeBackground: false/);
  assert.match(settings, /showFilePreviewsInFolderTree: true/);
  assert.match(settings, /showImagesInFilePreviews: true/);
  assert.match(settings, /baseCardImageLayout: "side"/);
  assert.match(settings, /defaultNewTabFile = ""/);
  assert.match(settings, /function normalizeNewTabFile/);
  assert.match(settings, /function sameNewTabFile/);
  assert.match(settings, /defaultAutosaveSettings/);
  assert.match(settings, /enabled: true/);
  assert.match(settings, /defaultTidbitSettings/);
  assert.match(settingsDialog, /Tidbit path pattern/);
  assert.match(settingsDialog, /<span>New Tab<\/span>/);
  assert.match(app, /function chooseNewTabFile\(\)/);
  assert.match(app, /title: "Choose New Tab File"/);
  assert.match(app, /Choose a file inside the current vault/);
  assert.match(settingsDialog, /value=\{newTabFileDraft\}/);
  assert.match(settingsDialog, /Choose\.\.\./);
  assert.match(settingsDialog, /setNewTabFileDraft\(activeFile\?\.relativePath \?\? ""\)/);
  assert.match(app, /Configure a new tab note in Settings/);
  assert.match(app, /openConfiguredNewTabRef\.current\(\)/);
  assert.match(app, /event\.key\.toLowerCase\(\) !== "t"/);
  assert.match(app, /addEventListener\("keydown", handleGlobalNewTabShortcut, \{ capture: true \}\)/);
  assert.doesNotMatch(app, /Attachment directory/);
  assert.match(settingsDialog, /defaultTidbitPathPattern/);
  assert.match(settingsDialog, /Show dotfiles and dot folders/);
  assert.match(settingsDialog, /Show files in folder trees/);
  assert.match(settingsDialog, /Show folder tree background/);
  assert.match(settingsDialog, /Show file previews/);
  assert.match(settingsDialog, /Show images in file previews/);
  assert.match(settingsDialog, /Base card image layout/);
  assert.match(settingsDialog, /value=\{fileDisplayDraft\.baseCardImageLayout\}/);
  assert.match(settingsDialog, /baseCardImageLayout,/);
  assert.match(settingsDialog, /settings-check-control settings-sub-check-control/);
  assert.match(settingsDialog, /disabled=\{!vaultRoot \|\| !fileDisplayDraft\.showFilePreviewsInFolderTree\}/);
  assert.match(settingsDialog, /onChange=\{\(event\) => onChange\(event\.currentTarget\.checked\)\}/);
  assert.match(settingsDialog, /showFilesInFolderTree: checked/);
  assert.match(settingsDialog, /showFolderTreeBackground: checked/);
  assert.match(settingsDialog, /showFilePreviewsInFolderTree: checked/);
  assert.match(settingsDialog, /showImagesInFilePreviews: checked/);
  assert.match(css, /\.settings-panel \.settings-sub-check-control/);
  assert.doesNotMatch(settingsDialog, /showFilesInFolderTree: event\.currentTarget\.checked/);
  assert.doesNotMatch(settingsDialog, /showFolderTreeBackground: event\.currentTarget\.checked/);
  assert.doesNotMatch(settingsDialog, /showFilePreviewsInFolderTree: event\.currentTarget\.checked/);
  assert.doesNotMatch(settingsDialog, /showImagesInFilePreviews: event\.currentTarget\.checked/);
  assert.match(settingsDialog, /Autosave current page once per minute/);
  assert.match(app, /window\.setInterval/);
  assert.match(app, /60_000/);
  assert.match(app, /glassEffect/);
  assert.match(settings, /showDocumentProxy: false/);
  assert.match(settings, /statusBarVisible: true/);
  assert.match(settings, /sectionCorners: "rounded"/);
  assert.match(settings, /workspaceMargin: "comfortable"/);
  assert.match(settings, /uiFontWeight: "regular"/);
  assert.match(settings, /defaultGlassOpacity = 0\.58/);
  assert.match(settings, /minimumGlassOpacity = 0\.24/);
  assert.match(settings, /maximumGlassOpacity = 0\.9/);
  assert.match(settingsDialog, /Use glass window effect/);
  assert.match(settingsDialog, /Show document proxy in title bar/);
  assert.match(settingsDialog, /Glass opacity/);
  assert.match(settingsDialog, /type="range"/);
  assert.match(app, /--glyphary-glass-opacity/);
  assert.match(settingsDialog, /Show status bar/);
  assert.match(settingsDialog, /Use rounded section corners/);
  assert.match(settingsDialog, /Workspace margins/);
  assert.match(settingsDialog, /UI text weight/);
  assert.match(settingsDialog, /<option value="compact">Flush<\/option>/);
  assert.match(settingsDialog, /<option value="spacious">Roomy<\/option>/);
  assert.match(settingsDialog, /<option value="regular">Regular<\/option>/);
  assert.match(settingsDialog, /<option value="medium">Medium<\/option>/);
  assert.match(settingsDialog, /<option value="bold">Bold<\/option>/);
  assert.match(app, /normalizedVaultAppearanceDraft/);
  assert.match(app, /normalizedVaultAppearanceDraft\.showDocumentProxy && activeFileBackedName/);
  assert.match(app, /section-corners-\$\{normalizedVaultAppearanceDraft\.sectionCorners\}/);
  assert.match(app, /workspace-margin-\$\{normalizedVaultAppearanceDraft\.workspaceMargin\}/);
  assert.match(app, /ui-weight-\$\{normalizedVaultAppearanceDraft\.uiFontWeight\}/);
  assert.doesNotMatch(
    app,
    /setVaultAppearanceDraft\(\(settings\) => \(\{(?:(?!\}\)\);)[\s\S])*event\.currentTarget/,
  );
  assert.match(css, /\.section-corners-square \.editor-pane/);
  assert.match(css, /\.workspace-margin-compact/);
  assert.match(css, /\.workspace-margin-spacious/);
  assert.match(css, /--glyphary-ui-font-weight: 400/);
  assert.match(css, /\.app-shell\.ui-weight-regular/);
  assert.match(css, /\.app-shell\.ui-weight-medium/);
  assert.match(css, /\.app-shell\.ui-weight-bold/);
  assert.match(css, /--glyphary-shell-padding-top: 8px/);
  assert.match(css, /--glyphary-shell-padding-inline: 8px/);
  assert.match(css, /\.workspace-margin-compact \{[\s\S]*--glyphary-shell-padding-top: 0px/);
  assert.match(css, /\.workspace-margin-compact \{[\s\S]*--glyphary-shell-padding-inline: 0px/);
  assert.match(css, /\.workspace-margin-spacious \{[\s\S]*--glyphary-shell-padding-top: 14px/);
  assert.match(app, /set_window_glass_effect/);
  assert.match(appTypes, /export type SettingsDragState/);
  assert.match(app, /function openSettings/);
  assert.match(app, /setSettingsOffset\(\{ x: 0, y: 0 \}\)/);
  assert.match(app, /function closeSettings/);
  assert.match(app, /function clampSettingsOffset/);
  assert.match(app, /function settingsDragStartedOnControl/);
  assert.match(app, /target\.closest\("button, input, select, textarea"\)/);
  assert.match(app, /settingsDragStartedOnControl\(event\.target\)/);
  assert.match(settingsDialog, /onPointerDown=\{startSettingsDrag\}/);
  assert.match(settingsDialog, /onPointerMove=\{moveSettingsDrag\}/);
  assert.match(app, /closeSettingsOnEscape/);
  assert.match(app, /event\.key === "Escape"/);
  assert.match(css, /data-window-glass="enabled"/);
  assert.match(css, /--glass-inner-overlay/);
  assert.match(css, /data-window-glass="enabled"\] \.settings-screen/);
  assert.match(css, /data-window-glass="enabled"\] \.settings-card \{[\s\S]*background: var\(--surface\)/);
  assert.match(css, /data-window-glass="enabled"\] \.settings-card \{[\s\S]*backdrop-filter: none/);
  assert.match(css, /\.editor-surface-frame/);
  assert.match(css, /\.settings-header\.dragging/);
  assert.match(css, /cursor: grab/);
  assert.match(windowingBackend, /Could not keep titlebar contrast material/);
  assert.doesNotMatch(windowingBackend, /set_effects\(None/);
  assert.match(css, /\.theme-preset-grid/);
  assert.match(css, /\.theme-preset-card/);
  assert.match(css, /\.app-shell\.theme-colorful-headings/);
  assert.match(css, /\.app-shell\.theme-heading-underlines/);
  assert.match(css, /\.app-shell\.theme-heading-anchors/);
  assert.match(css, /\.app-shell\.theme-rich-callouts/);
  assert.match(css, /\.app-shell\.callout-style-striped/);
  assert.match(css, /repeating-linear-gradient/);
  assert.match(css, /\.app-shell\.callout-style-card/);
  assert.match(css, /\.app-shell\.callout-style-compact/);
  assert.match(css, /\.app-shell\.callout-style-obsidian/);
  assert.match(css, /content: var\(--callout-icon\)/);
  assert.doesNotMatch(css, /data-glyphary-colorful-headings="enabled"/);
  assert.doesNotMatch(css, /data-glyphary-heading-underlines="enabled"/);
  assert.doesNotMatch(css, /data-glyphary-heading-anchors="enabled"/);
  assert.doesNotMatch(css, /data-glyphary-rich-callouts="enabled"/);
  assert.match(defaultsBackend, /"--glyphary-font-editor"/);
  assert.match(defaultsBackend, /"--glyphary-callout-padding"/);
  assert.match(defaultsBackend, /"--glyphary-callout-warning-color"/);
  assert.match(defaultsBackend, /"--glyphary-editor-max-width"/);
  assert.match(defaultsBackend, /"--glyphary-radius-md"/);
  assert.match(defaultsBackend, /"--syntax-purple"/);
  assert.match(modelsBackend, /pub\(crate\) struct VaultThemeOptions/);
  assert.match(modelsBackend, /pub\(crate\) struct VaultThemeCallouts/);
  assert.match(modelsBackend, /pub\(crate\) struct CssSnippetSettings/);
  assert.match(snippetsBackend, /pub\(crate\) fn list_css_snippets/);
  assert.match(snippetsBackend, /pub\(crate\) fn read_css_snippets/);
  assert.match(snippetsBackend, /pub\(crate\) fn clean_css_snippet_name/);
  assert.match(defaultsBackend, /THEME_CALLOUT_STYLE_ALLOWLIST/);
  assert.match(defaultsBackend, /THEME_CALLOUT_ICON_ALLOWLIST/);
  assert.match(themesBackend, /clean_theme_callouts/);
  assert.match(settingsTestsBackend, /writes_vault_theme_options_without_tokens/);
  assert.equal(config.app.macOSPrivateApi, true);
  assert.equal(config.app.windows[0].transparent, true);
  assert.equal(config.bundle.publisher, "Glyphary contributors");
  assert.match(config.bundle.copyright, /Glyphary contributors/);
  assert.match(cargo, /macos-private-api/);
  assert.match(cargo, /objc2-app-kit = \{ version = "0\.3\.2", default-features = false, features = \["NSButton", "NSControl", "NSView", "NSWindow"\] \}/);
  assert.match(nativeMenuBackend, /name: Some\("Glyphary"\.into\(\)\)/);
  assert.match(nativeMenuBackend, /A local-first Markdown workspace/);
  assert.match(nativeMenuBackend, /Built with Tauri, React, Tiptap/);
  assert.match(modelsBackend, /pub\(crate\) struct AppearanceSettings/);
  assert.match(modelsBackend, /glass_effect/);
  assert.match(modelsBackend, /glass_opacity/);
  assert.match(modelsBackend, /status_bar_visible/);
  assert.match(modelsBackend, /section_corners/);
  assert.match(modelsBackend, /workspace_margin/);
  assert.match(modelsBackend, /ui_font_weight/);
  assert.match(modelsBackend, /preset_id/);
  assert.match(windowingBackend, /Effect::UnderWindowBackground/);
  assert.match(windowingBackend, /set_background_color\(Some\(Color\(0, 0, 0, 0\)\)\)/);
});
