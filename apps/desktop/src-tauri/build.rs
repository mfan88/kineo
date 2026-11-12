fn main() {
    // The app icon is built into the binary (and shown in the Dock in dev); rebuild
    // when it's regenerated, which Cargo wouldn't otherwise notice.
    println!("cargo:rerun-if-changed=icons");
    tauri_build::build()
}
