# Uppercase Selection Rust Plugin

This is the same Glyphary transform as `examples/plugins/uppercase_selection`, but written in Rust and compiled to a plain WASM module.

The module intentionally does not use `wasm-bindgen` or JavaScript glue. Glyphary loads `plugin.wasm` directly and calls the exported ABI:

```text
memory
alloc(length)
transform(pointer, length)
dealloc(pointer, length)
```

## Try It

Build the WASM:

```sh
rustup target add wasm32-unknown-unknown
cargo build --manifest-path examples/plugins/uppercase_selection_rust/Cargo.toml \
  --release \
  --target wasm32-unknown-unknown
cp examples/plugins/uppercase_selection_rust/target/wasm32-unknown-unknown/release/glyphary_uppercase_selection_plugin.wasm \
  examples/plugins/uppercase_selection_rust/plugin.wasm
```

Copy this plugin into a vault:

```sh
mkdir -p /path/to/vault/.glyphary/plugins
cp -R examples/plugins/uppercase_selection_rust /path/to/vault/.glyphary/plugins/
```

Then in Glyphary:

1. Open that vault.
2. Open `Settings -> Plugins`.
3. Click `Refresh`.
4. Enable `Uppercase Selection (Rust)`.
5. Save settings.
6. Select text in the editor.
7. Run `Uppercase Selection (Rust)` from the command palette.

## Notes

The Rust source uses a small bump allocator because Glyphary's current WASM ABI exchanges raw UTF-8 bytes through linear memory. `dealloc` is a no-op for this sample, which is acceptable because Glyphary creates a fresh worker and module instance for each command run.
