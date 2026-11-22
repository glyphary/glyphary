/**
 * Host-runtime plugin calls.
 *
 * Responsibilities:
 * - Drive one call into a `glyphary-wasm-host@1` plugin module and police
 *   everything it asks for against the permissions its manifest declares.
 * - Parse panel Markdown into inert parts so plugin output never becomes HTML.
 *
 * Contracts:
 * - The module stays a pure function with no imports. It asks for vault data by
 *   returning `requests`; the host answers and calls it again with `responses`.
 * - Pure and UI-free: App supplies `transform` (the worker) and `fulfil` (Tauri).
 */

export const pluginHostRuntime = "glyphary-wasm-host@1";

export type PluginHostEvent = "command" | "panel" | "render" | "save" | "open";

export type PluginHostNote = { path: string; markdown?: string; selection?: string };

export type PluginHostRequest =
  | { type: "readNote"; path: string }
  | { type: "listNotes" }
  | { type: "search"; query: string };

export type PluginHostAction =
  | { type: "replaceSelection" | "insertAtCursor" | "replaceDocument"; markdown: string }
  | { type: "writeNote"; path: string; markdown: string }
  | { type: "openNote"; path: string }
  | { type: "status"; message: string };

export type PluginHostResult = { actions: PluginHostAction[]; panel: string | null };

const maxRounds = 4;
const maxItems = 16;

/** Vault-relative Markdown path, kept out of dot folders such as `.glyphary`. */
export function isPluginNotePath(path: string) {
  return (
    /\.(md|markdown)$/i.test(path) &&
    !path.includes("\\") &&
    !path.split("/").some((part) => !part || part.startsWith("."))
  );
}

export function cleanPluginNotePath(path: unknown) {
  const clean = typeof path === "string" ? path.trim() : "";

  if (!isPluginNotePath(clean)) {
    throw new Error(`Plugin note path must be a vault-relative Markdown file: ${String(path)}`);
  }

  return clean;
}

/** The note a plugin is shown, trimmed to what its permissions allow it to read. */
export function pluginHostNote(
  permissions: string[],
  note: { path: string; markdown: string; selection: string } | null,
): PluginHostNote | null {
  return note
    ? {
        path: note.path,
        ...(permissions.includes("document:read") ? { markdown: note.markdown } : {}),
        ...(permissions.includes("selection:read") ? { selection: note.selection } : {}),
      }
    : null;
}

function cleanRequest(request: PluginHostRequest): PluginHostRequest {
  if (request?.type === "readNote") {
    return { type: "readNote", path: cleanPluginNotePath(request.path) };
  }

  if (request?.type === "listNotes") {
    return { type: "listNotes" };
  }

  if (request?.type === "search" && typeof request.query === "string" && request.query.trim()) {
    return { type: "search", query: request.query.trim().slice(0, 200) };
  }

  throw new Error(`Unsupported plugin request: ${JSON.stringify(request)}`);
}

function cleanAction(
  action: PluginHostAction,
  permissions: string[],
  event: PluginHostEvent,
  note: PluginHostNote | null,
): PluginHostAction {
  const need = (permission: string) => {
    if (!permissions.includes(permission)) {
      throw new Error(`Plugin action ${action.type} needs the ${permission} permission`);
    }
  };
  const markdown = (action as { markdown?: unknown })?.markdown;

  switch (action?.type) {
    case "replaceSelection":
    case "insertAtCursor":
    case "replaceDocument":
      // Editing the open note from a save or open hook would dirty it again and
      // loop, so only a command the user ran may touch the editor.
      if (event !== "command" || typeof markdown !== "string") {
        throw new Error(`Plugin action ${action.type} is only valid in a command`);
      }

      need(action.type === "replaceDocument" ? "document:write" : "selection:write");
      return { type: action.type, markdown };
    case "writeNote": {
      // Panels and code blocks are drawn often and without the user asking, so
      // drawing one must never change the vault.
      if (event === "panel" || event === "render") {
        throw new Error("Plugin action writeNote is not valid while drawing");
      }

      need("vault:write");
      const path = cleanPluginNotePath(action.path);

      if (path === note?.path || typeof markdown !== "string") {
        throw new Error("Plugin action writeNote cannot target the open note");
      }

      return { type: "writeNote", path, markdown };
    }
    case "openNote":
      if (event !== "command") {
        throw new Error("Plugin action openNote is only valid in a command");
      }

      return { type: "openNote", path: cleanPluginNotePath(action.path) };
    case "status":
      return { type: "status", message: String(action.message ?? "").slice(0, 200) };
    default:
      throw new Error(`Unsupported plugin action: ${JSON.stringify(action)}`);
  }
}

