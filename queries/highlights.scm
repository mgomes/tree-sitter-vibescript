; Constants
(constant) @type

; Built-in namespaces
((constant) @module.builtin
  (#any-of? @module.builtin
    "JSON" "Regex" "Math" "Time" "Duration"))

; Ordinary names are variables unless a syntactic role overrides them.
(identifier) @variable

; Keywords
[
  "def"
  "end"
  "class"
  "module"
  "enum"
  "if"
  "elsif"
  "else"
  "then"
  "while"
  "for"
  "in"
  "case"
  "when"
  "begin"
  "rescue"
  "ensure"
  "raise"
  "return"
  "yield"
  "private"
  "public"
  "protected"
  "alias"
  "alias_method"
  "property"
  "getter"
  "setter"
  "export"
  "type"
] @keyword

; Control-flow values keep their own captures.
"break" @keyword
"next" @keyword
(retry) @keyword

; Class, module, and enum definitions
(class
  name: [(identifier) (constant)] @type)
(module
  name: (constant) @type)
(enum
  name: (constant) @type)
(enum
  name: (identifier) @type)
(enum_member) @constant

; Function calls
(call
  method: [(identifier) (constant)] @function.call)
(command_call
  method: [(identifier) (constant)] @function.call)

; Built-in kernel functions
((call
  !receiver
  method: (identifier) @function.builtin)
  (#any-of? @function.builtin
    "assert" "format" "loop" "money" "money_cents" "p"
    "print" "puts" "rand" "random_id" "srand"
    "to_float" "to_int" "uuid" "warn"))
((command_call
  method: (identifier) @function.builtin)
  (#any-of? @function.builtin
    "assert" "format" "loop" "money" "money_cents" "p"
    "print" "puts" "rand" "random_id" "srand"
    "to_float" "to_int" "uuid" "warn"))

; Type annotations
(type_name
  [(identifier) (constant)] @type)
(type_name
  ["type" "nil"] @type.builtin)
(qualified_type_name
  (identifier) @type)
(qualified_type_name
  (constant) @type)
(type_shape_field
  name: [(identifier) (constant)] @property)

; Built-in type names, including the optional suffix retained in name tokens.
((type_name
  (identifier) @type.builtin)
  (#match? @type.builtin "^(any|array|bool|duration|float|hash|int|money|number|range|string|symbol|time|regex|match_data|error|enum_value|enum_type|type|comparable)\\??$"))

; Nullable builtin shorthand in shape values ({ name: string? }) aliases
; to a leaf type_annotation node
(hash_entry
  value: (type_annotation) @type.builtin
  (#match? @type.builtin "^(any|int|float|number|string|bool|duration|time|money|symbol|range|array|hash|regex|match_data|error|enum_value|enum_type|comparable)\\?$"))

; Strings
(string) @string
(escape_sequence) @string.escape
(string_content) @string

; Numbers
(integer) @number
(float) @number

; Symbols
(symbol) @string.special.symbol
(quoted_symbol) @string.special.symbol

; Regular expressions
(regex) @string.regexp

; Booleans and nil
(true) @constant.builtin
(false) @constant.builtin
(nil) @constant.builtin

; Self
(self) @variable.builtin

; Instance and class variables
(instance_variable) @property
(class_variable) @property

; Parameters
(keyword_separator) @operator
(typed_parameter
  name: [(identifier) (constant)] @variable.parameter)
(ivar_parameter
  . (instance_variable) @variable.parameter)
(block_parameters
  [(identifier) (constant)] @variable.parameter)
(splat_parameter
  name: [(identifier) (constant)] @variable.parameter)
(double_splat_parameter
  name: [(identifier) (constant)] @variable.parameter)
(destructured_parameter
  [(identifier) (constant)] @variable.parameter)
(destructured_parameter
  (splat_target [(identifier) (constant)] @variable.parameter))

; Rescue bindings
(rescue
  binding: [(identifier) (constant)] @variable)

; Comments
(comment) @comment
(block_comment) @comment
(directive_comment) @comment

; Operators
[
  "+"
  "-"
  "*"
  "/"
  "//"
  "%"
  "**"
  "<<"
  "=="
  "==="
  "!="
  "=~"
  "!~"
  "<"
  ">"
  "<="
  ">="
  "<=>"
  "&&"
  "||"
  "&"
  "="
  ".."
  "..."
  "::"
  "&."
  "?"
  "->"
  "!"
  "=>"
  "+="
  "-="
  "*="
  "/="
  "//="
  "%="
  "**="
  "||="
  "&&="
] @operator

; Punctuation
[
  "("
  ")"
  "["
  "]"
  "{"
  "}"
] @punctuation.bracket

; Delimiters
[
  ";"
  ","
  ":"
  "."
  "|"
] @punctuation.delimiter

; Keyword arguments
(keyword_argument
  key: [(identifier) (constant)] @variable.parameter)

; Hash entry keys
(hash_entry
  key: [(identifier) (constant)] @property)

; Require
(require
  "require" @keyword)
(require "as" @variable.parameter)

; Literal import aliases name modules; references inherit this scope.
(require
  (string)
  (string . (string_content) @type .))
((call
  !receiver
  method: (identifier) @function.call
  (argument_list
    (keyword_argument
      key: (identifier) @variable.parameter
      value: (string . (string_content) @type .))))
 (#eq? @function.call "require")
 (#eq? @variable.parameter "as"))
((command_call
  method: (identifier) @function.call
  arguments: (command_arguments
    (keyword_argument
      key: (identifier) @variable.parameter
      value: (string . (string_content) @type .))))
 (#eq? @function.call "require")
 (#eq? @variable.parameter "as"))

(type_alias name: (constant) @type.definition)
(block_parameter name: [(identifier) (constant)] @variable.parameter)
(member_access ["." "&."] . [(identifier) (constant)] @function.method)
(member_access ["." "&."] . (operator_name _ @function.method))

; Function definitions
(method
  name: [(identifier) (constant)] @function.method)
(method
  name: (self_method_name
    [(identifier) (constant)] @function.method))
(self_method_name "self" @variable.builtin)
(method
  name: (setter_name
    (identifier) @function.method
    "=" @function.method))
(method
  name: (operator_name _ @function.method))

(accessor_name (identifier) @property)
(alias name: (identifier) @function.method)
(alias target: (identifier) @function.method)

; Interpolation delimiters
(interpolation
  "#{" @punctuation.special
  "}" @punctuation.special)
(type_annotation "|" @operator)

; Casts are member calls; unrelated functions and later arguments are values.
((call
  receiver: (_)
  method: (identifier) @function.call
  (argument_list . (identifier) @type.builtin .))
 (#eq? @function.call "as")
 (#match? @type.builtin "^(any|array|bool|duration|float|hash|int|money|number|range|string|symbol|time|regex|match_data|error|enum_value|enum_type|type|comparable)\\??$"))
((command_call
  method: (member_access ["." "&."] . (identifier) @function.method)
  arguments: (command_arguments . (identifier) @type.builtin .))
 (#eq? @function.method "as")
 (#match? @type.builtin "^(any|array|bool|duration|float|hash|int|money|number|range|string|symbol|time|regex|match_data|error|enum_value|enum_type|type|comparable)\\??$"))

((call
  receiver: (constant) @module.builtin
  method: (identifier) @function.call
  (argument_list . (_) . (identifier) @type.builtin .))
 (#eq? @module.builtin "JSON")
 (#eq? @function.call "parse_as")
 (#match? @type.builtin "^(any|array|bool|duration|float|hash|int|money|number|range|string|symbol|time|regex|match_data|error|enum_value|enum_type|type|comparable)\\??$"))
