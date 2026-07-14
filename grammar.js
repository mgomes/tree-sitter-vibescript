/// <reference types="tree-sitter-cli/dsl" />

const PREC = {
  ASSIGNMENT: 1,
  RESCUE: 2,
  WORD_OR: 3,
  WORD_AND: 4,
  CONDITIONAL: 5,
  OR: 6,
  AND: 7,
  EQUALITY: 8,
  COMPARISON: 9,
  RANGE: 10,
  BIT_AND: 11,
  SHIFT: 12,
  ADDITIVE: 13,
  MULTIPLICATIVE: 14,
  UNARY: 15,
  POWER: 16,
  CALL: 17,
};

module.exports = grammar({
  name: "vibescript",

  extras: ($) => [/\s/, $.comment],

  word: ($) => $.identifier,

  externals: ($) => [
    $.regex,
    $._block_open,
    $._command_start,
    $._endless_marker,
    $._signature_arrow,
    $._module_keyword,
    $._include_keyword,
    $._extend_keyword,
    $._public_keyword,
    $._protected_keyword,
    $._alias_keyword,
    $._rescue_modifier_keyword,
    $._loop_do,
  ],

  conflicts: ($) => [
    [$.simple_parameter, $._primary],
    [$.ivar_parameter, $._primary],
    [$.require, $._primary],
    [$.modifier, $._expression_statement],
    [$.type_annotation],
    [$.class_variable_assignment, $._primary],
    [$.argument_list],
    [$._expression_or_closed_range, $._paren_argument],
    [$._expression_or_closed_range, $._argument],
    [$.type_shape, $.hash],
    [$.type_name, $._primary],
    [$.type_name, $.nil],
    [$._statement, $.modifier],
    [$.binary, $.beginless_range],
    [$.scoped_constant, $._primary],
    [$._rescue_type, $._primary],
    [$.raise, $._expression_or_closed_range],
    [$.qualified_type_name, $._primary],
    [$.type_shape_field, $.hash_entry],
    [$.type_shape_field, $._primary],
    [$._assignable_member_access, $.member_access],
    [$._destructure_target, $._primary],
    [$._destructure_target, $._expression],
    [$.simple_parameter, $._destructure_target],
    [$.ivar_parameter, $._destructure_target],
    [$.splat_parameter, $.splat_target],
  ],

  rules: {
    // Enums join the choice here rather than in _declaration: the
    // interpreter rejects them anywhere but the program top level,
    // including module and method bodies.
    program: ($) =>
      repeat(choice($._statement, $._declaration, $.enum)),

    // --- Declarations ---

    _declaration: ($) =>
      choice(
        $.method,
        $.class,
        $.module,
        $.export_method,
      ),

    method: ($) =>
      seq(
        optional(field("visibility", $._visibility_modifier)),
        "def",
        field("name", choice(
          $.identifier,
          $.setter_name,
          $.self_method_name,
          $.operator_name,
        )),
        optional($.parameters),
        optional($.return_type),
        optional($._body),
        optional(seq(repeat1($.rescue), optional($.else))),
        optional($.ensure),
        "end",
      ),

    // `def name=(value)` declares a setter; the `=` must sit flush against
    // the name so `def foo` followed by an assignment body stays separate.
    setter_name: ($) =>
      seq($.identifier, token.immediate("=")),

    _visibility_modifier: ($) =>
      choice(
        "private",
        alias($._public_keyword, "public"),
        alias($._protected_keyword, "protected"),
      ),

    operator_name: (_$) =>
      choice(
        "+", "-", "*", "/", "%", "**", "<<", "&",
        "==", "!=", "<", "<=", ">", ">=", "<=>",
        "[]", "[]=",
      ),

    self_method_name: ($) =>
      seq("self", ".", $.identifier, optional(token.immediate("="))),

    export_method: ($) =>
      seq(
        "export",
        $.method,
      ),

    parameters: ($) =>
      prec.dynamic(10, seq(
        "(",
        optional(
          seq(
            $._parameter,
            repeat(seq(",", $._parameter)),
            optional(","),
          ),
        ),
        ")",
      )),

    _parameter: ($) =>
      choice(
        $.typed_parameter,
        $.keyword_parameter,
        $.ivar_parameter,
        $.splat_parameter,
        $.double_splat_parameter,
        $.block_parameter,
        $.simple_parameter,
      ),

    // `name: default` declares an optional keyword parameter and `name:` a
    // required one; `name: Type` is a typed positional parameter. When the
    // payload also parses as a type (`a: int`), the typed reading wins.
    keyword_parameter: ($) =>
      prec.dynamic(-5, seq(
        field("name", $.identifier),
        ":",
        optional(field("default", $._expression)),
      )),

    simple_parameter: ($) =>
      seq(
        $.identifier,
        optional(seq("=", $._expression)),
      ),

    typed_parameter: ($) =>
      seq(
        $.identifier,
        ":",
        $.type_annotation,
        optional(seq("=", $._expression)),
      ),

    ivar_parameter: ($) =>
      seq(
        $.instance_variable,
        optional(seq(":", $.type_annotation)),
      ),

    splat_parameter: ($) =>
      seq("*", $.identifier),

    double_splat_parameter: ($) =>
      seq("**", $.identifier),

    block_parameter: ($) =>
      seq("&", $.identifier),

    type_annotation: ($) =>
      seq(
        $._type,
        repeat(seq("|", $._type)),
      ),

    _type: ($) =>
      choice(
        $.type_name,
        $.qualified_type_name,
        $.type_shape,
      ),

    // Enum types exported by a required module: `status_mod.Status`. The
    // member must be CamelCase (uppercase with a later lowercase letter),
    // matching the interpreter's dotted-type rule, so ALL-CAPS members
    // like `pi: Math.PI` keep reading as keyword-default expressions.
    qualified_type_name: ($) =>
      seq(
        field("module", choice($.identifier, $.constant)),
        ".",
        alias(token(prec(1, /[A-Z][A-Z0-9_]*[a-z][a-zA-Z0-9_]*/)), $.constant),
        optional("?"),
      ),

    type_name: ($) =>
      seq(
        choice(
          $.identifier,
          $.constant,
          "nil",
        ),
        optional($.type_arguments),
        optional("?"),
      ),

    type_arguments: ($) =>
      seq(
        "<",
        $._type,
        repeat(seq(",", $._type)),
        ">",
      ),

    type_shape: ($) =>
      seq(
        "{",
        optional(seq(
          $.type_shape_field,
          repeat(seq(",", $.type_shape_field)),
          optional(","),
        )),
        "}",
      ),

    // Fields separate with a label colon or a hash rocket
    // ({ "user-id" => string }), matching the interpreter's shape grammar.
    type_shape_field: ($) =>
      seq(
        field("name", choice($.identifier, $.string, $.symbol, $.quoted_symbol)),
        choice(":", "=>"),
        $.type_annotation,
      ),

    nullable_builtin_type: (_$) =>
      token(prec(2,
        /(any|int|float|number|string|bool|duration|time|money|symbol|function|range|array|hash|object)\?/)),

    return_type: ($) =>
      seq(
        alias($._signature_arrow, "->"),
        $.type_annotation,
      ),

    class: ($) =>
      seq(
        "class",
        field("name", $.constant),
        optional($._class_body),
        "end",
      ),

    _class_body: ($) =>
      repeat1(
        choice(
          $.property_declaration,
          $.getter_declaration,
          $.setter_declaration,
          $.class_variable_assignment,
          $.method,
          $.mixin,
          $.visibility_directive,
          $.alias_method,
          $.class,
          $._statement,
        ),
      ),

    module: ($) =>
      seq(
        alias($._module_keyword, "module"),
        field("name", $.constant),
        optional($._module_body),
        "end",
      ),

    // Members are bare word tokens, at least one required.
    enum: ($) =>
      seq(
        "enum",
        field("name", choice($.constant, $.identifier)),
        repeat1(field("member", alias(choice($.constant, $.identifier), $.enum_member))),
        "end",
      ),

    _module_body: ($) =>
      repeat1(
        choice(
          $.property_declaration,
          $.getter_declaration,
          $.setter_declaration,
          $.class_variable_assignment,
          $.method,
          $.mixin,
          $.visibility_directive,
          $.alias_method,
          $.module,
          $._statement,
        ),
      ),

    mixin: ($) =>
      seq(
        field("keyword", choice(
          alias($._include_keyword, "include"),
          alias($._extend_keyword, "extend"),
        )),
        choice(
          seq("(", $._mixin_list, ")"),
          $._mixin_list,
        ),
      ),

    _mixin_list: ($) =>
      seq(
        $._mixin_name,
        repeat(seq(",", $._mixin_name)),
      ),

    _mixin_name: ($) =>
      choice($.constant, $.scoped_constant),

    scoped_constant: ($) =>
      seq($.constant, repeat1(seq("::", $.constant))),

    visibility_directive: ($) =>
      prec.dynamic(-10, prec.right(seq(
        $._visibility_modifier,
        optional(seq($._symbol_name, repeat(seq(",", $._symbol_name)))),
      ))),

    alias: ($) =>
      seq(
        alias($._alias_keyword, "alias"),
        field("name", $._alias_name),
        field("target", $._alias_name),
      ),

    _alias_name: ($) =>
      choice($.identifier, $.symbol, $.quoted_symbol),

    alias_method: ($) =>
      seq(
        "alias_method",
        choice(
          seq("(", field("name", $._symbol_name), ",", field("target", $._symbol_name), ")"),
          seq(field("name", $._symbol_name), ",", field("target", $._symbol_name)),
        ),
      ),

    _symbol_name: ($) =>
      choice($.symbol, $.quoted_symbol),

    accessor_name: ($) =>
      seq(
        $.identifier,
        optional(seq(":", $.type_annotation)),
      ),

    property_declaration: ($) =>
      seq(
        optional(field("visibility", $._visibility_modifier)),
        "property",
        $.accessor_name,
        repeat(seq(",", $.accessor_name)),
      ),

    getter_declaration: ($) =>
      seq(
        optional(field("visibility", $._visibility_modifier)),
        "getter",
        $.accessor_name,
        repeat(seq(",", $.accessor_name)),
      ),

    setter_declaration: ($) =>
      seq(
        optional(field("visibility", $._visibility_modifier)),
        "setter",
        $.accessor_name,
        repeat(seq(",", $.accessor_name)),
      ),

    class_variable_assignment: ($) =>
      seq(
        $.class_variable,
        "=",
        $._expression,
      ),

    // --- Statements ---

    _statement: ($) =>
      choice(
        $.if,
        $.unless,
        $.case,
        $.while,
        $.until,
        $.for,
        $.begin,
        $.return,
        $.break,
        $.next,
        $.retry,
        $.raise,
        $.yield,
        $.require,
        $.alias,
        $.modifier,
        $.destructuring_assignment,
        $.command_call,
        $.directive_comment,
        $._expression_statement,
      ),

    // prec.right: in `puts f 3, 4` the comma-separated list binds to the
    // innermost parenless call, matching Ruby's greedy command arguments.
    command_call: ($) =>
      prec.right(seq(
        field("method", $.identifier),
        $._command_start,
        field("arguments", $.command_arguments),
      )),

    command_arguments: ($) =>
      prec.right(seq(
        $._command_argument,
        repeat(seq(",", $._command_argument)),
      )),

    _command_argument: ($) =>
      choice(
        $._argument,
        $.endless_range,
        $.command_call,
      ),

    modifier: ($) =>
      prec.left(seq(
        field("body", choice(
          $._expression,
          $.return,
          $.break,
          $.next,
          $.retry,
          $.raise,
          $.yield,
        )),
        field("keyword", choice("if", "unless", "while", "until")),
        field("condition", $._expression),
      )),

    _expression_statement: ($) =>
      $._expression,

    assignment: ($) =>
      prec.right(PREC.ASSIGNMENT, seq(
        $._expression,
        "=",
        $._rhs_expression,
      )),

    _rhs_expression: ($) =>
      choice(
        $._expression,
        $.endless_range,
        $.if,
        $.unless,
        $.case,
        $.begin,
        $.while,
        $.until,
        $.for,
      ),

    destructuring_assignment: ($) =>
      prec.right(PREC.ASSIGNMENT, seq(
        field("left", seq(
          $._destructure_target,
          repeat1(seq(",", $._destructure_target)),
        )),
        "=",
        field("right", seq(
          $._expression,
          repeat(seq(",", $._expression)),
        )),
      )),

    // Safe navigation is read-only, so targets take a dot-only member
    // access; `user&.name, rest = pair` is a parse error in the
    // interpreter.
    _destructure_target: ($) =>
      choice(
        $.identifier,
        $.instance_variable,
        $.class_variable,
        alias($._assignable_member_access, $.member_access),
        $.subscript,
        $.splat_target,
        $.destructured_target,
      ),

    _assignable_member_access: ($) =>
      prec.left(PREC.CALL - 1, seq(
        $._expression,
        ".",
        $.identifier,
      )),

    // Nested destructuring groups: x, (y, z) = [1, [2, 3]] and the
    // bracket spelling x, [y, z] = ... Two elements minimum keeps a
    // parenthesized expression unambiguous.
    destructured_target: ($) =>
      choice(
        seq("(", $._destructure_target, repeat1(seq(",", $._destructure_target)), ")"),
        seq("[", $._destructure_target, repeat1(seq(",", $._destructure_target)), "]"),
      ),

    splat_target: ($) =>
      seq("*", optional($.identifier)),

    compound_assignment: ($) =>
      prec.right(PREC.ASSIGNMENT, seq(
        $._expression,
        choice("+=", "-=", "*=", "/=", "%=", "**=", "||=", "&&="),
        $._rhs_expression,
      )),

    return: ($) =>
      prec.right(seq(
        "return",
        optional(seq(
          $._range_or_expression,
          repeat(seq(",", $._range_or_expression)),
        )),
      )),

    _range_or_expression: ($) =>
      choice($._expression, $.endless_range),

    break: ($) =>
      prec.right(seq("break", optional($._expression))),

    next: ($) =>
      prec.right(seq("next", optional($._expression))),

    retry: (_$) => "retry",

    raise: ($) =>
      prec.right(seq(
        "raise",
        optional(choice(
          prec.dynamic(10, seq("(", $._expression, ")")),
          seq($._argument, repeat(seq(",", $._argument))),
        )),
      )),

    yield: ($) =>
      prec.right(seq(
        "yield",
        optional(choice(
          prec.dynamic(10, seq("(", optional($.argument_list), ")")),
          $.argument_list,
        )),
      )),

    require: ($) =>
      prec.dynamic(5, seq(
        field("variable", $.identifier),
        "=",
        "require",
        "(",
        $.string,
        optional(seq(",", "as", ":", $.string)),
        ")",
      )),

    // --- Control Flow ---

    if: ($) =>
      seq(
        "if",
        field("condition", $._expression),
        optional("then"),
        optional($._body),
        repeat($.elsif),
        optional($.else),
        "end",
      ),

    elsif: ($) =>
      seq(
        "elsif",
        field("condition", $._expression),
        optional("then"),
        optional($._body),
      ),

    else: ($) =>
      seq(
        "else",
        optional($._body),
      ),

    unless: ($) =>
      seq(
        "unless",
        field("condition", $._expression),
        optional("then"),
        optional($._body),
        optional($.else),
        "end",
      ),

    case: ($) =>
      seq(
        "case",
        optional(field("subject", $._expression)),
        repeat1($.when),
        optional($.else),
        "end",
      ),

    when: ($) =>
      seq(
        "when",
        $._when_pattern,
        repeat(seq(",", $._when_pattern)),
        optional("then"),
        optional($._body),
      ),

    _when_pattern: ($) =>
      choice($._range_or_expression, $.splat_argument),

    // The loop separator `do` is an external token so that in `while f do`
    // the `do` closes the loop header instead of opening a block on the
    // condition's call, matching Ruby's binding.
    while: ($) =>
      seq(
        "while",
        field("condition", $._expression),
        optional(alias($._loop_do, "do")),
        optional($._body),
        "end",
      ),

    until: ($) =>
      seq(
        "until",
        field("condition", $._expression),
        optional(alias($._loop_do, "do")),
        optional($._body),
        "end",
      ),

    // For-loop variables are block-parameter-style bindings: identifiers,
    // splats, and nested groups only. Member, index, and instance-variable
    // targets are parse errors in the interpreter.
    for: ($) =>
      seq(
        "for",
        field("variable", $._for_target),
        repeat(seq(",", field("variable", $._for_target))),
        "in",
        field("iterable", $._expression),
        optional(alias($._loop_do, "do")),
        optional($._body),
        "end",
      ),

    _for_target: ($) =>
      choice(
        $.identifier,
        $.splat_target,
        alias($._for_target_group, $.destructured_target),
      ),

    _for_target_group: ($) =>
      choice(
        seq("(", $._for_target, repeat1(seq(",", $._for_target)), ")"),
        seq("[", $._for_target, repeat1(seq(",", $._for_target)), "]"),
      ),

    // else only has meaning after at least one rescue clause; the
    // interpreter rejects a bare begin/else.
    begin: ($) =>
      seq(
        "begin",
        optional($._body),
        optional(seq(repeat1($.rescue), optional($.else))),
        optional($.ensure),
        "end",
      ),

    rescue: ($) =>
      seq(
        "rescue",
        optional(choice(
          prec.dynamic(10, seq("(", $._rescue_type, ")")),
          $._rescue_type,
        )),
        optional(seq("=>", field("binding", $.identifier))),
        optional($._body),
      ),

    _rescue_type: ($) =>
      seq(
        choice($.constant, $.scoped_constant),
        repeat(seq("|", choice($.constant, $.scoped_constant))),
      ),

    ensure: ($) =>
      seq(
        "ensure",
        optional($._body),
      ),

    // --- Expressions ---

    _expression: ($) =>
      choice(
        $.assignment,
        $.compound_assignment,
        $.ternary,
        $.binary,
        $.unary,
        $.beginless_range,
        $.rescue_modifier,
        $.call,
        $.member_access,
        $.scope_resolution,
        $.subscript,
        $._primary,
      ),

    binary: ($) =>
      choice(
        prec.left(PREC.WORD_OR, seq($._expression, "or", $._expression)),
        prec.left(PREC.WORD_AND, seq($._expression, "and", $._expression)),
        prec.left(PREC.OR, seq($._expression, "||", $._expression)),
        prec.left(PREC.AND, seq($._expression, "&&", $._expression)),
        prec.left(PREC.EQUALITY, seq($._expression, choice("==", "===", "!=", "=~", "!~"), $._expression)),
        prec.left(PREC.COMPARISON, seq($._expression, choice("<", ">", "<=", ">=", "<=>"), $._expression)),
        prec.left(PREC.RANGE, seq($._expression, choice("..", "..."), $._expression)),
        prec.left(PREC.BIT_AND, seq($._expression, "&", $._expression)),
        prec.left(PREC.SHIFT, seq($._expression, "<<", $._expression)),
        prec.left(PREC.ADDITIVE, seq($._expression, choice("+", "-"), $._expression)),
        prec.left(PREC.MULTIPLICATIVE, seq($._expression, choice("*", "/", "%"), $._expression)),
        prec.right(PREC.POWER, seq($._expression, "**", $._expression)),
      ),

    // Dynamic -1: when GLR can read `expr .. expr` either as one binary range
    // or as `expr` followed by a beginless-range statement, the binary range
    // wins.
    beginless_range: ($) =>
      prec.dynamic(-1, prec.left(PREC.RANGE, seq(
        choice("..", "..."),
        $._expression,
      ))),

    endless_range: ($) =>
      prec.left(PREC.RANGE, seq(
        $._expression,
        choice("..", "..."),
        $._endless_marker,
      )),

    _endless_range_closed: ($) =>
      prec.left(PREC.RANGE, seq(
        $._expression,
        choice("..", "..."),
      )),

    _expression_or_closed_range: ($) =>
      choice(
        $._expression,
        alias($._endless_range_closed, $.endless_range),
      ),

    // The external keyword only fires on the body's own line, so a `rescue`
    // opening a new line always reads as a begin/def rescue clause.
    rescue_modifier: ($) =>
      prec.left(PREC.RESCUE, seq(
        field("body", $._expression),
        alias($._rescue_modifier_keyword, "rescue"),
        field("handler", $._expression),
      )),

    ternary: ($) =>
      prec.right(PREC.CONDITIONAL, seq(
        $._expression,
        "?",
        $._expression,
        ":",
        $._expression,
      )),

    unary: ($) =>
      choice(
        prec(PREC.UNARY, seq(
          choice("-", "+", "!"),
          $._expression,
        )),
        // Word not binds looser than every symbolic operator but tighter
        // than and/or, matching Ruby: not a == b is not (a == b) while
        // not x and y is (not x) and y.
        prec.right(PREC.CONDITIONAL, seq(
          "not",
          $._expression,
        )),
      ),

    scope_resolution: ($) =>
      prec.left(PREC.CALL, seq(
        $._expression,
        "::",
        choice($.constant, $.identifier),
      )),

    call: ($) =>
      prec.right(PREC.CALL, choice(
        seq(
          field("receiver", optional(seq($._expression, choice(".", "&.")))),
          field("method", $.identifier),
          "(",
          optional($.argument_list),
          ")",
          optional($.block),
        ),
        seq(
          field("receiver", optional(seq($._expression, choice(".", "&.")))),
          field("method", $.identifier),
          $.block,
        ),
      )),

    member_access: ($) =>
      prec.left(PREC.CALL - 1, seq(
        $._expression,
        choice(".", "&."),
        choice($.identifier, $.constant),
        optional($.block),
      )),

    subscript: ($) =>
      prec(PREC.CALL, seq(
        $._expression,
        "[",
        $._expression_or_closed_range,
        repeat(seq(",", $._expression_or_closed_range)),
        "]",
      )),

    lambda: ($) =>
      seq(
        "->",
        optional($.lambda_parameters),
        field("body", $.block),
      ),

    lambda_parameters: ($) =>
      seq(
        "(",
        optional(
          seq(
            $._lambda_parameter,
            repeat(seq(",", $._lambda_parameter)),
          ),
        ),
        ")",
      ),

    _lambda_parameter: ($) =>
      choice(
        $.typed_parameter,
        $.identifier,
      ),

    block: ($) =>
      choice(
        seq(
          "do",
          optional($.block_parameters),
          optional($._body),
          "end",
        ),
        seq(
          $._block_open,
          optional($.block_parameters),
          optional($._body),
          "}",
        ),
      ),

    block_parameters: ($) =>
      seq(
        "|",
        $._block_parameter,
        repeat(seq(",", $._block_parameter)),
        "|",
      ),

    _block_parameter: ($) =>
      choice(
        $.identifier,
        $.typed_parameter,
        $.destructured_parameter,
      ),

    // Destructured block parameters: do |(head, *)| ... end. Splats live
    // only inside groups, matching the interpreter.
    destructured_parameter: ($) =>
      choice(
        seq("(", $._destructured_parameter_element, repeat(seq(",", $._destructured_parameter_element)), ")"),
        seq("[", $._destructured_parameter_element, repeat(seq(",", $._destructured_parameter_element)), "]"),
      ),

    _destructured_parameter_element: ($) =>
      choice(
        $.identifier,
        $.typed_parameter,
        $.splat_target,
        $.destructured_parameter,
      ),

    argument_list: ($) =>
      seq(
        $._paren_argument,
        repeat(seq(",", $._paren_argument)),
        optional(","),
      ),

    _paren_argument: ($) =>
      choice(
        $._argument,
        alias($._endless_range_closed, $.endless_range),
      ),

    _argument: ($) =>
      choice(
        $.keyword_argument,
        $.splat_argument,
        $.double_splat_argument,
        $.block_argument,
        $._expression,
      ),

    keyword_argument: ($) =>
      seq(
        field("key", $.identifier),
        ":",
        field("value", $._expression_or_closed_range),
      ),

    splat_argument: ($) =>
      seq("*", $._expression),

    double_splat_argument: ($) =>
      seq("**", $._expression),

    block_argument: ($) =>
      seq("&", $._expression),

    // --- Primaries ---

    _primary: ($) =>
      choice(
        $.identifier,
        $.constant,
        $.integer,
        $.float,
        $.string,
        $.symbol,
        $.quoted_symbol,
        $.percent_array,
        $.regex,
        $.lambda,
        $.true,
        $.false,
        $.nil,
        $.self,
        $.instance_variable,
        $.class_variable,
        $.array,
        $.hash,
        $.parenthesized,
      ),

    parenthesized: ($) =>
      seq("(", $._expression_or_closed_range, ")"),

    array: ($) =>
      seq(
        "[",
        optional(
          seq(
            $._expression_or_closed_range,
            repeat(seq(",", $._expression_or_closed_range)),
            optional(","),
          ),
        ),
        "]",
      ),

    hash: ($) =>
      seq(
        "{",
        optional(
          seq(
            $.hash_entry,
            repeat(seq(",", $.hash_entry)),
            optional(","),
          ),
        ),
        "}",
      ),

    hash_entry: ($) =>
      choice(
        seq(
          field("key", choice($.identifier, $.string)),
          ":",
          field("value", $._expression_or_closed_range),
        ),
        // Expression-position shape literals (JSON.parse_as schemas): the
        // value reads as a type annotation. The dynamic penalty keeps the
        // expression reading for groups that parse both ways ({ id: string }),
        // so this branch only wins where only type syntax parses
        // (string | nil, array<int>).
        prec.dynamic(-1, seq(
          field("key", choice($.identifier, $.string, $.symbol, $.quoted_symbol)),
          ":",
          field("value", $.type_annotation),
        )),
        // Nullable builtin shorthand ({ name: string? }): a ?-suffixed
        // builtin type name is always a shape field, mirroring the
        // interpreter's builtin-leaf rule, while other ?-suffixed
        // identifiers ({ ok: valid? }) keep the expression reading.
        prec.dynamic(1, seq(
          field("key", choice($.identifier, $.string, $.symbol, $.quoted_symbol)),
          ":",
          field("value", alias($.nullable_builtin_type, $.type_annotation)),
        )),
        // value omission: { name:, age: } takes the value from a local of the same name
        seq(
          field("key", $.identifier),
          ":",
        ),
        // hash rocket for runtime key expressions: { current_key => "x" }
        seq(
          field("key", $._expression),
          "=>",
          field("value", $._expression_or_closed_range),
        ),
      ),

    // --- Body ---

    _body: ($) =>
      repeat1(choice($._statement, $._declaration)),

    // --- Terminals ---

    identifier: (_$) =>
      /[a-z_][a-zA-Z0-9_]*[?!]?/,

    constant: (_$) =>
      /[A-Z][a-zA-Z0-9_]*/,

    integer: (_$) =>
      token(choice(
        /0[xX][0-9a-fA-F](_?[0-9a-fA-F])*/,
        /0[bB][01](_?[01])*/,
        /0[oO][0-7](_?[0-7])*/,
        /0[dD][0-9](_?[0-9])*/,
        /\d(_?\d)*/,
      )),

    // An exponent marker makes the literal a float even without a decimal
    // point (1e3 is 1000.0), matching the interpreter.
    float: (_$) =>
      token(choice(
        /\d(_?\d)*\.\d(_?\d)*([eE][+-]?\d(_?\d)*)?/,
        /\d(_?\d)*[eE][+-]?\d(_?\d)*/,
      )),

    // Every intra-string token is immediate so the whitespace/comment extras
    // can never fire between the quote and its contents.
    string: ($) =>
      choice(
        seq(
          '"',
          repeat(choice(
            $.string_content,
            // A '#' not opening an interpolation is plain text; '#{' wins
            // over this single-character token by longest match.
            alias(token.immediate(prec(1, '#')), $.string_content),
            $.escape_sequence,
            $.interpolation,
          )),
          token.immediate('"'),
        ),
        // Single-quoted strings only recognize \' and \\; every other
        // backslash (and any #{...}) is literal text, matching the
        // interpreter.
        seq(
          "'",
          repeat(choice(
            alias(token.immediate(prec(1, /[^'\\]+/)), $.string_content),
            alias(token.immediate(/\\['\\]/), $.escape_sequence),
            alias(token.immediate('\\'), $.string_content),
          )),
          token.immediate("'"),
        ),
      ),

    string_content: (_$) =>
      token.immediate(prec(1, /[^"\\#]+/)),

    escape_sequence: (_$) =>
      token.immediate(/\\(x[0-9a-fA-F]{1,2}|u[0-9a-fA-F]{4}|[^\n])/),

    // The body re-enters the full expression grammar, so nested strings and
    // nested interpolations come along for free. Value-producing control
    // flow ("#{if flag then "yes" else "no" end}") is admitted the same way
    // as on assignment right-hand sides.
    interpolation: ($) =>
      seq(token.immediate(prec(2, '#{')), field('body', $._rhs_expression), '}'),

    // Symbols may name operators (used by alias_method, retroactive
    // visibility, and block-pass shorthand).
    symbol: (_$) =>
      token(seq(':', choice(
        /[a-zA-Z_][a-zA-Z0-9_]*[?!]?/,
        '[]=', '[]', '===', '<=>', '**', '<<', '<=', '>=', '==', '!=',
        '&&', '||',
        /[+\-*\/%<>&|!]/,
      ))),

    // Quoted symbols use the matching string quote's escapes, so an
    // escaped quote stays inside the symbol (:'don\'t').
    quoted_symbol: (_$) =>
      token(seq(':', choice(
        seq('"', /([^"\\]|\\.)*/, '"'),
        seq("'", /([^'\\]|\\.)*/, "'"),
      ))),

    percent_array: (_$) =>
      token(seq(
        '%',
        /[wWiI]/,
        choice(
          seq('[', /[^\]]*/, ']'),
          seq('(', /[^)]*/, ')'),
          seq('{', /[^}]*/, '}'),
          seq('<', /[^>]*/, '>'),
        ),
      )),

    instance_variable: (_$) =>
      /@[a-zA-Z_][a-zA-Z0-9_]*/,

    class_variable: (_$) =>
      /@@[a-zA-Z_][a-zA-Z0-9_]*/,

    true: (_$) => "true",
    false: (_$) => "false",
    nil: (_$) => "nil",
    self: (_$) => "self",

    comment: (_$) =>
      /#.*/,

    directive_comment: (_$) =>
      choice(
        /# vibe: [0-9]+\.[0-9]+/,
        /# uses: [a-z_, ]+/,
      ),
  },
});
