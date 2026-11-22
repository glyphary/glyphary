//! Glyphary plugin template for runtime `glyphary-wasm-transform@1`.
//!
//! Edit `transform_text` and leave the rest alone. The three exports below it
//! are the whole contract between Glyphary and the module.

/// Receives the selection (plain text) or the document (Markdown), depending on
/// the command's `input` mode. The returned string is inserted as Markdown.
fn transform_text(input: &str) -> String {
    input.to_uppercase()
}

// ---- Fixed ABI: do not edit below this line ----

#[no_mangle]
pub extern "C" fn alloc(length: usize) -> *mut u8 {
    let mut buffer = Vec::<u8>::with_capacity(length.max(1));
    let pointer = buffer.as_mut_ptr();
    std::mem::forget(buffer);
    pointer
}

/// Returns a pointer to `[u32 little-endian length][UTF-8 bytes]`.
#[no_mangle]
pub unsafe extern "C" fn transform(pointer: *const u8, length: usize) -> *mut u8 {
    let input = std::slice::from_raw_parts(pointer, length);
    let output = transform_text(&String::from_utf8_lossy(input));
    let mut buffer = Vec::with_capacity(output.len() + 4);
    buffer.extend_from_slice(&(output.len() as u32).to_le_bytes());
    buffer.extend_from_slice(output.as_bytes());
    let output_pointer = buffer.as_mut_ptr();
    std::mem::forget(buffer);
    output_pointer
}

// Glyphary starts a fresh instance for every command run, so memory is
// reclaimed when the instance is dropped.
#[no_mangle]
pub extern "C" fn dealloc(_pointer: *mut u8, _length: usize) {}
