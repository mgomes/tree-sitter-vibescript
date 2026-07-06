; Keywords
[
  "def"
  "end"
  "class"
  "module"
  "if"
  "elsif"
  "else"
  "then"
  "unless"
  "while"
  "until"
  "for"
  "in"
  "do"
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
  "include"
  "extend"
  "alias"
  "alias_method"
  "property"
  "getter"
  "setter"
  "export"
  "and"
  "or"
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
  name: (operator_name) @function.method)

; Class and module definitions
(class
  name: (constant) @type)
(module
  name: (constant) @type)

; Function calls
(call
  method: (identifier) @function.call)
(command_call
  method: (identifier) @function.call)

; Callable constructors
((call
  method: (identifier) @function.builtin)
  (#any-of? @function.builtin "proc" "lambda"))

; Type annotations
(type_name
  (identifier) @type)
(type_shape_field
  name: (identifier) @property)

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

; Percent-array literals
(percent_array) @string.special

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
(simple_parameter
  (identifier) @variable.parameter)
(typed_parameter
  (identifier) @variable.parameter)
(ivar_parameter
  (instance_variable) @variable.parameter)
(block_parameters
  (identifier) @variable.parameter)
(keyword_parameter
  name: (identifier) @variable.parameter)
(splat_parameter
  (identifier) @variable.parameter)
(double_splat_parameter
  (identifier) @variable.parameter)
(block_parameter
  (identifier) @variable.parameter)
(lambda_parameters
  (identifier) @variable.parameter)

; Constants
(constant) @type

; Comments
(comment) @comment
(directive_comment) @comment

; Operators
[
  "+"
  "-"
  "*"
  "/"
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
  "+="
  "-="
  "*="
  "/="
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
