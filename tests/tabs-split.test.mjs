import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import {
  clampResizableDrawerWidth,
  findTabAcrossSplitGroups,
  recentFilesWithOpenedFile,
  remainingGroupAfterSplitPaneClose,
  splitHasDirtyTabs,
  tabIdForFile,
  tabsAfterClose,
} from "../.test-dist/tabs.js";

test("split editor groups find an already open file across both panes", () => {
  const app = readFileSync("src/App.tsx", "utf8");
  const appTypes = readFileSync("src/lib/app-types.ts", "utf8");
  const editorOptions = readFileSync("src/editor/editor-options.ts", "utf8");
  const editorPane = readFileSync("src/editor/EditorPane.tsx", "utf8");
  const css = readFileSync("src/App.css", "utf8");
  const main = readFileSync("src/main.tsx", "utf8");
  const documentsState = readFileSync("src/app-state/documents.ts", "utf8");
  const settings = readFileSync("src/lib/settings.ts", "utf8");
  const groups = {
    primary: {
      id: "primary",
      activeTabId: tabIdForFile("Notes/A.md"),
      tabs: [{ id: tabIdForFile("Notes/A.md"), dirty: false }],
    },
    secondary: {
      id: "secondary",
      activeTabId: tabIdForFile("Notes/B.md"),
      tabs: [{ id: tabIdForFile("Notes/B.md"), dirty: false }],
    },
  };

  assert.deepEqual(findTabAcrossSplitGroups(groups, tabIdForFile("Notes/B.md")), {
    groupId: "secondary",
    tab: { id: tabIdForFile("Notes/B.md"), dirty: false },
  });
  assert.equal(findTabAcrossSplitGroups(groups, tabIdForFile("Notes/C.md")), null);
  assert.match(app, /function revealFileInVaultDrawer\(file: ActiveFile \| null\)/);
  assert.match(app, /setVaultDrawerItem\("files"\)/);
  assert.match(app, /const fileDirectory = parentDirectory\(file\.relativePath\)/);
  assert.match(app, /void revealFileInVaultDrawer\(tab\.activeFile\)/);
  assert.match(appTypes, /openFiles: ActiveFile\[\]/);
  assert.match(settings, /openFiles: readFiles\(workspace\.openFiles\)/);
  assert.match(app, /function fileBackedTabs\(groups = editorGroupsRef\.current\)/);
  assert.match(app, /openFiles: next\.openFiles \?\? fileBackedTabs\(\)/);
  assert.match(app, /if \(workspace\?\.openFiles\.length\)/);
  assert.match(app, /\$\{statusPrefix\} \$\{tabs\.length\} tab/);
  assert.match(documentsState, /function setEditorMarkdownContent\(targetEditor: Editor, markdown: string\)/);
  assert.match(documentsState, /targetEditor\.commands\.setContent\(\{\s*type: "doc"/);
  assert.match(app, /function hydrateDocumentTabAfterCommit\(tab: DocumentTab/);
  assert.match(app, /window\.requestAnimationFrame\(\(\) => \{/);
  assert.match(app, /hydrateDocumentTabAfterCommit\(closeResult\.nextActiveTab, groupId\)/);
  assert.match(documentsState, /function createEmptyEditorGroups\(\)/);
  assert.match(documentsState, /function hasNoOpenDocumentTabs\(groups: Record<EditorGroupId, EditorGroupState>\)/);
  assert.match(documentsState, /function clearEditorContent\(targetEditor: Editor \| null\)/);
  assert.match(app, /function clearActiveDocument\(\)/);
  assert.match(app, /clearEditorContent\(primaryEditor\)/);
  assert.match(app, /clearEditorContent\(secondaryEditor\)/);
  assert.match(editorOptions, /if \(!tab \|\| tab\.kind !== "markdown"\) \{/);
  assert.match(app, /if \(hasNoOpenDocumentTabs\(editorGroupsRef\.current\)\) \{/);
  assert.match(app, /replaceEditorGroupsWithPrimaryTab\(tab\)/);
  assert.match(app, /Closed \$\{tabTitle\(tab\)\}; no document open/);
  assert.match(editorPane, /Open or create a note to start editing\./);
  assert.match(editorPane, /className="editor-surface-frame"/);
  assert.match(editorPane, /className="empty-document-placeholder"/);
  assert.match(editorPane, /className="editor-pane no-document-pane"/);
  assert.doesNotMatch(app, /commands\.setContent\(tab\.markdown, \{ contentType: "markdown" \}\)/);
  assert.match(css, /\.editor-surface-frame/);
  assert.match(css, /\.empty-document-placeholder/);
  assert.match(css, /\.no-document-pane/);
  assert.match(css, /\.empty-document-placeholder\.no-document/);
  assert.match(css, /isolation: isolate/);
  assert.match(css, /caret-color: var\(--editor-text\)/);
  assert.match(css, /\.ProseMirror-gapcursor/);
  assert.match(css, /\.ProseMirror-focused \.ProseMirror-gapcursor/);
  assert.match(css, /@keyframes glyphary-caret-blink/);
  assert.match(css, /z-index: 0/);
  assert.match(css, /--glyphary-editor-effective-padding-x: max\(18px, var\(--glyphary-editor-padding-x\)\)/);
  assert.match(css, /left: var\(--glyphary-editor-effective-padding-x\)/);
  assert.doesNotMatch(css, /top: calc\(var\(--glyphary-editor-padding-y\) \+ 92px\)/);
  assert.doesNotMatch(css, /100% - var\(--glyphary-editor-max-width\)/);
  assert.match(css, /\.app-error-screen/);
  assert.match(main, /class ErrorBoundary extends React\.Component/);
  assert.match(main, /<ErrorBoundary>/);
});

test("split editor refuses to close a secondary group with dirty tabs", () => {
  assert.equal(splitHasDirtyTabs([{ dirty: false }, { dirty: false }]), false);
  assert.equal(splitHasDirtyTabs([{ dirty: false }, { dirty: true }]), true);
});

test("closing the active tab selects a neighboring remaining tab", () => {
  const todayTab = { id: tabIdForFile("Calendar/Tue, Jun 16th 2026.md") };
  const heyTab = { id: tabIdForFile("hey.md") };
  const notesTab = { id: tabIdForFile("notes.md") };

  assert.deepEqual(tabsAfterClose([todayTab, heyTab], heyTab.id, heyTab.id), {
    nextTabs: [todayTab],
    nextActiveTab: todayTab,
    nextActiveTabId: todayTab.id,
    wasActiveTab: true,
  });
  assert.deepEqual(tabsAfterClose([todayTab, heyTab, notesTab], heyTab.id, heyTab.id), {
    nextTabs: [todayTab, notesTab],
    nextActiveTab: notesTab,
    nextActiveTabId: notesTab.id,
    wasActiveTab: true,
  });
  assert.deepEqual(tabsAfterClose([todayTab, heyTab], todayTab.id, heyTab.id), {
    nextTabs: [todayTab],
    nextActiveTab: todayTab,
    nextActiveTabId: todayTab.id,
    wasActiveTab: false,
  });
  assert.deepEqual(tabsAfterClose([todayTab], todayTab.id, todayTab.id), {
    nextTabs: [],
    nextActiveTab: null,
    nextActiveTabId: "",
    wasActiveTab: true,
  });
});

test("document tabs expose native close actions from their context menu", () => {
  const app = readFileSync("src/App.tsx", "utf8");
  const editorPane = readFileSync("src/editor/EditorPane.tsx", "utf8");

  assert.match(app, /function closeOtherDocumentTabs\(tabId: string, groupId: EditorGroupId\)/);
  assert.match(app, /text: "Close Tab"/);
  assert.match(app, /text: "Close Other Tabs"/);
  assert.match(app, /id: "document-tab-toggle-star"/);
  assert.match(app, /text:\s*tab\.activeFile && starredFiles\.includes\(tab\.activeFile\.relativePath\)/);
  assert.match(app, /Save \$\{tabTitle\(dirtyTab\)\} before closing other tabs/);
  assert.match(editorPane, /onContextMenu=\{\(event\) => onTabContextMenu\(event, tab, groupId\)\}/);
});

test("vault files can preview and open into either split pane by drag and drop", () => {
  const app = readFileSync("src/App.tsx", "utf8");
  const dropTarget = readFileSync("src/lib/editor-drop-target.ts", "utf8");
  const folderTree = readFileSync("src/vault/VaultFolderTree.tsx", "utf8");
  const editorPane = readFileSync("src/editor/EditorPane.tsx", "utf8");
  const css = readFileSync("src/App.css", "utf8");

  assert.match(app, /function handleVaultFilePointerDown/);
  assert.match(app, /event\.currentTarget\.setPointerCapture\(event\.pointerId\)/);
  assert.match(app, /event\.buttons & 1/);
  assert.match(app, /activeVaultFileDragPath/);
  assert.match(app, /function moveVaultFileDragCursor/);
  assert.match(app, /className="vault-file-drag-cursor"/);
  assert.match(app, /editorDropAnimation/);
  assert.match(dropTarget, /function editorDropTargetRect/);
  assert.match(app, /setTimeout\(\(\) => \{/);
  assert.match(app, /pendingVaultFileDragRef/);
  assert.match(dropTarget, /function editorGroupsAtPointer/);
  assert.match(app, /window\.addEventListener\("pointermove", handlePointerMove, true\)/);
  assert.match(app, /window\.addEventListener\("pointerup", finishPointerDrag, true\)/);
  assert.match(app, /pending\.active && preview\?\.relativePath === pending\.relativePath/);
  assert.match(app, /async function openFileFromEditorDrop/);
  assert.match(app, /openFileFromEditorDropRef\.current\(\s*pending\.relativePath,\s*target\.side,?\s*\)/s);
  assert.match(app, /lastPreview\?\.relativePath === pending\.relativePath/);
  assert.match(app, /side === "left" \? "primary" : "secondary"/);
  assert.match(app, /setSplitOpen\(true\)/);
  assert.match(app, /onFilePointerDown=\{handleVaultFilePointerDown\}/);
  assert.match(app, /pendingVaultFileDragRef\.current = null/);
  assert.match(app, /function handleFolderContextMenu/);
  assert.match(folderTree, /onFilePointerDown\?:/);
  assert.match(folderTree, /onPointerDown=\{\(event\) => onFilePointerDown\?\.\(event, entry\.relativePath\)\}/);
  assert.match(editorPane, /onDragOver=\{\(event\) => \{[\s\S]*event\.preventDefault\(\);/);
  assert.match(css, /\.editor-groups\.split-drop-preview/);
  assert.match(css, /\.editor-split-drop-preview/);
  assert.match(css, /\.vault-file-drag-cursor/);
  assert.match(css, /\.vault-file-drop-animation/);
  assert.match(css, /@keyframes vault-file-drop-expand/);
  assert.doesNotMatch(app, /vaultFileDragMimeType|handleEditorDragOver|editor-drag-overlay/);
  assert.doesNotMatch(folderTree, /draggable=|onDragStart=|onDragEnd=/);
});

test("closing the final tab in a split pane leaves the other pane as primary", () => {
  const groups = {
    primary: {
      id: "primary",
      activeTabId: "a",
      tabs: [{ id: "a", title: "Alpha" }],
    },
    secondary: {
      id: "secondary",
      activeTabId: "b",
      tabs: [
        { id: "b", title: "Beta" },
        { id: "c", title: "Gamma" },
      ],
    },
  };

  assert.deepEqual(remainingGroupAfterSplitPaneClose(groups, "secondary"), {
    remainingGroupId: "primary",
    activeTab: { id: "a", title: "Alpha" },
    primaryGroup: {
      id: "primary",
      activeTabId: "a",
      tabs: [{ id: "a", title: "Alpha" }],
    },
  });
  assert.deepEqual(remainingGroupAfterSplitPaneClose(groups, "primary"), {
    remainingGroupId: "secondary",
    activeTab: { id: "b", title: "Beta" },
    primaryGroup: {
      id: "primary",
      activeTabId: "b",
      tabs: [
        { id: "b", title: "Beta" },
        { id: "c", title: "Gamma" },
      ],
    },
  });
});

test("resizable drawer widths are clamped to preserve editor workspace", () => {
  assert.equal(clampResizableDrawerWidth(140, 1200, 360, 20), 220);
  assert.equal(clampResizableDrawerWidth(420, 1200, 360, 20), 420);
  assert.equal(clampResizableDrawerWidth(900, 1200, 360, 20), 460);
});
