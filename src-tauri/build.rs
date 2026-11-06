fn main() {
    // `tauri::generate_context!` needs `frontendDist` to exist, so `cargo test` fails
    // on a fresh clone. Debug builds never serve it (they use the dev server). Release
    // builds skip this on purpose: a missing frontend should fail, not ship blank.
    if std::env::var("PROFILE").as_deref() == Ok("debug") {
        std::fs::create_dir_all("../dist").expect("create ../dist");
    }
    // Run again if it's deleted later; a cached build script wouldn't recreate it.
    println!("cargo:rerun-if-changed=../dist");
    tauri_build::build()
}
