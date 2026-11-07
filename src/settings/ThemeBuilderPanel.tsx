import { useState, type Dispatch, type SetStateAction } from "react";
import type {
  ThemeBuilderDraft,
  ThemePreset,
  ThemeTokenControl,
  VaultThemeCalloutSettings,
  VaultThemeOptions,
} from "../lib/app-types";
import { cssColorToHex } from "../lib/settings";
import { defaultThemeIds, isCustomThemeId } from "../lib/theme-library";
import {
  calloutIconOptions,
  calloutKinds,
  calloutStyleOptions,
  defaultThemeCalloutSettings,
  normalizeCalloutIcon,
  normalizeCalloutStyle,
  themeTokenGroups,
} from "./theme-options";

// Everything the panel needs to pick a light/dark theme pair and build new
// custom themes; App owns the state and the cross-window preview.
export type ThemeLibraryControls = {
  allThemes: ThemePreset[];
  lightThemeId: string | null;
  darkThemeId: string | null;
  builderDraft: ThemeBuilderDraft | null;
  applyThemePreset: (preset: ThemePreset) => void;
  startThemeBuilder: (from: ThemePreset) => void;
  cancelThemeBuilder: () => void;
  saveThemeBuilderDraft: () => void;
  deleteCustomTheme: (id: string) => void;
  setThemeBuilderDraft: Dispatch<SetStateAction<ThemeBuilderDraft | null>>;
  updateThemeDraftToken: (token: string, value: string) => void;
};

// One row per VaultThemeOptions flag; adding an option means adding an entry
// here (plus its CSS class) instead of another hand-rolled checkbox block.
const themeOptionToggles: Array<{ key: keyof VaultThemeOptions; label: string }> = [
  { key: "colorfulHeadings", label: "Use colorful heading levels" },
  { key: "headingUnderlines", label: "Add heading underlines" },
  { key: "headingAnchors", label: "Show heading anchor markers" },
  { key: "richCallouts", label: "Use rich callout styling and icons" },
  { key: "plainEditorFrame", label: "Hide the accent border around the active note" },
  { key: "drawerShadow", label: "Cast a shadow from the file drawer" },
];

type ThemeBuilderPanelProps = {
  themeCalloutDraft: VaultThemeCalloutSettings;
  themeLibrary: ThemeLibraryControls;
  themeOptionsDraft: VaultThemeOptions;
  vaultRoot: string;
  onSetThemeCalloutDraft: Dispatch<SetStateAction<VaultThemeCalloutSettings>>;
  onSetThemeOptionsDraft: Dispatch<SetStateAction<VaultThemeOptions>>;
};

