import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultThemeIds,
  isCustomThemeId,
  normalizeThemeId,
  readCustomThemes,
  themeForMode,
  writeCustomThemes,
} from "../.test-dist/theme-library.js";

const theme = (id, base, tokens = { "--glyphary-accent": id }) => ({ id, name: id, description: "", base, tokens });
const themes = [theme("cupertino", "light"), theme("cupertino-dark", "dark"), theme("harbor", "light"), theme("custom-1", "dark")];

test("the mode picks its slot and falls back to Cupertino", () => {
  assert.equal(themeForMode(themes, { light: "harbor", dark: "custom-1" }, "light").id, "harbor");
  assert.equal(themeForMode(themes, { light: "harbor", dark: "custom-1" }, "dark").id, "custom-1");
  assert.equal(themeForMode(themes, {}, "light").id, defaultThemeIds.light);
  assert.equal(themeForMode(themes, { dark: "deleted" }, "dark").id, defaultThemeIds.dark);
  // A light theme never fills the dark slot, whatever the saved id says.
  assert.equal(themeForMode(themes, { dark: "harbor" }, "dark").id, "cupertino-dark");
  assert.equal(normalizeThemeId(" harbor "), "harbor");
  // Kept: the custom theme may live on another machine that shares the vault.
  assert.equal(normalizeThemeId("gone"), "gone");
  assert.equal(normalizeThemeId("  "), null);
  assert.equal(isCustomThemeId("custom-1"), true);
  assert.equal(isCustomThemeId("harbor"), false);
});

test("custom themes round-trip through localStorage and skip malformed entries", () => {
  const store = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (key) => store.get(key) ?? null,
      setItem: (key, value) => store.set(key, value),
    },
  };

  assert.deepEqual(readCustomThemes(), []);
  writeCustomThemes([theme("custom-1", "dark")]);
  assert.deepEqual(readCustomThemes(), [theme("custom-1", "dark")]);
  store.set("glyphary.customThemes", JSON.stringify([theme("harbor", "light"), { id: "custom-2" }, theme("custom-3", "light")]));
  assert.deepEqual(readCustomThemes().map((entry) => entry.id), ["custom-3"]);
  store.set("glyphary.customThemes", "{not json");
  assert.deepEqual(readCustomThemes(), []);
  delete globalThis.window;
});
