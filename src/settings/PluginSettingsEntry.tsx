import type { PluginManifest } from "../lib/app-types";

// Responsibilities:
// - Show one plugin in Settings: its switch, what it is allowed to do, and the
//   settings it declares.
// Contracts:
// - Capabilities are listed whether or not the plugin is enabled, so the user
//   can judge it before switching it on.
// - Setting values are always text: a switch holds "true" or "false".

type PluginSettingsEntryProps = {
  plugin: PluginManifest;
  enabled: boolean;
  disabled: boolean;
  /** Saved values by setting id; a missing one falls back to the default. */
  values: Record<string, string> | undefined;
  onToggle: (enabled: boolean) => void;
  onValue: (settingId: string, value: string) => void;
};

type PluginSetting = NonNullable<PluginManifest["settings"]>[number];

function plural(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function SettingControl(props: {
  setting: PluginSetting;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const { setting, value, disabled, onChange } = props;

  if (setting.type === "switch") {
    return (
      <input
        checked={value === "true"}
        disabled={disabled}
        role="switch"
        type="checkbox"
        onChange={(event) => onChange(String(event.currentTarget.checked))}
      />
    );
  }

  if (setting.type === "select") {
    return (
      <select
        disabled={disabled}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
      >
        {(setting.options ?? []).map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  }

  return (
    <input
      disabled={disabled}
      type="text"
      value={value}
      onChange={(event) => onChange(event.currentTarget.value)}
    />
  );
}

export function PluginSettingsEntry(props: PluginSettingsEntryProps) {
  const { plugin, enabled, disabled, values, onToggle, onValue } = props;
  const capabilities = [
    ["Permissions", plugin.permissions],
    ["Panels", (plugin.panels ?? []).map((panel) => panel.title)],
    ["Runs on", plugin.events ?? []],
    ["Renders code blocks", plugin.renderers ?? []],
  ] as const;
  const summary = [
    plural(plugin.commands.length, "command"),
    ...(plugin.styles.length > 0 ? [plural(plugin.styles.length, "stylesheet")] : []),
  ].join(" / ");

  return (
    <div>
      <label className="settings-check-control plugin-control">
        <input
          checked={enabled}
          disabled={disabled}
          role="switch"
          type="checkbox"
          onChange={(event) => onToggle(event.currentTarget.checked)}
        />
        <span>
          <strong>{plugin.name}</strong>
          <small>{summary}</small>
        </span>
      </label>
      <div className="plugin-details">
        {plugin.description ? <p>{plugin.description}</p> : null}
        {capabilities.map(([label, entries]) => (
          <p key={label}>
            {label}: {entries.length > 0 ? entries.join(", ") : "none"}
          </p>
        ))}
      </div>
      {(plugin.settings ?? []).map((setting) => (
        <label className="plugin-setting" key={setting.id}>
          <span>{setting.title}</span>
          <SettingControl
            disabled={disabled}
            setting={setting}
            value={values?.[setting.id] ?? setting.default ?? ""}
            onChange={(value) => onValue(setting.id, value)}
          />
        </label>
      ))}
    </div>
  );
}
