# Grammar notes

The reference is Rust Vibescript v0.80.0, especially `docs/language.md`, ADR-007,
ADR-008 and the sources accepted by `vibes check`. The grammar supports typed
locals, fields, constants and signatures; generic collection types; unions,
optionals, tuples and open record shapes; type aliases; typed block signatures;
keyword separators; checked `.as(T)` casts; enums; and floor division.
Functions themselves are not generic in this release.

## Editor approximations

Tree-sitter has no type or local-variable table. A bare name is an `identifier`
whether it names a local or a zero-argument function. Dotted zero-argument calls
use `member_access`; calls with arguments or a block use `call` or `command_call`.
The language server resolves names and performs semantic checks.

Spacing disambiguates parenless arguments from operators and indexing:
`f *items`, `f /pattern/` and `f [1]` can be command calls even when the compiler
knows that `f` is a local. Flush subscripts and spaced arithmetic remain ordinary
expressions. Floor division uses `//` and `//=` and never opens a nonempty regex.

Type literals and values share syntax. Generic, union, optional, tuple and shape
syntax can produce `type_literal`; ambiguous plain names, arrays and hashes
prefer the value reading. Optional markers are separate tokens, including in field labels and `&block?:`.
Semantic restrictions on type names, declaration placement, keyword ordering,
assignment targets and string-only hash keys belong to the checker.

Statement separators include semicolons. Whitespace is an extra, so some invalid
adjacent expressions can still produce separate statements. Similarly, a value
on the next line can attach to `return`, `break`, `next` or `yield`. Contextual
module/visibility/alias words, same-line blocks, parenless arguments, return
arrows and rescue modifiers use the external scanner.

Removed words can still be ordinary identifiers; `do`, `unless` and `until` no
longer have dedicated syntax rules. Percent literals, legacy keyword defaults,
untyped function parameters, symbol hash keys, lambdas and block forwarding
have no supported grammar productions.

## Method suffixes

The owner's 2026-09-28 rule and Rust `mgomes/name-suffix` branch restrict terminal
`?` and `!` name suffixes to methods: definitions, calls and method symbols.
Ordinary identifiers, constants and instance/class variables contain only their
Unicode letters, decimal digits and underscores. Suffixed method names use a
`method_name` node. An ordinary name child excludes the suffix and never
resolves as a local reference. Reserved-word spellings such as `if?` and
`return!` are scanned as whole method names so their prefixes cannot start
control-flow statements. Assignment targets and parameter/declaration names exclude it.
Tree-sitter marks invalid bindings with syntax errors; actionable diagnostics
and renames come from `vibes lsp`.

A suffix immediately followed by a single `=` is rejected, so `a!=b`,
`LIMIT!=OTHER` and `@left!=@right` remain inequalities. Before `==` or `=~`, it
remains a suffix: `ok?==true` calls `ok?`. The scanner checks beyond the suffix
without consuming the following operator. Optional type markers share the `?`
token but remain valid before assignments such as `value: int?=nil`.

Hash and keyword labels **keep suffixes**: `{ ready?: true }` names the string key
`"ready?"`, and `f(save!: true)` passes `"save!"`. They require explicit values;
`{ ready?: }` and `f(ready?:)` would read forbidden suffixed locals. This matches
the Rust branch's lexer, language guide and ADR-008 addendum. Type shapes instead
interpret `ready?: bool` as an optional field named `ready`; `&block?:` declares
an optional block whose binding name is `block`.

A nullable nominal type in an expression can share spelling with an illegal
constant name (`Record?`). The grammar can emit an optional `type_literal` there;
only the language server knows whether `Record` declares a type. Its `constant`
child never includes `?`. Nullable rescue types and expression-position schemas
accepted by the compiler retain their optional markers too.

## Local bindings and scopes

`locals.scm` captures syntactic binding positions. Assignments and updates share
definition captures; deciding which write first declares a name belongs to the
language server.

| Binding form | Definition and scope |
| --- | --- |
| Assignment, typed local or constant, compound assignment | Identifier or constant target, including nested parentheses, in the surrounding scope. Member/index receivers and instance/class variables are not local definitions. |
| Destructuring and splats | Every named target, including nested parenthesized/bracket groups and named rests. Anonymous `*` has no definition. |
| `for` variables and patterns | The same target captures, in the surrounding scope; loops do not introduce a local scope. |
| Brace-block parameters | Plain, typed, uppercase and nested destructured parameters belong to the block. Blocks inherit enclosing bindings; new names stay inside. |
| Function and method parameters | Positional, defaulted, rest, keyword, `**options`, and `&block` names belong to the method scope, including bare signatures. `@field` parameters write instance storage. The `&block` name is a declaration only; invocation uses `yield`. |
| `require` | The assigned variable and an unescaped literal `as:` name are definitions. Escaped aliases and implicitly imported exports require module analysis. |
| `rescue => error` | A handler scope shadows the outer name only through that handler, excluding following handlers, `else` and `ensure`. |
| Class, module and enum names | Definitions in the enclosing scope. Named `class_body` and `module_body` nodes keep namespace members separate from the declaration's name. Enum members are qualified members, not bare local bindings. |
| Constants and type aliases | Definitions in their enclosing program or namespace body. |
| `case` / `when`, `if`, `while`, `begin` | No additional pattern bindings or local scopes. Assignments inside them use the ordinary binding rules. |