export async function runPluginHostCall(options: {
  permissions: string[];
  event: PluginHostEvent;
  id: string;
  note: PluginHostNote | null;
  /** The code block text, for a `render` call. */
  source?: string;
  settings?: Record<string, string>;
  transform: (input: string) => Promise<string>;
  fulfil: (request: PluginHostRequest) => Promise<unknown>;
}): Promise<PluginHostResult> {
  const { permissions, event, id, note, source, settings = {}, transform, fulfil } = options;
  let responses: unknown[] = [];

  for (let round = 0; round < maxRounds; round += 1) {
    const reply = JSON.parse(
      await transform(JSON.stringify({ event, id, note, source, settings, round, responses })),
    );
    const requests: PluginHostRequest[] = Array.isArray(reply?.requests) ? reply.requests : [];

    if (requests.length === 0) {
      const actions: PluginHostAction[] = Array.isArray(reply?.actions) ? reply.actions : [];

      if (actions.length > maxItems) {
        throw new Error(`Plugin returned more than ${maxItems} actions`);
      }

      return {
        actions: actions.map((action) => cleanAction(action, permissions, event, note)),
        panel: typeof reply?.panel?.markdown === "string" ? reply.panel.markdown : null,
      };
    }

    if (!permissions.includes("vault:read")) {
      throw new Error("Plugin requests need the vault:read permission");
    }

    if (requests.length > maxItems) {
      throw new Error(`Plugin made more than ${maxItems} requests in one round`);
    }

    // A failed request is reported to the plugin instead of ending the call, so
    // it can treat a missing note as an ordinary answer.
    responses = await Promise.all(
      requests.map(async (request) => {
        try {
          return { ok: true, value: await fulfil(cleanRequest(request)) };
        } catch (error) {
          return { ok: false, error: error instanceof Error ? error.message : String(error) };
        }
      }),
    );
  }

  throw new Error(`Plugin did not finish within ${maxRounds} rounds`);
}

/** Declared defaults overlaid with the values saved for this vault. */
export function pluginSettingValues(
  declared: { id: string; default?: string }[] | undefined,
  saved: Record<string, string> | undefined,
) {
  return Object.fromEntries(
    (declared ?? []).map((setting) => [setting.id, saved?.[setting.id] ?? setting.default ?? ""]),
  );
}

export type PluginPanelPart =
  | { text: string }
  | { text: string; note: string }
  | { text: string; command: string };

export type PluginPanelBlock = {
  kind: "heading" | "bullet" | "paragraph";
  parts: PluginPanelPart[];
};

const panelLink = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]|\[([^\]]+)\]\(command:([A-Za-z0-9_-]+)\)/g;

/**
 * Panels understand headings, bullets, paragraphs, `[[note|label]]` links, and
 * `[label](command:id)` buttons. Everything else stays literal text, which is
 * what keeps remote images and markup out of the app window.
 */
export function parsePluginPanel(markdown: string): PluginPanelBlock[] {
  return markdown
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 400)
    .map((line) => {
      const heading = line.match(/^#{1,6}\s+(.+)$/);
      const bullet = line.match(/^[-*]\s+(.+)$/);
      const text = heading?.[1] ?? bullet?.[1] ?? line;
      const parts: PluginPanelPart[] = [];
      let last = 0;

      for (const match of text.matchAll(panelLink)) {
        if (match.index > last) {
          parts.push({ text: text.slice(last, match.index) });
        }

        parts.push(
          match[1]
            ? { text: (match[2] ?? match[1]).trim(), note: match[1].trim() }
            : { text: match[3], command: match[4] },
        );
        last = match.index + match[0].length;
      }

      if (last < text.length) {
        parts.push({ text: text.slice(last) });
      }

      return { kind: heading ? "heading" : bullet ? "bullet" : "paragraph", parts };
    });
}
