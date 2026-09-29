/// <reference types="tree-sitter-cli/dsl" />

const UNICODE = require("./unicode");

const PREC = {
  ASSIGNMENT: 1,
  RESCUE: 2,
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

  extras: ($) => [/\s/, $.comment, $.block_comment],

  word: ($) => $.identifier,

  externals: ($) => [
    $.regex,
    $._block_open,
    $._command_start,
    $._endless_marker,
    $._signature_arrow,
    $._module_keyword,
    $._public_keyword,
    $._protected_keyword,
    $._alias_keyword,
    $._rescue_modifier_keyword,
    $._multiply,
    $._divide,
    $._modifier_if,
    $._modifier_while,
    $._index_open,
    $._bare_parameter_start,
    $.block_comment,
    $._keyword_label,
    $._call_open,
    $._predicate_suffix,
    $._bang_suffix,
  ],

  conflicts: ($) => [
    [$.type_shape_field, $.method_name],
    [$.type_name, $.method_name],
    [$.type_name, $.method_name, $._bare_method_name],
    [$.type_name, $._bare_method_name],
    [$.type_name, $._assignment_target],
    [$.type_name, $._assignment_target, $._destructure_target, $.parenthesized_target, $._rescue_type, $._primary],
    [$.type_name, $._assignment_target, $.parenthesized_target, $._primary],
    [$._assignment_target, $._primary],
    [$._assignment_target, $._destructure_target, $._primary],
    [$.type_name, $._assignment_target, $._destructure_target, $.parenthesized_target, $._primary],
    [$._assignment_target, $._destructure_target],
    [$.class_variable_assignment, $._assignment_target],
    [$.method_name, $._bare_method_name],
    [$._assignment_target, $.splat_target],
    [$._assignment_target, $.require],
    [$.computed_call],
    [$.keyword_separator, $.splat_parameter],
    [$.type_alias, $.type_name],
    [$.type_literal, $.hash_entry],
    [$.qualified_type_name, $.scoped_constant],
    [$.type_name, $.keyword_argument, $._primary],
    [$.type_shape_field, $.type_literal, $.hash_entry],
    [$.keyword_separator, $.splat_target],
    [$.qualified_type_name, $.type_name],
    [$.type_name],
    [$.qualified_type_name, $.type_name, $.scoped_constant, $._primary],
    [$.type_name, $._rescue_type],
    [$.type_name, $._rescue_type, $._primary],
    [$.qualified_type_name],
    [$.type_tuple, $.type_literal],
    [$.type_name, $._destructure_target, $._primary],
    [$._type],
    [$.qualified_type_name, $.type_name, $._primary],
    [$.type_name, $._assignable_receiver, $._primary],
    [$.qualified_type_name, $.type_name, $._assignable_receiver, $._primary],
    [$.type_annotation],
    [$.argument_list],
    [$._expression_or_closed_range, $._paren_argument],
    [$._expression_or_closed_range, $._argument],
    [$.type_shape, $.hash],
    [$.type_name, $._primary],
    [$.type_name, $.nil],
    [$.binary, $.beginless_range],
    [$.raise, $._expression_or_closed_range],
    [$._assignable_receiver, $._primary],
    [$._assignable_receiver, $._expression],
    [$._destructure_target, $._primary],
  ],

  rules: {
    // Enums join the choice here rather than in _declaration: the
    // interpreter rejects them anywhere but the program top level,
    // including module and method bodies.
    program: ($) =>
      repeat(choice($._statement, $._declaration, $.enum, ";")),

    // --- Declarations ---

    _declaration: ($) =>
      choice(
        $.method,
        $.class,
        $.module,
        $.export_method,
        $.type_alias,
      ),

    method: ($) =>
      method($, choice(
        $.constant,
        $.identifier,
        $.method_name,
        $.setter_name,
        $.self_method_name,
        $.operator_name,
      )),

    _module_method: ($) => method($, $.self_method_name),

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
        "+", "-", "*", "/", "//", "%", "**", "<<", "&",
        "==", "!=", "<", "<=", ">", ">=", "<=>",
        "[]", "[]=",
      ),

    self_method_name: ($) =>
      seq("self", ".", choice($.identifier, $.constant, $.method_name), optional(token.immediate("="))),

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

    bare_parameters: ($) =>
      seq($._bare_parameter_start, $._parameter, repeat(seq(",", $._parameter))),

    _parameter: ($) =>
      choice(
        $.typed_parameter,
        $.ivar_parameter,
        $.splat_parameter,
        $.double_splat_parameter,
        $.keyword_separator,
        $.block_parameter,
      ),

    keyword_separator: (_$) => "*",

    block_parameter: ($) =>
      seq("&", field("name", choice($.identifier, $.constant)), optional(choice(token.immediate("?"), alias($._predicate_suffix, "?"))), token(prec(3, ":")), $.block_type),

    block_type: ($) =>
      seq(
        choice($.type_annotation, seq("(", optional(seq(
          $.type_annotation, repeat(seq(",", $.type_annotation)),
        )), ")")),
        optional(seq("->", $.type_annotation)),
      ),

    typed_parameter: ($) =>
      seq(
        field("name", choice($.identifier, $.constant)),
        token(prec(3, ":")),
        $.type_annotation,
        optional(seq("=", $._expression)),
      ),

    ivar_parameter: ($) =>
      seq(
        $.instance_variable,
        token(prec(3, ":")), $.type_annotation,
        optional(seq("=", $._expression)),
      ),

    splat_parameter: ($) =>
      seq("*", field("name", choice($.identifier, $.constant)), token(prec(3, ":")), $.type_annotation),

    double_splat_parameter: ($) =>
      seq("**", field("name", choice($.identifier, $.constant)), token(prec(3, ":")), $.type_annotation),

    type_annotation: ($) =>
      seq(
        $._type,
        repeat(seq("|", $._type)),
      ),

    _type: ($) =>
      seq(choice(
        $.type_name,
        $.qualified_type_name,
        $.type_shape,
        $.type_tuple,
      ), optional(optionalMarker($))),

    type_alias: ($) =>
      seq("type", field("name", $.constant), "=", $.type_annotation),

    type_tuple: ($) =>
      seq("[", $.type_annotation, repeat(seq(",", $.type_annotation)), "]"),

    qualified_type_name: ($) =>
      seq(
        field("module", choice($.identifier, $.constant)),
        repeat1(seq(choice(".", token(prec(4, "::"))), $.constant)),
      ),

    type_name: ($) =>
      seq(
        choice(
          $.identifier,
          $.constant,
          "nil",
          "type",
        ),
        optional($.type_arguments),
      ),

    type_arguments: ($) =>
      seq(
        "<",
        $.type_annotation,
        repeat(seq(",", $.type_annotation)),
        ">",
      ),

    type_shape: ($) =>
      seq(
        choice("{", alias($._block_open, "{")),
        optional(seq(
          choice("...", seq($.type_shape_field,
            repeat(seq(",", $.type_shape_field)), optional(seq(",", "...")))),
          optional(","),
        )),
        "}",
      ),

    type_shape_field: ($) =>
      seq(
        field("name", choice($.identifier, $.constant, $.string, $.symbol, $.quoted_symbol)),
        optional(optionalMarker($)),
        token(prec(3, ":")),
        $.type_annotation,
      ),

    nullable_builtin_type: (_$) =>
      token(prec(2,
        /(any|int|float|number|string|bool|duration|time|money|symbol|range|array|hash|regex|match_data|error|enum_value|enum_type|comparable)\?/)),

    return_type: ($) =>
      seq(
        alias($._signature_arrow, "->"),
        $.type_annotation,
      ),

    class: ($) =>
      seq(
        "class",
        field("name", choice($.constant, $.identifier)),
        optional(field("body", alias($._class_body, $.class_body))),
        "end",
      ),

    _class_body: ($) =>
      repeat1(
        choice(
          ";",
          $.property_declaration,
          $.getter_declaration,
          $.setter_declaration,
          $.class_variable_assignment,
          $.method,
          $.visibility_directive,
          $.alias_method,
          $.class,
          $.type_alias,
          $._statement,
        ),
      ),

    module: ($) =>
      seq(
        alias($._module_keyword, "module"),
        field("name", $.constant),
        optional(field("body", alias($._module_body, $.module_body))),
        "end",
      ),

    // Members are bare word tokens, at least one required.
    enum: ($) =>
      seq(
        "enum",
        field("name", choice($.constant, $.identifier)),
        repeat(";"),
        repeat1(seq(
          field("member", alias(choice($.constant, $.identifier), $.enum_member)),
          repeat(";"),
        )),
        "end",
      ),

    _module_body: ($) =>
      repeat1(
        choice(
          ";",
          alias($._module_method, $.method),
          $.visibility_directive,
          $.module,
          $.class,
          $.type_alias,
          $.class_variable_assignment,
          $._non_alias_statement,
        ),
      ),

    scoped_constant: ($) =>
      seq($.constant, repeat1(seq(token(prec(4, "::")), $.constant))),

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
      choice($.identifier, $.method_name, alias($._alias_symbol, $.symbol), $.quoted_symbol),

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
        optional(seq(token(prec(3, ":")), $.type_annotation)),
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
        optional(seq(token(prec(3, ":")), $.type_annotation)),
        "=",
        $._expression,
      ),

    // --- Statements ---

    _statement: ($) =>
      choice($.alias, $._non_alias_statement),

    _non_alias_statement: ($) =>
      choice(
        $.return,
        $.break,
        $.next,
        $.retry,
        $.raise,
        $.require,
        $.modifier,
        $.endless_range,
        $.destructuring_assignment,
        $.typed_assignment,
        $.directive_comment,
        $._expression_statement,
      ),

    // prec.right: in `puts f 3, 4` the comma-separated list binds to the
    // innermost parenless call, matching Ruby's greedy command arguments.
    // Callees may be identifiers or constants: `UNDEF_CONST [1], [2]`
    // parses as one command call in the interpreter.
    command_call: ($) =>
      prec.right(seq(
        field("method", choice($.identifier, $.constant, alias($._bare_method_name, $.method_name), $.member_access)),
        $._command_start,
        field("arguments", $.command_arguments),
        optional($.block),
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
      ),

    modifier: ($) =>
      prec.left(seq(
        field("body", choice(
          $._expression,
          $.typed_assignment,
          $.return,
          $.break,
          $.next,
          $.retry,
          $.raise,
        )),
        field("keyword", choice(alias($._modifier_if, "if"), alias($._modifier_while, "while"))),
        field("condition", $._expression),
      )),

    _expression_statement: ($) =>
      $._expression,

    assignment: ($) =>
      prec.right(PREC.ASSIGNMENT, seq(
        choice($.parenthesized_target, $._assignment_target),
        "=",
        $._rhs_expression,
      )),

    typed_assignment: ($) =>
      seq(field("name", choice($.identifier, $.constant, $.instance_variable)),
        token(prec(3, ":")), $.type_annotation, optional(seq("=", $._rhs_expression))),

    _rhs_expression: ($) =>
      choice(
        $._expression,
        $.endless_range,
      ),

    destructuring_assignment: ($) =>
      prec.right(PREC.ASSIGNMENT, seq(
        field("left", choice(seq(
          $._destructure_target,
          repeat1(seq(",", $._destructure_target)),
        ), $.splat_target, $.destructured_target)),
        "=",
        field("right", seq(
          $._expression,
          repeat(seq(",", $._expression)),
        )),
      )),

    // Safe navigation is read-only and rejected anywhere in an assignment
    // target, so member and index targets build on dot-only receiver
    // chains: `user&.name`, `user&.profile.name`, and `user&.items[0]` all
    // error as in the interpreter.
    _assignment_target: ($) =>
      choice(
        $.identifier, alias("type", $.identifier), $.constant, $.instance_variable, $.class_variable, $.array,
        alias($._assignable_parenthesized, $.parenthesized),
        alias($._assignable_member_access, $.member_access),
        alias($._assignable_subscript, $.subscript),
      ),

    _assignable_parenthesized: ($) => prec.dynamic(2, seq("(", $._assignment_target, ")")),

    _destructure_target: ($) =>
      choice(
        $.identifier,
        $.constant,
        $.instance_variable,
        $.class_variable,
        alias($._assignable_member_access, $.member_access),
        alias($._assignable_subscript, $.subscript),
        $.splat_target,
        $.destructured_target,
      ),

    _assignable_member_access: ($) =>
      prec.left(PREC.CALL - 1, seq(
        $._assignable_receiver,
        ".",
        choice($.identifier, $.constant),
      )),

    _assignable_subscript: ($) =>
      prec(PREC.CALL, seq(
        $._assignable_receiver,
        alias($._index_open, "["),
        $._expression_or_closed_range,
        repeat(seq(",", $._expression_or_closed_range)),
        "]",
      )),

    _assignable_receiver: ($) =>
      choice(
        $.identifier,
        $.constant,
        $.instance_variable,
        $.class_variable,
        $.self,
        $.scoped_constant,
        $.scope_resolution,
        $.call,
        $.parenthesized,
        alias($._assignable_member_access, $.member_access),
        alias($._assignable_subscript, $.subscript),
      ),

    // Nested destructuring groups: x, (y, z) = [1, [2, 3]] and the
    // bracket spelling x, [y, z] = ... Two elements minimum keeps a
    // parenthesized expression unambiguous.
    destructured_target: ($) =>
      choice(
        seq("(", $._destructure_target, repeat(seq(",", $._destructure_target)), ")"),
        seq("[", $._destructure_target, repeat(seq(",", $._destructure_target)), "]"),
      ),

    splat_target: ($) =>
      seq("*", optional(choice($.identifier, $.constant, alias($._assignable_member_access, $.member_access), alias($._assignable_subscript, $.subscript)))),

    parenthesized_target: ($) =>
      prec.dynamic(3, seq("(", choice(
        $.identifier,
        $.constant,
        $.parenthesized_target,
      ), ")")),

    compound_assignment: ($) =>
      prec.right(PREC.ASSIGNMENT, seq(
        choice($.parenthesized_target, $._assignment_target),
        choice("+=", "-=", "*=", "/=", "//=", "%=", "**=", "||=", "&&="),
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
          prec.dynamic(10, seq(choice(alias($._call_open, "("), "("), optional($.argument_list), ")")),
          $.argument_list,
        )),
      )),

    require: ($) =>
      prec.dynamic(5, seq(
        field("variable", choice($.identifier, $.constant)),
        "=",
        "require",
        alias($._call_open, "("),
        $.string,
        optional(seq(",", "as", token(prec(3, ":")), $.string)),
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

    case: ($) =>
      seq(
        "case",
        optional(field("subject", $._expression)),
        repeat(";"),
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

    while: ($) =>
      seq(
        "while",
        field("condition", $._expression),
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
        optional($._body),
        "end",
      ),

    _for_target: ($) =>
      choice(
        $.identifier,
        $.constant,
        $.splat_target,
        alias($._for_target_group, $.destructured_target),
      ),

    _for_target_group: ($) =>
      choice(
        seq("(", $._for_target, repeat(seq(",", $._for_target)), ")"),
        seq("[", $._for_target, repeat(seq(",", $._for_target)), "]"),
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
        optional(seq("=>", field("binding", choice($.identifier, $.constant)))),
        optional($._body),
      ),

    _rescue_type: ($) =>
      seq(
        choice($.constant, $.scoped_constant), optional(optionalMarker($)),
        repeat(seq("|", choice($.constant, $.scoped_constant), optional(optionalMarker($)))),
      ),

    ensure: ($) =>
      seq(
        "ensure",
        optional($._body),
      ),

    // --- Expressions ---

    _expression: ($) =>
      choice(
        $.yield,
        $.command_call,
        $.assignment,
        $.compound_assignment,
        $.ternary,
        $.binary,
        $.unary,
        $.beginless_range,
        $.rescue_modifier,
        $.call,
        $.member_access,
        $.computed_call,
        $.scope_resolution,
        $.subscript,
        $._primary,
      ),

    binary: ($) =>
      choice(
        prec.left(PREC.OR, seq($._expression, "||", $._expression)),
        prec.left(PREC.AND, seq($._expression, "&&", $._expression)),
        prec.left(PREC.EQUALITY, seq($._expression, choice("==", "===", "!=", "=~", "!~"), $._expression)),
        prec.left(PREC.COMPARISON, seq($._expression, choice("<", ">", "<=", ">=", "<=>"), $._expression)),
        prec.left(PREC.RANGE, seq($._expression, choice("..", "..."), $._expression)),
        prec.left(PREC.BIT_AND, seq($._expression, "&", $._expression)),
        prec.left(PREC.SHIFT, seq($._expression, "<<", $._expression)),
        prec.left(PREC.ADDITIVE, seq($._expression, choice("+", "-"), $._expression)),
        prec.left(PREC.MULTIPLICATIVE, seq($._expression, choice(alias($._multiply, "*"), alias($._divide, "/"), "/", "//", "%"), $._expression)),
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
        token(prec(3, ":")),
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
        token(prec(4, "::")),
        choice($.identifier, $.constant),
      )),

    call: ($) =>
      prec.right(PREC.CALL, choice(
        seq(
          choice(
            field("method", choice($.identifier, $.constant, alias($._bare_method_name, $.method_name))),
            seq(field("receiver", $._expression), choice(".", "&."),
              field("method", choice($.identifier, $.constant, $.method_name))),
          ),
          alias($._call_open, "("),
          optional($.argument_list),
          ")",
          optional($.block),
        ),
        seq(
          choice(
            field("method", choice($.identifier, $.constant, alias($._bare_method_name, $.method_name))),
            seq(field("receiver", $._expression), choice(".", "&."),
              field("method", choice($.identifier, $.constant, $.method_name))),
          ),
          $.block,
        ),
      )),

    computed_call: ($) => prec.dynamic(-5, prec(PREC.CALL, choice(
      seq(field("function", $._expression), alias($._call_open, "("), optional($.argument_list), ")", optional($.block)),
      seq(field("function", $.parenthesized), $.block),
    ))),

    member_access: ($) =>
      prec.left(PREC.CALL - 1, seq(
        $._expression,
        choice(".", "&."),
        choice($.identifier, $.constant, $.method_name, $.operator_name),
        optional($.block),
      )),

    subscript: ($) =>
      prec(PREC.CALL, seq(
        $._expression,
        alias($._index_open, "["),
        $._expression_or_closed_range,
        repeat(seq(",", $._expression_or_closed_range)),
        "]",
      )),

    block: ($) =>
      seq($._block_open, optional($.block_parameters), optional($._body), "}"),

    block_parameters: ($) =>
      seq(
        "|",
        optional(seq($._block_parameter,
          repeat(seq(",", $._block_parameter)))),
        "|",
      ),

    _block_parameter: ($) =>
      choice(
        $.identifier,
        $.constant,
        $.typed_parameter,
        $.destructured_parameter,
      ),

    // Destructured block parameters: { |(head, *)| ... }. Splats live
    // only inside groups, matching the interpreter.
    destructured_parameter: ($) =>
      choice(
        seq("(", $._destructured_parameter_element, repeat(seq(",", $._destructured_parameter_element)), ")"),
        seq("[", $._destructured_parameter_element, repeat(seq(",", $._destructured_parameter_element)), "]"),
      ),

    _destructured_parameter_element: ($) =>
      choice(
        $.identifier,
        $.constant,
        $.typed_parameter,
        $.splat_target,
        $.splat_parameter,
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
        $._expression,
      ),

    keyword_argument: ($) =>
      choice(
        seq(field("key", $.method_name), token(prec(3, ":")),
          field("value", $._expression_or_closed_range)),
        prec.right(seq(
          field("key", choice($.identifier, $.constant, alias($._keyword_label, $.identifier))),
          token(prec(3, ":")),
          optional(field("value", $._expression_or_closed_range)),
        )),
      ),

    splat_argument: ($) =>
      seq("*", $._expression),

    double_splat_argument: ($) =>
      seq("**", $._expression),

    // --- Primaries ---

    _primary: ($) =>
      choice(
        $.identifier,
        alias($._bare_method_name, $.method_name),
        $.constant,
        $.integer,
        $.float,
        $.string,
        $.symbol,
        $.quoted_symbol,
        $.regex,
        alias("//", $.regex),
        $.true,
        $.false,
        $.nil,
        $.self,
        $.if,
        $.case,
        $.begin,
        $.while,
        $.for,
        $.instance_variable,
        $.class_variable,
        $.type_literal,
        $.array,
        $.hash,
        $.parenthesized,
      ),

    type_literal: ($) => prec.dynamic(-2, $.type_annotation),

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
        choice("{", alias($._block_open, "{")),
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
          field("key", choice($.identifier, $.constant, $.method_name, $.string)),
          token(prec(3, ":")),
          field("value", $._expression_or_closed_range),
        ),
        // Expression-position shape literals (JSON.parse_as schemas): the
        // value reads as a type annotation. The dynamic penalty keeps the
        // expression reading for groups that parse both ways ({ id: string }),
        // so this branch only wins where only type syntax parses
        // (string | nil, array<int>).
        prec.dynamic(-1, seq(
          field("key", choice($.identifier, $.constant, $.method_name, $.string)),
          token(prec(3, ":")),
          field("value", $.type_annotation),
        )),
        // Nullable builtin shorthand ({ name: string? }): a ?-suffixed
        // builtin type name is always a shape field, mirroring the
        // interpreter's builtin-leaf rule, while other ?-suffixed
        // identifiers ({ ok: valid? }) keep the expression reading.
        prec.dynamic(1, seq(
          field("key", choice($.identifier, $.constant, $.method_name, $.string)),
          token(prec(3, ":")),
          field("value", alias($.nullable_builtin_type, $.type_annotation)),
        )),
        // value omission: { name:, age: } takes the value from a local of the same name
        seq(
          field("key", choice($.identifier, $.constant)),
          token(prec(3, ":")),
        ),
      ),

    // --- Body ---

    _body: ($) =>
      repeat1(choice($._non_alias_statement, $.class, $.method, ";")),

    // --- Terminals ---

    method_name: ($) => seq(choice($.identifier, $.constant), methodSuffix($)),

    _bare_method_name: ($) => seq($.identifier, methodSuffix($)),

    identifier: (_$) =>
      new RegExp(UNICODE.identifier, "u"),

    constant: (_$) =>
      new RegExp(UNICODE.constant, "u"),

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
      token.immediate(/\\(x[0-9a-fA-F]{1,2}|u[0-9a-fA-F]{4}|[\s\S])/),

    // The body re-enters the full expression grammar, so nested strings and
    // nested interpolations come along for free. Value-producing control
    // flow ("#{if flag then "yes" else "no" end}") is admitted the same way
    // as on assignment right-hand sides.
    interpolation: ($) =>
      seq(token.immediate(prec(2, '#{')), field('body', $._rhs_expression), '}'),

    // Alias targets follow another name directly; their colon must beat the
    // annotation colon without changing ordinary `property name:Type` lexing.
    symbol: ($) => symbol($, 0),
    _alias_symbol: ($) => symbol($, 4),

    // Quoted symbols use the matching string quote's escapes, so an
    // escaped quote stays inside the symbol (:'don\'t').
    quoted_symbol: (_$) =>
      token(seq(':', choice(
        seq('"', /([^"\\]|\\[\s\S])*/, '"'),
        seq("'", /([^'\\]|\\[\s\S])*/, "'"),
      ))),

    instance_variable: (_$) =>
      new RegExp("@" + UNICODE.variable, "u"),

    class_variable: (_$) =>
      new RegExp("@@" + UNICODE.variable, "u"),

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

function method($, name) {
  return seq(
    optional(field("visibility", $._visibility_modifier)),
    "def",
    field("name", name),
    optional(choice($.parameters, $.bare_parameters)),
    optional($.return_type),
    optional($._body),
    optional(seq(repeat1($.rescue), optional($.else))),
    optional($.ensure),
    "end",
  );
}

function methodSuffix($) {
  return choice(alias($._predicate_suffix, "?"), alias($._bang_suffix, "!"));
}

function optionalMarker($) {
  return choice("?", alias($._predicate_suffix, "?"));
}

function symbol($, priority) {
  return prec.right(choice(
    seq(token(prec(priority, seq(":", new RegExp(UNICODE.symbol, "u")))), optional(methodSuffix($))),
    token(prec(priority, seq(":", choice(
      "[]=", "[]", "===", "<=>", "**", "<<", "<=", ">=", "==", "!=",
      "&&", "||", /[+\-*\/%<>&|!]/,
    )))),
  ));
}
