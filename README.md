# tree-sitter-vibescript

A [Tree-sitter](https://tree-sitter.github.io/tree-sitter/) grammar for
[Vibescript 0.80.0](https://github.com/xipkit/vibescript/releases/tag/v0.80.0).
The grammar and crate versions track the supported language release.

## Rust

Add the grammar and parser to your application:

```sh
cargo add tree-sitter-vibescript@0.80.0 tree-sitter@0.26
```

```rust
let mut parser = tree_sitter::Parser::new();
parser.set_language(&tree_sitter_vibescript::LANGUAGE.into())?;
let tree = parser.parse("puts [1, 2, 3].map { |n| n * 2 }", None).unwrap();
assert!(!tree.root_node().has_error());
```

The crate includes the generated parser, external scanner, node descriptions,
and highlighting, injection, folding, indentation, and locals queries. Cargo builds the parser with
a C compiler and Rust 1.90 or newer; consumers do not need Node.js or the
Tree-sitter CLI.

## Language support

Supports the Rust language's typed locals and signatures, generic types, unions,
optionals, tuples, open shapes, aliases, typed block signatures, keyword
parameters, casts, enums, floor division and brace blocks. The Go implementation
is retired. Removed syntax no longer has dedicated grammar productions.

See [grammar notes](docs/grammar.md) for editor parsing approximations.
Vibescript's checker remains responsible for semantic validation.

## Development

```sh
npm ci
npm run generate
npm test
CARGO_BUILD_JOBS=3 cargo test
CARGO_BUILD_JOBS=3 cargo publish --dry-run
```

Commit the generated parser alongside grammar changes. CI checks regeneration,
the corpus, examples, Rust bindings, queries, and crate packaging. The
[external corpus gate](docs/grammar.md#corpus-gate) checks Rust fixtures against
`vibes check` before requiring error-free editor parses.

## Releases

Keep the versions in `Cargo.toml`, `package.json`, and `tree-sitter.json` aligned.
Configure the repository's `CARGO_REGISTRY_TOKEN` Actions secret with a crates.io
API token that can publish `tree-sitter-vibescript`. Publishing a GitHub release
such as `v0.80.0` runs the crate tests and publishes that version to crates.io.
The publish workflow can also be run manually from `master` for an existing
release tag. It accepts tags whose commits have reached `master`, checks the
versions, and publishes the resolved commit even if a ref changes during the run.
