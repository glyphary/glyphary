#!/usr/bin/env node
// Checks a Glyphary plugin folder and runs its WASM outside the app.
//
// Transform plugins (glyphary-wasm-transform@1):
//   node run-plugin.mjs <plugin-dir> [input text]        input may also be piped
//
// Host plugins (glyphary-wasm-host@1):
//   node run-plugin.mjs <plugin-dir> --event panel --id <panel id> \
//     --vault <vault dir> --note <path/in/vault.md> [--selection "text"]
//   node run-plugin.mjs <plugin-dir> --event render --id <language> --source "block text"
//   Add --setting name=value to override a declared setting.
//
// The vault is only read. `writeNote` and editor actions are printed, never
// applied. The manifest rules mirror src-tauri/src/plugins.rs, the WASM call
// mirrors src/pluginWorker.ts, and the host loop mirrors src/lib/plugin-host.ts
// in the Glyphary repository.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";

const TRANSFORM_RUNTIME = "glyphary-wasm-transform@1";
const HOST_RUNTIME = "glyphary-wasm-host@1";
const PERMISSIONS = [
  "document:read",
  "document:write",
  "selection:read",
  "selection:write",
  "styles:load",
  "vault:read",
  "vault:write",
];
const ID = /^[A-Za-z0-9_-]{1,80}$/;
const ICON_PATH_DATA = /^[MmLlHhVvCcSsQqTtAaZzeE0-9 .,+-]{1,2000}$/;
const EDITOR_ACTION_PERMISSION = {
  replaceSelection: "selection:write",
  insertAtCursor: "selection:write",
  replaceDocument: "document:write",
};
const MAX_ROUNDS = 4;
const MAX_ITEMS = 16;

// ---- Manifest rules ----

function checkId(id, errors, label) {
  if (!ID.test(id ?? "")) {
    errors.push(`${label}: id must use 1-80 letters, numbers, dash, or underscore`);
  }
}

function checkTitle(value, errors, label) {
  const title = String(value ?? "").trim();

  if (title.length < 1 || title.length > 96) {
    errors.push(`${label}: must be 1-96 characters`);
  }
}

function checkFile(dir, path, extensions, errors, label) {
  const parts = String(path ?? "").trim().split("/");

  if (!path || path.startsWith("/") || path.includes("\\") || parts.includes("..")) {
    errors.push(`${label}: path must be relative and stay inside the plugin folder: ${path}`);
    return;
  }

  if (!extensions.some((extension) => path.toLowerCase().endsWith(`.${extension}`))) {
    errors.push(`${label}: unsupported extension, expected ${extensions.join(", ")}: ${path}`);
  } else if (!existsSync(join(dir, path))) {
    errors.push(`${label}: file not found: ${path}`);
  }
}

function settingTypeError(setting) {
  const type = setting.type ?? "text";
  const options = setting.options ?? [];
  const fallback = setting.default ?? "";

  if (!["text", "switch", "select"].includes(type)) {
    return "type must be text, switch, or select";
  }

  if (type !== "select") {
    if (options.length > 0) {
      return "only a select has options";
    }

    return type === "switch" && !["", "true", "false"].includes(fallback)
      ? 'a switch default is "true" or "false"'
      : null;
  }

  if (
    options.length < 1 ||
    options.length > 32 ||
    options.some((option) => typeof option !== "string" || !option.trim())
  ) {
    return "a select needs 1-32 non-empty options";
  }

  return fallback && !options.includes(fallback) ? "default is not one of its options" : null;
}

function checkSetting(setting, errors) {
  const label = `setting ${setting.id}`;
  const typeError = settingTypeError(setting);

  checkId(setting.id, errors, label);
  checkTitle(setting.title, errors, `${label} title`);

  if (typeError) {
    errors.push(`${label}: ${typeError}`);
  }
}

function checkPanel(panel, errors) {
  const label = `panel ${panel.id}`;

  checkId(panel.id, errors, label);
  checkTitle(panel.title, errors, `${label} title`);

  if (panel.icon && !ICON_PATH_DATA.test(panel.icon)) {
    errors.push(`${label}: icon must be SVG path data, not SVG markup`);
  }
}

