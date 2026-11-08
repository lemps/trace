fn main() {
    // `tauri::generate_context!` needs `frontendDist` to exist, so `cargo test` fails
    // on a fresh clone. Debug builds never serve it (they use the dev server). Release
    // builds skip this on purpose: a missing frontend should fail, not ship blank.
    if std::env::var("PROFILE").as_deref() == Ok("debug") {
        std::fs::create_dir_all("../dist").expect("create ../dist");
    }
    // Run again if it's deleted later; a cached build script wouldn't recreate it.
    println!("cargo:rerun-if-changed=../dist");

    // Windows needs the Common Controls v6 manifest in any executable that can end
    // up importing a v6-only function (TaskDialogIndirect, through the dialog code);
    // without it Windows won't load the program (STATUS_ENTRYPOINT_NOT_FOUND).
    // tauri-build only gives it to the app binary, and whether the unit-test binary
    // imports such a function changes with unrelated code, so it once stopped loading
    // when a dependency was added. The linker embeds it in every executable instead,
    // tests included, and tauri-build is told not to add a second copy.
    let msvc = std::env::var("CARGO_CFG_TARGET_ENV").as_deref() == Ok("msvc");
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows") && msvc {
        println!("cargo:rustc-link-arg=/MANIFEST:EMBED");
        println!(
            "cargo:rustc-link-arg=/MANIFESTDEPENDENCY:type='win32' \
             name='Microsoft.Windows.Common-Controls' version='6.0.0.0' \
             processorArchitecture='*' publicKeyToken='6595b64144ccf1df' language='*'"
        );
        let windows = tauri_build::WindowsAttributes::new_without_app_manifest();
        tauri_build::try_build(tauri_build::Attributes::new().windows_attributes(windows))
            .expect("tauri-build");
        return;
    }
    tauri_build::build()
}
