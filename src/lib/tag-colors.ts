/**
 * Tag colours.
 *
 * Responsibilities:
 * - Resolve the colour a vault picked for a tag, if any, and produce the CSS
 *   custom property the tag surfaces (inline pills, frontmatter pills, Tags
 *   drawer) read to draw themselves.
 *
 * Contracts:
 * - Tags are never coloured automatically: with no pick, a surface gets no
 *   style and keeps its neutral look.
 * - A pick applies to the tag and everything nested under it unless a deeper
 *   pick exists. Keys are lowercased, values are `#rrggbb`.
 * - The Obsidian snippet mirrors the same picks through Obsidian's own tag
 *   variables so the vault looks alike in both apps.
 */

export type TagColors = Record<string, string>;

const HEX_COLOR = /^#[0-9a-f]{6}$/;

export function normalizeTagColors(colors: TagColors | null | undefined): TagColors {
  const normalized: TagColors = {};

  for (const [tag, color] of Object.entries(colors ?? {})) {
    const key = tag.trim().replace(/^#/, "").replace(/^\/+|\/+$/g, "").toLowerCase();
    const value = color.trim().toLowerCase();

    if (key && HEX_COLOR.test(value)) {
      normalized[key] = value;
    }
  }

  return normalized;
}

export function withTagColor(colors: TagColors, tag: string, color: string | null): TagColors {
  const next = { ...colors };

  if (color) {
    next[tag] = color;
  } else {
    delete next[tag];
  }

  return next;
}

export function sameTagColors(left: TagColors, right: TagColors) {
  const leftKeys = Object.keys(left);

  return (
    leftKeys.length === Object.keys(right).length && leftKeys.every((key) => left[key] === right[key])
  );
}

export function tagOverride(tag: string, colors: TagColors) {
  const segments = tag.toLowerCase().split("/");

  for (let depth = segments.length; depth > 0; depth -= 1) {
    const color = colors[segments.slice(0, depth).join("/")];

    if (color) {
      return color;
    }
  }

  return null;
}

export type TagStyle = { "--tag-color": string };

export function tagStyle(tag: string, colors: TagColors): TagStyle | undefined {
  const override = tagOverride(tag, colors);

  return override ? { "--tag-color": override } : undefined;
}

/** The same as `tagStyle`, as an inline `style` attribute for non-React DOM. */
export function tagStyleAttribute(tag: string, colors: TagColors) {
  const override = tagOverride(tag, colors);

  return override ? `--tag-color: ${override}` : undefined;
}

export const OBSIDIAN_TAG_SNIPPET_NAME = "glyphary-tag-colors.css";

/**
 * A CSS snippet for Obsidian's `.obsidian/snippets` carrying the same picks.
 * Reading view matches the tag link and everything nested under it; live
 * preview only exposes a class for the root segment, so nested picks show
 * their root's colour there. Properties pills carry no tag identity Obsidian
 * exposes to CSS and are left alone.
 */
export function obsidianTagColorSnippet(colors: TagColors) {
  const rules = Object.keys(colors)
    .sort()
    .map((tag) => {
      const color = colors[tag];
      const selectors = [`a.tag[href="#${tag}" i]`, `a.tag[href^="#${tag}/" i]`];

      if (!tag.includes("/")) {
        selectors.push(`.cm-s-obsidian .cm-line span.cm-hashtag.cm-tag-${tag}`);
      }

      return [
        `${selectors.join(",\n")} {`,
        `  --tag-color: color-mix(in srgb, ${color} 70%, var(--text-normal));`,
        `  --tag-background: color-mix(in srgb, ${color} 22%, var(--background-primary));`,
        `  --tag-border-color: color-mix(in srgb, ${color} 55%, var(--background-modifier-border));`,
        "}",
      ].join("\n");
    });

  return [
    "/* Tag colours exported from Glyphary. Regenerate from Settings > Export; edits here are overwritten. */",
    ...rules,
    "",
  ].join("\n\n");
}
