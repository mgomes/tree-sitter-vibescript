# tree-sitter-vibescript

A [tree-sitter](https://tree-sitter.github.io/tree-sitter/) grammar for [Vibescript](https://github.com/mgomes/vibescript).

## Usage

```sh
tree-sitter generate
tree-sitter test
```

## Grammar notes

### Known divergences from the interpreter

The interpreter disambiguates several prefix sigils (`*`, `&`, `/`, `[`)
by consulting its local-variable table: a slash, star, or bracket after a
*known local* is an operator or index, while after a non-local callee it
opens a parenless argument. Tree-sitter has no symbol table, so this
grammar approximates the
rule with spacing alone (space before the sigil, none after it). Both
readings keep the tree free of `ERROR` nodes; only which nodes appear can
differ from how the interpreter executes the code:

- `x *n` and `x &b` at statement level parse as parenless splat /
  block-pass commands even when `x` is a local variable (the interpreter
  multiplies / intersects for locals). `x * n` and `x*n` always stay
  binary operators, and `x *= 2` stays a compound assignment.
- `total /2` parses as division because the slash never closes on its
  line. With a closing slash, `f /2 + g/i` parses as a regex command
  argument even when `f` is a local (the interpreter keeps dividing for
  locals, including the implicit `it` parameter and enclosing class
  constants).
- `a [0]` (spaced bracket) parses as an array command argument even when
  `a` is a local, and `a [0] = 1` becomes a command whose argument is an
  assignment to an array literal (the interpreter indexes locals in every
  spacing). Flush brackets (`a[0]`, `puts[1]`) always stay indexing, and
  `self [0]` stays indexing because a command callee must be an
  identifier. `f [0] = 5` with a non-local callee is a parse error in the
  interpreter; the grammar keeps the intact command-with-assignment tree
  instead.

Other approximations, all chosen so that the tree stays intact:

- A visibility word on its own line followed by a definition
  (`private` then `def x`) produces the same tokens as the inline form
  (`private def x`), so the grammar attaches the modifier to that first
  definition instead of emitting a bare section directive. A visibility
  word before a non-definition member (or before `end`) still parses as a
  `visibility_directive` section, and `private :a, :b` parses as the
  retroactive symbol form.
- A bare `rescue` whose body's first statement begins with a constant on
  the next line reads that constant as the rescue's error type.
- `return`, `break`, `next`, and `yield` values must sit on the keyword's
  line; a bare keyword followed by an expression statement on the next
  line parses as the keyword consuming that expression.
- `module foo` (lowercase name) parses as a command call; the interpreter
  reports a targeted "module name must start with an uppercase letter"
  error instead.
- `def f(a: nil)` parses the `nil` as a type annotation; the interpreter
  reads it as a keyword default unless a union pipe follows.
- A hash entry whose value only parses as type syntax
  (`{ note: string | nil }`, `{ tags: array<int> }`) carries a
  `type_annotation` value, mirroring rc4 expression-position shape
  literals. An entry that parses both ways (`{ id: string }`) keeps the
  expression reading, exactly like the interpreter's dual-reading
  default, so a pure schema literal can mix expression-valued and
  type-valued entries in one hash node.
- Interpolations inside `%W[...]` / `%I[...]` percent arrays are not
  structured; the whole literal stays a single token, so `#{...}`
  segments inside them are not highlighted as code.
- Nested destructuring groups (`x, (y, z) = ...`) need at least two
  elements; a single-element group parses as a parenthesized
  expression.

Contextual words are handled precisely, matching the interpreter:
`module = 5`, `public = 1`, `protected = 2`, `include = 3`, `extend = 4`,
and `alias = 5` all stay ordinary identifier assignments, while the
declaration and directive forms (`module Name`, `include M`,
`protected def x`, `private :hidden`, `alias b a`) parse as keywords. The
statement-level newline that ends an endless range (`x = 5..`), the
signature-line-only `-> Type` return annotation, the same-line `rescue`
modifier, and the loop-header `do` are recognized by the external scanner
(`src/scanner.c`).
