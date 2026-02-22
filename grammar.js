/// <reference types="tree-sitter-cli/dsl" />

const PREC = {
  ASSIGNMENT: 1,
  OR: 2,
  AND: 3,
  EQUALITY: 4,
  COMPARISON: 5,
  RANGE: 6,
  ADDITIVE: 7,
  MULTIPLICATIVE: 8,
  UNARY: 9,
  CALL: 10,
};

module.exports = grammar({
  name: "vibescript",

  extras: ($) => [/\s/, $.comment],

  word: ($) => $.identifier,

  conflicts: ($) => [
    [$.simple_parameter, $._primary],
    [$.ivar_parameter, $._primary],
    [$.require, $._primary],
    [$.rescue, $._primary],
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
        $.type_name,
        repeat(seq("|", $.type_name)),
      ),

    type_name: ($) =>
      seq(
        choice(
          $.identifier,
          "nil",
        ),
        optional("?"),
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

    property_declaration: ($) =>
      seq(
        "property",
        $.identifier,
        repeat(seq(",", $.identifier)),
      ),

    getter_declaration: ($) =>
      seq(
        "getter",
        $.identifier,
        repeat(seq(",", $.identifier)),
      ),

    setter_declaration: ($) =>
      seq(
        "setter",
        $.identifier,
        repeat(seq(",", $.identifier)),
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
        $.directive_comment,
        $._expression_statement,
      ),

    _expression_statement: ($) =>
      $._expression,

    assignment: ($) =>
      prec.right(PREC.ASSIGNMENT, seq(
        $._expression,
        "=",
        $._expression,
      )),

    compound_assignment: ($) =>
      prec.right(PREC.ASSIGNMENT, seq(
        $._expression,
        choice("+=", "-="),
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
        $.binary,
        $.unary,
        $.call,
        $.member_access,
        $.subscript,
        $._primary,
      ),

    binary: ($) =>
      choice(
        prec.left(PREC.OR, seq($._expression, choice("||", "or"), $._expression)),
        prec.left(PREC.AND, seq($._expression, choice("&&", "and"), $._expression)),
        prec.left(PREC.EQUALITY, seq($._expression, choice("==", "!="), $._expression)),
        prec.left(PREC.COMPARISON, seq($._expression, choice("<", ">", "<=", ">="), $._expression)),
        prec.left(PREC.RANGE, seq($._expression, "..", $._expression)),
        prec.left(PREC.ADDITIVE, seq($._expression, choice("+", "-"), $._expression)),
        prec.left(PREC.MULTIPLICATIVE, seq($._expression, choice("*", "/", "%"), $._expression)),
      ),

    unary: ($) =>
      prec(PREC.UNARY, seq(
        choice("-", "!"),
        $._expression,
      )),

    call: ($) =>
      prec.right(PREC.CALL, seq(
        field("receiver", optional(seq($._expression, "."))),
        field("method", $.identifier),
        "(",
        optional($.argument_list),
        ")",
        optional($.block),
      )),

    member_access: ($) =>
      prec.left(PREC.CALL - 1, seq(
        $._expression,
        ".",
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
      seq(
        "do",
        optional($.block_parameters),
        optional($._body),
        "end",
      ),

    block_parameters: ($) =>
      seq(
        "|",
        $.identifier,
        repeat(seq(",", $.identifier)),
        "|",
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
      seq(
        field("key", choice($.identifier, $.string)),
        ":",
        field("value", $._expression),
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