export function ThemeBuilderPanel({
  themeCalloutDraft,
  themeLibrary,
  themeOptionsDraft,
  vaultRoot,
  onSetThemeCalloutDraft,
  onSetThemeOptionsDraft,
}: ThemeBuilderPanelProps) {
  const {
    allThemes,
    lightThemeId,
    darkThemeId,
    builderDraft,
    applyThemePreset,
    startThemeBuilder,
    cancelThemeBuilder,
    saveThemeBuilderDraft,
    deleteCustomTheme,
    setThemeBuilderDraft,
    updateThemeDraftToken,
  } = themeLibrary;
  const [builderSourceId, setBuilderSourceId] = useState<string>(defaultThemeIds.light);
  const builderSource =
    allThemes.find((theme) => theme.id === builderSourceId) ?? allThemes[0];
  const draftTokens = builderDraft?.tokens ?? {};

  function themeTokenValue(token: string) {
    return cssColorToHex(
      draftTokens[token] ??
        window.getComputedStyle(document.documentElement).getPropertyValue(token),
    );
  }

  function rawThemeTokenValue(control: ThemeTokenControl) {
    return (
      draftTokens[control.token] ??
      window.getComputedStyle(document.documentElement).getPropertyValue(control.token).trim() ??
      control.placeholder ??
      ""
    );
  }

  function themeGrid(base: "light" | "dark") {
    const selectedId = (base === "dark" ? darkThemeId : lightThemeId) ?? defaultThemeIds[base];

    return (
      <section className="settings-section" aria-label={`${base} theme`}>
        <div className="settings-section-header">
          <div>
            <h3>{base === "dark" ? "Dark Theme" : "Light Theme"}</h3>
            <p>
              {base === "dark"
                ? "Used whenever the app is in dark mode."
                : "Used whenever the app is in light mode."}
            </p>
          </div>
        </div>
        <div className="theme-preset-grid">
          {allThemes
            .filter((theme) => theme.base === base)
            .map((theme) => (
              <button
                className={
                  selectedId === theme.id ? "theme-preset-card active" : "theme-preset-card"
                }
                disabled={!vaultRoot}
                key={theme.id}
                type="button"
                onClick={() => applyThemePreset(theme)}
              >
                <span className="theme-preset-swatches" aria-hidden="true">
                  <i style={{ background: theme.tokens["--glyphary-app-bg"] }} />
                  <i style={{ background: theme.tokens["--glyphary-surface"] }} />
                  <i style={{ background: theme.tokens["--glyphary-accent"] }} />
                  <i style={{ background: theme.tokens["--glyphary-code-bg"] }} />
                </span>
                <strong>{theme.name}</strong>
                <small>{theme.description}</small>
              </button>
            ))}
        </div>
      </section>
    );
  }

  return (
    <>
      {themeGrid("light")}
      {themeGrid("dark")}
      <section className="settings-section" aria-label="Theme options">
        <div className="settings-section-header">
          <div>
            <h3>Theme Options</h3>
            <p>Apply optional editor treatments on top of the selected theme.</p>
          </div>
        </div>
        {themeOptionToggles.map(({ key, label }) => (
          <label className="settings-check-control" key={key}>
            <input
              checked={themeOptionsDraft[key]}
              disabled={!vaultRoot}
              role="switch"
              type="checkbox"
              onChange={(event) => {
                const checked = event.currentTarget.checked;

                onSetThemeOptionsDraft((options) => ({
                  ...options,
                  [key]: checked,
                }));
              }}
            />
            <span>{label}</span>
          </label>
        ))}
      </section>
      <section className="settings-section" aria-label="Callout rendering">
        <div className="settings-section-header">
          <div>
            <h3>Callout Rendering</h3>
            <p>Choose a structured callout layout and icons for this vault theme.</p>
          </div>
        </div>
        <label>
          <span>Callout layout</span>
          <select
            disabled={!vaultRoot}
            value={themeCalloutDraft.style}
            onChange={(event) => {
              const style = normalizeCalloutStyle(event.currentTarget.value);

              onSetThemeCalloutDraft((settings) => ({
                ...settings,
                style,
              }));
            }}
          >
            {calloutStyleOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <div className="callout-icon-grid">
          {calloutKinds.map((kind) => (
            <label key={kind.value}>
              <span>{kind.label} icon</span>
              <select
                disabled={!vaultRoot}
                value={themeCalloutDraft.icons[kind.value]}
                onChange={(event) => {
                  const icon = normalizeCalloutIcon(
                    event.currentTarget.value,
                    defaultThemeCalloutSettings.icons[kind.value],
                  );

                  onSetThemeCalloutDraft((settings) => ({
                    ...settings,
                    icons: {
                      ...settings.icons,
                      [kind.value]: icon,
                    },
                  }));
                }}
              >
                {calloutIconOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      </section>
      <section className="settings-section" aria-label="Theme builder">
        <div className="settings-section-header">
          <div>
            <h3>Theme Builder</h3>
            <p>
              {builderDraft
                ? `Editing a ${builderDraft.base} theme. Changes preview immediately; Save Theme adds it to the list above.`
                : "Start from any theme to create a new one. Custom themes are shared by all vaults."}
            </p>
          </div>
          {builderDraft ? (
            <div className="theme-builder-actions">
              <button className="inline-action" type="button" onClick={cancelThemeBuilder}>
                Cancel
              </button>
              <button
                className="inline-action"
                disabled={!builderDraft.name.trim()}
                type="button"
                onClick={saveThemeBuilderDraft}
              >
                Save Theme
              </button>
            </div>
          ) : null}
        </div>
        {builderDraft ? (
          <label className="settings-field compact-field">
            <span>Theme name</span>
            <input
              type="text"
              value={builderDraft.name}
              onChange={(event) => {
                const name = event.currentTarget.value;

                setThemeBuilderDraft((draft) => (draft ? { ...draft, name } : draft));
              }}
            />
          </label>
        ) : (
          <div className="theme-builder-actions">
            <label className="settings-field compact-field">
              <span>Start from</span>
              <select
                value={builderSource.id}
                onChange={(event) => setBuilderSourceId(event.currentTarget.value)}
              >
                {allThemes.map((theme) => (
                  <option key={theme.id} value={theme.id}>
                    {theme.name} ({theme.base})
                  </option>
                ))}
              </select>
            </label>
            <button
              className="inline-action"
              type="button"
              onClick={() => startThemeBuilder(builderSource)}
            >
              {isCustomThemeId(builderSource.id) ? "Edit Theme" : "New Theme"}
            </button>
            {isCustomThemeId(builderSource.id) ? (
              <button
                className="inline-action"
                type="button"
                onClick={() => {
                  deleteCustomTheme(builderSource.id);
                  setBuilderSourceId(defaultThemeIds.light);
                }}
              >
                Delete Theme
              </button>
            ) : null}
          </div>
        )}
        {builderDraft ? (
          // The grid's own display rule would override the hidden attribute,
          // so the token controls only exist while a theme is being built.
          <div className="theme-builder">
          {themeTokenGroups.map((group) => (
            <fieldset className="theme-token-group" key={group.title}>
              <legend>{group.title}</legend>
              {group.controls.map((control) => (
                <label className="theme-token-control" key={control.token}>
                  <span>{control.label}</span>
                  <div>
                    {control.kind === "value" ? (
                      <input
                        aria-label={control.label}
                        type="text"
                        value={rawThemeTokenValue(control)}
                        placeholder={control.placeholder}
                        onChange={(event) =>
                          updateThemeDraftToken(control.token, event.currentTarget.value)
                        }
                      />
                    ) : (
                      <input
                        aria-label={control.label}
                        type="color"
                        value={themeTokenValue(control.token)}
                        onChange={(event) =>
                          updateThemeDraftToken(control.token, event.currentTarget.value)
                        }
                      />
                    )}
                    <code>{control.token}</code>
                  </div>
                </label>
              ))}
            </fieldset>
          ))}
          </div>
        ) : null}
      </section>
    </>
  );
}
