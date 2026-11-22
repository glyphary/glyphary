import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  cleanPluginNotePath,
  parsePluginPanel,
  pluginHostNote,
  pluginSettingValues,
  runPluginHostCall,
} from "../.test-dist/plugin-host.js";
import { normalizePluginSettings, samePluginSettings } from "../.test-dist/settings.js";
import {
  fulfilFromVault,
  runHostCall,
  runTransform,
  settingDefault,
} from "../skills/glyphary-plugin/run-plugin.mjs";

const vault = "tests/fixtures/plugin-vault";
const backlinks = readFileSync("examples/plugins/backlinks/plugin.wasm");
const note = { path: "Alpha.md", markdown: "# Alpha", selection: "" };
// What Glyphary sends when the user has changed nothing.
const settings = Object.fromEntries(
  JSON.parse(readFileSync("examples/plugins/backlinks/plugin.json", "utf8")).settings.map(
    (setting) => [setting.id, settingDefault(setting)],
  ),
);

// A scripted plugin: replies[n] answers round n, and every input is recorded.
function scripted(...replies) {
  const inputs = [];

  return {
    inputs,
    transform: async (input) => {
      inputs.push(JSON.parse(input));
      return JSON.stringify(replies[inputs.length - 1]);
    },
  };
}

const call = (overrides) =>
  runPluginHostCall({
    permissions: [],
    event: "command",
    id: "run",
    note: null,
    fulfil: async () => "answer",
    ...overrides,
  });

test("the shipped backlinks plugin runs through the app's host loop", async () => {
  const run = (event) =>
    runPluginHostCall({
      permissions: ["vault:read", "selection:write"],
      event,
      id: "linked_from",
      note: pluginHostNote(["vault:read"], note),
      settings,
      transform: (input) => runTransform(backlinks, input),
      fulfil: async (request) => fulfilFromVault(vault, request),
    });

  const panel = await run("panel");

  // The dot folder holds a note that links to Alpha and must stay invisible.
  assert.match(panel.panel, /^## Linked from\n- \[\[Delta\.md\]\]\n- \[\[Projects\/Beta\.md\]\]\n\n\[Insert this list\]/);
  assert.deepEqual(panel.actions, []);
  assert.deepEqual((await run("command")).actions, [
    { type: "insertAtCursor", markdown: "- [[Delta.md]]\n- [[Projects/Beta.md]]" },
  ]);

  // The skill harness must reach the same answer as the app loop.
  const harness = await runHostCall({
    bytes: backlinks,
    permissions: ["vault:read", "selection:write"],
    event: "panel",
    id: "linked_from",
    note,
    settings,
    fulfil: (request) => fulfilFromVault(vault, request),
  });

  assert.equal(harness.panel, panel.panel);
});

test("requests are answered in order and failures are handed back to the plugin", async () => {
  const plugin = scripted(
    { requests: [{ type: "listNotes" }, { type: "readNote", path: "../secret.md" }] },
    { actions: [{ type: "status", message: "done" }] },
  );
  const result = await call({ permissions: ["vault:read"], transform: plugin.transform });

  assert.deepEqual(result.actions, [{ type: "status", message: "done" }]);
  assert.equal(plugin.inputs[1].round, 1);
  assert.deepEqual(plugin.inputs[1].responses[0], { ok: true, value: "answer" });
  assert.equal(plugin.inputs[1].responses[1].ok, false);
});

test("permissions gate what a plugin sees, asks for, and does", async () => {
  assert.deepEqual(pluginHostNote(["selection:read"], note), { path: "Alpha.md", selection: "" });
  assert.equal(pluginHostNote(["document:read"], null), null);

  await assert.rejects(
    call({ transform: scripted({ requests: [{ type: "listNotes" }] }).transform }),
    /vault:read/,
  );
  await assert.rejects(
    call({
      transform: scripted({ actions: [{ type: "writeNote", path: "a.md", markdown: "" }] })
        .transform,
    }),
    /vault:write/,
  );
  await assert.rejects(
    call({
      permissions: ["document:write"],
      event: "save",
      transform: scripted({ actions: [{ type: "replaceDocument", markdown: "x" }] }).transform,
    }),
    /only valid in a command/,
  );
  await assert.rejects(
    call({
      permissions: ["vault:write"],
      note: { path: "Alpha.md" },
      transform: scripted({ actions: [{ type: "writeNote", path: "Alpha.md", markdown: "" }] })
        .transform,
    }),
    /open note/,
  );
  await assert.rejects(
    call({
      permissions: ["vault:read"],
      transform: scripted(...Array(4).fill({ requests: [{ type: "listNotes" }] })).transform,
    }),
    /4 rounds/,
  );
});

test("plugin note paths stay inside the visible vault", () => {
  assert.equal(cleanPluginNotePath(" Projects/Beta.md "), "Projects/Beta.md");

  for (const path of [
    "../Beta.md",
    "/etc/passwd.md",
    ".glyphary/plugins/x/plugin.json",
    ".glyphary/notes.md",
    "Projects/.hidden/a.md",
    "a\\b.md",
    "config.json",
    42,
  ]) {
    assert.throws(() => cleanPluginNotePath(path), /vault-relative Markdown/);
  }
});

test("panel Markdown becomes inert parts", () => {
  assert.deepEqual(
    parsePluginPanel(
      "## Linked from\n- [[Projects/Beta.md|Beta]] and [[Gamma]]\n\n[Run](command:insert_backlinks) ![x](https://example.com/a.png) <b>",
    ),
    [
      { kind: "heading", parts: [{ text: "Linked from" }] },
      {
        kind: "bullet",
        parts: [
          { text: "Beta", note: "Projects/Beta.md" },
          { text: " and " },
          { text: "Gamma", note: "Gamma" },
        ],
      },
      {
        kind: "paragraph",
        parts: [
          { text: "Run", command: "insert_backlinks" },
          { text: " ![x](https://example.com/a.png) <b>" },
        ],
      },
    ],
  );
});

test("a code block render carries its source and the plugin's settings", async () => {
  const settings = pluginSettingValues(
    [{ id: "heading", default: "Linked from" }, { id: "limit" }],
    { heading: "Mentions", stale: "x" },
  );

  assert.deepEqual(settings, { heading: "Mentions", limit: "" });

  const result = await runPluginHostCall({
    permissions: ["vault:read"],
    event: "render",
    id: "backlinks",
    note: null,
    source: "Alpha",
    settings,
    transform: (input) => runTransform(backlinks, input),
    fulfil: async (request) => fulfilFromVault(vault, request),
  });

  assert.equal(result.panel, "## Mentions\n- [[Delta.md]]\n- [[Projects/Beta.md]]");

  // Drawing happens without the user asking, so it must not write.
  for (const event of ["panel", "render"]) {
    await assert.rejects(
      call({
        permissions: ["vault:write"],
        event,
        transform: scripted({ actions: [{ type: "writeNote", path: "a.md", markdown: "" }] })
          .transform,
      }),
      /while drawing/,
    );
  }
});

test("plugin setting values survive normalization and count as a change", () => {
  const saved = normalizePluginSettings({
    enabled: ["b", "a", "a"],
    values: { backlinks: { heading: "Mentions" }, empty: {}, "bad id": { a: "b" } },
  });

  assert.deepEqual(saved, { enabled: ["a", "b"], values: { backlinks: { heading: "Mentions" } } });
  assert.deepEqual(normalizePluginSettings({ enabled: [] }), { enabled: [] });
  assert.equal(samePluginSettings(saved, { ...saved, values: {} }), false);
});
