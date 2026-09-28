[(program) (class_body) (module_body) (block) (rescue)] @local.scope

((method) @local.scope
 (#set! local.scope-inherits false))

(block_parameter name: [(identifier) (constant)] @local.definition)
(typed_parameter name: [(identifier) (constant)] @local.definition)
(splat_parameter name: [(identifier) (constant)] @local.definition)
(double_splat_parameter name: [(identifier) (constant)] @local.definition)
(block_parameters [(identifier) (constant)] @local.definition)
(destructured_parameter [(identifier) (constant)] @local.definition)
(typed_assignment name: [(identifier) (constant)] @local.definition)
(assignment . [(identifier) (constant)] @local.definition)
(compound_assignment . [(identifier) (constant)] @local.definition)
(require variable: [(identifier) (constant)] @local.definition)
(require
  (string)
  (string . (string_content) @local.definition .))
((call
  !receiver
  method: (identifier) @_require
  (argument_list
    (keyword_argument
      key: (identifier) @_as
      value: (string . (string_content) @local.definition .))))
 (#eq? @_require "require")
 (#eq? @_as "as"))
((command_call
  method: (identifier) @_require
  (command_arguments
    (keyword_argument
      key: (identifier) @_as
      value: (string . (string_content) @local.definition .))))
 (#eq? @_require "require")
 (#eq? @_as "as"))
(destructuring_assignment left: [(identifier) (constant)] @local.definition)
(destructured_target [(identifier) (constant)] @local.definition)
(splat_target [(identifier) (constant)] @local.definition)
(parenthesized_target [(identifier) (constant)] @local.definition)
(for variable: [(identifier) (constant)] @local.definition)
(rescue binding: [(identifier) (constant)] @local.definition)

(class name: [(identifier) (constant)] @local.definition)
(module name: (constant) @local.definition)
(enum name: [(identifier) (constant)] @local.definition)
(type_alias name: (constant) @local.definition)

[(identifier) (constant)] @local.reference
