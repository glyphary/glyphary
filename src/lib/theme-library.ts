/**
 * Theme library.
 *
 * Responsibilities:
 * - Persist app-wide custom themes (built in the theme builder) in
 *   localStorage so every vault and window sees the same list.
 * - Resolve which theme a vault's light/dark choice yields for a mode.
 *
 * Contracts:
 * - A vault stores only theme ids; palettes live here or in the built-in
 *   presets. An id that does not resolve here is kept as saved (the custom
 *   theme may exist on another machine sharing the vault) and falls back to
 *   the Cupertino theme of the same base at render time.
 * - Custom theme ids carry the `custom-` prefix; built-ins never do.
 */
import type { ThemePreset } from "./app-types";

export const customThemesStorageKey = "glyphary.customThemes";
export const defaultThemeIds = { light: "cupertino", dark: "cupertino-dark" } as const;

export type ThemeSelection = { light?: string | null; dark?: string | null };

export function isCustomThemeId(id: string) {
  return id.startsWith("custom-");
}

export function newCustomThemeId() {
  return `custom-${Date.now().toString(36)}`;
}

function isThemePreset(value: unknown): value is ThemePreset {
  const theme = value as ThemePreset | null;

  return (
    typeof theme?.id === "string" &&
    isCustomThemeId(theme.id) &&
    typeof theme.name === "string" &&
    (theme.base === "light" || theme.base === "dark") &&
    typeof theme.tokens === "object" &&
    theme.tokens !== null
  );
}

export function readCustomThemes(): ThemePreset[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(customThemesStorageKey) ?? "[]");

    return Array.isArray(parsed) ? parsed.filter(isThemePreset) : [];
  } catch {
    return [];
  }
}

export function writeCustomThemes(themes: ThemePreset[]) {
  window.localStorage.setItem(customThemesStorageKey, JSON.stringify(themes));
}

export function normalizeThemeId(id: string | null | undefined) {
  return id?.trim() || null;
}

export function themeForMode(
  themes: ThemePreset[],
  selection: ThemeSelection,
  mode: "light" | "dark",
): ThemePreset {
  const chosen = themes.find((theme) => theme.id === selection[mode] && theme.base === mode);
  const fallback =
    themes.find((theme) => theme.id === defaultThemeIds[mode]) ??
    themes.find((theme) => theme.base === mode);

  if (!chosen && !fallback) {
    throw new Error(`No ${mode} theme available`);
  }

  return (chosen ?? fallback) as ThemePreset;
}
