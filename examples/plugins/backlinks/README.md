# Backlinks

A sample plugin for runtime `glyphary-wasm-host@1`. It searches the vault for notes that link to the open note, shows them in a panel in the right drawer, and adds an Insert Backlinks List command. A fenced code block with the language `backlinks` shows the same list inside a note, for the note named in the block or for the open note when the block is empty. Its settings show the three control types: a text field for the heading, a dropdown for the order, and a switch for the insert button.

The source is the host template in `skills/glyphary-plugin/template-host`. Rebuild `plugin.wasm` from the repository root:

```sh
rustup target add wasm32-unknown-unknown
cargo build --manifest-path skills/glyphary-plugin/template-host/Cargo.toml --release \
  --target wasm32-unknown-unknown --target-dir "${TMPDIR:-/tmp}/glyphary-plugin-target"
cp "${TMPDIR:-/tmp}/glyphary-plugin-target/wasm32-unknown-unknown/release/glyphary_plugin.wasm" \
  examples/plugins/backlinks/plugin.wasm
```

Install it into a vault:

```sh
mkdir -p /path/to/vault/.glyphary/plugins
cp -R examples/plugins/backlinks /path/to/vault/.glyphary/plugins/
```

Then enable it under Settings, Plugins. It asks for `vault:read` to search and `selection:write` to insert the list.
