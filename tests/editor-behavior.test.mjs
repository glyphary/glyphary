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
  excalidrawFileNameForTitle,
  fileNameForDroppedImage,
  fileNameForDroppedPath,
  imageFilesFromDataTransfer,
  imagePathsFromDrop,
  isSupportedImageFile,
} from "../.test-dist/assets.js";

test("highlight mark expands ==text== while typing", () => {
  const editorOptions = readFileSync("src/editor/editor-options.ts", "utf8");
  const markdownExtensions = readFileSync("src/editor/markdown-extensions.tsx", "utf8");

  assert.match(editorOptions, /name: "highlight",[\s\S]{0,240}?inputPattern: /);
  assert.match(markdownExtensions, /markInputRule\(\{\s*find: inputPattern/);
});

test("strike input rule expands ~~text~~ without requiring a leading boundary", () => {
  const editorOptions = readFileSync("src/editor/editor-options.ts", "utf8");

  // The stock Tiptap rule only fires after whitespace, which disagreed with
  // the GFM parser that strikes x~~text~~ anywhere. Lock the loosened rule.
  assert.match(editorOptions, /strike: false/);
  assert.match(editorOptions, /Strike\.extend\(/);
  const strikeFind = /\(\?<!~\)\(~~\(\?!\\s\+~~\)\(\[\^~\\n\]\+\?\)~~\)\$/;
  assert.match(editorOptions, strikeFind);
  const rule = /(?<!~)(~~(?!\s+~~)([^~\n]+?)~~)$/;
  assert.equal(rule.test("word~~struck~~"), true);
  assert.equal(rule.test("~~struck~~"), true);
  assert.equal(rule.test("~~~struck~~"), false);
  assert.equal(rule.test("~single~"), false);
});

test("drag and paste image filtering accepts supported image formats", () => {
  const app = readFileSync("src/App.tsx", "utf8");
  const editorOptions = readFileSync("src/editor/editor-options.ts", "utf8");
  const assets = readFileSync("src-tauri/src/assets.rs", "utf8");
  const vault = readFileSync("src-tauri/src/vault.rs", "utf8");

  assert.equal(isSupportedImageFile({ name: "photo.png", type: "" }), true);
  assert.equal(isSupportedImageFile({ name: "photo.dat", type: "image/webp" }), true);
  assert.equal(isSupportedImageFile({ name: "notes.txt", type: "text/plain" }), false);
  assert.match(editorOptions, /handleDrop: \(view: EditorView, event: DragEvent\) =>/);
  assert.match(editorOptions, /transfer\?\.getData\("text\/plain"\)/);
  assert.match(editorOptions, /file\.type\.startsWith\("text\/"\)/);
  assert.match(editorOptions, /void file\.text\(\)\.then/);
  assert.match(editorOptions, /view\.pasteText\(text\)/);
  assert.match(editorOptions, /handlePaste: \(_view: unknown, event: ClipboardEvent\) =>/);
  assert.match(editorOptions, /queueImageImport\(event\.clipboardData\)/);
  assert.match(editorOptions, /handleKeyDown: \(view: EditorView, event: KeyboardEvent\) =>/);
  assert.match(editorOptions, /event\.shiftKey && \(event\.metaKey \|\| event\.ctrlKey\) && event\.key\.toLowerCase\(\) === "v"/);
  assert.match(editorOptions, /navigator\.clipboard\?\.readText/);
  assert.match(editorOptions, /view\.pasteText\(text\)/);
  assert.match(app, /onDragDropEvent\(\(event\) =>/);
  assert.match(app, /import_dropped_vault_image/);
  assert.match(app, /assetDirectory: defaultVaultImageDirectory/);
  assert.match(app, /fileName: fileNameForDroppedPath\(source\)/);
  assert.match(app, /findNativeDropTarget/);
  assert.match(app, /focusNativeDropTarget/);
  assert.match(app, /read_dropped_text_file/);
  assert.match(assets, /pub\(crate\) fn import_dropped_vault_image/);
  assert.match(vault, /pub\(crate\) fn read_dropped_text_file/);
});

test("pasted clipboard image items are converted into importable files", () => {
  const image = { name: "image.png", type: "image/png" };
  const transfer = {
    files: [],
    items: [{ kind: "file", getAsFile: () => image }],
  };

  assert.deepEqual(imageFilesFromDataTransfer(transfer), [image]);
});

test("everyday languages are registered for code block highlighting", () => {
  const editorOptions = readFileSync("src/editor/editor-options.ts", "utf8");
  const app = readFileSync("src/App.tsx", "utf8");
  const languageTable =
    editorOptions.match(/export const codeBlockLanguages[\s\S]*?\n\];/)?.[0] ?? "";

  for (const language of [
    "go", "c", "cpp", "java", "csharp", "swift", "kotlin", "php", "ruby",
    "yaml", "toml", "ini", "dockerfile", "diff", "makefile", "cmake", "lua",
    "perl", "r", "scala", "haskell", "objectivec", "powershell", "graphql",
    "latex", "nginx", "protobuf", "dart", "elixir",
  ]) {
    assert.match(languageTable, new RegExp(`value: "${language}", grammar: `));
  }

  for (const alias of [
    "golang", "yml", "c\\+\\+", "cs", "kt", "rb", "patch", "objc", "ps1",
    "gql", "tex", "proto", "docker", "make",
  ]) {
    assert.match(languageTable, new RegExp(`"${alias}"`));
  }

  // The registration table also feeds the picker datalist, so the suggestions
  // can never drift from what actually highlights.
  assert.match(editorOptions, /for \(const language of codeBlockLanguages\)/);
  assert.match(app, /\.\.\.codeBlockLanguages/);
});

test("vim-style editing is wired behind a settings option", () => {
  const app = readFileSync("src/App.tsx", "utf8");
  const settingsDialog = readFileSync("src/settings/SettingsDialog.tsx", "utf8");
  const editorOptions = readFileSync("src/editor/editor-options.ts", "utf8");
  const vimMode = readFileSync("src/editor/vim-mode.ts", "utf8");
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));

  assert.equal(pkg.dependencies["@prose-motions/core"], undefined);
  assert.match(vimMode, /Responsibilities:/);
  assert.match(vimMode, /Contracts:/);
  assert.match(vimMode, /name: "glypharyVimMode"/);
  assert.match(editorOptions, /\.\.\.\(vimMode \? \[createGlypharyVimMode\(setStatus\)\] : \[\]\)/);
  assert.match(vimMode, /Vim normal mode/);
  assert.match(vimMode, /Vim insert mode/);
  assert.match(vimMode, /case "u":/);
  assert.match(vimMode, /event\.key\.toLowerCase\(\) === "r"/);
  assert.match(vimMode, /case "A":/);
  assert.match(vimMode, /case "0":/);
  assert.match(vimMode, /case "\$":/);
  assert.match(vimMode, /case "\^":/);
  assert.match(vimMode, /case "Space":/);
  assert.match(vimMode, /case "%":/);
  assert.match(vimMode, /case "G":/);
  assert.match(vimMode, /case "g":/);
  assert.match(vimMode, /moveToFileStart/);
  assert.match(vimMode, /Selection\.atStart\(state\.doc\)/);
  assert.match(vimMode, /case "c":/);
  assert.match(vimMode, /case "d":/);
  assert.match(vimMode, /case "w":/);
  assert.match(vimMode, /case "b":/);
  assert.match(vimMode, /case "x":/);
  assert.match(vimMode, /case "s":/);
  assert.match(vimMode, /case "S":/);
  assert.match(vimMode, /case "p":/);
  assert.match(vimMode, /case "O":/);
  assert.match(vimMode, /case "y":/);
  assert.match(vimMode, /writeCopyBuffer\(\{ text, linewise: true \}\)/);
  assert.match(vimMode, /deleteWordUnderCursor/);
  assert.match(vimMode, /yankWordUnderCursor/);
  assert.match(vimMode, /handleTextInput: \(\) =>/);
  assert.match(settingsDialog, /Use Vim keybindings/);
});

test("command save shortcut is wrapped in the webview", () => {
  const app = readFileSync("src/App.tsx", "utf8");
  const pageSearch = readFileSync("src/search/page-search.ts", "utf8");
  const editorOptions = readFileSync("src/editor/editor-options.ts", "utf8");
  const editorPane = readFileSync("src/editor/EditorPane.tsx", "utf8");
  const css = readFileSync("src/App.css", "utf8");

  assert.match(app, /handleGlobalSaveShortcut/);
  assert.match(app, /handleGlobalCommandPaletteShortcut/);
  assert.match(app, /handleGlobalPageSearchShortcut/);
  assert.match(app, /handleGlobalCloseTabShortcut/);
  assert.match(app, /handleGlobalSwitchTabShortcut/);
  assert.match(app, /handleGlobalDrawerShortcut/);
  assert.match(pageSearch, /function pageSearchMatches/);
  assert.match(pageSearch, /new PluginKey<PageSearchPluginState>\("pageSearch"\)/);
  assert.match(pageSearch, /const PageSearchRenderer = Extension\.create/);
  assert.match(editorOptions, /PageSearchRenderer/);
  assert.match(pageSearch, /const CommandPaletteSelectionRenderer = Extension\.create/);
  assert.match(editorOptions, /CommandPaletteSelectionRenderer/);
  assert.match(app, /commandPaletteSelectionPluginKey/);
  assert.match(app, /commandPaletteSelectionRef/);
  assert.match(app, /function captureCommandPaletteSelection/);
  assert.match(app, /function restoreCommandPaletteSelection/);
  assert.match(app, /Selection\.fromJSON\(saved\.editor\.state\.doc, saved\.selection\)/);
  assert.match(app, /saved\.editor\.view\.focus\(\)/);
  assert.match(app, /captureCommandPaletteSelection\(\);\s*setCommandPaletteOpen\(true\)/);
  assert.match(app, /function closeCommandPalette\(\) \{\s*restoreCommandPaletteSelection\(\)/);
  assert.match(pageSearch, /Decoration\.inline\(match\.from, match\.to/);
  assert.match(pageSearch, /Decoration\.inline\(range\.from, range\.to/);
  assert.match(pageSearch, /targetEditor\.state\.tr\.setMeta\(pageSearchPluginKey, state\)/);
  assert.match(app, /targetEditor\.state\.tr\.setMeta\(commandPaletteSelectionPluginKey, state\)/);
  assert.match(pageSearch, /function openSearch/);
  assert.match(pageSearch, /function closeSearch/);
  assert.match(pageSearch, /function move/);
  assert.match(pageSearch, /const \[open, setOpen\] = useState\(false\)/);
  assert.match(pageSearch, /const \[query, setQuery\] = useState\(""\)/);
  assert.match(pageSearch, /const \[index, setIndex\] = useState\(0\)/);
  assert.match(app, /event\.key\.toLowerCase\(\) !== "s"/);
  assert.match(app, /event\.key\.toLowerCase\(\) !== "p"/);
  assert.match(app, /event\.key\.toLowerCase\(\) !== "f"/);
  assert.match(app, /event\.key\.toLowerCase\(\) !== "w"/);
  assert.match(app, /const isControlTab = key === "Tab"/);
  assert.match(app, /const isMacBracketTab =/);
  assert.match(app, /!event\.metaKey && !event\.ctrlKey/);
  assert.match(app, /!event\.metaKey \|\| event\.ctrlKey \|\| event\.altKey \|\| event\.shiftKey/);
  assert.match(app, /!event\.metaKey[\s\S]*!event\.altKey[\s\S]*event\.ctrlKey[\s\S]*event\.shiftKey/);
  assert.match(app, /void saveCurrentFileRef\.current\(\)/);
  assert.match(app, /openPageSearchRef\.current\(\)/);
  assert.match(app, /closeActiveDocumentTabRef\.current\(\)/);
  assert.match(app, /const direction = \(event\.shiftKey && key === "Tab"\) \|\| key === "\[" \? -1 : 1/);
  assert.match(app, /switchDocumentTabRef\.current\(direction\)/);
  assert.match(app, /toggleVaultDrawerItem\(vaultDrawerItem\)/);
  assert.match(app, /toggleDrawerItem\(drawerItem\)/);
  assert.match(app, /function switchDocumentTab\(direction: 1 \| -1\)/);
  assert.match(app, /switchToDocumentTab\(group\.tabs\[nextIndex\]\.id, groupId\)/);
  assert.match(app, /setCommandPaletteOpen\(true\)/);
  assert.match(app, /aria-label="Open command palette"/);
  assert.match(app, /onClick=\{\(\) => openCommandPaletteRoot\(\)\}/);
  // The editor slash menu opens the flattened all-commands scope.
  assert.match(app, /openCommandPaletteRootRef\.current\("flat"\)/);
  // The slash menu flattens only the AI and Insert groups. The typed "/"
  // stays in the document; running a command deletes it again.
  const paletteDefinitions = readFileSync("src/command-palette/command-definitions.ts", "utf8");
  assert.match(
    paletteDefinitions,
    /const flatCommandPaletteCommands = \[\s*\.\.\.aiCommandPaletteCommands,\s*\.\.\.activeInsertCommandPaletteCommands,\s*\]/,
  );
  const editorOptionsForSlash = readFileSync("src/editor/editor-options.ts", "utf8");
  assert.match(editorOptionsForSlash, /view\.dispatch\(view\.state\.tr\.insertText\("\/"\)\)/);
  assert.match(app, /slashTrigger\.editor\.state\.tr\.delete\(slashTrigger\.from - 1, slashTrigger\.from\)/);
  assert.match(app, /className="quiet-icon-action titlebar-command-palette"/);
  assert.match(editorPane, /className="page-search-bar"/);
  assert.match(editorPane, /aria-label="Find in page"/);
  assert.match(editorPane, /aria-label="Previous match"/);
  assert.match(editorPane, /aria-label="Next match"/);
  assert.match(editorPane, /aria-label="Close find in page"/);
  assert.match(app, /window\.addEventListener\("keydown", handleGlobalSaveShortcut\)/);
  assert.match(app, /window\.addEventListener\("keydown", handleGlobalCommandPaletteShortcut\)/);
  assert.match(app, /window\.addEventListener\("keydown", handleGlobalPageSearchShortcut, \{ capture: true \}\)/);
  assert.match(app, /window\.addEventListener\("keydown", handleGlobalCloseTabShortcut, \{ capture: true \}\)/);
  assert.match(app, /window\.addEventListener\("keydown", handleGlobalSwitchTabShortcut, \{ capture: true \}\)/);
  assert.match(app, /window\.addEventListener\("keydown", handleGlobalDrawerShortcut, \{ capture: true \}\)/);
  assert.match(css, /\.page-search-bar/);
  assert.match(css, /\.editor-surface \.page-search-match/);
  assert.match(css, /\.editor-surface \.page-search-match\.active/);
  assert.match(css, /\.editor-surface \.command-palette-preserved-selection/);
});

test("renaming a page title immediately saves the active file", () => {
  const app = readFileSync("src/App.tsx", "utf8");

  assert.match(app, /function finishPageNameEdit\(\)/);
  assert.match(app, /pageNameRef\.current\.trim\(\) !== fileNameWithoutMarkdownExtension\(activeFile\.name\)/);
  assert.match(app, /void saveCurrentFileRef\.current\(\)/);
});

test("list task quote code table columns and callout toolbar actions render as icons", () => {
  const app = readFileSync("src/App.tsx", "utf8");
  const editorPane = readFileSync("src/editor/EditorPane.tsx", "utf8");
  const editorOptions = readFileSync("src/editor/editor-options.ts", "utf8");
  const toolbarIcons = readFileSync("src/toolbar-icons.tsx", "utf8");
  const css = readFileSync("src/App.css", "utf8");
  const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

  assert.match(editorOptions, /import \{ TaskItem \} from "@tiptap\/extension-task-item"/);
  assert.match(editorOptions, /import \{ TaskList \} from "@tiptap\/extension-task-list"/);
  assert.match(editorOptions, /TaskItem\.configure\(\{[\s\S]*nested: true,/);
  assert.match(editorOptions, /TaskList/);
  assert.match(app, /toggleTaskList\(\)/);
  assert.match(editorPane, /renderToolbarIcon\(action\.icon\)/);
  assert.match(toolbarIcons, /export type ToolbarIconName/);
  assert.match(toolbarIcons, /export function renderToolbarIcon/);
  assert.match(app, /icon: "bullet-list"/);
  assert.match(app, /icon: "ordered-list"/);
  assert.match(app, /icon: "task-list"/);
  assert.match(app, /icon: "quote"/);
  assert.match(app, /icon: "code"/);
  assert.match(app, /icon: "html"/);
  assert.match(app, /icon: "table"/);
  assert.match(app, /icon: "columns"/);
  assert.match(app, /icon: "callout"/);
  assert.match(editorPane, /aria-label=\{action\.title\}/);
  assert.match(editorPane, /action\.icon \? renderToolbarIcon\(action\.icon\) : action\.label/);
  assert.match(css, /\.tool-button svg/);
  assert.match(css, /ul\[data-type="taskList"\]/);
  assert.match(css, /li\[data-type="taskItem"\]/);
  assert.match(css, /li\[data-checked\]/);
  assert.match(css, /display: flex;/);
  assert.match(css, /flex: 0 0 1\.15rem;/);
  assert.match(css, /li\[data-type="taskItem"\] > div > p/);
  assert.equal(packageJson.dependencies["@tiptap/extension-task-item"], "^3.26.1");
  assert.equal(packageJson.dependencies["@tiptap/extension-task-list"], "^3.26.1");
});

test("toolbar state refreshes when editor selection changes", () => {
  const app = readFileSync("src/App.tsx", "utf8");
  const editorOptions = readFileSync("src/editor/editor-options.ts", "utf8");

  assert.match(app, /editorStateVersion/);
  assert.match(app, /setEditorStateVersion\(\(version\) => version \+ 1\)/);
  assert.match(editorOptions, /onSelectionUpdate: \(\{ editor \}: \{ editor: Editor \}\) => \{/);
  assert.match(app, /\[editor, editorFocused, editorStateVersion, markdown\]/);
});

test("Markdown editors use automatic text direction with direction-safe content styles", () => {
  const editorOptions = readFileSync("src/editor/editor-options.ts", "utf8");
  const tidbitCapture = readFileSync("src/TidbitCapture.tsx", "utf8");
  const css = readFileSync("src/App.css", "utf8");

  assert.match(editorOptions, /"aria-label": "Markdown document editor",\s*dir: "auto"/);
  assert.match(tidbitCapture, /"aria-label": "Tidbit capture editor",\s*dir: "auto"/);
  assert.match(css, /\.editor-surface blockquote \{[\s\S]*border-inline-start:/);
  assert.match(css, /\.editor-surface \.markdown-callout \{[\s\S]*border-inline-start:/);
  assert.match(css, /\.editor-surface ul,[\s\S]*padding-inline-start: 1\.35rem/);
});