function checkCommand(dir, command, host, errors) {
  const label = `command ${command.id}`;
  const hasAction =
    String(command.insertMarkdown ?? "").trim() || command.template || command.wasm;

  checkId(command.id, errors, label);
  checkTitle(command.title, errors, `${label} title`);

  // A host command without an action of its own is sent to the module.
  if (!host && !hasAction) {
    errors.push(`${label}: needs insertMarkdown, template, or wasm`);
  }

  if (command.template) {
    checkFile(dir, command.template, ["md", "markdown", "txt"], errors, label);
  }

  if (!command.wasm) {
    return;
  }

  checkFile(dir, command.wasm.module, ["wasm"], errors, label);

  if (!["selection", "document"].includes(command.wasm.input)) {
    errors.push(`${label}: wasm.input must be selection or document`);
  }

  if (!["replaceSelection", "insertAtCursor", "replaceDocument"].includes(command.wasm.output)) {
    errors.push(`${label}: wasm.output must be replaceSelection, insertAtCursor, or replaceDocument`);
  }
}

function checkHostFields(dir, manifest, host, errors) {
  const { events = [], panels = [], renderers = [], settings = [] } = manifest;

  if (host) {
    checkFile(dir, manifest.module, ["wasm"], errors, "module");
  } else if (manifest.module || events.length + panels.length + renderers.length + settings.length) {
    errors.push(`module, events, panels, renderers, and settings require runtime "${HOST_RUNTIME}"`);
  }

  if (panels.length > 8 || renderers.length > 8 || settings.length > 16) {
    errors.push("at most 8 panels, 8 renderers, and 16 settings");
  }

  for (const event of events) {
    if (!["save", "open"].includes(event)) {
      errors.push(`events: unsupported "${event}", expected save or open`);
    }
  }

  for (const language of renderers) {
    if (!ID.test(language ?? "") || ["toc", "mermaid"].includes(String(language).toLowerCase())) {
      errors.push(`renderers: "${language}" must be an id and not a built-in language`);
    }
  }

  panels.forEach((panel) => checkPanel(panel, errors));
  settings.forEach((setting) => checkSetting(setting, errors));
}

/** Returns `{ manifest, errors }`. An empty `errors` means Glyphary will load it. */
export function validatePlugin(dir) {
  const errors = [];
  let manifest;

  try {
    manifest = JSON.parse(readFileSync(join(dir, "plugin.json"), "utf8"));
  } catch (error) {
    return { manifest: null, errors: [`plugin.json: ${error.message}`] };
  }

  const host = manifest.runtime === HOST_RUNTIME;
  const folder = basename(resolve(dir));
  const { permissions = [], styles = [], commands = [] } = manifest;

  if (!ID.test(manifest.id ?? "")) {
    errors.push("id: use 1-80 letters, numbers, dash, or underscore");
  } else if (manifest.id !== folder) {
    errors.push(`id: "${manifest.id}" must match the folder name "${folder}"`);
  }

  checkTitle(manifest.name, errors, "name");

  if (!host && manifest.runtime !== TRANSFORM_RUNTIME) {
    errors.push(`runtime: must be "${TRANSFORM_RUNTIME}" or "${HOST_RUNTIME}"`);
  }

  for (const permission of permissions) {
    if (!PERMISSIONS.includes(permission)) {
      errors.push(`permissions: unsupported "${permission}"`);
    }
  }

  if (styles.length > 8) {
    errors.push("styles: at most 8 stylesheets");
  }

  if (commands.length > 32) {
    errors.push("commands: Glyphary reads only the first 32");
  }

  styles.forEach((style) => checkFile(dir, style, ["css"], errors, "styles"));
  checkHostFields(dir, manifest, host, errors);
  commands.forEach((command) => checkCommand(dir, command, host, errors));

  return { manifest, errors };
}

/** The value Glyphary sends when the user has not changed a setting. */
export function settingDefault(setting) {
  return (
    setting.default ||
    (setting.type === "switch" ? "false" : setting.type === "select" ? setting.options[0] : "")
  );
}

// ---- Running a module ----

/** Runs one transform the way Glyphary's worker does: no imports, fresh instance. */
export async function runTransform(bytes, input) {
  const module = await WebAssembly.compile(bytes);
  const imports = WebAssembly.Module.imports(module);

  if (imports.length > 0) {
    const names = imports.map((entry) => `${entry.module}.${entry.name}`).join(", ");

    throw new Error(`module has imports, Glyphary provides none: ${names}`);
  }

  const { memory, alloc, transform } = (await WebAssembly.instantiate(module, {})).exports;

  if (!memory || !alloc || !transform) {
    throw new Error("module must export memory, alloc(length), and transform(pointer, length)");
  }

  const inputBytes = new TextEncoder().encode(input);
  const inputPointer = alloc(inputBytes.length);

  new Uint8Array(memory.buffer, inputPointer, inputBytes.length).set(inputBytes);

  // The result is `[u32 little-endian length][UTF-8 bytes]` at the returned pointer.
  const outputPointer = transform(inputPointer, inputBytes.length);
  const outputLength = new DataView(memory.buffer).getUint32(outputPointer, true);

  return new TextDecoder().decode(
    new Uint8Array(memory.buffer, outputPointer + 4, outputLength).slice(),
  );
}

