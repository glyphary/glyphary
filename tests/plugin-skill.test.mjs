import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runTransform, validatePlugin } from "../skills/glyphary-plugin/run-plugin.mjs";

test("the plugin skill harness accepts and runs the shipped examples", async () => {
  for (const example of ["uppercase_selection", "uppercase_selection_rust"]) {
    const dir = `examples/plugins/${example}`;

    assert.deepEqual(validatePlugin(dir).errors, []);
    assert.equal(await runTransform(readFileSync(`${dir}/plugin.wasm`), "hello"), "HELLO");
  }
});

test("the plugin skill harness rejects a manifest Glyphary would reject", () => {
  // The template id is a placeholder, so it cannot match its folder name.
  assert.match(validatePlugin("skills/glyphary-plugin/template").errors.join("\n"), /must match/);
});
