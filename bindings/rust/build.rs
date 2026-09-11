fn main() {
    let mut build = cc::Build::new();
    build
        .include("src")
        .file("src/parser.c")
        .file("src/scanner.c")
        .flag_if_supported("-std=c11")
        .warnings(false)
        .compile("tree-sitter-vibescript");

    for file in ["src/parser.c", "src/scanner.c", "src/tree_sitter/parser.h"] {
        println!("cargo:rerun-if-changed={file}");
    }
}
