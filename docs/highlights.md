# Highlight query audit

The audit accounts for all 110 named node kinds in `src/node-types.json`.
`test/highlight/` runs native `tree-sitter test` assertions, including negative
receiver assertions and collisions between parameters, methods and labels.
A Rust test checks that these fixtures parse without errors and exercise every
emitted named node kind. The unused directive-node spelling is an explicit
exception, with the actual first-line comment spelling tested instead.

Generic leaf captures come before contextual overrides. Punctuation and operator
captures precede method-name and interpolation overrides. Predicates capture
public roles so helper names cannot replace a visible highlight in the test
runner. Repeated direct-child patterns are intentional only when every matching
child has that role; containers wrapping defaults, arguments and nested types
prevent those expressions from matching.

| Nodes | Capture boundary |
| --- | --- |
| `identifier` | Variable fallback. A later field- or position-specific rule overrides syntactic names. Bare zero-argument calls remain ambiguous. |
| `constant` | Type fallback, with builtin namespace names recognized by spelling. Later method, parameter, label and declaration captures take precedence. |
| `method_name` | Whole suffixed name and its direct name/suffix children are calls by default. Keyword-prefixed names are leaves. Definition/member/alias positions override them as methods; hash and keyword keys override them as labels. None of these children are lexical local references. |
| `method`, `self_method_name`, `setter_name`, `operator_name` | `method.name` selects the definition. Self-qualified names capture the child name and `self` separately. Setter names and operator tokens override generic punctuation/operators; no body expression is captured. |
| `class`, `module`, `enum`, `type_alias`, `enum_member` | Declaration `name` fields, and the leaf enum-member node. Class/module bodies and alias right-hand types are separate nodes. |
| `call`, `command_call`, `member_access`, `computed_call` | Calls use `method`; command arguments use `arguments`. Members select the name after `.` or `&.`, including capitalized/operator names. Kernel builtins require a receiverless call. Computed callees retain their expression captures. Nested receivers and arguments are never selected as the outer callee. |
| `accessor_name`, `property_declaration`, `getter_declaration`, `setter_declaration`, `alias`, `alias_method`, `visibility_directive` | An accessor has one direct identifier; its annotation is wrapped. Alias identifiers use `name`/`target`; symbol aliases and visibility lists retain symbol captures. Declaration words are keyword tokens, not whole declarations. |
| `typed_parameter`, `splat_parameter`, `double_splat_parameter`, `block_parameter`, `ivar_parameter` | Parameter `name` fields, or the first named child for an instance-variable parameter. Annotation and default-expression children are excluded. This also prevents `@fallback` defaults inheriting the parameter capture. |
| `block_parameters`, `destructured_parameter`, `splat_target` | Direct identifier/constant children are parameters only under the parameter containers. A splat target gets parameter color only under a destructured parameter. Assignment/loop splats keep ordinary binding colors. |
| `parameters`, `bare_parameters`, `keyword_separator` | Parameter-list containers have no blanket capture. The bare keyword separator is a leaf operator. |
| `type_name`, `qualified_type_name` | Only direct name children are types; generic arguments are wrapped and visited separately. Every direct qualified-name component is intentionally a type component. Optional markers are separate operators; builtin names use the name child; `nil` and `type` have token-specific type captures. |
| `type_annotation`, `type_arguments`, `type_literal`, `type_tuple`, `type_shape`, `block_type`, `return_type` | Containers delegate to their names, fields and punctuation. Union pipes are operators. The sole whole-node exception is a hash value aliased to a leaf nullable builtin; an exact builtin-name predicate limits it. |
| `type_shape_field`, `hash_entry`, `keyword_argument` | Only `name` or `key` fields receive property/keyword-parameter captures, including capitalized labels. Values and nested type annotations keep independent captures. Quoted and symbol-spelled keys retain literal colors. |
| `require` | The `require` token is a keyword. The first string is the path; only the second, unescaped single-content string is an alias. Other require spellings require a receiverless `require` method and an `as` keyword value. Calls on receivers and unrelated functions keep ordinary strings. |
| `rescue` | Only the `binding` field receives a variable capture; exception types and handler expressions keep their own captures. |
| `string`, `string_content`, `escape_sequence`, `interpolation`, `quoted_symbol`, `symbol`, `regex` | Strings/content, escapes, symbol tokens and regex tokens have literal captures. Interpolation expressions use normal child captures and its delimiters override generic braces. Literal containers intentionally span their contents; function/type/parameter rules do not. |
| `integer`, `float`, `true`, `false`, `nil`, `self`, `instance_variable`, `class_variable` | Leaf numbers, builtin values, `self`, and properties. Contextual parameter/type rules can override these leaves where appropriate. |
| `comment`, `block_comment`, `directive_comment` | Whole comment nodes only. First-line directive examples currently lex as `comment`; the separate `directive_comment` node has the same capture and no children. |
| `break`, `next`, `retry`, `return`, `raise`, `yield` | Keyword tokens only, except the leaf `retry`. Operands and yielded/returned values retain expression captures. |
| `program`, `class_body`, `module_body`, `export_method`, `block` | Structural containers have no blanket capture. Their declarations, parameters, expressions and visible delimiters are handled independently. |
| `assignment`, `typed_assignment`, `compound_assignment`, `class_variable_assignment`, `destructuring_assignment`, `destructured_target`, `parenthesized_target` | Assignment containers do not style their operands. Names, annotation nodes and operator tokens supply captures; receivers, indices and right-hand expressions remain independent. |
| `if`, `elsif`, `else`, `while`, `for`, `case`, `when`, `begin`, `ensure`, `modifier`, `rescue_modifier` | Control-flow containers have no blanket capture. Only keyword/operator tokens and contextual rescue bindings are special; conditions, patterns, iterables and bodies remain expressions. |
| `binary`, `unary`, `ternary`, `beginless_range`, `endless_range`, `scope_resolution`, `scoped_constant`, `subscript`, `parenthesized`, `array`, `hash`, `argument_list`, `command_arguments`, `splat_argument`, `double_splat_argument` | Expression containers have no blanket capture. Leaf operators, punctuation, names and literals are highlighted independently, including receivers, indices and nested arguments. |

## Type/value ambiguities and local propagation

Plain identifiers can name locals or zero-argument functions. Plain names, arrays,
hashes and qualified member expressions can also stand for types in schema/cast
arguments. The grammar notes describe this ambiguity. Explicit type nodes are
highlighted in every position. Primitive arguments to member `.as` and the second
argument of `JSON.parse_as` have additional anchored captures; unrelated functions,
receivers and other arguments keep their expression colors. Fully resolving
ambiguous schemas or qualified expressions requires the language server.

The locals query propagates colors only through value/type reference positions.
It excludes method names, accessor/alias names and explicit labels, so a parameter
called `name` cannot recolor `user.name` or a `{ name: value }` key. Namespace suffixes
are not looked up as unrelated lexical locals. Generic type references, expression
receivers, argument values, defaults, interpolation bodies and nested bindings
still participate in local resolution. Type-alias references may inherit the
alias definition color where the enclosing local scope makes it visible.
Shorthand hash and keyword labels with no value are also references to the local
of the same name. Splatted arguments and yielded operands propagate local colors
through their argument containers.
