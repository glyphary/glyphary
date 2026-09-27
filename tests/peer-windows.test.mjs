import assert from "node:assert/strict";
import test from "node:test";
import {
  dirtyFilePaths,
  parsePeerNotice,
  peerStorageKeys,
  readDirtyFilesMirror,
  writeDirtyFilesMirror,
  writePeerNotice,
} from "../.test-dist/peer-windows.js";

function fakeStorage() {
  const map = new Map();

  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => map.set(key, String(value)),
  };
}

test("the dirty mirror lists unsaved tabs and survives a corrupt value", () => {
  const storage = fakeStorage();
  const groups = {
    primary: {
      tabs: [
        { dirty: true, activeFile: { relativePath: "a.md" } },
        { dirty: false, activeFile: { relativePath: "b.md" } },
        { dirty: true, activeFile: null },
      ],
    },
    secondary: { tabs: [{ dirty: true, activeFile: { relativePath: "c.md" } }] },
  };

  writeDirtyFilesMirror(dirtyFilePaths(groups), storage);
  assert.deepEqual(readDirtyFilesMirror(storage), ["a.md", "c.md"]);

  storage.setItem(peerStorageKeys.dirtyFiles, "{not json");
  assert.deepEqual(readDirtyFilesMirror(storage), []);
  storage.setItem(peerStorageKeys.dirtyFiles, JSON.stringify(["x.md", 5, null]));
  assert.deepEqual(readDirtyFilesMirror(storage), ["x.md"]);
});

test("peer notices carry a root, an optional path, and a timestamp so repeats still fire", () => {
  const storage = fakeStorage();

  writePeerNotice(peerStorageKeys.openRequest, { root: "/v", relativePath: "n.md" }, storage);
  const stored = JSON.parse(storage.getItem(peerStorageKeys.openRequest));
  assert.equal(stored.root, "/v");
  assert.equal(stored.relativePath, "n.md");
  assert.equal(typeof stored.updatedAt, "number");

  assert.deepEqual(parsePeerNotice(storage.getItem(peerStorageKeys.openRequest)), { root: "/v", relativePath: "n.md" });
  assert.deepEqual(parsePeerNotice(JSON.stringify({ root: "/v" })), { root: "/v", relativePath: null });
  assert.equal(parsePeerNotice(JSON.stringify({ relativePath: "n.md" })), null);
  assert.equal(parsePeerNotice("nope"), null);
  assert.equal(parsePeerNotice(null), null);
});
