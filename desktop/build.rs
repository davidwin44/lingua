fn main() {
    // The web app is embedded into the executable, so it must be built first (`npm run build`).
    if !std::path::Path::new("../dist/index.html").exists() {
        panic!("../dist is missing: run `npm run build` in the project root first");
    }
    println!("cargo:rerun-if-changed=../dist");
    println!("cargo:rerun-if-changed=lingua.rc");
    println!("cargo:rerun-if-changed=lingua.manifest");
    println!("cargo:rerun-if-changed=assets/lingua.ico");
    embed_resource::compile("lingua.rc", embed_resource::NONE)
        .manifest_optional()
        .unwrap();
}
