import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import {
  calendarDateKey,
  calendarDayRelativePath,
  calendarDayTitle,
  calendarPathDateKey,
} from "../.test-dist/calendar.js";
import {
  clampResizableDrawerWidth,
  findTabAcrossSplitGroups,
  recentFilesWithOpenedFile,
  remainingGroupAfterSplitPaneClose,
  splitHasDirtyTabs,
  tabIdForFile,
  tabsAfterClose,
} from "../.test-dist/tabs.js";
import {
  cleanVaultAssetReference,
  displayVaultRelativePath,
  escapeMarkdownUrl,
} from "../.test-dist/paths.js";
import {
  expandedFolderPathsForSelection,
  folderExpansionPaths,
  mergeExpandedFolderPaths,
} from "../.test-dist/folder-tree.js";
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
  appendFrontmatterEntry,
  composeMarkdown,
  frontmatterEntries,
  frontmatterEntryListValues,
  frontmatterListValues,
  frontmatterScalarValue,
  markdownHeadings,
  replaceFrontmatterEntry,
  serializeFrontmatterListValues,
  splitMetaHeader,
} from "../.test-dist/markdown.js";
import {
  excalidrawFileNameForTitle,
  fileNameForDroppedImage,
  fileNameForDroppedPath,
  imageFilesFromDataTransfer,
  imagePathsFromDrop,
  isSupportedImageFile,
} from "../.test-dist/assets.js";
import {
  expandDateFormat,
  expandDateTemplate,
} from "../.test-dist/dates.js";
import {
  glypharyOpenUrl,
  parseGlypharyOpenUrl,
  resolveDeepLinkVaultRoot,
} from "../.test-dist/deep-links.js";
import { reorderedStarredFiles } from "../.test-dist/starred-files.js";
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

test("Glyphary deep links parse Obsidian-style open requests", () => {
  assert.deepEqual(
    parseGlypharyOpenUrl("glyphary://open?vault=Demo&file=00%20Start%20Here.md"),
    { vaultName: "Demo", filePath: "00 Start Here.md" },
  );
  assert.deepEqual(parseGlypharyOpenUrl("glyphary://open?file=Note.md"), {
    vaultName: undefined,
    filePath: "Note.md",
  });
  assert.equal(
    glypharyOpenUrl("Demo", "00 Start Here/01 Quick Start.md"),
    "glyphary://open?vault=Demo&file=00+Start+Here%2F01+Quick+Start.md",
  );
  assert.equal(parseGlypharyOpenUrl("glyphary://new?file=Note.md"), null);
  assert.equal(
    resolveDeepLinkVaultRoot("demo", "/vaults/current", [
      { name: "Demo", root: "/vaults/demo", lastOpenedAt: 1 },
    ]),
    "/vaults/demo",
  );
  assert.equal(resolveDeepLinkVaultRoot("current", "/vaults/current", []), "/vaults/current");
});

test("starred file reordering keeps the dragged item in the requested position", () => {
  assert.deepEqual(
    reorderedStarredFiles(["A.md", "B.md", "C.md"], "A.md", 3),
    ["B.md", "C.md", "A.md"],
  );
  assert.deepEqual(
    reorderedStarredFiles(["A.md", "B.md", "C.md"], "C.md", 0),
    ["C.md", "A.md", "B.md"],
  );
});

test("date templates expand centrally for tidbit paths", () => {
  const date = new Date(2026, 5, 15, 9, 4, 7);

  assert.equal(expandDateFormat("YYYY-MM-DD-HH-mm-ss", date), "2026-06-15-09-04-07");
  assert.equal(expandDateFormat("YYYY-mm-DD-hh-mm-ss", date), "2026-06-15-09-04-07");
  assert.equal(
    expandDateTemplate(defaultTidbitPathPattern, date),
    "__transit__/Objects/tidbit-2026-06-15-09-04-07.md",
  );
  assert.equal(defaultTidbitGlobalShortcut, "CommandOrControl+Shift+Space");
});

