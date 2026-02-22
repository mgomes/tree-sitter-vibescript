; Keywords
[
  "def"
  "end"
  "class"
  "if"
  "elsif"
  "else"
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
  "property"
  "getter"
  "setter"
  "export"
  "and"
  "or"
] @keyword

; Break and next are named nodes
(break) @keyword
(next) @keyword

; Function definitions
(method
  name: (identifier) @function.method)
(method
  name: (self_method_name) @function.method)

; Class definitions
(class
  name: (constant) @type)

; Function calls
(call
  method: (identifier) @function.call)

; Member access with block (no-arg method calls with blocks)
(member_access
  (identifier) @function.call
  (block))

; Type annotations
(type_name
  (identifier) @type)

; Strings
(string) @string
(escape_sequence) @string.escape
(string_content) @string

; Numbers
(integer) @number
(float) @number

; Symbols
(symbol) @string.special.symbol

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
  "=="
  "!="
  "<"
  ">"
  "<="
  ">="
  "&&"
  "||"
  "="
  ".."
  "->"
  "!"
  "+="
  "-="
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
