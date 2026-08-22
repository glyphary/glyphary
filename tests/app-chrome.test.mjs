import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import {
  parseOnboardingTipsEnabled,
  parseSeenOnboardingTips,
  serializeSeenOnboardingTips,
} from "../.test-dist/onboarding.js";
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
  isIPadPlatform,
  isMacOsPlatform,
  isWindowsPlatform,
} from "../.test-dist/platform.js";

test("onboarding tips persist seen ids and survive corrupted storage", () => {
  assert.deepEqual(parseSeenOnboardingTips(null), []);
  assert.deepEqual(parseSeenOnboardingTips("not json"), []);
  assert.deepEqual(parseSeenOnboardingTips('{"a":1}'), []);
  assert.deepEqual(parseSeenOnboardingTips('["a",2,"b"]'), ["a", "b"]);
  assert.equal(serializeSeenOnboardingTips([], "slash-command-menu"), '["slash-command-menu"]');
  assert.equal(serializeSeenOnboardingTips(["a"], "a"), '["a"]');
  assert.equal(serializeSeenOnboardingTips(["a"], "b"), '["a","b"]');

  // Hints are on unless explicitly disabled; unknown storage stays enabled.
  assert.equal(parseOnboardingTipsEnabled(null), true);
  assert.equal(parseOnboardingTipsEnabled("true"), true);
  assert.equal(parseOnboardingTipsEnabled("garbage"), true);
  assert.equal(parseOnboardingTipsEnabled("false"), false);

  // The slash menu is the first consumer: opening the flat scope routes
  // through the one-time tip, and dismissal resumes the intercepted open.
  const app = readFileSync("src/App.tsx", "utf8");
  assert.match(app, /function withOnboardingTip/);
  assert.match(app, /readOnboardingTipsEnabled\(\) \|\| hasSeenOnboardingTip/);
  assert.match(app, /withOnboardingTip\(\s*\{\s*id: "slash-command-menu"/);
  assert.match(app, /withOnboardingTip\(\s*\{\s*id: "source-drawer"/);
  assert.match(app, /markOnboardingTipSeen\(onboardingTip\.id\)/);

  // Settings exposes a dedicated Hints section with a toggle and reset.
  const settingsDialog = readFileSync("src/settings/SettingsDialog.tsx", "utf8");
  assert.match(settingsDialog, /aria-label="Hint settings"/);
  assert.match(settingsDialog, /setOnboardingTipsEnabled\(event\.currentTarget\.checked\)/);
  assert.match(settingsDialog, /void resetOnboardingTips\(\)\.then/);
  // Reset requires native confirmation and reports back inside the dialog,
  // because the settings window has no status bar.
  assert.match(app, /confirmDestructiveAction\(\s*"Reset first-use hints\?/);
  assert.match(settingsDialog, /hintsResetDone/);
});

test("excalidraw dirty tracking, save feedback, and preview cache", () => {
  const app = readFileSync("src/App.tsx", "utf8");
  const excalidrawEditor = readFileSync("src/excalidraw/editor.tsx", "utf8");

  // Dirty means "element versions differ from the saved baseline", because
  // Excalidraw's onChange also fires for pan/zoom and post-save re-renders.
  assert.match(app, /function excalidrawSceneVersion/);
  assert.match(app, /excalidrawSceneVersion\(elements\) !== excalidrawSavedSceneVersionRef\.current/);
  assert.match(app, /excalidrawSavedSceneVersionRef\.current = excalidrawSceneVersion\(restored\.elements\)/);
  assert.match(app, /excalidrawSavedSceneVersionRef\.current = excalidrawSceneVersion\(elements\)/);
  // Saving confirms inside the dialog and disables Save until the next edit.
  assert.match(excalidrawEditor, /excalidraw-save-note/);
  assert.match(excalidrawEditor, /disabled=\{!dirty\}/);
  // Remounts render the cached preview instantly instead of flashing the
  // loading state on every return to the note.
  assert.match(excalidrawEditor, /const excalidrawPreviewCache = new Map/);
  // One outcome cache: successes render instantly on remount, failures show a
  // steady error instead of alternating with the loading state.
  assert.match(excalidrawEditor, /excalidrawPreviewCache\.set\(target, \{ svg: markup \}\)/);
  assert.match(excalidrawEditor, /excalidrawPreviewCache\.set\(target, \{ failure: message \}\)/);
  // Fonts are self-hosted: without EXCALIDRAW_ASSET_PATH excalidraw fetches
  // from esm.sh at runtime and offline machines fail every preview export.
  const indexHtml = readFileSync("index.html", "utf8");
  const packageJson = readFileSync("package.json", "utf8");
  assert.match(indexHtml, /window\.EXCALIDRAW_ASSET_PATH = "\/"/);
  assert.match(packageJson, /"prebuild": "node scripts\/copy-excalidraw-fonts\.mjs"/);
  assert.match(packageJson, /"predev": "node scripts\/copy-excalidraw-fonts\.mjs"/);
});

test("focus mode hides workspace chrome via palette and native menu", () => {
  const app = readFileSync("src/App.tsx", "utf8");
  const css = readFileSync("src/App.css", "utf8");
  const nativeMenu = readFileSync("src-tauri/src/native_menu.rs", "utf8");

  assert.match(app, /id: "toggle-focus-mode"/);
  assert.match(app, /commandId === "toggle-focus-mode"/);
  assert.match(app, /focusMode \? "focus-mode" : ""/);
  // CSS-only hiding preserves drawer state across enter/exit.
  assert.match(css, /\.workspace\.focus-mode \{\s*grid-template-columns: 0 0 minmax\(0, 1fr\) 0 0/);
  assert.match(css, /\.workspace\.focus-mode \.vault-pane/);
  assert.match(css, /\.workspace\.focus-mode \.document-tabs,\s*\.workspace\.focus-mode \.toolbar,\s*\.workspace\.focus-mode \.frontmatter-header \{\s*display: none/);
  // Titlebar chrome hides by exclusion so newly added buttons default to
  // hidden in focus mode instead of silently leaking in.
  assert.match(css, /\.app-shell\.focus-mode \.app-actions > \*:not\(\[aria-label="Save"\]\):not\(\.titlebar-command-palette\)/);
  assert.match(css, /\.app-shell\.focus-mode \.titlebar-vault-actions,\s*\.app-shell\.focus-mode \.titlebar-native-actions/);
  assert.match(app, /focusMode \? "focus-mode" : null/);
  assert.match(nativeMenu, /"toggle_focus_mode" => Some\("toggle-focus-mode"\)/);
  assert.match(nativeMenu, /focus_mode: bool/);
});

test("desktop platform detection controls platform-specific window actions", () => {
  const app = readFileSync("src/App.tsx", "utf8");
  const vaultPersistence = readFileSync("src/vault/persistence.ts", "utf8");
  const vaultTree = readFileSync("src/vault/VaultFolderTree.tsx", "utf8");
  const vaultIcons = readFileSync("src/vault/VaultIcons.tsx", "utf8");
  const css = readFileSync("src/App.css", "utf8");
  const capabilities = JSON.parse(readFileSync("src-tauri/capabilities/default.json", "utf8"));
  const config = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8"));
  const windowsConfig = JSON.parse(readFileSync("src-tauri/tauri.windows.conf.json", "utf8"));
  const backend = readFileSync("src-tauri/src/lib.rs", "utf8");
  const windowingBackend = readFileSync("src-tauri/src/windowing.rs", "utf8");

  assert.equal(isMacOsPlatform("MacIntel"), true);
  assert.equal(isMacOsPlatform("", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"), true);
  assert.equal(isMacOsPlatform("Win32"), false);
  assert.equal(isMacOsPlatform("Linux x86_64"), false);
  assert.equal(isIPadPlatform("iPad", "Mozilla/5.0 (iPad)"), true);
  assert.equal(
    isIPadPlatform("MacIntel", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 5),
    true,
  );
  assert.equal(
    isIPadPlatform("MacIntel", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"),
    false,
  );
  assert.equal(isWindowsPlatform("Win32"), true);
  assert.equal(isWindowsPlatform("", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"), true);
  assert.equal(isWindowsPlatform("MacIntel"), false);
  assert.match(app, /hideDuplicateDocumentActions/);
  assert.match(app, /isWindowsPlatform/);
  assert.match(css, /\.titlebar[\s\S]*background: var\(--surface\)/);
  assert.doesNotMatch(css, /data-window-glass="enabled"] \.document-tabs,\n:root\[data-window-glass="enabled"] \.titlebar/);
  assert.match(css, /data-window-glass="enabled"] \.app-shell:not\(\.platform-macos\) \.titlebar[\s\S]*backdrop-filter: none/);
  assert.match(app, /getCurrentWindow\(\)\.setTheme\(appearance === "auto" \? null : appearance\)/);
  assert.match(app, /titlebar-document-proxy/);
  assert.match(app, /showActiveDocumentProxyMenu/);
  assert.match(app, /github-sync-progress/);
  assert.match(app, /platform-ipad/);
  assert.match(app, /isIPad \? fileMenu\(\)/);
  assert.match(app, /isIPad[\s\S]*pick_vault_folder/);
  assert.match(app, /function fileMenu\(\)/);
  assert.match(app, /!settingsWindowMode && !isIPad/);
  assert.match(css, /\.platform-ipad \.workspace\.with-vault \.vault-pane/);
  assert.match(css, /\.platform-ipad \.workspace\.with-vault\.vault-drawer-closed \.vault-pane/);
  assert.match(css, /\.platform-ipad \.titlebar > \.file-menu \.file-menu-popover[\s\S]*right: auto[\s\S]*left: 0/);
  assert.match(app, /active-document-copy-path/);
  assert.doesNotMatch(app, /app-brand/);
  assert.ok(capabilities.permissions.includes("core:window:allow-set-theme"));
  assert.ok(capabilities.permissions.includes("core:window:allow-start-dragging"));
  assert.equal(config.app.windows[0].decorations, true);
  assert.equal(config.app.windows[0].theme, "Dark");
  assert.equal(config.app.windows[0].hiddenTitle, true);
  assert.equal(config.app.windows[0].titleBarStyle, "Overlay");
  assert.deepEqual(config.app.windows[0].trafficLightPosition, { x: 20, y: 28 });
  assert.equal(config.app.windows[0].transparent, true);
  assert.equal(windowsConfig.app.windows[0].transparent, false);
  assert.ok(config.bundle.icon.includes("icons/icon.ico"));
  assert.equal(config.bundle.windows.nsis.installerIcon, "icons/icon.ico");
  assert.equal(config.bundle.windows.nsis.uninstallerIcon, "icons/icon.ico");
  assert.match(app, /const isMacOs = isMacOsPlatform/);
  assert.match(app, /platform-macos/);
  assert.match(app, /titlebar-drag-region/);
  assert.match(app, /function startTitlebarDrag/);
  assert.match(app, /getCurrentWindow\(\)\.startDragging\(\)/);
  assert.match(app, /onMouseDown=\{startTitlebarDrag\}/);
  assert.match(app, /<header className="titlebar" data-tauri-drag-region onMouseDown=\{startTitlebarDrag\}>/);
  assert.match(app, /titlebar-drawer-toggle/);
  assert.match(app, /titlebar-document-name/);
  assert.match(app, /titlebar-inspector-toggle/);
  assert.match(app, /onClick=\{\(\) => toggleDrawerItem\(drawerItem\)\}/);
  assert.match(backend, /pick_vault_folder/);
  assert.match(css, /\.titlebar \{[\s\S]*app-region: drag/);
  assert.match(css, /\.titlebar-drawer-toggle svg \{[\s\S]*width: 22px/);
  assert.match(css, /\.titlebar-document-proxy \{[\s\S]*max-width: min\(34vw, 360px\)/);
  assert.match(css, /\.titlebar-native-actions,\n\.titlebar-vault-actions,\n\.titlebar-document-proxy,\n\.app-actions \{[\s\S]*app-region: no-drag/);
  assert.match(css, /\.app-actions \{[\s\S]*app-region: no-drag/);
  assert.match(css, /\.platform-macos \.titlebar \{[\s\S]*position: absolute/);
  assert.match(css, /\.platform-macos \.titlebar \{[\s\S]*top: 0/);
  assert.match(css, /\.platform-macos \.titlebar \{[\s\S]*left: 0/);
  assert.match(css, /\.platform-macos \.titlebar \{[\s\S]*background: transparent/);
  assert.match(css, /data-window-glass="enabled"] \.platform-macos \.titlebar \{[\s\S]*background: transparent/);
  assert.match(css, /\.platform-macos \.titlebar[\s\S]*padding: 8px 10px 8px 0/);
  assert.match(css, /\.platform-macos \.titlebar-document-proxy \{[\s\S]*margin-left: max\(132px, calc\(var\(--vault-width, 320px\) \+ var\(--vault-resizer-width, 10px\) \+ 48px\)\)/);
  assert.doesNotMatch(css, /\.platform-macos::before/);
  assert.match(css, /\.platform-macos \.titlebar-native-actions \{[\s\S]*left: max\(86px, calc\(var\(--vault-width, 320px\) \+ var\(--vault-resizer-width, 10px\) \+ 8px\)\)/);
  assert.doesNotMatch(css, /\.platform-macos \.workspace \{[\s\S]*margin-top: -46px/);
  assert.match(css, /\.platform-macos \.vault-rail \{[\s\S]*padding: 46px 7px 12px/);
  assert.match(css, /\.platform-macos \.vault-content \{[\s\S]*padding-top: 46px/);
  assert.match(css, /\.platform-macos \.drawer-rail,\n\.platform-macos \.drawer-content \{[\s\S]*padding-top: 46px/);
  assert.match(css, /\.platform-macos \.document-tabs \{[\s\S]*margin-top: 46px/);
  assert.match(backend, /apply_macos_titlebar_chrome\(app\.handle\(\)\)/);
  assert.match(windowingBackend, /NSWindowStyleMask::FullSizeContentView/);
  assert.match(windowingBackend, /move_traffic_lights\(ns_window, 20\.0, 28\.0\)/);
  assert.match(windowingBackend, /standardWindowButton\(NSWindowButton::CloseButton\)/);
  assert.match(windowingBackend, /titlebar\.setFrame\(titlebar_rect\)/);
  assert.match(windowingBackend, /Could not make macOS window background transparent/);
  assert.match(windowingBackend, /setTitlebarAppearsTransparent\(true\)/);
  assert.match(windowingBackend, /setTitleVisibility\(NSWindowTitleVisibility::Hidden\)/);
});

test("startup release checks compare the latest GitHub release tag", () => {
  const app = readFileSync("src/App.tsx", "utf8");
  const css = readFileSync("src/App.css", "utf8");

  assert.match(app, /import packageJson from "\.\.\/package\.json"/);
  assert.match(app, /const currentAppVersion = packageJson\.version/);
  assert.match(
    app,
    /https:\/\/api\.github\.com\/repos\/glyphary\/glyphary\/releases\/latest/,
  );
  assert.match(app, /function releaseNotificationFromGitHubRelease/);
  assert.match(app, /function normalizedReleaseVersion/);
  assert.doesNotMatch(app, /function releaseVersionParts/);
  assert.doesNotMatch(app, /function compareReleaseVersions/);
  assert.match(app, /fetch\(githubLatestReleaseApiUrl/);
  assert.match(app, /application\/vnd\.github\+json/);
  assert.match(app, /const latestRelease = releaseNotificationFromGitHubRelease\(/);
  assert.match(app, /normalizedReleaseVersion\(latestRelease\.tagName\) !==\s+normalizedReleaseVersion\(currentAppVersion\)/);
  assert.match(app, /setReleaseNotification\(latestRelease\)/);
  assert.match(app, /aria-label="Glyphary update available"/);
  assert.match(app, /Glyphary \{releaseNotification\.tagName\} is available/);
  assert.match(app, /You are running \{currentAppVersion\}/);
  assert.match(app, /releaseNotification\.notes/);
  assert.match(app, /Open Release/);
  assert.match(css, /\.release-update-screen/);
  assert.match(css, /\.release-update-card/);
  assert.match(css, /\.release-update-notes p/);
  assert.match(css, /\.inline-action \{\s*display: inline-grid;/);
});

test("global tidbit capture is vault-gated and opens a lightweight editor window", () => {
  const app = readFileSync("src/App.tsx", "utf8");
  const settingsDialog = readFileSync("src/settings/SettingsDialog.tsx", "utf8");
  const settings = readFileSync("src/lib/settings.ts", "utf8");
  const capture = readFileSync("src/TidbitCapture.tsx", "utf8");
  const main = readFileSync("src/main.tsx", "utf8");
  const css = readFileSync("src/App.css", "utf8");
  const backend = readFileSync("src-tauri/src/lib.rs", "utf8");
  const defaultsBackend = readFileSync("src-tauri/src/defaults.rs", "utf8");
  const modelsBackend = readFileSync("src-tauri/src/models.rs", "utf8");
  const shortcutsBackend = readFileSync("src-tauri/src/shortcuts.rs", "utf8");
  const cargo = readFileSync("src-tauri/Cargo.toml", "utf8");
  const capabilities = JSON.parse(readFileSync("src-tauri/capabilities/default.json", "utf8"));
  const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

  assert.equal(packageJson.dependencies["@tauri-apps/plugin-global-shortcut"], "^2.3.2");
  assert.equal(packageJson.dependencies["tauri-plugin-macos-permissions-api"], "^2.3.0");
  assert.match(cargo, /tauri-plugin-global-shortcut = "2"/);
  assert.match(cargo, /tauri-plugin-macos-permissions = "2\.3\.0"/);
  assert.ok(capabilities.windows.includes("tidbit-capture"));
  assert.ok(capabilities.permissions.includes("global-shortcut:default"));
  assert.ok(capabilities.permissions.includes("macos-permissions:default"));
  assert.ok(capabilities.permissions.includes("core:window:allow-close"));
  assert.ok(capabilities.permissions.includes("core:webview:allow-create-webview-window"));
  assert.match(defaultsBackend, /global_shortcut_enabled: false/);
  assert.match(defaultsBackend, /default_tidbit_global_shortcut/);
  assert.match(backend, /tauri_plugin_global_shortcut::Builder::new\(\)\.build\(\)/);
  assert.match(backend, /tauri_plugin_macos_permissions::init\(\)/);
  assert.match(modelsBackend, /pub\(crate\) struct TidbitShortcutState/);
  assert.match(shortcutsBackend, /pub\(crate\) fn register_tidbit_global_shortcut/);
  assert.match(shortcutsBackend, /pub\(crate\) fn unregister_tidbit_global_shortcut/);
  assert.match(shortcutsBackend, /pub\(crate\) fn tidbit_global_shortcut_status/);
  assert.match(shortcutsBackend, /pub\(crate\) fn test_tidbit_global_shortcut_event/);
  assert.match(shortcutsBackend, /app\.global_shortcut\(\)\s*\.on_shortcut/);
  assert.match(shortcutsBackend, /app\.emit\("tidbit-global-shortcut"/);
  assert.match(backend, /register_tidbit_global_shortcut,/);
  assert.match(backend, /unregister_tidbit_global_shortcut,/);
  assert.match(backend, /tidbit_global_shortcut_status,/);
  assert.match(backend, /test_tidbit_global_shortcut_event,/);
  assert.match(settings, /globalShortcutEnabled: false/);
  assert.match(settings, /globalShortcut: defaultTidbitGlobalShortcut/);
  assert.match(app, /checkAccessibilityPermission/);
  assert.match(app, /requestAccessibilityPermission/);
  assert.match(app, /function requestTidbitShortcutAccessibilityPermission/);
  assert.match(settings, /function keyboardEventMatchesShortcut/);
  assert.match(settingsDialog, /void requestTidbitShortcutAccessibilityPermission\(\);/);
  assert.match(app, /if \(!isTauri\(\) \|\| !vaultRoot \|\| !settings\.globalShortcutEnabled\)/);
  assert.match(app, /if \(!isTauri\(\) \|\| !isRunningOnMacOs\(\)\)/);
  assert.match(app, /Grant Glyphary Accessibility permission in macOS System Settings/);
  assert.match(app, /listen<string>\("tidbit-global-shortcut"/);
  assert.match(app, /Received global tidbit shortcut event/);
  assert.match(app, /Received tidbit shortcut test event/);
  assert.match(app, /invoke<boolean>\("register_tidbit_global_shortcut"/);
  assert.match(app, /invoke\("unregister_tidbit_global_shortcut"\)/);
  assert.match(settingsDialog, /invoke<TidbitShortcutStatus>\("tidbit_global_shortcut_status"\)/);
  assert.match(settingsDialog, /invoke\("test_tidbit_global_shortcut_event"\)/);
  assert.match(app, /It may already be used by macOS or another app/);
  assert.match(app, /WebviewWindow\.getByLabel\("tidbit-capture"\)/);
  assert.match(app, /url: `index\.html\?\$\{params\.toString\(\)\}`/);
  assert.match(app, /view: "tidbit-capture"/);
  assert.match(app, /hiddenTitle: true/);
  assert.match(app, /titleBarStyle: "overlay"/);
  assert.match(app, /trafficLightPosition: new LogicalPosition\(20, 28\)/);
  assert.match(app, /transparent: true/);
  assert.match(app, /visible: false/);
  assert.match(app, /tidbit-capture-created/);
  assert.match(settingsDialog, /Enable global tidbit capture shortcut/);
  assert.match(settingsDialog, /Global tidbit shortcut/);
  assert.match(settingsDialog, /settingsTab === "debug"/);
  assert.match(settingsDialog, /debugDraft\.enabled \? \(/);
  assert.match(settingsDialog, /Enable debug mode/);
  assert.match(settingsDialog, /Global Shortcut Diagnostics/);
  assert.match(settingsDialog, /Request Permission/);
  assert.match(settingsDialog, /Test Capture Event/);
  assert.match(settingsDialog, /Check Shortcut/);
  assert.match(settingsDialog, /No tidbit shortcut is registered/);
  assert.match(settingsDialog, /onClick=\{\(\) => void requestTidbitShortcutAccessibilityPermission\(\)\}/);
  assert.match(settingsDialog, /Save Settings to activate global tidbit capture/);
  assert.match(settingsDialog, /Save Settings to activate it/);
  assert.match(settingsDialog, /const pathPattern = event\.currentTarget\.value;/);
  assert.match(settingsDialog, /const globalShortcutEnabled = event\.currentTarget\.checked;/);
  assert.match(settings, /function shortcutFromKeyboardEvent/);
  assert.match(settings, /function shortcutKeyFromEvent/);
  assert.match(settings, /event\.metaKey \? "Command" : ""/);
  assert.match(settings, /event\.ctrlKey \? "Control" : ""/);
  assert.match(settings, /if \(!event\.metaKey \|\| event\.ctrlKey\)/);
  assert.match(settingsDialog, /readOnly/);
  assert.match(settingsDialog, /onKeyDown=\{\(event\) => \{/);
  assert.match(settingsDialog, /const globalShortcut = shortcutFromKeyboardEvent\(event\);/);
  assert.match(settingsDialog, /event\.preventDefault\(\);/);
  assert.match(settingsDialog, /globalShortcut: defaultTidbitGlobalShortcut/);
  assert.match(app, /handleFocusedTidbitShortcut/);
  assert.match(app, /keyboardEventMatchesShortcut\(event, settings\.globalShortcut\)/);
  assert.match(app, /addEventListener\("keydown", handleFocusedTidbitShortcut, \{ capture: true \}\)/);
  assert.match(app, /target\.closest\("\.shortcut-capture-control"\)/);
  assert.doesNotMatch(settingsDialog, /setTidbitDraft\(\(settings\) => \(\{[\s\S]{0,220}event\.currentTarget/);
  const mainSettingsStart = settingsDialog.indexOf('{settingsTab === "main" ? (');
  const mainSettingsEnd = settingsDialog.indexOf('{settingsTab === "plugins" ? (', mainSettingsStart);
  const mainSettingsPanel = settingsDialog.slice(mainSettingsStart, mainSettingsEnd);
  const debugSettingsStart = settingsDialog.indexOf('{settingsTab === "debug" ? (');
  const debugSettingsEnd = settingsDialog.indexOf('{settingsTab === "appearance" ? (', debugSettingsStart);
  const debugSettingsPanel = settingsDialog.slice(debugSettingsStart, debugSettingsEnd);

  assert.ok(mainSettingsStart > -1);
  assert.ok(mainSettingsEnd > mainSettingsStart);
  assert.ok(debugSettingsStart > -1);
  assert.ok(debugSettingsEnd > debugSettingsStart);
  assert.doesNotMatch(mainSettingsPanel, /Request Permission|Test Capture Event|Check Shortcut/);
  assert.match(debugSettingsPanel, /Request Permission/);
  assert.match(debugSettingsPanel, /Test Capture Event/);
  assert.match(debugSettingsPanel, /Check Shortcut/);
  const registrationStart = app.indexOf("async function registerTidbitShortcut()");
  const registrationEnd = app.indexOf("void registerTidbitShortcut().catch", registrationStart);
  const registrationEffect = app.slice(registrationStart, registrationEnd);
  const tidbitGlassStart = css.indexOf(':root[data-window-glass="enabled"] .tidbit-capture');
  const tidbitGlassEnd = css.indexOf(".editor-surface h1", tidbitGlassStart);
  const tidbitGlassCss = css.slice(tidbitGlassStart, tidbitGlassEnd);
  const tidbitGlassRootRule =
    css.match(/:root\[data-window-glass="enabled"\] \.tidbit-capture \{[^}]*\}/)?.[0] ?? "";

  assert.ok(registrationStart > -1);
  assert.ok(registrationEnd > registrationStart);
  assert.ok(tidbitGlassStart > -1);
  assert.ok(tidbitGlassEnd > tidbitGlassStart);
  assert.ok(tidbitGlassRootRule);
  assert.doesNotMatch(registrationEffect, /requestTidbitShortcutAccessibilityPermission/);
  assert.doesNotMatch(registrationEffect, /checkAccessibilityPermission/);
  assert.match(css, /\.shortcut-capture-control/);
  assert.match(css, /\.settings-inline-actions/);
  assert.match(css, /\.settings-inline-action/);
  assert.match(capture, /function contextFromUrl/);
  assert.match(capture, /readPersistedAppearance/);
  assert.match(capture, /resolveAppearance/);
  assert.match(capture, /read_vault_settings/);
  assert.match(capture, /normalizeVaultAppearanceSettings/);
  assert.match(capture, /function applyCaptureGlassSettings/);
  assert.match(capture, /dataset\.windowGlass = appearance\.glassEffect \? "enabled" : "disabled"/);
  assert.match(capture, /--glyphary-glass-opacity/);
  assert.match(capture, /set_window_glass_effect/);
  assert.match(capture, /windowLabel: getCurrentWindow\(\)\.label/);
  assert.match(capture, /function tidbitDirectory/);
  assert.match(capture, /function tidbitDisplayName/);
  assert.match(capture, /function normalizeTidbitNameDraft/);
  assert.match(capture, /function tidbitRelativePathFromName/);
  assert.match(capture, /const \[nameEditing, setNameEditing\]/);
  assert.match(capture, /const \[nameDraft, setNameDraft\]/);
  assert.match(capture, /const saveRelativePath = tidbitRelativePathFromName\(relativePath, nameDraft\)/);
  assert.match(capture, /import \{ normalizeThemeTokens \} from "\.\/settings\/theme-options"/);
  assert.match(capture, /const tokens = normalizeThemeTokens\(settings\.theme\?\.tokens\)/);
  assert.match(capture, /document\.documentElement\.style\.setProperty\(token, value\)/);
  assert.match(capture, /getCurrentWindow\(\)\.setTheme\(appearance === "auto" \? null : appearance\)/);
  assert.match(capture, /requestAnimationFrame/);
  assert.match(capture, /getCurrentWindow\(\)[\s\S]*\.show\(\)/);
  assert.match(capture, /useEditor\(\{/);
  assert.match(capture, /Markdown\.configure/);
  assert.match(capture, /create_vault_markdown_file/);
  assert.match(capture, /relative: saveRelativePath/);
  assert.match(capture, /write_vault_file/);
  assert.match(capture, /emitTo\("main", "tidbit-capture-created"/);
  assert.match(capture, /event\.key === "Enter" && \(event\.metaKey \|\| event\.ctrlKey\)/);
  assert.match(capture, /event\.key === "Escape"/);
  assert.match(capture, /getCurrentWindow\(\)\.close\(\)/);
  assert.match(capture, /onKeyDownCapture=\{handleKeyDown\}/);
  assert.match(capture, /platform-macos/);
  assert.match(capture, /aria-label="Tidbit name"/);
  assert.match(capture, /onDoubleClick=\{\(\) => setNameEditing\(true\)\}/);
  assert.match(capture, /Double-click to rename before saving/);
  assert.match(capture, /tidbitDisplayName\(saveRelativePath\)/);
  assert.match(capture, /setStatus\(error instanceof Error \? error\.message : String\(error\)\)/);
  assert.match(main, /view"\) === "tidbit-capture"/);
  assert.match(main, /<TidbitCapture \/>/);
  assert.match(css, /\.tidbit-capture/);
  assert.match(css, /\.tidbit-capture \{[\s\S]*height: 100vh/);
  assert.match(css, /\.tidbit-capture \{[\s\S]*overflow: hidden/);
  assert.match(css, /\.tidbit-capture-path/);
  assert.match(css, /\.tidbit-capture-header input/);
  assert.match(css, /data-window-glass="enabled"\] \.tidbit-capture/);
  assert.match(css, /data-window-glass="enabled"\] \.tidbit-capture-header/);
  assert.match(css, /data-window-glass="enabled"\] \.tidbit-capture-editor/);
  assert.match(css, /data-window-glass="enabled"\] \.tidbit-capture-actions button/);
  assert.match(css, /data-window-glass="enabled"\] \.tidbit-capture-actions button\.primary,[\s\S]*background: var\(--accent\)/);
  assert.match(css, /data-window-glass="enabled"\] \.tidbit-capture-actions button\.primary,[\s\S]*color: var\(--accent-text\)/);
  // The onboarding tip primary button keeps accent styling under glass too.
  assert.match(css, /data-window-glass="enabled"\] \.onboarding-tip-card \.primary-action/);
  assert.match(css, /\.tidbit-capture\.platform-macos \.tidbit-capture-header/);
  assert.doesNotMatch(tidbitGlassRootRule, /backdrop-filter: none/);
  assert.match(css, /\.tidbit-capture-editor \.tiptap/);
  assert.match(css, /\.tidbit-capture-editor \.tiptap \{[\s\S]*max-width: var\(--glyphary-editor-max-width\)/);
});

test("native webview context menu is suppressed except for editor text services", () => {
  const app = readFileSync("src/App.tsx", "utf8");

  assert.match(app, /const suppressNativeContextMenu = \(event: MouseEvent\) => \{/);
  assert.match(app, /target\.closest\("\.ProseMirror\[contenteditable='true'\]"\)/);
  assert.match(app, /event\.preventDefault\(\);/);
  assert.match(app, /window\.addEventListener\("contextmenu", suppressNativeContextMenu\)/);
  assert.match(app, /window\.removeEventListener\("contextmenu", suppressNativeContextMenu\)/);
});

test("tauri starts with the requested default window size", () => {
  const config = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8"));
  const [windowConfig] = config.app.windows;

  assert.equal(windowConfig.width, 1470);
  assert.equal(windowConfig.height, 956);
});

test("interactive overlays use native modal and viewport-aware popover primitives", () => {
  const app = readFileSync("src/App.tsx", "utf8");
  const palette = readFileSync("src/command-palette/CommandPaletteDialog.tsx", "utf8");
  const canvasDialogs = readFileSync("src/canvas/CanvasDialogs.tsx", "utf8");
  const excalidraw = readFileSync("src/excalidraw/editor.tsx", "utf8");
  const modal = readFileSync("src/ui/ModalDialog.tsx", "utf8");
  const popover = readFileSync("src/ui/AnchoredPopover.tsx", "utf8");

  assert.match(modal, /dialog\.showModal\(\)/);
  assert.match(modal, /event\.target === event\.currentTarget/);
  assert.match(popover, /createPortal\(/);
  assert.match(popover, /window\.addEventListener\("scroll", updatePosition, true\)/);
  assert.match(app, /<AnchoredPopover[\s\S]*className="file-menu-popover"/);
  assert.match(palette, /<ModalDialog[\s\S]*className=\{anchor \? "command-palette-screen anchored" : "command-palette-screen"\}/);
  // The caret-anchored slash menu positions the card at the cursor and has no
  // Back navigation into the hierarchical root scope.
  assert.match(palette, /scope !== "root" && scope !== "flat"/);
  assert.match(app, /commandPaletteScope !== "root" && commandPaletteScope !== "flat"/);
  assert.match(canvasDialogs, /<ModalDialog[\s\S]*className="canvas-dialog-screen"/);
  assert.match(excalidraw, /<ModalDialog[\s\S]*className="excalidraw-dialog-screen"/);
  assert.doesNotMatch(app, /role="dialog"/);
  assert.doesNotMatch(excalidraw, /role="dialog"/);
});