test("vault documents open with one click by default and can require double-clicking", () => {
  const app = readFileSync("src/App.tsx", "utf8");
  const vaultFileOperations = readFileSync("src/vault/file-operations.ts", "utf8");
  const paletteDefinitions = readFileSync("src/command-palette/command-definitions.ts", "utf8");
  const folderTree = readFileSync("src/vault/VaultFolderTree.tsx", "utf8");
  const settingsDialog = readFileSync("src/settings/SettingsDialog.tsx", "utf8");

  assert.equal(defaultFileDisplaySettings.openDocumentsOnDoubleClick, false);
  assert.equal(normalizeFileDisplaySettings(null).openDocumentsOnDoubleClick, false);
  assert.equal(
    normalizeFileDisplaySettings({
      ...defaultFileDisplaySettings,
      openDocumentsOnDoubleClick: true,
    }).openDocumentsOnDoubleClick,
    true,
  );
  assert.equal(shouldOpenDocumentOnClick(false, 0), true);
  assert.equal(shouldOpenDocumentOnClick(false, 1), true);
  assert.equal(shouldOpenDocumentOnClick(false, 2), false);
  assert.equal(shouldOpenDocumentOnClick(true, 0), true);
  assert.equal(shouldOpenDocumentOnClick(true, 1), false);
  assert.equal(shouldOpenDocumentOnClick(true, 2), true);
  assert.match(
    app,
    /shouldOpenDocumentOnClick\(\s*savedFileDisplaySettings\.openDocumentsOnDoubleClick,\s*event\.detail/,
  );
  assert.match(app, /handleDocumentClick\(event, \(\) => openCalendarDay\(date\)\)/);
  assert.doesNotMatch(app, /onDoubleClick=\{\(\) => openCalendarDay\(date\)\}/);
  assert.match(folderTree, /shouldOpenDocumentOnClick\(openDocumentsOnDoubleClick, event\.detail\)/);
  assert.match(settingsDialog, /Open documents with a double click/);
});

test("interface settings group optional Files header actions", () => {
  const app = readFileSync("src/App.tsx", "utf8");
  const vaultFileOperations = readFileSync("src/vault/file-operations.ts", "utf8");
  const paletteDefinitions = readFileSync("src/command-palette/command-definitions.ts", "utf8");
  const settingsDialog = readFileSync("src/settings/SettingsDialog.tsx", "utf8");
  const toolbarIcons = readFileSync("src/toolbar-icons.tsx", "utf8");
  const vaultTitlebarActions = readFileSync("src/vault/VaultTitlebarActions.tsx", "utf8");

  assert.equal(defaultFileDisplaySettings.showNewNoteButton, true);
  assert.equal(defaultFileDisplaySettings.showNewFolderButton, true);
  assert.equal(normalizeFileDisplaySettings(null).showNewNoteButton, true);
  assert.equal(normalizeFileDisplaySettings(null).showNewFolderButton, true);
  assert.equal(
    normalizeFileDisplaySettings({
      ...defaultFileDisplaySettings,
      showNewNoteButton: false,
      showNewFolderButton: false,
    }).showNewNoteButton,
    false,
  );
  assert.match(app, /savedFileDisplaySettings\.showNewNoteButton/);
  assert.match(app, /savedFileDisplaySettings\.showNewFolderButton/);
  assert.match(app, /openFolderActionDialog\("create-note", currentDirectoryEntry\(\)\)/);
  assert.match(app, /openFolderActionDialog\("create-folder", currentDirectoryEntry\(\)\)/);
  assert.match(app, /<VaultTitlebarActions/);
  assert.match(vaultTitlebarActions, /className="titlebar-vault-actions"/);
  assert.match(vaultTitlebarActions, /aria-label="Back"/);
  assert.match(settingsDialog, /aria-label="Interface settings"/);
  assert.match(settingsDialog, /Show new note button/);
  assert.match(settingsDialog, /Show new folder button/);
  assert.match(settingsDialog, /Show document proxy in title bar/);
  assert.match(settingsDialog, /Show status bar/);
  assert.match(toolbarIcons, /"file-plus"/);
  assert.match(toolbarIcons, /"folder-plus"/);
});

test("vault onboarding hides document and drawer chrome", () => {
  const app = readFileSync("src/App.tsx", "utf8");
  const vaultFileOperations = readFileSync("src/vault/file-operations.ts", "utf8");
  const paletteDefinitions = readFileSync("src/command-palette/command-definitions.ts", "utf8");
  const titlebar = app.slice(
    app.indexOf('<header className="titlebar"'),
    app.indexOf("</header>", app.indexOf('<header className="titlebar"')),
  );

  assert.match(titlebar, /\{vaultRoot \? \(\s*<>/);
  assert.match(titlebar, /className="app-actions"/);
  assert.match(app, /<section className="vault-onboarding" aria-label="Open a vault">/);
  assert.match(app, /vaultRoot && normalizedVaultAppearanceDraft\.statusBarVisible \? \(/);
});

test("vault paths display relative to the vault root without markdown extensions", () => {
  assert.equal(displayVaultRelativePath(""), "/");
  assert.equal(displayVaultRelativePath("folder1/hello.md"), "folder1/hello");
  assert.equal(displayVaultRelativePath("/folder1/hello.markdown"), "folder1/hello");
  assert.equal(
    displayVaultRelativePath(
      "/Users/Chris/Documents/Obsidian/CFR/folder1/hello.md",
      "/Users/Chris/Documents/Obsidian/CFR",
    ),
    "folder1/hello",
  );
  assert.equal(
    displayVaultRelativePath(
      "/Users/Chris/Documents/Obsidian/CFR",
      "/Users/Chris/Documents/Obsidian/CFR",
    ),
    "/",
  );
});

test("folder tree expansion follows selected folder and active file parents", () => {
  assert.deepEqual(folderExpansionPaths("Meta/Sub"), ["Meta", "Meta/Sub"]);
  assert.deepEqual(
    expandedFolderPathsForSelection("Calendar", "Meta/Sub/Home.md"),
    ["", "Calendar", "Meta", "Meta/Sub"],
  );
  assert.deepEqual(mergeExpandedFolderPaths(["", "Meta"], ["", "Meta/Sub"]), [
    "",
    "Meta",
    "Meta/Sub",
  ]);
});

test("local vault image references are accepted while URLs and path escapes are rejected", () => {
  assert.equal(cleanVaultAssetReference("image.png"), "image.png");
  assert.equal(cleanVaultAssetReference("folder/image.png|alias"), "folder/image.png");
  assert.equal(
    cleanVaultAssetReference("Pasted%20image%2020220413143858.png"),
    "Pasted image 20220413143858.png",
  );
  assert.equal(
    cleanVaultAssetReference("Pasted%20image%2020220413152337.png"),
    "Pasted image 20220413152337.png",
  );
  assert.equal(cleanVaultAssetReference("![[vllm-logo.png]]"), null);
  assert.equal(cleanVaultAssetReference("!%5B%5Bvllm-logo.png%5D%5D"), null);
  assert.equal(cleanVaultAssetReference("https://example.com/image.png"), null);
  assert.equal(cleanVaultAssetReference("https%3A%2F%2Fexample.com%2Fimage.png"), null);
  assert.equal(cleanVaultAssetReference("../image.png"), null);
  assert.equal(cleanVaultAssetReference("folder/../image.png"), null);
  assert.equal(cleanVaultAssetReference("bad%zz.png"), null);
});

test("markdown local image URLs are percent-encoded while external URLs stay intact", () => {
  assert.equal(
    escapeMarkdownUrl("Pasted image 20220413143858.png"),
    "Pasted%20image%2020220413143858.png",
  );
  assert.equal(
    escapeMarkdownUrl("folder/Pasted image 20220413143858.png"),
    "folder/Pasted%20image%2020220413143858.png",
  );
  assert.equal(escapeMarkdownUrl("https://example.com/Pasted image.png"), "https://example.com/Pasted image.png");
});

test("dropped image names follow the pasted-image timestamp convention", () => {
  const date = new Date(2023, 0, 2, 17, 37, 41);

  assert.equal(
    fileNameForDroppedImage({ name: "image.png", type: "image/png" }, date),
    "Pasted image 20230102173741.png",
  );
  assert.equal(
    fileNameForDroppedImage({ name: "Screen Shot: Draft?.jpeg", type: "image/jpeg" }, date),
    "Screen Shot- Draft 20230102173741.jpg",
  );
  assert.equal(
    fileNameForDroppedImage({ name: "diagram.webp", type: "" }, date),
    "diagram 20230102173741.webp",
  );
  assert.equal(
    fileNameForDroppedPath("/tmp/Screen Shot: Draft?.jpeg", date),
    "Screen Shot- Draft 20230102173741.jpg",
  );
  assert.deepEqual(imagePathsFromDrop(["/tmp/photo.png", "/tmp/notes.txt"]), [
    "/tmp/photo.png",
  ]);
});

test("calendar filenames match the requested note naming scheme and dot marker keys", () => {
  const app = readFileSync("src/App.tsx", "utf8");
  const vaultFileOperations = readFileSync("src/vault/file-operations.ts", "utf8");
  const paletteDefinitions = readFileSync("src/command-palette/command-definitions.ts", "utf8");
  const settingsDialog = readFileSync("src/settings/SettingsDialog.tsx", "utf8");
  const appTypes = readFileSync("src/lib/app-types.ts", "utf8");
  const css = readFileSync("src/App.css", "utf8");
  const settings = readFileSync("src/lib/settings.ts", "utf8");
  const openCalendarDay = app.slice(
    app.indexOf("async function openCalendarDay"),
    app.indexOf("async function openDirectoryShadow"),
  );
  const day = new Date(2026, 5, 14);

  assert.equal(calendarDayTitle(day), "Sun, Jun 14th 2026");
  assert.equal(calendarDayRelativePath(day), "Calendar/Sun, Jun 14th 2026.md");
  assert.equal(calendarDateKey(day), "2026-06-14");
  assert.equal(calendarPathDateKey("Calendar/Sun, Jun 14th 2026.md"), "2026-06-14");
  assert.equal(calendarPathDateKey("Calendar/Mon, Jun 14th 2026.md"), null);
  assert.match(openCalendarDay, /await revealFileInVaultDrawer\(existing\.tab\.activeFile\)/);
  assert.match(openCalendarDay, /await revealFileInVaultDrawer\(tab\.activeFile\)/);
  assert.doesNotMatch(openCalendarDay, /await loadEntries\(vaultRoot, currentDir\)/);
  assert.match(settings, /minimumCalendarPreviewDelayMs = 0/);
  assert.match(settings, /maximumCalendarPreviewDelayMs = 5000/);
  assert.match(settings, /defaultEditorBehaviorSettings: EditorBehaviorSettings = \{\s*calendarPreviewDelayMs: 2000,/);
  assert.match(appTypes, /export type EditorBehaviorSettings = \{\s*calendarPreviewDelayMs: number;\s*vimMode: boolean;/);
  assert.match(app, /const calendarPreviewWidth = 320/);
  assert.match(app, /function calendarPreviewPosition\(event: ReactMouseEvent<HTMLButtonElement> \| ReactPointerEvent<HTMLButtonElement>\)/);
  assert.match(app, /function scheduleCalendarDayPreview\(\s*date: Date,\s*event: ReactMouseEvent<HTMLButtonElement> \| ReactPointerEvent<HTMLButtonElement>,\s*\)/);
  assert.match(app, /function moveCalendarDayPreview\(/);
  assert.match(app, /const hasExistingNote = calendarNoteDateKeySet\.has\(dateKey\)/);
  assert.match(
    app,
    /markdown: `No calendar note yet\. \$\{calendarDayOpenAction\} this day to create it\.`/,
  );
  assert.match(app, /title=\{`\$\{calendarDayOpenAction\} to open \$\{calendarDayTitle\(date\)\}`\}/);
  assert.match(app, /calendarPreviewTimer\.current = setTimeout/);
  assert.match(app, /\}, editorBehavior\.calendarPreviewDelayMs\)/);
  assert.match(app, /readVaultFile\(vaultRootRef\.current, relativePath\)/);
  assert.match(app, /onMouseEnter=\{\(event\) => scheduleCalendarDayPreview\(date, event\)\}/);
  assert.match(app, /onMouseLeave=\{closeCalendarDayPreview\}/);
  assert.match(app, /onMouseMove=\{\(event\) => moveCalendarDayPreview\(date, event\)\}/);
  assert.match(app, /onPointerEnter=\{\(event\) => scheduleCalendarDayPreview\(date, event\)\}/);
  assert.match(app, /onPointerLeave=\{closeCalendarDayPreview\}/);
  assert.match(app, /aria-label="Previous month"[\s\S]*title="Previous month"/);
  assert.match(app, /aria-label="Next month"[\s\S]*title="Next month"/);
  assert.match(app, /aria-label="Jump to today"[\s\S]*title="Jump to today"/);
  assert.match(app, /const today = new Date\(\);\s*setCalendarMonth\(new Date\(today\.getFullYear\(\), today\.getMonth\(\), 1\)\)/);
  assert.match(css, /grid-template-columns: 30px minmax\(0, 1fr\) 30px/);
  assert.match(css, /\.calendar-navigation-button \{[\s\S]*width: 30px/);
  assert.match(css, /\.calendar-footer \{[\s\S]*justify-content: flex-start/);
  assert.match(app, /className="calendar-day-preview"/);
  assert.match(app, /style=\{\{ left: calendarDayPreview\.x, top: calendarDayPreview\.y \}\}/);
  assert.match(app, /<CanvasMarkdownPreview markdown=\{calendarDayPreview\.markdown\} \/>/);
  assert.match(app, /aria-label=\{`Preview \$\{calendarDayPreview\.title\}`\}/);
  assert.match(settingsDialog, /Calendar preview delay/);
  assert.match(settingsDialog, /value=\{editorBehaviorDraft\.calendarPreviewDelayMs\}/);
  assert.match(readFileSync("src/canvas/CanvasNodes.tsx", "utf8"), /export function CanvasMarkdownPreview/);
  assert.match(css, /\.calendar-day-preview/);
  assert.match(css, /width: 320px/);
  assert.match(css, /background: var\(--surface\)/);
  assert.match(css, /\.calendar-day-preview \.canvas-markdown-preview/);
  assert.match(css, /pointer-events: none/);
});

test("recent files are newest-first unique and capped", () => {
  const existing = Array.from({ length: maxRecentFiles }, (_, index) => ({
    name: `Note ${index}.md`,
    relativePath: `notes/note-${index}.md`,
  }));
  const reopened = {
    name: "Note 4.md",
    relativePath: "notes/note-4.md",
  };
  const withReopened = recentFilesWithOpenedFile(existing, reopened);

  assert.equal(withReopened[0].relativePath, "notes/note-4.md");
  assert.equal(
    withReopened.filter((file) => file.relativePath === "notes/note-4.md").length,
    1,
  );

  const withNewFile = recentFilesWithOpenedFile(withReopened, {
    name: "New.md",
    relativePath: "new.md",
  });

  assert.equal(withNewFile.length, maxRecentFiles);
  assert.equal(withNewFile[0].relativePath, "new.md");
  assert.equal(withNewFile.at(-1)?.relativePath, "notes/note-18.md");
});

test("vault library entries persist alphabetically and can be removed", () => {
  const store = new Map();
  const previousWindow = globalThis.window;
  globalThis.window = {
    localStorage: {
      getItem: (key) => store.get(key) ?? null,
      setItem: (key, value) => store.set(key, String(value)),
    },
  };

  try {
    let entries = upsertPersistedVaultLibrary([], "/Users/chris/Notes/CFR", 1000);
    entries = upsertPersistedVaultLibrary(entries, "/Users/chris/Notes/Research", 3000);

    assert.deepEqual(entries.map((entry) => entry.root), [
      "/Users/chris/Notes/CFR",
      "/Users/chris/Notes/Research",
    ]);
    assert.equal(entries[0].name, "CFR");
    assert.equal(JSON.parse(store.get(vaultLibraryStorageKey)).length, 2);
    assert.equal(readPersistedVaultLibrary()[0].name, "CFR");
    assert.equal(readPersistedVaultLibrary()[1].lastOpenedAt, 3000);

    entries = updatePersistedVaultLibraryEntry(entries, "/Users/chris/Notes/CFR", {
      coverImage: "/Users/chris/Pictures/cfr-cover.png",
    });
    entries = upsertPersistedVaultLibrary(entries, "/Users/chris/Notes/Research", 4000);

    assert.equal(entries[0].coverImage, "/Users/chris/Pictures/cfr-cover.png");
    assert.equal(readPersistedVaultLibrary()[0].coverImage, "/Users/chris/Pictures/cfr-cover.png");

    entries = removePersistedVaultLibraryEntry(entries, "/Users/chris/Notes/CFR");

    assert.deepEqual(entries.map((entry) => entry.root), ["/Users/chris/Notes/Research"]);
  } finally {
    if (previousWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = previousWindow;
    }
  }
});

test("workspace sessions are persisted independently per vault", () => {
  const store = new Map();
  const previousWindow = globalThis.window;
  globalThis.window = {
    localStorage: {
      getItem: (key) => store.get(key) ?? null,
      setItem: (key, value) => store.set(key, String(value)),
    },
  };

  try {
    writePersistedWorkspace({
      vaultRoot: "/Users/chris/Notes/CFR",
      currentDir: "Meta",
      activeFile: { name: "Home.md", relativePath: "Meta/Home.md" },
      openFiles: [
        { name: "Home.md", relativePath: "Meta/Home.md" },
        { name: "Roadmap.md", relativePath: "Meta/Roadmap.md" },
      ],
      recentFiles: [{ name: "Home.md", relativePath: "Meta/Home.md" }],
      vaultDrawerOpen: true,
      vaultDrawerItem: "files",
      drawerOpen: false,
      drawerItem: "source",
      splitOpen: false,
    });
    writePersistedWorkspace({
      vaultRoot: "/Users/chris/Notes/Research",
      currentDir: "Sources",
      activeFile: { name: "Sources.base", relativePath: "Sources.base" },
      openFiles: [{ name: "Sources.base", relativePath: "Sources.base" }],
      recentFiles: [],
      vaultDrawerOpen: true,
      vaultDrawerItem: "vaults",
      drawerOpen: true,
      drawerItem: "calendar",
      splitOpen: false,
    });

    const sessions = JSON.parse(store.get(workspaceSessionsStorageKey));

    assert.equal(sessions.activeVaultRoot, "/Users/chris/Notes/Research");
    assert.equal(readPersistedWorkspace()?.vaultRoot, "/Users/chris/Notes/Research");
    assert.deepEqual(
      readPersistedWorkspaceForVault("/Users/chris/Notes/CFR")?.openFiles.map(
        (file) => file.relativePath,
      ),
      ["Meta/Home.md", "Meta/Roadmap.md"],
    );
    assert.equal(
      readPersistedWorkspaceForVault("/Users/chris/Notes/Research")?.drawerItem,
      "calendar",
    );
    assert.equal(
      JSON.parse(store.get(workspaceStorageKey)).vaultRoot,
      "/Users/chris/Notes/Research",
    );
  } finally {
    if (previousWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = previousWindow;
    }
  }
});

test("vault drawer exposes files search recent and task views", () => {
  const app = readFileSync("src/App.tsx", "utf8");
  const vaultFileOperations = readFileSync("src/vault/file-operations.ts", "utf8");
  const paletteDefinitions = readFileSync("src/command-palette/command-definitions.ts", "utf8");
  const appTypes = readFileSync("src/lib/app-types.ts", "utf8");
  const commandPalette = readFileSync("src/command-palette/commands.ts", "utf8");
  const starredFiles = readFileSync("src/lib/starred-files.ts", "utf8");
  const settings = readFileSync("src/lib/settings.ts", "utf8");
  const vaultTasks = readFileSync("src/tasks/vault-tasks.ts", "utf8");
  const vaultSearch = readFileSync("src/search/vault-search.ts", "utf8");
  const fileActions = readFileSync("src/vault/file-actions.ts", "utf8");
  const editorPane = readFileSync("src/editor/EditorPane.tsx", "utf8");
  const css = readFileSync("src/App.css", "utf8");

  assert.match(appTypes, /export type TaskFilter = "incomplete" \| "complete" \| "all"/);
  assert.match(appTypes, /export type TaskSort = "name" \| "date"/);
  assert.match(appTypes, /modifiedMs\?: number/);
  assert.match(appTypes, /starredFiles\?: string\[\] \| null/);
  assert.match(appTypes, /export type VaultDrawerItem = "vaults" \| "files" \| "search" \| "starred" \| "recent" \| "tasks"/);
  assert.match(appTypes, /export type VaultLibraryEntry/);
  assert.match(appTypes, /coverImage\?: string \| null/);
  assert.match(settings, /export const defaultStarredFiles: string\[\] = \[\]/);
  assert.match(settings, /vaultLibraryStorageKey/);
  assert.match(settings, /upsertPersistedVaultLibrary/);
  assert.match(settings, /updatePersistedVaultLibraryEntry/);
  assert.match(settings, /export function normalizeStarredFiles/);
  assert.match(app, /recentFilesWithOpenedFile/);
  assert.match(app, /readPersistedVaultLibrary/);
  assert.match(app, /vaultLibraryShelves/);
  assert.match(appTypes, /recentFiles: ActiveFile\[\]/);
  assert.match(app, /Switch workspaces/);
  assert.match(app, /vaultLibraryOverlayOpen/);
  assert.match(app, /toggleVaultLibraryOverlay/);
  assert.doesNotMatch(app, /toggleVaultDrawerItem\("vaults"\)/);
  assert.match(app, /openVaultRoot\(entry\.root\)/);
  assert.match(app, /readPersistedWorkspaceForVault\(root\)/);
  assert.match(app, /const nextVaultRoot = next\.vaultRoot \?\? vaultRootRef\.current \?\? vaultRoot/);
  assert.match(app, /currentDir: next\.currentDir \?\? currentDirRef\.current/);
  assert.match(app, /activeFile: next\.activeFile === undefined \? activeFileRef\.current : next\.activeFile/);
  assert.match(app, /if \(vaultRootRef\.current !== root\) \{\s*return;\s*\}/);
  assert.match(settings, /workspaceSessionsStorageKey/);
  assert.match(app, /forgetVaultLibraryEntry\(entry\.root\)/);
  assert.match(app, /showVaultLibraryEntryMenu/);
  assert.match(app, /Choose Cover Image\.\.\./);
  assert.match(app, /Remove Cover Image/);
  assert.match(app, /import_vault_library_cover/);
  assert.match(app, /allow_vault_library_covers/);
  assert.match(app, /Recently opened files/);
  assert.match(app, /starredFiles: defaultStarredFiles/);
  assert.match(app, /toggleVaultDrawerItem\("recent"\)/);
  assert.match(app, /toggleVaultDrawerItem\("starred"\)/);
  assert.match(app, /toggleVaultDrawerItem\("tasks"\)/);
  assert.match(css, /\.vault-library-screen/);
  assert.match(css, /\.vault-library-card/);
  assert.match(css, /\.vault-library-shelf/);
  assert.match(css, /\.vault-library-book/);
  assert.match(css, /\.vault-library-book\.has-cover/);
  assert.match(css, /\.vault-library-cover/);
  assert.match(app, /Starred files/);
  assert.match(app, /const activeFileBackedPath = activeDocumentTab\?\.activeFile\?\.relativePath \?\? ""/);
  assert.match(paletteDefinitions, /id: activeFileStarred \? "unstar-file" : "star-file"/);
  assert.match(app, /function toggleActiveFileStar/);
  assert.match(paletteDefinitions, /\.\.\.activeFileCommandPaletteCommands/);
  assert.match(commandPalette, /command\.id !== "star-file"/);
  assert.match(app, /const \[draggingStarredPath, setDraggingStarredPath\] = useState\(""\)/);
  assert.match(app, /const draggingStarredPathRef = useRef\(""\)/);
  assert.match(app, /const suppressStarredClickRef = useRef\(false\)/);
  assert.match(app, /const \[starredDragOrder, setStarredDragOrder\] = useState<string\[\] \| null>\(null\)/);
  assert.match(app, /const starredListRef = useRef<HTMLDivElement \| null>\(null\)/);
  assert.match(app, /const starredDragOrderRef = useRef<string\[\] \| null>\(null\)/);
  assert.match(app, /const starredPointerIdRef = useRef<number \| null>\(null\)/);
  assert.match(app, /const \[starredDropIndex, setStarredDropIndex\] = useState<number \| null>\(null\)/);
  assert.match(starredFiles, /function starredDropIndexFromPointer\(container: HTMLElement, pointerY: number\)/);
  assert.match(starredFiles, /querySelectorAll<HTMLElement>\("\[data-starred-path\]"\)/);
  assert.match(starredFiles, /function reorderedStarredFiles\(/);
  assert.match(app, /function previewStarredFileReorder\(pointerY: number\)/);
  assert.match(starredFiles, /let targetIndex = Math\.max\(0, Math\.min\(dropIndex, current\.length\)\)/);
  assert.match(starredFiles, /next\.splice\(targetIndex, 0, dragged\)/);
  assert.match(app, /onPointerDown=\{\(event: ReactPointerEvent<HTMLButtonElement>\) => \{/);
  assert.match(app, /startStarredPointerDrag\(event, file\.relativePath, index\)/);
  assert.match(app, /onPointerMove=\{updateStarredPointerDrag\}/);
  assert.match(app, /void finishStarredPointerDrag\(true\)/);
  assert.match(app, /draggingStarredPathRef\.current = relativePath/);
  assert.match(app, /starredDragOrderRef\.current = next/);
  assert.match(app, /suppressStarredClickRef\.current = true/);
  assert.match(css, /\.starred-entry\.drop-target/);
  assert.match(css, /\.starred-entry\.drop-target-after/);
  assert.match(css, /touch-action: none/);
  assert.deepEqual(
    normalizeStarredFiles([
      "Notes/A.md",
      "Views/Sources.base",
      "Canvas/Map.canvas",
      "image.png",
      "../escape.base",
    ]),
    ["Notes/A.md", "Views/Sources.base", "Canvas/Map.canvas"],
  );
  assert.match(app, /useState<TaskFilter>\("incomplete"\)/);
  assert.match(app, /useState<TaskSort>\("name"\)/);
  assert.match(app, /taskListQuery/);
  assert.match(app, /visibleTaskResults/);
  assert.match(app, /setTaskListQuery\(event\.currentTarget\.value\)/);
  assert.match(app, /setTaskSort\(event\.currentTarget\.value as TaskSort\)/);
  assert.match(vaultTasks, /right\.modifiedMs \?\? 0/);
  assert.match(vaultTasks, /function taskSearchPattern/);
  assert.match(vaultTasks, /function taskResultPresentation/);
  assert.match(vaultTasks, /line\.match\(\/\^- \\\[/);
  assert.ok(vaultTasks.includes('return "- \\\\[[xX]\\\\]";'));
  assert.ok(vaultTasks.includes('return "- \\\\[ \\\\]";'));
  assert.match(app, /includeContent: true/);
  assert.match(app, /markdownOnly: true/);
  assert.match(app, /excludeDotPaths: true/);
  assert.match(app, /aria-label="Refresh tasks"/);
  assert.match(app, /renderToolbarIcon\("refresh"\)/);
  assert.match(app, /renderToolbarIcon\(task\.completed \? "task-done" : "task-open"\)/);
  assert.match(app, /result\.isContentMatch/);
  assert.match(app, /visibleVaultSearchResults\(searchResults\)/);
  assert.match(vaultSearch, /const seenPaths = new Set<string>\(\)/);
  assert.match(vaultSearch, /const matchCounts = searchResults\.reduce/);
  assert.match(vaultSearch, /counts\.set\(result\.relativePath, \(counts\.get\(result\.relativePath\) \?\? 0\) \+ 1\)/);
  assert.match(vaultSearch, /seenPaths\.has\(result\.relativePath\)/);
  assert.match(vaultSearch, /\.sort\(\(left, right\) => \(right\.modifiedMs \?\? 0\) - \(left\.modifiedMs \?\? 0\)\)/);
  assert.match(vaultSearch, /matchCount: matchCounts\.get\(result\.relativePath\) \?\? 1/);
  assert.match(app, /async function searchVault\(\) \{[\s\S]*markdownOnly: true/);
  assert.match(app, /visibleSearchResults\.map\(\(\{ matchCount, result \}, index\) =>/);
  assert.match(app, /matchCount === 1 \? "1 match" : `\$\{matchCount\} matches`/);
  assert.match(app, /async function openFile\(\s*relativePath: string,[\s\S]*revealInVaultDrawer\?: boolean/);
  assert.match(app, /async function openSearchResult\(result: SearchResult\) \{[\s\S]*openFile\(result\.relativePath, \{ revealInVaultDrawer: false \}\)/);
  assert.match(css, /\.vault-tasks/);
  assert.match(css, /\.task-options/);
  assert.match(css, /\.task-list-tools/);
  assert.match(css, /\.task-list-tools input/);
  assert.match(css, /\.task-list-tools select/);
  assert.match(css, /\.task-refresh-button svg/);
  assert.match(css, /\.task-result-icon/);
  assert.match(css, /\.task-result-text/);
  assert.match(css, /\.task-results/);
  assert.doesNotMatch(app, /className="file-context"/);
  assert.match(app, /import \{ openPath, openUrl, revealItemInDir \} from "@tauri-apps\/plugin-opener"/);
  assert.match(fileActions, /export function vaultEntryPath/);
  assert.match(vaultFileOperations, /async function revealEntryFromContextMenu/);
  assert.match(vaultFileOperations, /async function openEntryFromContextMenu/);
  assert.match(app, /displayVaultRelativePath\(activeFile\?\.relativePath \?\? currentDir, vaultRoot\)/);
  assert.match(editorPane, /frontmatterScalarValue\(paneMetaHeader, "banner"\)/);
  assert.match(editorPane, /frontmatterEntries\(paneMetaHeader, paneMetaDelimiter\)/);
  assert.match(editorPane, /frontmatterEntryListValues\(/);
  assert.match(editorPane, /className="frontmatter-row"/);
  assert.match(editorPane, /className="frontmatter-value-list"/);
  assert.match(editorPane, /className="frontmatter-remove"/);
  assert.match(editorPane, /className="frontmatter-add"/);
  assert.doesNotMatch(editorPane, /<textarea/);
  assert.match(css, /\.metadata-toggle::before[\s\S]*border-left: 6px solid/);
  assert.match(app, /useState<"edit" \| "view">\("edit"\)/);
  assert.match(app, /className="view-mode-control"/);
  assert.match(app, /aria-label="Document display mode"/);
  assert.match(app, /aria-label="View mode"/);
  assert.match(app, /aria-label="Edit mode"/);
  assert.match(app, /<svg aria-hidden="true" viewBox="0 0 24 24">/);
  assert.match(app, /setDocumentDisplayMode\("view"\)/);
  assert.match(app, /setDocumentDisplayMode\("edit"\)/);
  assert.match(editorPane, /const showEditingChrome = documentDisplayMode === "edit"/);
  assert.match(editorPane, /isMarkdownTab && showEditingChrome/);
  assert.match(editorPane, /isActiveGroup && isMarkdownTab && showEditingChrome/);
  assert.match(editorPane, /className="document-banner"/);
  assert.match(editorPane, /className="document-banner"[\s\S]*className="metadata-shell"/);
  assert.match(editorPane, /<img alt="" src=\{bannerSrc\} \/>/);
  assert.doesNotMatch(app, /vaultDrawerItem === "files"[\s\S]*?return vaultRoot \|\| "No vault selected"/);
  assert.doesNotMatch(app, /aria-label="Close vault drawer"/);
  assert.match(editorPane, /className=\{isActiveGroup \? "editor-pane-shell active-group" : "editor-pane-shell"\}/);
  assert.match(css, /\.editor-pane-shell/);
  assert.match(css, /\.view-mode-control/);
  assert.match(css, /\.view-mode-button/);
  assert.match(css, /\.view-mode-button svg/);
  assert.match(css, /\.view-mode-button\.active/);
  assert.match(css, /\.document-banner/);
  assert.match(css, /\.document-banner img/);
  assert.match(css, /\.editor-pane-shell\.active-group \.editor-pane/);
  assert.match(css, /\.editor-groups \{[\s\S]*grid-auto-rows: minmax\(0, 1fr\)/);
  assert.match(css, /\.editor-pane-shell \{[\s\S]*height: 100%/);
  assert.match(css, /\.editor-pane \{[\s\S]*flex: 1/);
  assert.doesNotMatch(css, /\.editor-groups\s*\{[^}]*padding-top:\s*50px/s);
  assert.match(css, /\.recent-entry-text/);
  assert.match(css, /\.recent-entry em/);
});

test("vault rows expose context menu actions for folders and files", () => {
  const app = readFileSync("src/App.tsx", "utf8");
  const vaultFileOperations = readFileSync("src/vault/file-operations.ts", "utf8");
  const paletteDefinitions = readFileSync("src/command-palette/command-definitions.ts", "utf8");
  const fileActions = readFileSync("src/vault/file-actions.ts", "utf8");
  const vaultContextMenu = readFileSync("src/vault/VaultContextMenu.tsx", "utf8");
  const vaultTree = readFileSync("src/vault/VaultFolderTree.tsx", "utf8");
  const vaultIcons = readFileSync("src/vault/VaultIcons.tsx", "utf8");
  const vaultPersistence = readFileSync("src/vault/persistence.ts", "utf8");
  const documentsState = readFileSync("src/app-state/documents.ts", "utf8");
  const css = readFileSync("src/App.css", "utf8");
  const backend = readFileSync("src-tauri/src/lib.rs", "utf8");
  const vaultBackend = readFileSync("src-tauri/src/vault.rs", "utf8");
  const config = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8"));

  assert.match(app, /onContextMenu=\{\(event\) => handleFolderContextMenu\(entry, event\)\}/);
  assert.match(app, /function currentDirectoryEntry\(\): VaultEntry/);
  assert.match(app, /function handleVaultListContextMenu\(event: ReactMouseEvent<HTMLDivElement>\)/);
  assert.match(app, /onContextMenu=\{handleVaultListContextMenu\}/);
  assert.match(app, /showVaultNativeContextMenu\(currentDirectoryEntry\(\), event, true\)/);
  assert.match(app, /fallbackVaultContextMenu\(entry, event, createOnly\)/);
  assert.match(vaultContextMenu, /!menu\.createOnly/);
  assert.match(app, /suppressDirectoryClickRef/);
  assert.match(app, /onMouseDown=\{\(event\) => handleVaultEntryMouseDown\(entry, event\)\}/);
  assert.match(app, /event\.button !== 0 \|\| suppressDirectoryClickRef\.current/);
  assert.match(app, /window\.addEventListener\("pointerdown", closeMenuOnPrimaryPointerDown\)/);
  assert.match(app, /event\.button === 0/);
  assert.match(vaultContextMenu, /onPointerDown=\{\(event\) => event\.stopPropagation\(\)\}/);
  assert.match(vaultFileOperations, /createNoteFromFolderMenu/);
  assert.match(vaultFileOperations, /createCanvasFromFolderMenu/);
  assert.match(vaultFileOperations, /createFolderFromFolderMenu/);
  assert.match(vaultFileOperations, /renameFolderFromFolderMenu/);
  assert.match(vaultFileOperations, /renameFileFromContextMenu/);
  assert.match(vaultFileOperations, /moveFolderFromContextMenu/);
  assert.match(vaultFileOperations, /moveFileFromContextMenu/);
  assert.match(vaultFileOperations, /deleteFileFromContextMenu/);
  assert.match(vaultTree, /function VaultFolderTree/);
  assert.match(vaultTree, /isMoveFolderDestinationDisabled/);
  assert.match(vaultTree, /expandedFolderPathsForSelection/);
  assert.match(vaultTree, /mergeExpandedFolderPaths/);
  assert.match(vaultTree, /fileButtonsRef\.current\[activeFilePath\]\?\.scrollIntoView/);
  assert.match(vaultTree, /block: "nearest"/);
  assert.match(vaultTree, /treeScopeRef/);
  assert.match(vaultTree, /treeScopeRef\.current\.root !== root/);
  assert.match(vaultTree, /setExpandedPaths\(paths\)/);
  assert.match(vaultTree, /loadChildren\(path, scopeChanged\)/);
  assert.match(vaultTree, /setExpandedPaths\(\(current\) => mergeExpandedFolderPaths\(current, paths\)\)/);
  assert.match(vaultTree, /showFiles \? children : children\.filter\(\(entry\) => entry\.isDir\)/);
  assert.match(vaultTree, /function TreeFilePreview/);
  assert.match(vaultTree, /readVaultFile\(root, relativePath\)/);
  assert.match(vaultTree, /showFilePreviews \? \(/);
  assert.match(vaultTree, /splitMetaHeader\(content\)/);
  assert.match(vaultTree, /firstImageReference\(file\.content\)/);
  assert.match(vaultTree, /vaultImagePathCandidates\(root, firstImageReference\(file\.content\)/);
  assert.match(documentsState, /convertFileSrc\(`\$\{root\}\/\$\{defaultVaultAssetDirectory\}\/\$\{cleanReference\}`\)/);
  assert.match(documentsState, /convertFileSrc\(`\$\{root\}\/Attachments\/\$\{cleanReference\}`\)/);
  assert.match(vaultTree, /cleanVaultAssetReference\(wikilinkMatch\[1\]\)/);
  assert.match(vaultTree, /cleanVaultAssetReference\(target\)/);
  assert.match(vaultTree, /loading="lazy"/);
  assert.match(vaultTree, /imageIndex: nextIndex/);
  assert.match(vaultTree, /className="file-preview-thumbnail"/);
  assert.match(vaultTree, /<VaultFileIcon relativePath=\{entry\.relativePath\} \/>/);
  assert.match(app, /folderActionDialog/);
  assert.match(app, /<VaultContextMenu/);
  assert.match(app, /onAction=\{openFolderActionDialog\}/);
  assert.match(vaultContextMenu, /onAction\("create-folder", menu\.entry\)/);
  assert.match(vaultContextMenu, /onAction\("create-canvas", menu\.entry\)/);
  assert.match(vaultContextMenu, /onAction\("move-folder", menu\.entry\)/);
  assert.match(vaultContextMenu, /onAction\("move-file", menu\.entry\)/);
  assert.match(vaultContextMenu, /onAction\("rename-file", menu\.entry\)/);
  assert.match(vaultContextMenu, /onAction\("delete-file", menu\.entry\)/);
  assert.match(app, /aria-label=\{folderActionDialogTitle\(/);
  assert.match(vaultPersistence, /"create_note_in_directory"/);
  assert.match(vaultPersistence, /"create_canvas_in_directory"/);
  assert.match(vaultPersistence, /"create_directory_in_directory"/);
  assert.match(vaultPersistence, /"rename_vault_directory"/);
  assert.match(vaultPersistence, /"move_vault_directory"/);
  assert.match(vaultPersistence, /"move_vault_file"/);
  assert.match(vaultPersistence, /"delete_vault_file"/);
  assert.match(vaultContextMenu, /Create Note/);
  assert.match(vaultContextMenu, /Create Canvas/);
  assert.match(vaultContextMenu, /Create Folder/);
  assert.match(vaultContextMenu, /Reveal in Finder/);
  assert.match(fileActions, /Move Folder/);
  assert.match(fileActions, /Move File/);
  assert.match(fileActions, /Rename File/);
  assert.match(fileActions, /Rename Canvas/);
  assert.match(fileActions, /Delete File/);
  assert.match(app, /<VaultFolderTree/);
  assert.match(app, /showFiles=\{savedFileDisplaySettings\.showFilesInFolderTree\}/);
  assert.match(app, /unframed=\{!savedFileDisplaySettings\.showFolderTreeBackground\}/);
  assert.match(app, /savedFileDisplaySettings\.showFilesInFolderTree \? \(/);
  assert.match(app, /activeFilePath=\{activeFile\?\.relativePath\}/);
  assert.match(app, /hideHeader/);
  assert.match(app, /onEntryContextMenu=\{handleFolderContextMenu\}/);
  assert.match(app, /onFileOpen=\{handleVaultFileOpen\}/);
  assert.match(app, /showFilePreviews=\{savedFileDisplaySettings\.showFilePreviewsInFolderTree\}/);
  assert.match(app, /showPreviewImages=\{savedFileDisplaySettings\.showImagesInFilePreviews\}/);
  assert.match(app, /import \{ TreeFilePreview, VaultFolderTree \}/);
  assert.match(app, /<span className="vault-entry-text">/);
  assert.match(app, /showImage=\{savedFileDisplaySettings\.showImagesInFilePreviews\}/);
  assert.match(vaultTree, /<FolderIcon \/>/);
  assert.match(vaultTree, /onEntryContextMenu\?\.\(entry, event\)/);
  assert.match(vaultTree, /shouldOpenDocumentOnClick\(openDocumentsOnDoubleClick, event\.detail\)/);
  assert.doesNotMatch(vaultTree, /onDoubleClick/);
  assert.match(vaultTree, /hideHeader \? null/);
  assert.match(vaultTree, /relativePath \? \(/);
  assert.match(vaultTree, /<span className="folder-tree-expander-placeholder" \/>/);
  assert.match(vaultIcons, /function FolderIcon/);
  assert.match(vaultContextMenu, /Rename/);
  assert.match(css, /\.folder-context-menu/);
  assert.match(css, /\.folder-action-dialog-card/);
  assert.match(css, /\.folder-action-dialog-warning/);
  assert.match(css, /\.vault-folder-tree/);
  assert.match(css, /\.vault-list \.vault-folder-tree-picker/);
  assert.match(css, /\.folder-action-dialog-card \.vault-folder-tree/);
  assert.match(css, /\.folder-tree-select/);
  assert.match(css, /\.folder-tree-file/);
  assert.match(css, /\.vault-entry-text/);
  assert.match(css, /\.file-preview-thumbnail/);
  assert.match(vaultBackend, /pub\(crate\) fn create_note_in_directory/);
  assert.match(vaultBackend, /pub\(crate\) fn create_canvas_in_directory/);
  assert.match(vaultBackend, /pub\(crate\) fn create_directory_in_directory/);
  assert.match(vaultBackend, /pub\(crate\) fn rename_vault_directory/);
  assert.match(vaultBackend, /pub\(crate\) fn move_vault_directory/);
  assert.match(vaultBackend, /pub\(crate\) fn move_vault_file/);
  assert.match(vaultBackend, /pub\(crate\) fn delete_vault_file/);
  assert.equal(config.app.windows[0].hiddenTitle, true);
});