function isNotePath(path) {
  return (
    typeof path === "string" &&
    /\.(md|markdown)$/i.test(path) &&
    !path.includes("\\") &&
    !path.split("/").some((part) => !part || part.startsWith("."))
  );
}

function vaultNotes(vault, relative = "") {
  return readdirSync(join(vault, relative), { withFileTypes: true }).flatMap((entry) => {
    const path = relative ? `${relative}/${entry.name}` : entry.name;

    // Dot folders such as .glyphary are invisible to plugins.
    if (entry.name.startsWith(".")) {
      return [];
    }

    return entry.isDirectory() ? vaultNotes(vault, path) : isNotePath(path) ? [path] : [];
  });
}

function searchVault(vault, query) {
  const needle = query.trim().toLowerCase();

  // Like the app: a literal, case-insensitive match on file names and lines.
  return vaultNotes(vault).flatMap((path) => [
    ...(basename(path).toLowerCase().includes(needle) ? [{ path, line: null, text: "" }] : []),
    ...readFileSync(join(vault, path), "utf8")
      .split("\n")
      .flatMap((text, index) =>
        text.toLowerCase().includes(needle) ? [{ path, line: index + 1, text }] : [],
      ),
  ]);
}

/** Answers a plugin request from a folder on disk, the way Glyphary answers from the vault. */
export function fulfilFromVault(vault, request) {
  if (!vault) {
    throw new Error("no --vault given");
  }

  if (request.type === "readNote" && isNotePath(request.path)) {
    return { path: request.path, markdown: readFileSync(join(vault, request.path), "utf8") };
  }

  if (request.type === "listNotes") {
    return vaultNotes(vault).map((path) => ({ path, name: basename(path) }));
  }

  if (request.type === "search" && typeof request.query === "string" && request.query.trim()) {
    return searchVault(vault, request.query);
  }

  throw new Error(`Unsupported plugin request: ${JSON.stringify(request)}`);
}

/** Throws the error Glyphary would raise for an action the manifest or the event does not allow. */
function checkAction(action, permissions, event, note) {
  const type = action?.type;
  const editorPermission = EDITOR_ACTION_PERMISSION[type];
  const need = (permission) => {
    if (!permissions.includes(permission)) {
      throw new Error(`action ${type} needs the ${permission} permission`);
    }
  };

  if (type === "status") {
    return;
  }

  if (editorPermission || type === "openNote") {
    if (event !== "command") {
      throw new Error(`action ${type} is only valid in a command`);
    }
  } else if (type !== "writeNote") {
    throw new Error(`unsupported action: ${JSON.stringify(action)}`);
  }

  if (editorPermission) {
    need(editorPermission);
    return;
  }

  if (!isNotePath(action.path)) {
    throw new Error(`action ${type}: not a vault-relative Markdown path: ${action.path}`);
  }

  if (type === "openNote") {
    return;
  }

  // Panels and code blocks are drawn without the user asking, so drawing one
  // must never change the vault.
  if (event === "panel" || event === "render") {
    throw new Error("action writeNote is not valid while drawing");
  }

  need("vault:write");

  if (action.path === note?.path) {
    throw new Error("action writeNote cannot target the open note");
  }
}

/**
 * One host call: feeds the module, answers its requests, and returns
 * `{ actions, panel, rounds }` or throws the error Glyphary would show.
 */
export async function runHostCall({
  bytes,
  permissions = [],
  event,
  id,
  note = null,
  source,
  settings = {},
  fulfil,
}) {
  // The plugin only sees the parts of the note its permissions cover.
  const shown = note && {
    path: note.path,
    ...(permissions.includes("document:read") ? { markdown: note.markdown } : {}),
    ...(permissions.includes("selection:read") ? { selection: note.selection } : {}),
  };
  let responses = [];

  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    const reply = JSON.parse(
      await runTransform(
        bytes,
        JSON.stringify({ event, id, note: shown, source, settings, round, responses }),
      ),
    );
    const requests = Array.isArray(reply?.requests) ? reply.requests : [];

    if (requests.length === 0) {
      const actions = Array.isArray(reply?.actions) ? reply.actions : [];

      if (actions.length > MAX_ITEMS) {
        throw new Error(`more than ${MAX_ITEMS} actions`);
      }

      actions.forEach((action) => checkAction(action, permissions, event, note));

      return {
        actions,
        panel: typeof reply?.panel?.markdown === "string" ? reply.panel.markdown : null,
        rounds: round + 1,
      };
    }

    if (!permissions.includes("vault:read")) {
      throw new Error("requests need the vault:read permission");
    }

    if (requests.length > MAX_ITEMS) {
      throw new Error(`more than ${MAX_ITEMS} requests in one round`);
    }

    // A failed request is handed back to the plugin instead of ending the call.
    responses = requests.map((request) => {
      try {
        return { ok: true, value: fulfil(request) };
      } catch (error) {
        return { ok: false, error: error.message };
      }
    });
  }

  throw new Error(`did not finish within ${MAX_ROUNDS} rounds`);
}

