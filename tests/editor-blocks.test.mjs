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
  createGlypharyMarked,
  splitGfmTableRow,
} from "../.test-dist/markdown-table.js";
import {
  excalidrawFileNameForTitle,
  fileNameForDroppedImage,
  fileNameForDroppedPath,
  imageFilesFromDataTransfer,
  imagePathsFromDrop,
  isSupportedImageFile,
} from "../.test-dist/assets.js";
import {
  richLinkMarkdown,
} from "../.test-dist/rich-links.js";

test("markdown headings produce a table of contents and ignore fenced code", () => {
  assert.deepEqual(
    markdownHeadings(`# Alpha

\`\`\`md
# Not a heading
\`\`\`

## Beta ##
### Beta
## Beta
# C#
`),
    [
      { id: "1:Alpha:1", level: 1, title: "Alpha", occurrence: 1 },
      { id: "2:Beta:1", level: 2, title: "Beta", occurrence: 1 },
      { id: "3:Beta:1", level: 3, title: "Beta", occurrence: 1 },
      { id: "2:Beta:2", level: 2, title: "Beta", occurrence: 2 },
      { id: "1:C#:1", level: 1, title: "C#", occurrence: 1 },
    ],
  );
});

test("toc fenced code blocks have an inline renderer while staying markdown code blocks", () => {
  const app = readFileSync("src/App.tsx", "utf8");
  const codeBlockLanguage = readFileSync("src/editor/code-block-language.tsx", "utf8");
  const codeBlockRenderers = readFileSync("src/editor/code-block-renderers.ts", "utf8");
  const editorOptions = readFileSync("src/editor/editor-options.ts", "utf8");
  const css = readFileSync("src/App.css", "utf8");

  assert.doesNotMatch(app, /\{ label: "Table of contents", value: "toc" \}/);
  assert.match(codeBlockLanguage, /const isRenderedTableOfContents = language === "toc"/);
  assert.match(codeBlockLanguage, /!isRenderedTableOfContents \? \(/);
  assert.match(codeBlockLanguage, /function codeBlockDecorationClassNames/);
  assert.match(codeBlockLanguage, /\.\.\.codeBlockDecorationClassNames\(decorations\)/);
  assert.match(editorOptions, /lowlight\.register\("toc", plaintext\)/);
  assert.match(editorOptions, /TocCodeBlockRenderer/);
  assert.match(codeBlockRenderers, /Responsibilities:/);
  assert.match(codeBlockRenderers, /Contracts:/);
  assert.match(codeBlockRenderers, /dataset\.tocBlockPosition/);
  assert.match(codeBlockRenderers, /dataset\.tocEntryId/);
  assert.match(css, /pre\.toc-code-block\.rendered/);
  assert.match(css, /\.toc-code-render/);
});

test("table insertion seed keeps markdown table support available", () => {
  assert.match(emptyTableMarkdown, /^\| Column 1 \| Column 2 \| Column 3 \|/);
  assert.match(emptyTableMarkdown, /\| --- \| --- \| --- \|/);
});

test("table parsing keeps wikilink alias pipes inside the cell", () => {
  const row = "| 1 | [[00 Start Here/01 Quick Start|Quick Start]] | ![[image.png|300]] |";
  const source = "| Step | Page | Image |\n| --- | --- | --- |\n" + row + "\n\nAfter";
  const parser = createGlypharyMarked();
  const table = new parser.Lexer().lex(source)[0];

  assert.deepEqual(splitGfmTableRow(row), [
    "1",
    "[[00 Start Here/01 Quick Start|Quick Start]]",
    "![[image.png|300]]",
  ]);
  assert.equal(table.type, "table");
  assert.equal(table.rows[0][1].text, "[[00 Start Here/01 Quick Start|Quick Start]]");
  assert.equal(table.rows[0][2].text, "![[image.png|300]]");
  assert.equal(table.raw.endsWith("After"), false);
});

test("block-widget boundaries expose an editable insertion point", () => {
  const app = readFileSync("src/App.tsx", "utf8");
  const blockBoundary = readFileSync("src/editor/block-boundary-insertion.ts", "utf8");
  const editorOptions = readFileSync("src/editor/editor-options.ts", "utf8");
  const css = readFileSync("src/App.css", "utf8");

  assert.match(blockBoundary, /Responsibilities:/);
  assert.match(blockBoundary, /Contracts:/);
  assert.match(blockBoundary, /import \{ GapCursor \} from "@tiptap\/pm\/gapcursor"/);
  assert.match(blockBoundary, /function createBlockBoundaryInsertionExtension\(\)/);
  assert.match(blockBoundary, /name: "glypharyBlockBoundaryInsertion"/);
  assert.match(blockBoundary, /priority: 10000/);
  assert.match(blockBoundary, /addKeyboardShortcuts\(\)/);
  assert.match(blockBoundary, /function moveGapCursorTo/);
  assert.match(blockBoundary, /RuntimeGapCursor\.valid\(resolvedPosition\)/);
  assert.match(blockBoundary, /new GapCursor\(resolvedPosition\)/);
  assert.match(blockBoundary, /function insertParagraphAtGapCursor/);
  assert.match(blockBoundary, /selection instanceof GapCursor/);
  assert.match(blockBoundary, /view\.state\.tr\.insert\(selection\.from, paragraph\)/);
  assert.match(blockBoundary, /TextSelection\.create\(transaction\.doc, selection\.from \+ 1\)/);
  assert.match(blockBoundary, /function insertParagraphAtPosition/);
  assert.match(blockBoundary, /function moveTextSelectionNear/);
  assert.match(blockBoundary, /TextSelection\.near\(resolvedPosition, bias\)/);
  assert.match(blockBoundary, /const blockBoundaryInsertNodeNames = new Set/);
  assert.match(blockBoundary, /"table"/);
  // Container blocks trap the caret; adjacent callouts/columns/collapses need
  // the + affordance to insert a paragraph between them.
  assert.match(blockBoundary, /"callout"/);
  assert.match(blockBoundary, /"columns"/);
  assert.match(blockBoundary, /"collapse"/);
  // A required target keeps the high-priority excalidraw atom out of
  // ProseMirror createAndFill, which otherwise appends a phantom embed to
  // every parsed document.
  const excalidrawEditor = readFileSync("src/excalidraw/editor.tsx", "utf8");
  assert.match(excalidrawEditor, /isRequired: true/);
  assert.doesNotMatch(excalidrawEditor, /target: \{\s*default:/);
  assert.match(blockBoundary, /"htmlBlock"/);
  assert.match(blockBoundary, /"richLink"/);
  assert.match(blockBoundary, /"excalidrawEmbed"/);
  assert.match(blockBoundary, /"gallery"/);
  assert.match(blockBoundary, /function supportsBlockBoundaryInsert/);
  assert.match(blockBoundary, /isAiBuilderMarkerComment\(node\.attrs\.rawHtml\)/);
  assert.match(blockBoundary, /function selectedTopLevelWidgetBlock/);
  assert.match(blockBoundary, /selection instanceof NodeSelection && supportsBlockBoundaryInsert\(selection\.node\)/);
  assert.match(blockBoundary, /selection\.\$from\.node\(1\)/);
  assert.match(blockBoundary, /selection\.\$from\.before\(1\)/);
  assert.match(blockBoundary, /selection\.\$from\.after\(1\)/);
  assert.match(blockBoundary, /function blockBoundaryInsertWidget/);
  assert.match(blockBoundary, /function blockBoundaryInsertDecorations/);
  assert.match(blockBoundary, /const selectedBlock = selectedTopLevelWidgetBlock\(view\)/);
  assert.match(blockBoundary, /DecorationSet\.empty/);
  assert.match(blockBoundary, /blockBoundaryInsertWidget\(selectedBlock\.from, -1\)/);
  assert.match(blockBoundary, /blockBoundaryInsertWidget\(selectedBlock\.to, 1\)/);
  assert.doesNotMatch(blockBoundary, /isBlockBoundaryWidgetCandidate\(previousNode\)/);
  assert.doesNotMatch(blockBoundary, /node\.isBlock && !node\.isTextblock/);
  assert.match(blockBoundary, /Decoration\.widget\(/);
  assert.match(blockBoundary, /className = "block-boundary-insert"/);
  assert.match(blockBoundary, /aria-label", "Insert paragraph between blocks"/);
  assert.match(blockBoundary, /button\.title = "Insert paragraph"/);
  assert.match(blockBoundary, /insertParagraphAtPosition\(targetView, currentPosition\)/);
  assert.match(blockBoundary, /glypharyBlockBoundaryInsertAffordance/);
  assert.match(blockBoundary, /function moveGapCursorAfterTableBoundary/);
  assert.match(blockBoundary, /view\.endOfTextblock\("down"\)/);
  assert.match(blockBoundary, /nodeAfterTable\.isTextblock/);
  assert.match(blockBoundary, /moveGapCursorTo\(view, afterTable\)/);
  assert.match(blockBoundary, /function codeBlockBoundary/);
  assert.match(blockBoundary, /ancestorDepthByName\(selection\.\$head, "codeBlock"\)/);
  assert.match(blockBoundary, /function moveCursorOutOfCodeBlock/);
  assert.match(blockBoundary, /insertParagraphAtPosition\(view, boundary\.after\)/);
  assert.match(blockBoundary, /moveTextSelectionNear\(view, boundary\.after, 1\)/);
  assert.match(blockBoundary, /insertParagraphAtPosition\(view, boundary\.before\)/);
  assert.match(blockBoundary, /moveTextSelectionNear\(view, boundary\.before, -1\)/);
  assert.match(blockBoundary, /function moveGapCursorBeforeSelectedBlock/);
  assert.match(blockBoundary, /function moveGapCursorAfterSelectedBlock/);
  assert.match(blockBoundary, /nodeAfterSelectedBlock\.isTextblock/);
  assert.match(blockBoundary, /selection instanceof NodeSelection/);
  assert.match(blockBoundary, /Enter: \(\) =>/);
  assert.match(blockBoundary, /ArrowDown: \(\) =>/);
  assert.match(blockBoundary, /ArrowUp: \(\) =>/);
  assert.match(blockBoundary, /moveCursorOutOfCodeBlock\(this\.editor\.view, "down"\) \|\|/);
  assert.match(blockBoundary, /moveCursorOutOfCodeBlock\(this\.editor\.view, "up"\) \|\|/);
  assert.match(blockBoundary, /insertParagraphAtGapCursor\(this\.editor\.view\) \|\|/);
  assert.doesNotMatch(blockBoundary, /insertEmptyParagraphAt/);
  assert.match(editorOptions, /createBlockBoundaryInsertionExtension\(\),\s*TableKit\.configure/);
  assert.match(css, /\.block-boundary-insert/);
  assert.match(css, /\.block-boundary-insert-button/);
  assert.match(css, /width: 0;/);
  assert.match(css, /transform: translate\(-28px, -1px\)/);
  assert.match(css, /width: 16px;/);
  assert.match(css, /border: 1px solid transparent/);
  assert.match(css, /display: none;/);
});

test("columns markdown containers are wired into the editor", () => {
  const app = readFileSync("src/App.tsx", "utf8");
  const markdownExtensions = readFileSync("src/editor/markdown-extensions.tsx", "utf8");
  const editorOptions = readFileSync("src/editor/editor-options.ts", "utf8");
  const css = readFileSync("src/App.css", "utf8");

  assert.match(emptyColumnsMarkdown, /^::: columns/);
  assert.match(emptyColumnsMarkdown, /::: column/);
  assert.match(markdownExtensions, /function createMarkdownContainerToken/);
  assert.match(markdownExtensions, /name: "columns"/);
  assert.match(markdownExtensions, /name: "column"/);
  assert.match(markdownExtensions, /markdownTokenName: "columns"/);
  assert.match(markdownExtensions, /markdownTokenName: "column"/);
  assert.match(editorOptions, /createColumnExtension\(\)/);
  assert.match(editorOptions, /createColumnsExtension\(\)/);
  assert.match(app, /appendColumns\(\)/);
  assert.match(app, /insertContent\(emptyColumnsMarkdown, \{ contentType: "markdown" \}\)/);
  assert.doesNotMatch(app, /setEditorBody\(`\$\{markdown\.trimEnd\(\)\}\\n\\n\$\{emptyColumnsMarkdown\}`/);
  assert.match(css, /\.markdown-columns/);
  assert.match(css, /\.markdown-column/);
});

test("gallery markdown containers are wired into the editor", () => {
  const app = readFileSync("src/App.tsx", "utf8");
  const markdownExtensions = readFileSync("src/editor/markdown-extensions.tsx", "utf8");
  const editorOptions = readFileSync("src/editor/editor-options.ts", "utf8");
  const vaultImages = readFileSync("src/editor/vault-images.ts", "utf8");
  const editorCommands = readFileSync("src/editor/commands.ts", "utf8");
  const editorPane = readFileSync("src/editor/EditorPane.tsx", "utf8");
  const css = readFileSync("src/App.css", "utf8");
  const manual = readFileSync("docs-manual/index.html", "utf8");

  assert.match(markdownExtensions, /function createGalleryExtension\(\)/);
  assert.match(markdownExtensions, /name: "gallery"/);
  assert.match(markdownExtensions, /markdownTokenName: "gallery"/);
  assert.match(markdownExtensions, /data-glyphary-gallery/);
  assert.match(markdownExtensions, /namedContainerOpening\(src, "gallery"\)/);
  assert.match(editorOptions, /createGalleryExtension\(\)/);
  assert.match(vaultImages, /export function imageNodeMarkdown/);
  assert.match(editorCommands, /export function selectedGalleryImages/);
  assert.match(app, /function wrapSelectedImagesInGallery\(\)/);
  assert.match(app, /id: "gallery-layout"/);
  assert.match(app, /title: "Gallery layout"/);
  assert.match(css, /\.markdown-gallery/);
  assert.match(manual, /Gallery layout/);
});

test("editor images can be opened in a full-size preview", () => {
  const app = readFileSync("src/App.tsx", "utf8");
  const appState = readFileSync("src/app-state/documents.ts", "utf8");
  const editorPane = readFileSync("src/editor/EditorPane.tsx", "utf8");
  const vaultImages = readFileSync("src/editor/vault-images.ts", "utf8");
  const css = readFileSync("src/App.css", "utf8");

  assert.match(app, /type ImagePreviewState/);
  assert.match(app, /imagePreview, setImagePreview/);
  assert.match(app, /function openImagePreviewFromEditor/);
  assert.match(app, /target instanceof HTMLImageElement/);
  assert.match(editorPane, /onDoubleClick=\{onOpenImagePreview\}/);
  assert.match(editorPane, /onErrorCapture=\{handleEditorImageError\}/);
  assert.match(editorPane, /vaultImagePathCandidates\(vaultRoot, reference/);
  assert.match(editorPane, /candidate !== target\.currentSrc/);
  assert.match(editorPane, /target\.src = candidates\[nextIndex\]/);
  assert.match(appState, /function vaultImagePathCandidates/);
  assert.match(appState, /convertFileSrc\(`\$\{root\}\/\$\{defaultVaultAssetDirectory\}\/\$\{cleanReference\}`\)/);
  assert.match(appState, /convertFileSrc\(`\$\{root\}\/Attachments\/\$\{cleanReference\}`\)/);
  assert.match(vaultImages, /start: \(src: string\) => src\.indexOf\("!\[\["\)/);
  assert.doesNotMatch(vaultImages, /markdownImageTarget/);
  assert.match(vaultImages, /assetReference/);
  assert.match(vaultImages, /attrs\.assetReference \? \{ "data-asset-reference": attrs\.assetReference \} : \{\}/);
  assert.match(vaultImages, /attrs\.vaultTarget \? \{ "data-vault-target": attrs\.vaultTarget \} : \{\}/);
  assert.match(vaultImages, /data-asset-reference/);
  assert.match(app, /closeImagePreviewOnEscape/);
  assert.match(app, /className="image-preview-screen"/);
  assert.match(app, /aria-label="Image preview"/);
  assert.match(css, /\.image-preview-screen/);
  assert.match(css, /\.image-preview-card img/);
  assert.match(css, /max-height: calc\(100vh - 128px\)/);
});

test("callout markdown containers are wired into the editor", () => {
  const app = readFileSync("src/App.tsx", "utf8");
  const markdownExtensions = readFileSync("src/editor/markdown-extensions.tsx", "utf8");
  const editorOptions = readFileSync("src/editor/editor-options.ts", "utf8");
  const css = readFileSync("src/App.css", "utf8");

  assert.match(emptyCalloutMarkdown, /^::: callout note "Note"/);
  assert.match(markdownExtensions, /function calloutContainerOpening/);
  assert.match(markdownExtensions, /name: "callout"/);
  assert.match(markdownExtensions, /markdownTokenName: "callout"/);
  assert.match(markdownExtensions, /data-glyphary-callout/);
  assert.match(markdownExtensions, /data-callout-kind/);
  assert.match(markdownExtensions, /escapeCalloutTitle/);
  assert.match(editorOptions, /createCalloutExtension\(\)/);
  assert.match(app, /appendCallout\(\)/);
  assert.match(css, /\.markdown-callout/);
  assert.match(css, /\.markdown-callout-warning/);
  assert.match(css, /\.markdown-callout-title/);
});

test("collapse markdown containers render as expandable details blocks", () => {
  const app = readFileSync("src/App.tsx", "utf8");
  const markdownExtensions = readFileSync("src/editor/markdown-extensions.tsx", "utf8");
  const editorOptions = readFileSync("src/editor/editor-options.ts", "utf8");
  const css = readFileSync("src/App.css", "utf8");

  assert.match(emptyCollapseMarkdown, /^::: collapse More details/);
  assert.match(markdownExtensions, /function collapseContainerOpening/);
  assert.match(markdownExtensions, /function CollapseNodeView/);
  assert.match(markdownExtensions, /const \[open, setOpen\] = useState\(Boolean\(node\.attrs\.defaultOpen\)\)/);
  assert.match(markdownExtensions, /name: "collapse"/);
  assert.match(markdownExtensions, /markdownTokenName: "collapse"/);
  assert.match(markdownExtensions, /defaultOpen/);
  assert.match(markdownExtensions, /plainTitleIncludesOpenFlag/);
  assert.match(markdownExtensions, /data-glyphary-collapse/);
  assert.match(markdownExtensions, /markdown-collapse-summary/);
  assert.match(markdownExtensions, /ReactNodeViewRenderer\(CollapseNodeView\)/);
  assert.match(markdownExtensions, /setOpen\(\(value\) => !value\)/);
  assert.match(editorOptions, /createCollapseExtension\(\)/);
  assert.match(app, /insertCollapseBlock\(\)/);
  assert.match(app, /id: "insert-collapse"/);
  assert.match(app, /title: "Insert collapse"/);
  assert.match(app, /insertContent\(emptyCollapseMarkdown, \{ contentType: "markdown" \}\)/);
  assert.match(markdownExtensions, /const openPart = attrs\.defaultOpen === true \? " open" : ""/);
  assert.match(css, /\.markdown-collapse/);
  assert.match(css, /\.markdown-collapse\.open/);
  assert.match(css, /\.markdown-collapse-summary/);
  assert.match(css, /\.markdown-collapse-body/);
});

test("html blocks are preserved as sanitized editable source blocks", () => {
  const app = readFileSync("src/App.tsx", "utf8");
  const markdownExtensions = readFileSync("src/editor/markdown-extensions.tsx", "utf8");
  const editorOptions = readFileSync("src/editor/editor-options.ts", "utf8");
  const css = readFileSync("src/App.css", "utf8");

  assert.match(markdownExtensions, /const htmlBlockTags = new Set/);
  assert.match(markdownExtensions, /function htmlBlockMarkdownToken/);
  assert.match(markdownExtensions, /function sanitizeHtmlBlock/);
  assert.match(markdownExtensions, /function createKeyboardKeyExtension/);
  assert.match(markdownExtensions, /blockedHtmlPreviewSelector/);
  assert.match(markdownExtensions, /safeHtmlAttributeValue/);
  assert.match(markdownExtensions, /function isAiBuilderMarkerComment/);
  assert.match(markdownExtensions, /function HtmlBlockNodeView/);
  assert.match(emptyHtmlBlockMarkdown, /^<div>/);
  assert.match(markdownExtensions, /selected, updateAttributes/);
  assert.match(markdownExtensions, /name: "htmlBlock"/);
  assert.match(markdownExtensions, /markdownTokenName: "htmlBlock"/);
  assert.match(markdownExtensions, /data-glyphary-html-block/);
  assert.match(markdownExtensions, /data-raw-html/);
  assert.match(markdownExtensions, /rawHtml/);
  assert.match(markdownExtensions, /dangerouslySetInnerHTML=\{\{ __html: sanitizeHtmlBlock\(rawHtml\) \}\}/);
  assert.match(markdownExtensions, /selected \? \(/);
  assert.match(markdownExtensions, /aria-label="HTML block source"/);
  assert.match(markdownExtensions, /markdown-html-block-hidden/);
  assert.match(markdownExtensions, /ReactNodeViewRenderer\(HtmlBlockNodeView\)/);
  assert.match(editorOptions, /createHtmlBlockExtension\(\)/);
  assert.match(markdownExtensions, /name: "keyboardKey"/);
  assert.match(markdownExtensions, /tag: "kbd"/);
  assert.match(markdownExtensions, /htmlReopen: \{ open: "<kbd>", close: "<\/kbd>" \}/);
  assert.match(markdownExtensions, /`<kbd>\$\{helpers\.renderChildren\(node\.content \?\? \[\]\)\}<\/kbd>`/);
  assert.match(editorOptions, /createKeyboardKeyExtension\(\)/);
  assert.match(app, /function insertHtmlBlock\(\)/);
  assert.match(app, /insertContent\(emptyHtmlBlockMarkdown, \{ contentType: "markdown" \}\)/);
  assert.match(editorOptions, /createCollapseExtension\(\),\s*createHtmlBlockExtension\(\),\s*createKeyboardKeyExtension\(\),[\s\S]*createDelimitedMarkdownMarkExtension\(\{[\s\S]*createRichLinkExtension\(\)/);
  assert.match(markdownExtensions, /"script"/);
  assert.match(markdownExtensions, /"style"/);
  assert.match(markdownExtensions, /"pre"/);
  assert.match(markdownExtensions, /"iframe"/);
  assert.match(markdownExtensions, /javascript\|data\|vbscript/);
  assert.match(markdownExtensions, /\^on\/i/);
  assert.match(css, /\.markdown-html-block/);
  assert.match(css, /\.markdown-html-preview/);
  assert.match(css, /\.markdown-html-source textarea/);
  assert.match(css, /\.editor-surface kbd/);
});

test("rich link markdown containers are wired into the editor", () => {
  const app = readFileSync("src/App.tsx", "utf8");
  const markdownExtensions = readFileSync("src/editor/markdown-extensions.tsx", "utf8");
  const css = readFileSync("src/App.css", "utf8");

  assert.equal(
    richLinkMarkdown({
      url: "https://example.com",
      title: "Example",
      description: "Line one\nline two",
      image: "https://example.com/card.png",
      siteName: "Example Site",
    }),
    `::: rich-link
url: https://example.com
title: Example
description: Line one line two
image: https://example.com/card.png
siteName: Example Site
:::`,
  );
  assert.match(markdownExtensions, /name: "richLink"/);
  assert.match(markdownExtensions, /markdownTokenName: "rich-link"/);
  assert.match(markdownExtensions, /data-glyphary-rich-link/);
  assert.match(app, /fetch_rich_link_metadata/);
  assert.match(app, /id: "insert-rich-link"/);
  assert.match(app, /openRichLinkDialog/);
  assert.match(app, /insertRichLinkFromUrl/);
  assert.match(app, /insertMarkdownAtCursor\(editor, richLinkMarkdown\(metadata\)\)/);
  assert.doesNotMatch(app, /setEditorBody\(`\$\{markdown\.trimEnd\(\)\}\\n\\n\$\{richLinkMarkdown\(metadata\)\}`/);
  assert.match(app, /richLinkDialogOpen/);
  assert.match(app, /aria-label="Insert rich link"/);
  assert.match(css, /\.rich-link-card/);
  assert.match(css, /\.rich-link-dialog-screen/);
  assert.match(css, /\.rich-link-image/);
  assert.match(css, /\.rich-link-content/);
});

test("excalidraw drawings are embedded as vault files", () => {
  const app = readFileSync("src/App.tsx", "utf8");
  const excalidrawEditor = readFileSync("src/excalidraw/editor.tsx", "utf8");
  const editorOptions = readFileSync("src/editor/editor-options.ts", "utf8");
  const vaultPersistence = readFileSync("src/vault/persistence.ts", "utf8");
  const css = readFileSync("src/App.css", "utf8");
  const backend = readFileSync("src-tauri/src/lib.rs", "utf8");
  const vaultBackend = readFileSync("src-tauri/src/vault.rs", "utf8");
  const date = new Date("2023-01-02T17:37:41");

  assert.equal(defaultExcalidrawDirectory, "_assets_/drawings");
  assert.equal(
    excalidrawFileNameForTitle("System sketch?.excalidraw", date),
    "System sketch 20230102173741.excalidraw",
  );
  assert.match(excalidrawEditor, /const ExcalidrawCanvas = lazy/);
  assert.match(excalidrawEditor, /function createExcalidrawEmbedExtension/);
  assert.match(excalidrawEditor, /markdownTokenName: "excalidrawEmbed"/);
  assert.match(excalidrawEditor, /src\.search\(/);
  assert.match(excalidrawEditor, /return index >= 0 \? index : src\.length/);
  assert.match(excalidrawEditor, /excalidraw-embed-invalid/);
  const excalidrawViewStart = excalidrawEditor.indexOf("function ExcalidrawEmbedView");
  const invalidEmbedReturn = excalidrawEditor.indexOf("excalidraw-embed-invalid", excalidrawViewStart);
  const previewEffectHook = excalidrawEditor.indexOf("useEffect(() => {", excalidrawViewStart);
  assert.ok(excalidrawViewStart >= 0);
  assert.ok(previewEffectHook > excalidrawViewStart);
  assert.ok(previewEffectHook < invalidEmbedReturn);
  const useExcalidraw = readFileSync("src/excalidraw/use-excalidraw.ts", "utf8");
  assert.match(useExcalidraw, /excalidrawPreviewRefreshEvent/);
  assert.match(useExcalidraw, /window\.dispatchEvent\(\s*new CustomEvent\(excalidrawPreviewRefreshEvent/);
  assert.doesNotMatch(app, /excalidrawIgnoreNextChangeRef/);
  assert.match(useExcalidraw, /ExcalidrawImperativeAPI/);
  assert.match(useExcalidraw, /apiRef/);
  assert.match(useExcalidraw, /api\?\.getSceneElementsIncludingDeleted\(\)/);
  assert.match(useExcalidraw, /visibleElementCount/);
  assert.match(useExcalidraw, /visible element/);
  assert.match(useExcalidraw, /api\?\.getAppState\(\)/);
  assert.match(useExcalidraw, /api\?\.getFiles\(\)/);
  assert.match(excalidrawEditor, /excalidrawAPI=\{onApi\}/);
  assert.match(editorOptions, /createExcalidrawEmbedExtension\(\{/);
  assert.match(app, /id: "insert-excalidraw"/);
  assert.match(app, /title: "Insert Excalidraw drawing"/);
  assert.match(app, /excalidraw\.openCreateDialog/);
  assert.match(useExcalidraw, /createDialogOpen/);
  assert.match(excalidrawEditor, /aria-label="Insert Excalidraw drawing"/);
  assert.match(vaultPersistence, /create_excalidraw_file/);
  assert.match(useExcalidraw, /serializeAsJSON\(elements, appState, files, "local"\)/);
  assert.match(useExcalidraw, /excalidrawSceneToSvgMarkup/);
  assert.match(css, /\.editor-surface \.excalidraw-embed/);
  assert.match(css, /\.excalidraw-create-dialog-screen/);
  assert.match(css, /\.excalidraw-dialog-screen/);
  assert.match(css, /\.excalidraw-editor-shell/);
  assert.match(vaultBackend, /pub\(crate\) fn create_excalidraw_file/);
  assert.match(vaultBackend, /Drawing path must end with \.excalidraw/);
  assert.match(backend, /create_excalidraw_file,/);
});

test("canvas files open as editable React Flow graph tabs", () => {
  const app = readFileSync("src/App.tsx", "utf8");
  const settingsDialog = readFileSync("src/settings/SettingsDialog.tsx", "utf8");
  const css = readFileSync("src/App.css", "utf8");
  const canvasView = readFileSync("src/CanvasView.tsx", "utf8");
  const editorPane = readFileSync("src/editor/EditorPane.tsx", "utf8");
  const vaultIcons = readFileSync("src/vault/VaultIcons.tsx", "utf8");
  const canvasNodes = readFileSync("src/canvas/CanvasNodes.tsx", "utf8");
  const canvasDialogs = readFileSync("src/canvas/CanvasDialogs.tsx", "utf8");
  const canvasLogic = readFileSync("src/lib/canvas.ts", "utf8");
  const appTypes = readFileSync("src/lib/app-types.ts", "utf8");
  const settings = readFileSync("src/lib/settings.ts", "utf8");

  assert.match(appTypes, /kind: "markdown" \| "canvas" \| "base"/);
  assert.match(app, /canvasTitle,[\s\S]*isCanvasPath,[\s\S]*type CanvasCommandAction,[\s\S]*type CanvasCommandRequest,[\s\S]*from "\.\/CanvasView"/);
  assert.match(editorPane, /import \{ CanvasView, type CanvasCommandRequest \} from "\.\.\/CanvasView"/);
  assert.match(app, /if \(isCanvasPath\(file\.relativePath\)\) \{/);
  assert.match(app, /kind: "canvas"/);
  assert.match(app, /!tab\s*\?\s*initialMarkdown[\s\S]*tab\.kind !== "markdown"\s*\?\s*tab\.markdown/);
  assert.match(app, /activeTab\?\.kind !== "markdown"/);
  assert.match(editorPane, /<CanvasView[\s\S]*commandRequest=\{isActiveGroup \? canvasCommandRequest : null\}[\s\S]*content=\{paneMarkdown\}/);
  assert.match(app, /Canvas JSON source/);
  assert.match(vaultIcons, /function CanvasFileIcon/);
  assert.match(vaultIcons, /className="vault-entry-icon canvas-file-icon"/);
  assert.match(vaultIcons, /function VaultFileIcon/);
  assert.match(vaultIcons, /isCanvasPath\(relativePath\) \? <CanvasFileIcon \/> : <MarkdownFileIcon \/>/);
  assert.match(app, /<VaultFileIcon relativePath=\{entry\.relativePath\} \/>/);
  assert.match(app, /<VaultFileIcon relativePath=\{file\.relativePath\} \/>/);
  assert.match(canvasView, /from "@xyflow\/react"/);
  assert.match(canvasView, /import \{ createPortal \} from "react-dom"/);
  assert.match(canvasView, /from "\.\/lib\/canvas\.js"/);
  assert.match(canvasView, /from "\.\/canvas\/CanvasNodes\.js"/);
  assert.match(canvasView, /from "\.\/canvas\/CanvasDialogs\.js"/);
  assert.match(canvasNodes, /^\/\*\*/);
  assert.match(canvasNodes, /Responsibilities:/);
  assert.match(canvasNodes, /Contracts:/);
  assert.match(canvasDialogs, /^\/\*\*/);
  assert.match(canvasDialogs, /Responsibilities:/);
  assert.match(canvasDialogs, /Contracts:/);
  assert.match(canvasNodes, /convertFileSrc/);
  assert.match(canvasView, /ReactFlowProvider/);
  assert.match(canvasView, /useReactFlow/);
  assert.doesNotMatch(canvasView, /from "@tauri-apps\/plugin-dialog"/);
  assert.match(canvasLogic, /function parseCanvasDocument/);
  assert.match(canvasLogic, /function serializeCanvasDocument/);
  assert.match(canvasLogic, /Preserving it here would make the node blink and reappear/);
  assert.match(canvasLogic, /\.filter\(\(node\): node is JsonCanvasNode => Boolean\(node\)\)/);
  assert.match(canvasLogic, /function canvasNodeFromFlowNode/);
  assert.match(canvasView, /CanvasPromptDialogState/);
  assert.match(canvasView, /export type CanvasCommandAction = "card" \| "note" \| "media" \| "web" \| "group"/);
  assert.match(canvasView, /commandRequest\?: CanvasCommandRequest \| null/);
  assert.match(canvasView, /handledCommandRequestIdRef/);
  assert.match(canvasView, /runCanvasMenuAction\(commandRequest\.action, centeredCanvasPosition\(\)\)/);
  assert.match(canvasNodes, /isEditing\?: boolean/);
  assert.match(canvasNodes, /onCommitText\?: \(nodeId: string, text: string\) => void/);
  assert.match(canvasView, /CanvasVaultPickerDialogState/);
  assert.match(canvasLogic, /type JsonCanvasNode = \{/);
  assert.match(canvasLogic, /type: "text" \| "file" \| "link" \| "group"/);
  assert.match(canvasLogic, /return \["text", "file", "link", "group"\]\.includes\(node\.type\)/);
  assert.match(canvasLogic, /const obsidianCanvasColors/);
  assert.match(canvasLogic, /"1": "#fb464c"/);
  assert.match(canvasNodes, /function canvasNodeStyle/);
  assert.match(canvasNodes, /"--canvas-node-bg": `color-mix\(in srgb, \$\{accent\} 42%, var\(--surface\)\)`/);
  assert.match(canvasNodes, /"--canvas-node-border": `color-mix\(in srgb, \$\{accent\} 88%, var\(--border\)\)`/);
  assert.match(canvasLogic, /\.\.\.\(flowNode\.data\.color \? \{ color: flowNode\.data\.color \} : \{\}\)/);
  assert.match(canvasLogic, /nextNode\.color = flowNode\.data\.color/);
  assert.match(canvasLogic, /delete nextNode\.color/);
  assert.match(canvasLogic, /function canvasFileKind/);
  assert.match(canvasLogic, /mediaExtensions\.image/);
  assert.match(canvasLogic, /mediaExtensions\.video/);
  assert.match(canvasLogic, /mediaExtensions\.audio/);
  assert.match(canvasNodes, /function vaultFileAssetUrl/);
  assert.match(canvasView, /applyNodeChanges/);
  assert.match(canvasView, /applyEdgeChanges/);
  assert.match(canvasView, /addEdge/);
  assert.match(canvasView, /ConnectionMode\.Loose/);
  assert.match(settings, /defaultCanvasSettings: CanvasSettings = \{\s*nodeBorderWidth: 1,/);
  assert.match(settings, /function normalizeCanvasSettings/);
  assert.match(settings, /function sameCanvasSettings/);
  assert.match(appTypes, /export type CanvasSettings/);
  assert.match(appTypes, /canvas\?: CanvasSettings \| null/);
  assert.match(canvasView, /MarkerType\.ArrowClosed/);
  assert.match(canvasView, /markerEnd: canvasEdgeMarker/);
  assert.match(canvasView, /function canvasFlowEdgeType/);
  assert.match(canvasView, /strokeWidth: settings\.edgeThickness/);
  assert.match(canvasView, /snapToGrid=\{settings\.snapToGrid\}/);
  assert.match(canvasView, /settings\.showGrid \? <Background \/> : null/);
  assert.match(canvasView, /settings\.showNavigationPreview \? <MiniMap pannable zoomable \/> : null/);
  assert.match(settingsDialog, /Show preview\/navigation box/);
  assert.match(canvasNodes, /<Handle id="top" position=\{Position\.Top\} type="source" \/>/);
  assert.doesNotMatch(canvasNodes, /type="target"/);
  assert.match(canvasView, /onChange\(serializeCanvasDocument/);
  assert.match(canvasView, /onPaneContextMenu=\{handlePaneContextMenu\}/);
  assert.match(canvasView, /onNodeContextMenu=\{handleNodeContextMenu\}/);
  assert.match(canvasView, /onPaneClick=\{handlePaneClick\}/);
  assert.match(canvasView, /onNodeDoubleClick=\{handleNodeDoubleClick\}/);
  assert.match(canvasView, /lastContextMenuOpenedAtRef/);
  assert.match(canvasView, /Date\.now\(\) - lastContextMenuOpenedAtRef\.current < 350/);
  assert.match(canvasView, /node\.type !== "text"/);
  assert.match(canvasView, /setEditingCardId\(node\.id\)/);
  assert.match(canvasView, /CanvasNodeContextMenuState/);
  assert.match(canvasView, /runCanvasNodeMenuAction/);
  assert.match(canvasView, /setCanvasNodeColor/);
  assert.match(canvasView, /deleteCanvasNode/);
  assert.match(canvasView, /aria-label="Node actions"/);
  assert.match(canvasView, /aria-label="Node color"/);
  assert.match(canvasView, /Delete Node/);
  assert.match(canvasView, /Object\.entries\(obsidianCanvasColors\)\.map/);
  assert.match(canvasNodes, /className="canvas-card-editor nodrag nowheel"/);
  assert.match(canvasNodes, /data\.onCommitText\?\.\(id, draft\)/);
  assert.match(canvasNodes, /skipNextBlurCommitRef/);
  assert.match(canvasNodes, /event\.key === "Enter" && \(event\.metaKey \|\| event\.ctrlKey\)/);
  assert.match(canvasView, /nodes=\{displayedNodes\}/);
  assert.doesNotMatch(canvasView, /Edit Card/);
  assert.doesNotMatch(canvasView, /Save Card/);
  assert.match(canvasView, /screenToFlowPosition/);
  assert.match(canvasView, /getBoundingClientRect/);
  assert.match(canvasView, /event\.clientX - \(canvasBounds\?\.left \?\? 0\)/);
  assert.match(canvasView, /Add Card/);
  assert.match(canvasView, /Add Note From Vault/);
  assert.match(canvasView, /Add Media From Vault/);
  assert.match(canvasView, /Add Web Page/);
  assert.match(canvasNodes, /className="canvas-web-preview"/);
  assert.match(canvasNodes, /<iframe/);
  assert.match(canvasView, /Create Group/);
  assert.match(canvasView, /Snap To Grid/);
  assert.match(canvasDialogs, /CanvasVaultPickerTree/);
  assert.match(canvasView, /<CanvasDialogs/);
  assert.match(canvasView, /createPortal\(canvasDialogs, document\.body\)/);
  assert.match(canvasView, /event\.button !== 0/);
  assert.match(canvasView, /closest\("\.canvas-context-menu"\)/);
  assert.match(canvasView, /list_vault_dir/);
  assert.match(canvasView, /pendingVaultDirectoryLoad/);
  assert.match(canvasDialogs, /canvasVaultPickerFileVisible/);
  assert.doesNotMatch(canvasView, /list_vault_markdown_files/);
  assert.doesNotMatch(canvasView, /list_vault_media_files/);
  assert.match(canvasView, /canvasSnapGridSize/);
  assert.match(canvasNodes, /read_vault_file/);
  assert.match(canvasNodes, /data\.onOpenFile\(data\.file\)/);
  assert.match(canvasNodes, /fileKind === "markdown"/);
  assert.match(canvasNodes, /className="canvas-media-preview"/);
  assert.match(canvasNodes, /className="canvas-audio-preview"/);
  assert.match(canvasView, /draggable: node\.type !== "group"/);
  assert.match(canvasView, /connectable: node\.type !== "group"/);
  assert.match(canvasView, /selectable: node\.type !== "group"/);
  assert.match(canvasView, /focusable: false/);
  assert.match(canvasView, /zIndex: node\.type === "group" \? 0 : 1/);
  assert.match(canvasView, /removedNodeIds/);
  assert.match(canvasView, /!removed\.has\(edge\.source\) && !removed\.has\(edge\.target\)/);
  assert.match(canvasView, /onNodeDragStop=\{handleNodeDragStop\}/);
  assert.match(canvasView, /onConnect=\{handleConnect\}/);
  assert.match(canvasView, /nodesDraggable/);
  assert.match(canvasView, /nodesConnectable/);
  assert.match(app, /function updateCanvasDocument\(groupId: EditorGroupId, nextContent: string\)/);
  assert.match(app, /dirty: true/);
  assert.match(css, /\.canvas-editor-pane/);
  assert.match(css, /\.canvas-file-icon \.canvas-edge-line/);
  assert.match(css, /\.canvas-file-icon \.canvas-node-dot/);
  assert.match(css, /\.canvas-view \{[\s\S]*?position: relative/);
  assert.match(css, /radial-gradient\(circle at 1px 1px/);
  assert.match(css, /background-size: 22px 22px, auto/);
  assert.match(css, /\.canvas-view \.react-flow/);
  assert.match(css, /\.canvas-view \.react-flow__controls-button/);
  assert.match(css, /\.canvas-view \.react-flow__minimap-mask/);
  assert.match(css, /\.canvas-view \.react-flow__edge-path/);
  assert.match(css, /stroke-width: 2\.5/);
  assert.match(css, /:root\[data-window-glass="enabled"\] \.canvas-view/);
  assert.match(css, /:root\[data-window-glass="enabled"\] \.canvas-node-card/);
  assert.match(css, /\.canvas-context-menu \{[\s\S]*?position: absolute/);
  assert.match(css, /\.canvas-color-menu/);
  assert.match(css, /\.canvas-context-menu \.canvas-color-choice/);
  assert.match(css, /\.canvas-context-menu button\.danger/);
  assert.match(css, /\.canvas-dialog-screen \{[\s\S]*?position: fixed/);
  assert.match(css, /\.canvas-card-editor/);
  assert.match(css, /\.canvas-vault-tree-row/);
  assert.match(css, /\.canvas-view \.react-flow__handle/);
  assert.match(css, /--canvas-node-accent/);
  assert.match(css, /var\(--canvas-node-bg, var\(--surface\)\)/);
  assert.match(css, /\.canvas-node-card::before/);
  assert.match(css, /\.canvas-view \.react-flow__node\.selected \.canvas-node-card/);
  assert.match(css, /border: var\(--canvas-node-border-width, 1px\) solid var\(--canvas-node-border/);
  assert.match(css, /\.canvas-file-node/);
  assert.match(css, /\.canvas-web-preview/);
  assert.match(css, /\.canvas-group-node/);
  assert.doesNotMatch(css, /\.canvas-view \.react-flow__node-group \{\s*pointer-events: none;\s*\}/);
  assert.match(css, /\.canvas-media-preview/);
  assert.match(css, /\.canvas-audio-preview/);
});

test("code block language picker renders inside the active code block", () => {
  const app = readFileSync("src/App.tsx", "utf8");
  const codeBlockLanguage = readFileSync("src/editor/code-block-language.tsx", "utf8");
  const codeBlockRenderers = readFileSync("src/editor/code-block-renderers.ts", "utf8");
  const editorOptions = readFileSync("src/editor/editor-options.ts", "utf8");
  const css = readFileSync("src/App.css", "utf8");

  assert.match(codeBlockLanguage, /Responsibilities:/);
  assert.match(codeBlockLanguage, /Contracts:/);
  assert.match(codeBlockRenderers, /function codeBlockContainsSelection\(/);
  assert.match(codeBlockRenderers, /const contentStart = position \+ 1;/);
  assert.match(codeBlockRenderers, /const contentEnd = position \+ nodeSize - 1;/);
  assert.match(codeBlockRenderers, /selection\.from >= contentStart && selection\.to <= contentEnd/);
  assert.match(codeBlockLanguage, /function codeBlockDecorationsContainLanguageControl/);
  assert.match(codeBlockLanguage, /includes\("code-block-language-active"\)/);
  assert.match(codeBlockLanguage, /function CodeBlockNodeView/);
  assert.match(codeBlockLanguage, /new PluginKey\("codeBlockLanguageControl"\)/);
  assert.match(codeBlockLanguage, /codeBlockContainsSelection\(state\.selection, position, node\.nodeSize\)/);
  assert.match(codeBlockLanguage, /addKeyboardShortcuts\(\) \{/);
  assert.match(codeBlockLanguage, /Tab: \(\) => \{/);
  assert.match(codeBlockLanguage, /return this\.editor\.commands\.insertContent\("    "\);/);
  assert.match(codeBlockLanguage, /"Shift-Tab": \(\) => this\.editor\.isActive\(this\.name\),/);
  assert.match(codeBlockLanguage, /ReactNodeViewRenderer\(CodeBlockNodeView, \{\s*update: \(\{ updateProps \}\) => \{/);
  assert.match(codeBlockLanguage, /updateProps\(\);/);
  assert.match(editorOptions, /CodeBlockWithLanguageControl\.configure\(\{\s*lowlight,/);
  assert.match(codeBlockLanguage, /class: "code-block-language-active"/);
  assert.match(codeBlockLanguage, /className="code-block-language-control"/);
  assert.match(codeBlockLanguage, /<NodeViewContent<"code"> as="code" \/>/);
  assert.match(app, /<datalist id="code-language-options">/);
  assert.doesNotMatch(app, /disabled=\{!codeBlockActive\}/);
  assert.doesNotMatch(app, /function updateCodeLanguage/);
  assert.doesNotMatch(app, /className="code-language-control"/);
  assert.match(css, /\.editor-surface \.code-block-node/);
  assert.match(css, /display: none;/);
  assert.match(css, /\.editor-surface \.code-block-node\.active \.code-block-language-control/);
  assert.match(css, /tab-size: 4;/);
  assert.match(css, /\.code-block-language-control/);
  assert.doesNotMatch(css, /\.code-language-control/);
});

test("mermaid code blocks render diagrams while keeping fenced source editable", () => {
  const app = readFileSync("src/App.tsx", "utf8");
  const editorOptions = readFileSync("src/editor/editor-options.ts", "utf8");
  const codeBlockRenderers = readFileSync("src/editor/code-block-renderers.ts", "utf8");
  const css = readFileSync("src/App.css", "utf8");

  assert.match(editorOptions, /lowlight\.register\("mermaid", plaintext\)/);
  assert.match(codeBlockRenderers, /function loadMermaidRenderer/);
  assert.match(codeBlockRenderers, /import\("mermaid"\)\.then/);
  assert.match(codeBlockRenderers, /mermaid\.initialize\(\{/);
  // Parse errors stay inside the widget; mermaid's body-level "bomb" SVG is
  // suppressed and any leftover measuring element is removed.
  assert.match(codeBlockRenderers, /suppressErrorRendering: true/);
  assert.match(codeBlockRenderers, /getElementById\(`d\$\{renderId\}`\)\?\.remove\(\)/);
  assert.match(codeBlockRenderers, /function createMermaidCodeWidget/);
  assert.match(codeBlockRenderers, /function renderMermaidDiagram/);
  assert.match(codeBlockRenderers, /mermaid\.render\(renderId, source\)/);
  assert.match(codeBlockRenderers, /new PluginKey\("mermaidCodeBlockRenderer"\)/);
  assert.match(codeBlockRenderers, /node\.attrs\.language !== "mermaid"/);
  assert.match(codeBlockRenderers, /class: selected \? "mermaid-code-block editing" : "mermaid-code-block rendered"/);
  assert.match(editorOptions, /MermaidCodeBlockRenderer/);
  assert.match(codeBlockRenderers, /dataset\.mermaidEdit/);
  assert.match(css, /\.editor-surface pre\.mermaid-code-block\.rendered/);
  assert.match(css, /\.mermaid-code-render/);
  assert.match(css, /\.mermaid-code-body svg/);
});

test("base files query markdown properties and render dedicated views", () => {
  const app = readFileSync("src/App.tsx", "utf8");
  const appTypes = readFileSync("src/lib/app-types.ts", "utf8");
  const appCss = readFileSync("src/App.css", "utf8");
  const appDocuments = readFileSync("src/app-state/documents.ts", "utf8");
  const baseHelpers = readFileSync("src/base/base.ts", "utf8");
  const baseView = readFileSync("src/base/BaseView.tsx", "utf8");
  const editorPane = readFileSync("src/editor/EditorPane.tsx", "utf8");
  const persistence = readFileSync("src/vault/persistence.ts", "utf8");
  const backend = readFileSync("src-tauri/src/base.rs", "utf8");
  const backendModels = readFileSync("src-tauri/src/models.rs", "utf8");
  const backendLib = readFileSync("src-tauri/src/lib.rs", "utf8");
  const backendTests = readFileSync("src-tauri/src/tests/base.rs", "utf8");

  assert.match(appTypes, /kind: "markdown" \| "canvas" \| "base"/);
  assert.match(appTypes, /export type BaseQueryResult/);
  assert.match(baseHelpers, /export function isBasePath/);
  assert.match(baseHelpers, /export function baseFieldValue/);
  assert.match(baseHelpers, /export function baseAvailableFields/);
  assert.match(baseHelpers, /export function baseRowsMatchingTitle/);
  assert.match(baseHelpers, /export function baseSortedRows/);
  assert.match(baseHelpers, /fields\.has\(`note\.\$\{property\}`\)/);
  assert.match(baseHelpers, /const frontmatterTitle = baseFieldValue\(row, "title"\)/);
  assert.match(baseHelpers, /Number\.isFinite\(leftNumber\) && Number\.isFinite\(rightNumber\)/);
  assert.match(baseHelpers, /if \(!leftValue\) \{[\s\S]*return 1;/);
  assert.match(appDocuments, /isBasePath\(name\) \? baseTitle\(name\)/);
  assert.match(app, /if \(isBasePath\(file\.relativePath\)\) \{/);
  assert.match(app, /kind: "base"/);
  assert.match(app, /!tab\s*\?\s*initialMarkdown[\s\S]*tab\.kind !== "markdown"\s*\?\s*tab\.markdown/);
  assert.match(app, /activeDocumentIsMarkdown/);
  assert.match(editorPane, /import \{ BaseView \} from "\.\.\/base\/BaseView"/);
  assert.match(editorPane, /const isBaseTab = groupActiveTab\?\.kind === "base"/);
  assert.match(editorPane, /<BaseView/);
  assert.match(editorPane, /assetDirectory=\{vaultSettings\.assetDirectory\}/);
  assert.match(editorPane, /imageLayout=\{vaultSettings\.files\?\.baseCardImageLayout === "top" \? "top" : "side"\}/);
  assert.match(baseView, /queryBase\(vaultRoot, relativePath\)/);
  assert.match(baseView, /function BaseControls/);
  assert.match(baseView, /baseAvailableFields\(activeView\)/);
  assert.match(baseView, /baseRowsMatchingTitle\(activeView\.rows, titleQuery\)/);
  assert.match(baseView, /baseSortedRows\(/);
  assert.match(baseView, /openControl === "search"/);
  assert.match(baseView, /openControl === "sort"/);
  assert.match(baseView, /openControl === "fields"/);
  assert.match(baseView, /event\.key !== "Escape"/);
  assert.match(baseView, /window\.addEventListener\("keydown", closeBaseControl, \{ capture: true \}\)/);
  assert.match(baseView, /function baseControlIcon/);
  assert.match(baseView, /Displayed properties/);
  assert.match(baseView, /Search title/);
  assert.match(baseView, /Sort by/);
  assert.match(baseView, /imageLayout: "side" \| "top"/);
  assert.match(baseView, /imageLayout === "top" \? "image-top"/);
  assert.match(baseView, /import \{ isUrlLike \} from "\.\.\/lib\/paths"/);
  assert.match(baseView, /function baseImageSources/);
  assert.match(baseView, /reference === "null" \|\| reference === "~"/);
  assert.match(baseView, /if \(isUrlLike\(reference\)\) \{[\s\S]*return \[reference\]/);
  assert.match(baseView, /vaultImagePathCandidates\(root, reference/);
  assert.match(baseView, /relativePath: row\.relativePath/);
  assert.match(baseView, /setImageIndex\(nextIndex\)/);
  assert.match(baseView, /activeView\.type === "table"/);
  assert.match(persistence, /"query_base"/);
  assert.match(appCss, /\.base-card-grid/);
  assert.match(appCss, /\.base-controls/);
  assert.match(appCss, /\.base-control-group/);
  assert.match(appCss, /\.base-control-menu/);
  assert.match(appCss, /\.base-sort-options/);
  assert.doesNotMatch(appCss, /\.base-field-picker/);
  assert.match(appCss, /\.base-card\.image-top/);
  assert.match(appCss, /\.base-table/);
  assert.match(backendModels, /struct BaseQueryResult/);
  assert.match(backendModels, /struct BaseViewResult/);
  assert.match(backendModels, /struct BaseRow/);
  assert.match(backendLib, /mod base;/);
  assert.match(backendLib, /query_base/);
  assert.match(backend, /fn parse_base_definition/);
  assert.match(backend, /fn parse_note_properties/);
  assert.match(backend, /BaseCondition::HasProperty/);
  assert.match(backend, /BaseCondition::Equals/);
  assert.match(backend, /walk_files/);
  assert.match(backendTests, /queries_base_views_from_note_frontmatter/);
});
