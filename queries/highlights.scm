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

; Break, next, and retry are named nodes
(break) @keyword
(next) @keyword
(retry) @keyword

; Function definitions
(method
  name: (identifier) @function.method)
(method
  name: (self_method_name) @function.method)
(method
  name: (setter_name) @function.method)
(method
  name: (operator_name) @function.method)

; Class, module, and enum definitions
(class
  name: (constant) @type)
(module
  name: (constant) @type)
(enum
  name: (constant) @type)
(enum
  name: (identifier) @type)
(enum_member) @constant

; Function calls
(call
  method: (identifier) @function.call)
(command_call
  method: (identifier) @function.call)

; Built-in kernel functions
((call
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
  (identifier) @type)
(qualified_type_name
  (identifier) @type)
(qualified_type_name
  (constant) @type)
(type_shape_field
  name: (identifier) @property)

; Built-in type names
((type_name
  (identifier) @type.builtin)
  (#any-of? @type.builtin
    "any" "array" "bool" "duration" "float" "hash" "int"
    "money" "number" "range" "string" "symbol" "time"
    "regex" "match_data" "error" "enum_value" "enum_type" "type" "comparable"))

; Nullable builtin shorthand in shape values ({ name: string? }) aliases
; to a leaf type_annotation node
(hash_entry
  value: (type_annotation) @type.builtin
  (#match? @type.builtin "^[a-z]+\\?$"))

; Strings
(string) @string
(escape_sequence) @string.escape
(string_content) @string

; Interpolation delimiters
(interpolation
  "#{" @punctuation.special
  "}" @punctuation.special)

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

; Constants
(constant) @type

; Built-in namespaces
((constant) @module.builtin
  (#any-of? @module.builtin
    "JSON" "Regex" "Math" "Time" "Duration"))

; Parameters
(typed_parameter
  name: [(identifier) (constant)] @variable.parameter)
(ivar_parameter
  (instance_variable) @variable.parameter)
(block_parameters
  [(identifier) (constant)] @variable.parameter)
(splat_parameter
  name: [(identifier) (constant)] @variable.parameter)
(double_splat_parameter
  name: [(identifier) (constant)] @variable.parameter)
(destructured_parameter
  [(identifier) (constant)] @variable.parameter)

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
  key: (identifier) @variable.parameter)

; Hash entry keys
(hash_entry
  key: (identifier) @property)

; Require
(require
  "require" @keyword)

; Literal import aliases name modules; references inherit this scope.
(require
  (string)
  (string . (string_content) @type .))
((call
  !receiver
  method: (identifier) @_require
  (argument_list
    (keyword_argument
      key: (identifier) @_as
      value: (string . (string_content) @type .))))
 (#eq? @_require "require")
 (#eq? @_as "as"))
((command_call
  method: (identifier) @_require
  (command_arguments
    (keyword_argument
      key: (identifier) @_as
      value: (string . (string_content) @type .))))
 (#eq? @_require "require")
 (#eq? @_as "as"))

(type_alias name: (constant) @type.definition)
(block_parameter name: [(identifier) (constant)] @variable.parameter)
(member_access ["." "&."] . (identifier) @function.method)
(class name: (identifier) @type)
(member_access ["." "&."] . (operator_name _ @function.method))
