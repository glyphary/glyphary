// Ships excalidraw's version-locked fonts at /fonts so exportToSvg never
// falls back to its esm.sh CDN fetch, which breaks previews offline.
// Paired with window.EXCALIDRAW_ASSET_PATH in index.html.
import { cpSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(projectRoot, "node_modules/@excalidraw/excalidraw/dist/prod/fonts");
const destination = join(projectRoot, "public/fonts");

mkdirSync(destination, { recursive: true });
cpSync(source, destination, { recursive: true });
console.log(`Copied Excalidraw fonts to ${destination}`);
