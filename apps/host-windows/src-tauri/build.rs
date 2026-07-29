use std::{env, fs, path::PathBuf};

fn main() {
    println!("cargo:rerun-if-env-changed=BADGERBOTS_PLUGIN_JAR");
    let output = PathBuf::from(env::var_os("OUT_DIR").expect("Cargo must provide OUT_DIR"))
        .join("badgerbots-paper-plugin.jar");
    let configured_source = env::var_os("BADGERBOTS_PLUGIN_JAR")
        .map(PathBuf::from)
        .or_else(|| {
            let bundled = PathBuf::from(
                env::var_os("CARGO_MANIFEST_DIR").expect("Cargo must provide CARGO_MANIFEST_DIR"),
            )
            .join("bundled")
            .join("badgerbots-paper-plugin.jar");
            bundled.is_file().then_some(bundled)
        });
    if let Some(source) = configured_source {
        println!("cargo:rerun-if-changed={}", source.display());
        fs::copy(source, output).expect("BADGERBOTS_PLUGIN_JAR could not be bundled");
        println!("cargo:rustc-env=BADGERBOTS_EMBEDDED_PLUGIN_PRESENT=true");
    } else {
        // Native tests and UI-only development remain possible without Gradle. Runtime
        // preparation fails closed when this empty marker is encountered.
        fs::write(output, []).expect("embedded plugin marker could not be written");
        println!("cargo:rustc-env=BADGERBOTS_EMBEDDED_PLUGIN_PRESENT=false");
    }
    tauri_build::build()
}
