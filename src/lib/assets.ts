/**
 * Vault asset naming and validation helpers.
 *
 * Responsibilities:
 * - Recognize supported dropped/pasted image files.
 * - Produce markdown-visible asset and drawing filenames using Glyphary's timestamp convention.
 *
 * Contracts:
 * - These helpers operate on file-like metadata only; the backend still validates bytes and paths.
 * - Generated names must remain stable because they are inserted directly into markdown.
 */

import { timestampForAssetName } from "./dates.js";

const supportedImageTypes = new Map([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/gif", "gif"],
  ["image/webp", "webp"],
]);

type ImageFileLike = {
  name: string;
  type: string;
};

export function imageExtensionForFile(file: ImageFileLike) {
  const mimeExtension = supportedImageTypes.get(file.type);

  if (mimeExtension) {
    return mimeExtension;
  }

  const extension = file.name.split(".").pop()?.toLowerCase();

  return extension && ["png", "jpg", "jpeg", "gif", "webp"].includes(extension)
    ? extension
    : "png";
}

export function isSupportedImageFile(file: ImageFileLike) {
  const extension = file.name.split(".").pop()?.toLowerCase();

  return (
    supportedImageTypes.has(file.type) ||
    (!!extension && ["png", "jpg", "jpeg", "gif", "webp"].includes(extension))
  );
}

export function imageFilesFromDataTransfer(transfer: DataTransfer | null | undefined) {
  if (!transfer) {
    return [];
  }

  const files = Array.from(transfer.files);
  if (files.length > 0) {
    return files.filter(isSupportedImageFile);
  }

  return Array.from(transfer.items)
    .filter((item) => item.kind === "file")
    .map((item) => item.getAsFile())
    .filter((file): file is File => Boolean(file))
    .filter(isSupportedImageFile);
}

export function imagePathsFromDrop(paths: string[]) {
  return paths.filter((path) => isSupportedImageFile({ name: path, type: "" }));
}

export function sanitizeAssetNameStem(fileName: string) {
  const withoutPath = fileName.split(/[/\\]/).pop() ?? "";
  const withoutExtension = withoutPath.replace(/\.[^.]+$/, "");
  const sanitized = withoutExtension
    .replace(/[^\w\s.-]+/g, "-")
    .replace(/\s+/g, " ")
    .replace(/^[\s.-]+|[\s.-]+$/g, "");

  if (!sanitized || /^image$/i.test(sanitized)) {
    return "Pasted image";
  }

  return sanitized;
}

export function fileNameForDroppedImage(file: ImageFileLike, date = new Date()) {
  const stem = sanitizeAssetNameStem(file.name);
  const extension = imageExtensionForFile(file);

  return `${stem} ${timestampForAssetName(date)}.${extension}`;
}

export function fileNameForDroppedPath(path: string, date = new Date()) {
  const name = path.split(/[/\\]/).pop() ?? path;
  const extension = name.split(".").pop()?.toLowerCase();

  // Native drops provide an OS path rather than MIME metadata, so JPEG paths
  // must use the same extension mapping as browser-provided image files.
  return fileNameForDroppedImage(
    { name, type: extension === "jpg" || extension === "jpeg" ? "image/jpeg" : "" },
    date,
  );
}

export function sanitizeDrawingName(value: string) {
  const sanitized = value
    .replace(/\.[^.]+$/, "")
    .replace(/[^\w\s.-]+/g, "-")
    .replace(/\s+/g, " ")
    .replace(/^[\s.-]+|[\s.-]+$/g, "");

  return sanitized || "Drawing";
}

export function excalidrawFileNameForTitle(title: string, date = new Date()) {
  return `${sanitizeDrawingName(title)} ${timestampForAssetName(date)}.excalidraw`;
}
