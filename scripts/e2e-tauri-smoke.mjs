#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import process from "node:process";

const port = Number(process.env.GLYPHARY_E2E_DRIVER_PORT || 4444);
const scratchDir = "_glyphary_e2e";
const scratchName = "Glyphary E2E Scratch.md";
const scratchRelativePath = `${scratchDir}/${scratchName}`;
const scratchContent = "glyphary e2e selection target\n";
const dragTargetName = "Glyphary E2E Drag Target.md";
const splitTabName = "Glyphary E2E Split Tab.md";
const betaUnsupported = process.platform === "darwin" && !process.env.GLYPHARY_E2E_FORCE;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function defaultApplicationPath() {
  if (process.platform === "win32") {
    return resolve("src-tauri/target/debug/tauri-app.exe");
  }

  return resolve("src-tauri/target/debug/tauri-app");
}

function driverAvailable() {
  const result = spawnSync("tauri-driver", ["--version"], { encoding: "utf8" });
  return result.status === 0;
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed`);
  }
}

function platformSkip(message) {
  if (process.env.GLYPHARY_E2E_STRICT) {
    throw new Error(message);
  }

  console.log(`skipped: ${message}`);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    application: process.env.GLYPHARY_E2E_APP || defaultApplicationPath(),
    selfTest: false,
    vault: process.env.GLYPHARY_E2E_VAULT || "",
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--self-test") {
      options.selfTest = true;
    } else if (arg === "--app") {
      options.application = resolve(args[++index] || "");
    } else if (arg === "--vault") {
      options.vault = resolve(args[++index] || "");
    } else if (arg === "--help" || arg === "-h") {
      console.log(
        [
          "Usage: npm run e2e:tauri -- [--vault /path/to/vault] [--app /path/to/app]",
          "",
          "Uses tauri-driver to run the real desktop app against an owned scratch note.",
          "Set GLYPHARY_E2E_VAULT to avoid relying on the app's persisted vault.",
        ].join("\n"),
      );
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

async function request(method, path, body) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new Error(`${method} ${path} failed: ${text}`);
  }

  return payload.value ?? payload;
}

async function waitFor(fn, label, timeoutMs = 20000) {
  const started = Date.now();
  let lastError = null;

  while (Date.now() - started < timeoutMs) {
    try {
      const value = await fn();
      if (value) {
        return value;
      }
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolveWait) => setTimeout(resolveWait, 200));
  }

  throw new Error(`Timed out waiting for ${label}${lastError ? `: ${lastError.message}` : ""}`);
}

function elementId(element) {
  return element["element-6066-11e4-a52e-4f735466cecf"] || element.ELEMENT;
}

class WebDriverSession {
  constructor(id) {
    this.id = id;
  }

  endpoint(path) {
    return `/session/${this.id}${path}`;
  }

  async close() {
    await request("DELETE", `/session/${this.id}`);
  }

  async execute(script, args = []) {
    return request("POST", this.endpoint("/execute/sync"), { script, args });
  }

  async find(using, value) {
    return request("POST", this.endpoint("/element"), { using, value });
  }

  async waitForSelector(selector, timeoutMs) {
    return waitFor(() => this.find("css selector", selector), selector, timeoutMs);
  }

  async click(selector) {
    const element = await this.waitForSelector(selector);
    await request("POST", this.endpoint(`/element/${elementId(element)}/click`), {});
  }

  async value(selector, text) {
    const element = await this.waitForSelector(selector);
    await request("POST", this.endpoint(`/element/${elementId(element)}/value`), {
      text,
      value: [...text],
    });
  }

  async pointerAction(actions) {
    await request("POST", this.endpoint("/actions"), {
      actions: [
        {
          id: "mouse",
          type: "pointer",
          parameters: { pointerType: "mouse" },
          actions,
        },
      ],
    });
  }

  async pointerPosition(selector, xRatio, yRatio) {
    await this.waitForSelector(selector);
    const rect = await this.execute(
      `
        const element = document.querySelector(arguments[0]);
        if (!element) throw new Error("Pointer target is not visible");
        const rect = element.getBoundingClientRect();
        return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
      `,
      [selector],
    );

    return {
      x: Math.round(rect.left + rect.width * xRatio),
      y: Math.round(rect.top + rect.height * yRatio),
    };
  }

  async pointerDown(selector) {
    const position = await this.pointerPosition(selector, 0.5, 0.5);
    await this.pointerAction([
      { type: "pointerMove", origin: "viewport", ...position },
      { type: "pointerDown", button: 0 },
    ]);
  }

  async pointerMove(selector, xRatio = 0.75, yRatio = 0.5) {
    const position = await this.pointerPosition(selector, xRatio, yRatio);
    await this.pointerAction([{ type: "pointerMove", origin: "viewport", ...position }]);
  }

  async pointerUp() {
    await this.pointerAction([{ type: "pointerUp", button: 0 }]);
  }

  async shortcut(key) {
    await request("POST", this.endpoint("/actions"), {
      actions: [
        {
          id: "keyboard",
          type: "key",
          actions: [
            { type: "keyDown", value: "\uE009" },
            { type: "keyDown", value: key },
            { type: "keyUp", value: key },
            { type: "keyUp", value: "\uE009" },
          ],
        },
      ],
    });
  }

  async reload() {
    await request("POST", this.endpoint("/refresh"), {});
  }
}

async function createSession(application) {
  const session = await request("POST", "/session", {
    capabilities: {
      alwaysMatch: {
        browserName: "wry",
        "tauri:options": { application },
      },
    },
  });

  return new WebDriverSession(session.sessionId);
}

async function startDriver() {
  const child = spawn("tauri-driver", ["--port", String(port)], {
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout.on("data", (chunk) => process.stdout.write(chunk));
  child.stderr.on("data", (chunk) => process.stderr.write(chunk));

  await waitFor(async () => {
    try {
      await request("GET", "/status");
      return true;
    } catch {
      return false;
    }
  }, "tauri-driver");

  return child;
}

async function openScratchWorkspace(session, vaultFromCli) {
  const persisted = await session.execute(
    'return window.localStorage.getItem("glyphary.workspace");',
  );
  const persistedVault = (() => {
    try {
      const parsed = persisted ? JSON.parse(persisted) : null;
      return typeof parsed?.vaultRoot === "string" ? parsed.vaultRoot : "";
    } catch {
      return "";
    }
  })();
  const vault = resolve(vaultFromCli || persistedVault);

  assert(vaultFromCli || persistedVault, "Set GLYPHARY_E2E_VAULT or open a vault once first.");
  assert(existsSync(vault), `Vault does not exist: ${vault}`);

  const scratchPath = join(vault, scratchRelativePath);
  mkdirSync(dirname(scratchPath), { recursive: true });
  writeFileSync(scratchPath, scratchContent);
  writeFileSync(join(vault, scratchDir, dragTargetName), "glyphary e2e drag target\n");
  writeFileSync(join(vault, scratchDir, splitTabName), "glyphary e2e split tab target\n");

  await session.execute(
    `
      window.localStorage.setItem("glyphary.workspace", JSON.stringify({
        vaultRoot: arguments[0],
        currentDir: arguments[1],
        activeFile: { name: arguments[2], relativePath: arguments[3] },
        recentFiles: []
      }));
    `,
    [vault, scratchDir, scratchName, scratchRelativePath],
  );
  await session.reload();
  await session.waitForSelector(".app-shell", 30000);
  await dismissReleaseDialog(session);

  return { dragTargetName, scratchPath, splitTabName, vault };
}

async function dismissReleaseDialog(session) {
  await session.execute(`
    const dialog = document.querySelector(".release-update-screen");
    if (dialog) {
      dialog.querySelector("button")?.click();
    }
  `);
}

async function runSettingsSmoke(session) {
  await session.execute(`
    [...document.querySelectorAll(".file-menu-popover button")]
      .find((button) => button.textContent.trim() === "Settings...")
      ?.click();
  `);
  await session.waitForSelector('[role="dialog"][aria-label="Settings"]', 5000);
  await session.click('button[aria-label="Close settings"]');
}

async function runVaultReopenSmoke(session) {
  await session.click('button[aria-label="Close Glyphary E2E Scratch"]');
  await session.waitForSelector(".editor-pane.no-document-pane", 5000);
  await session.execute(
    `
      const entry = [...document.querySelectorAll(".vault-entry")]
        .find((button) => button.textContent.includes(arguments[0]));
      if (!entry) throw new Error("Scratch note is not visible in the vault tree");
      entry.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, button: 0 }));
    `,
    [scratchName],
  );
  await session.waitForSelector(".editor-surface .ProseMirror", 10000);
  await waitFor(
    () =>
      session.execute(
        `return document.querySelector(".editor-surface .ProseMirror")?.textContent.includes(arguments[0]);`,
        ["glyphary e2e selection target"],
      ),
    "scratch note content",
  );
}

async function runCommandPaletteSmoke(session, scratchPath) {
  await session.click(".editor-surface .ProseMirror");
  await session.shortcut("a");
  await session.shortcut("p");
  await session.waitForSelector('[role="dialog"][aria-label="Quick command"]', 5000);
  await session.value('input[aria-label="Quick command"]', "Format");
  await session.click("#command-palette-format-menu");
  await session.value('input[aria-label="Quick command"]', "Highlight");
  await session.click("#command-palette-format-highlight");
  await session.shortcut("s");

  await waitFor(() => readFileSync(scratchPath, "utf8").includes("=="), "highlighted file");
}

async function markE2EDragSource(session, fileName, attribute) {
  await session.execute(
    `
      const entry = [...document.querySelectorAll(".vault-entry")]
        .find((button) => button.textContent.includes(arguments[0]));
      if (!entry) throw new Error("Drag source is not visible in the vault tree");
      entry.setAttribute(arguments[1], "true");
    `,
    [fileName, attribute],
  );
  await session.waitForSelector(`[${attribute}="true"]`, 5000);
}

async function runVaultFileDragDropSmoke(session, dragTarget, splitTabTarget) {
  await markE2EDragSource(session, dragTarget, "data-e2e-drag-source");
  await markE2EDragSource(session, splitTabTarget, "data-e2e-split-tab-source");

  await session.pointerDown('[data-e2e-drag-source="true"]');
  await session.pointerMove(".editor-groups", 0.75, 0.5);
  await session.waitForSelector(
    '.editor-groups.split-drop-preview .editor-split-drop-preview[aria-label*="on the right"]',
    5000,
  );
  await session.pointerUp();

  await session.waitForSelector(".editor-groups.split", 10000);
  await waitFor(
    () =>
      session.execute(
        `return document.querySelectorAll(".editor-pane-shell").length === 2 &&
          document.querySelector('[aria-label="secondary open documents"]')?.textContent.includes(arguments[0]);`,
        [dragTarget],
      ),
    "dragged file in right split",
  );

  await session.pointerDown('[data-e2e-split-tab-source="true"]');
  await session.pointerMove(".editor-groups", 0.75, 0.5);
  await session.pointerUp();

  await waitFor(
    () =>
      session.execute(
        `return document.querySelector('[aria-label="secondary open documents"]')?.textContent.includes(arguments[0]);`,
        [splitTabTarget],
      ),
    "dragged file as right split tab",
  );
}

async function main() {
  const options = parseArgs();

  if (options.selfTest) {
    assert(defaultApplicationPath().includes("target"), "default app path should use target");
    assert(scratchRelativePath === "_glyphary_e2e/Glyphary E2E Scratch.md", "scratch path drifted");
    console.log("self-test ok");
    return;
  }

  if (betaUnsupported) {
    platformSkip("Tauri WebDriver does not support macOS webviews; run on Windows/Linux.");
    return;
  }

  if (!driverAvailable()) {
    throw new Error("tauri-driver is required. Install it with: cargo install tauri-driver");
  }

  if (!process.env.GLYPHARY_E2E_SKIP_BUILD) {
    run("npm", ["run", "tauri", "--", "build", "--debug", "--no-bundle"]);
  }

  assert(existsSync(options.application), `Application not found: ${options.application}`);

  const driver = await startDriver();
  let session = null;
  let scratchPath = "";

  try {
    session = await createSession(options.application);
    const workspace = await openScratchWorkspace(session, options.vault);
    scratchPath = workspace.scratchPath;
    console.log(`using vault: ${workspace.vault}`);

    await runSettingsSmoke(session);
    await runVaultReopenSmoke(session);
    await runCommandPaletteSmoke(session, scratchPath);
    await runVaultFileDragDropSmoke(session, workspace.dragTargetName, workspace.splitTabName);

    console.log("tauri e2e smoke ok");
  } finally {
    if (session) {
      await session.close().catch(() => {});
    }
    driver.kill();
    if (scratchPath && !process.env.GLYPHARY_E2E_KEEP) {
      rmSync(dirname(scratchPath), { force: true, recursive: true });
    }
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