Function names, method aliases, accessors and fields have their own semantic
namespaces and are not local definitions. Method scopes do not inherit ordinary
script locals. Constant/type lookup through a namespace, required-file
environments, forward declarations, and distinguishing updates to captured
outer locals from new block locals require the language server. The reference
captures are lexical candidates, including ambiguous bare zero-argument calls;
the query is not a replacement for name resolution or definite-assignment checks.

Rust tests exercise definition captures and Tree-sitter's actual highlighting
consumer, including scope inheritance, shadowing and binding lifetimes.

The reference audit checks every reachable direct identifier/constant slot in
`src/node-types.json`. It asserts reference, definition and non-local-name roles,
and verifies parameter-color propagation through every operand context. New
slots fail the inventory test until classified. The one schema-only exception is
`computed_call.function`: bare callees prefer `call.method`, while computed calls
contain parenthesized or compound expressions, whose inner references are tested.

Both `yield value` and `yield(value)` wrap operands in `argument_list`, so they
share its reference capture. Splatted values use `splat_argument` and
`double_splat_argument`. Shorthand `{ name: }` and `f(name:)` labels also read a
local; explicit labels in `{ name: value }` and `f(name: value)` do not. Type tuple
elements resolve through `type_name`, casts through `.as` receivers and arguments,
and the canonical replacement for `unless` through `if !condition`.

## Highlight captures

The [highlight audit](highlights.md) records the capture boundary for every named
node kind. `npm test` runs the assertions in `test/highlight/`; Rust tests also
check that those fixtures parse and cover the emitted named-node inventory.
Receivers, defaults, argument values and nested expressions keep independent
captures. Local-reference propagation excludes syntactic method names and labels.

## Compiler compatibility exceptions

ADR-008 prescribes parenless zero-argument calls and removes the empty regex.
The v0.80.0 `vibes check` binary nevertheless accepts some `f()` calls when the
function has defaulted parameters, `yield()`, standalone `//`, and symbol-spelled
field labels inside type shapes. Computed callees and nested declarations also
appear in accepted fixtures. The editor
accepts these spellings too so accepted programs always have intact syntax
trees. Empty parentheses on other calls are left to the language server to
reject. Documentation and examples use the canonical spellings.

## Corpus gate

```sh
npm ci
npm run generate
python3 scripts/check-corpora.py /path/to/rust-vibescript \
  --vibes /path/to/vibes --output /path/to/editor-tooling-results
```

The gate walks `tests/`, `corpus/glue/` and `examples/`, including `.vibe` files,
JSON/JSONL source fields, compressed replay programs, and standalone string
literals in Rust tests/examples. It deduplicates identical source and working
directory pairs, then runs `vibes check --json` with at most three workers.
File fixtures keep their original module-resolution directory. Compiler
rejections are recorded, never rewritten or counted as parser successes.

Every accepted source is passed to the npm-installed Tree-sitter CLI. Any
`ERROR`, `MISSING` node or parse timeout fails the gate, except for the exact
retired sources in `test/name-suffix-exceptions.json`. That ledger lists 181
v0.80.0 fixtures confirmed with `V0003` by the Rust suffix-branch binary, using
SHA-256 of the complete source, original corpus locations and diagnostic spans.
No spelling-based exclusion applies to new or edited programs. These sources are
still parsed and listed in `retired-suffix-names.json`, separately from unexpected
failures; remove ledger entries as the upstream fixtures migrate. The output directory
contains compiler diagnostics, source origins, accepted fixtures and parser
results. `--reuse-checks` reuses compiler results only when the binary and all
source candidates are unchanged; parsing always runs again. The parser has a
two-minute limit per fixture. Generated stress fixtures with tens of thousands of call arguments can take tens of seconds;
this gate establishes syntax compatibility rather than an editor latency budget.

Rust snippets assembled by `format!`, concatenation, host declarations or runtime
generators are not reconstructed. Their checked-in JSON/replay forms are covered
where present. Sources requiring host capabilities or additional fixture setup
remain in the rejection report unless independently accepted by the CLI.

Identifier character classes are generated from Unicode 17.0.0, matching the
compiler, by `npm run generate`. The pinned Unicode npm dependency makes parser
generation independent of the Unicode version bundled with the CLI.

The module scanner uses `src/unicode.h`, generated from the very same
`Uppercase_Letter` list as the `constant` token. Lowercase, titlecase and uncased
Unicode names keep contextual `module` in call position (`module λ`).
