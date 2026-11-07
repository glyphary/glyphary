/**
 * Image-valued frontmatter properties.
 *
 * Responsibilities:
 * - Decide which frontmatter rows get the picture control, and produce the
 *   property value for a picture stored in the vault.
 *
 * Contracts:
 * - A row is an image row when its key is one people use for pictures
 *   (`photo`, `image`, `avatar`, `cover`, `picture`, `thumbnail`) or when its
 *   value already names an image file or URL.
 * - The stored value is Obsidian's form, a quoted bare wikilink, so the
 *   property reads as a link in both apps and never as a YAML list.
 */

const imageKeys = new Set(["photo", "image", "avatar", "cover", "picture", "thumbnail"]);
const imageExtension = /\.(png|jpe?g|gif|webp|avif|svg)(?:[?#].*)?$/i;

export function isImageProperty(key: string, value: string) {
  return imageKeys.has(key.trim().toLowerCase()) || imageExtension.test(imageReferenceFromValue(value));
}

/** The bare file name, path, or URL inside a property value. */
export function imageReferenceFromValue(value: string) {
  return value
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/^!?\[\[([^\]|]+)(?:\|[^\]]*)?\]\]$/, "$1")
    .trim();
}

export function imagePropertyValue(fileName: string) {
  return `"[[${fileName}]]"`;
}
