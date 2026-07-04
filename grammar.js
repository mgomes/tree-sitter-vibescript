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
  ],

  conflicts: ($) => [
    [$.simple_parameter, $._primary],
    [$.ivar_parameter, $._primary],
    [$.require, $._primary],
    [$.rescue, $._primary],
    [$.modifier, $._expression_statement],
    [$.splat_target, $._primary],
    [$.type_annotation],
  ],

  rules: {
    program: ($) =>
      repeat(choice($._statement, $._declaration)),

    // --- Declarations ---

    _declaration: ($) =>
      choice(
        $.method,
        $.class,
        $.export_method,
      ),

    method: ($) =>
      seq(
        optional("private"),
        "def",
        field("name", choice($.identifier, $.self_method_name)),
        optional($.parameters),
        optional($.return_type),
        optional($._body),
        "end",
      ),

    self_method_name: ($) =>
      seq("self", ".", $.identifier),

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
        $.ivar_parameter,
        $.simple_parameter,
      ),

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

    type_annotation: ($) =>
      seq(
        $._type,
        repeat(seq("|", $._type)),
      ),

    _type: ($) =>
      choice(
        $.type_name,
        $.type_shape,
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

    type_shape_field: ($) =>
      seq(
        field("name", $.identifier),
        ":",
        $.type_annotation,
      ),

    return_type: ($) =>
      seq(
        "->",
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
        ),
      ),

    accessor_name: ($) =>
      seq(
        $.identifier,
        optional(seq(":", $.type_annotation)),
      ),

    property_declaration: ($) =>
      seq(
        "property",
        $.accessor_name,
        repeat(seq(",", $.accessor_name)),
      ),

    getter_declaration: ($) =>
      seq(
        "getter",
        $.accessor_name,
        repeat(seq(",", $.accessor_name)),
      ),

    setter_declaration: ($) =>
      seq(
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
        $.raise,
        $.yield,
        $.require,
        $.modifier,
        $.destructuring_assignment,
        $.command_call,
        $.directive_comment,
        $._expression_statement,
      ),

    command_call: ($) =>
      prec.left(seq(
        field("method", $.identifier),
        $._command_start,
        field("arguments", $.command_arguments),
      )),

    command_arguments: ($) =>
      seq(
        $._argument,
        repeat(seq(",", $._argument)),
      ),

    modifier: ($) =>
      prec.left(seq(
        field("body", $._expression),
        field("keyword", choice("if", "unless", "while", "until")),
        field("condition", $._expression),
      )),

    _expression_statement: ($) =>
      $._expression,

    assignment: ($) =>
      prec.right(PREC.ASSIGNMENT, seq(
        $._expression,
        "=",
        $._expression,
      )),

    destructuring_assignment: ($) =>
      prec.right(PREC.ASSIGNMENT, seq(
        field("left", seq(
          $._destructure_target,
          repeat1(seq(",", $._destructure_target)),
        )),
        "=",
        field("right", $._expression),
      )),

    _destructure_target: ($) =>
      choice(
        $.identifier,
        $.instance_variable,
        $.splat_target,
      ),

    splat_target: ($) =>
      seq("*", optional($.identifier)),

    compound_assignment: ($) =>
      prec.right(PREC.ASSIGNMENT, seq(
        $._expression,
        choice("+=", "-=", "*=", "/=", "%=", "**=", "||=", "&&="),
        $._expression,
      )),

    return: ($) =>
      prec.right(seq("return", optional($._expression))),

    break: (_$) => "break",

    next: (_$) => "next",

    raise: ($) =>
      seq("raise", "(", $._expression, ")"),

    yield: ($) =>
      prec.right(seq(
        "yield",
        optional(seq("(", optional($.argument_list), ")")),
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
        optional($._body),
        repeat($.elsif),
        optional($.else),
        "end",
      ),

    elsif: ($) =>
      seq(
        "elsif",
        field("condition", $._expression),
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
        optional($._body),
        optional($.else),
        "end",
      ),

    case: ($) =>
      seq(
        "case",
        field("subject", $._expression),
        repeat1($.when),
        optional($.else),
        "end",
      ),

    when: ($) =>
      seq(
        "when",
        $._expression,
        repeat(seq(",", $._expression)),
        optional($._body),
      ),

    while: ($) =>
      seq(
        "while",
        field("condition", $._expression),
        optional($._body),
        "end",
      ),

    until: ($) =>
      seq(
        "until",
        field("condition", $._expression),
        optional($._body),
        "end",
      ),

    for: ($) =>
      seq(
        "for",
        field("variable", $.identifier),
        "in",
        field("iterable", $._expression),
        optional($._body),
        "end",
      ),

    begin: ($) =>
      seq(
        "begin",
        optional($._body),
        repeat($.rescue),
        optional($.ensure),
        "end",
      ),

    rescue: ($) =>
      seq(
        "rescue",
        optional(prec.dynamic(10, seq("(", $.constant, ")"))),
        optional($._body),
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

    ternary: ($) =>
      prec.right(PREC.CONDITIONAL, seq(
        $._expression,
        "?",
        $._expression,
        ":",
        $._expression,
      )),

    unary: ($) =>
      prec(PREC.UNARY, seq(
        choice("-", "+", "!"),
        $._expression,
      )),

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
        $.identifier,
        optional($.block),
      )),

    subscript: ($) =>
      prec(PREC.CALL, seq(
        $._expression,
        "[",
        $._expression,
        "]",
      )),

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
      ),

    argument_list: ($) =>
      seq(
        $._argument,
        repeat(seq(",", $._argument)),
        optional(","),
      ),

    _argument: ($) =>
      choice(
        $.keyword_argument,
        $._expression,
      ),

    keyword_argument: ($) =>
      seq(
        field("key", $.identifier),
        ":",
        field("value", $._expression),
      ),

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
      seq("(", $._expression, ")"),

    array: ($) =>
      seq(
        "[",
        optional(
          seq(
            $._expression,
            repeat(seq(",", $._expression)),
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
          field("value", $._expression),
        ),
        // value omission: { name:, age: } takes the value from a local of the same name
        seq(
          field("key", $.identifier),
          ":",
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
      /\d[\d_]*/,

    float: (_$) =>
      /\d[\d_]*\.\d[\d_]*/,

    string: ($) =>
      seq(
        '"',
        repeat(choice($.escape_sequence, $.string_content)),
        '"',
      ),

    string_content: (_$) =>
      /[^"\\]+/,

    escape_sequence: (_$) =>
      /\\[nrt\\"]/,

    symbol: (_$) =>
      /:[a-zA-Z_][a-zA-Z0-9_]*/,

    quoted_symbol: (_$) =>
      token(seq(':', '"', /[^"]*/, '"')),

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
