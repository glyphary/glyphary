fn main() {
    const COMMANDS: &[&str] = &[];

    tauri_plugin::Builder::new(COMMANDS)
        .ios_path("ios")
        .build();
}
