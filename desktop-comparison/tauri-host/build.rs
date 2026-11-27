fn main() {
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows") {
        println!("cargo:rerun-if-changed=../native/windows.cpp");
        cc::Build::new()
            .cpp(true)
            .std("c++17")
            .flag_if_supported("/utf-8")
            .define("WSEARCH_TAURI_OVERLAY", None)
            .file("../native/windows.cpp")
            .compile("wsearch_overlay");
        for lib in ["user32", "gdi32", "dwmapi"] {
            println!("cargo:rustc-link-lib={lib}");
        }
    }
    tauri_build::build()
}