// ---- Command line ----

/** Runs `run`, prints its timing, and returns false when it failed or was too slow. */
async function timed(label, timeoutMs, run) {
  const limit = Math.min(2000, Math.max(50, timeoutMs ?? 750));
  const started = performance.now();

  try {
    const rounds = (await run()) ?? 1;
    const elapsed = Math.round(performance.now() - started);

    console.log(`(${label}: ${elapsed}ms, limit ${limit}ms per round)`);

    if (elapsed > limit * rounds) {
      throw new Error("would time out in Glyphary");
    }

    return true;
  } catch (error) {
    console.error(`failed: ${label}: ${error.message}`);
    return false;
  }
}

function hostSettings(manifest, overrides) {
  return {
    ...Object.fromEntries(
      (manifest.settings ?? []).map((setting) => [setting.id, settingDefault(setting)]),
    ),
    // A value may itself contain "=", so only the first one separates the name.
    ...Object.fromEntries(
      overrides.map((pair) => [pair.split("=")[0], pair.split("=").slice(1).join("=")]),
    ),
  };
}

function runHostMode(dir, manifest, flags) {
  const id = flags.id ?? flags.event;
  const note = flags.note
    ? {
        path: flags.note,
        markdown: readFileSync(join(flags.vault ?? ".", flags.note), "utf8"),
        selection: flags.selection,
      }
    : null;

  return timed(`${flags.event} ${id}`, manifest.timeoutMs, async () => {
    const result = await runHostCall({
      bytes: readFileSync(join(dir, manifest.module)),
      permissions: manifest.permissions,
      event: flags.event,
      id,
      note,
      source: flags.source,
      settings: hostSettings(manifest, flags.setting),
      fulfil: (request) => {
        console.log(`request: ${JSON.stringify(request)}`);
        return fulfilFromVault(flags.vault, request);
      },
    });

    result.actions.forEach((action) => console.log(`action: ${JSON.stringify(action)}`));

    if (result.panel !== null) {
      console.log(`--- panel\n${result.panel}`);
    }

    return result.rounds;
  });
}

async function runTransformMode(dir, manifest, argument) {
  const wasmCommands = manifest.commands?.filter((entry) => entry.wasm) ?? [];
  // Stdin is only read when a transform will use it; reading an empty,
  // non-interactive stdin otherwise fails.
  const input =
    argument ?? (wasmCommands.length === 0 || process.stdin.isTTY ? "" : readFileSync(0, "utf8"));
  let passed = true;

  if (manifest.runtime === HOST_RUNTIME) {
    console.log("pass --event and --id to run the module");
  }

  for (const command of wasmCommands) {
    const ok = await timed(command.id, command.wasm.timeoutMs, async () => {
      console.log(await runTransform(readFileSync(join(dir, command.wasm.module)), input));
    });

    passed &&= ok;
  }

  return passed;
}

async function main() {
  const { values: flags, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      event: { type: "string" },
      id: { type: "string" },
      vault: { type: "string" },
      note: { type: "string" },
      selection: { type: "string", default: "" },
      source: { type: "string" },
      setting: { type: "string", multiple: true, default: [] },
    },
  });
  const [dir, argument] = positionals;

  if (!dir) {
    console.error("usage: node run-plugin.mjs <plugin-dir> [input text | --event ... --id ...]");
    process.exit(2);
  }

  const { manifest, errors } = validatePlugin(dir);

  if (errors.length > 0) {
    console.error(errors.map((error) => `invalid: ${error}`).join("\n"));
    process.exit(1);
  }

  console.log(`manifest ok: ${manifest.id} (${manifest.runtime})`);

  if (flags.event && manifest.runtime !== HOST_RUNTIME) {
    console.error(`failed: --event needs runtime "${HOST_RUNTIME}"`);
    process.exit(1);
  }

  const passed = flags.event
    ? await runHostMode(dir, manifest, flags)
    : await runTransformMode(dir, manifest, argument);

  process.exit(passed ? 0 : 1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
}
