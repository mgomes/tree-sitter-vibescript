[(program) (method) (class) (module) (block)] @local.scope

(block_parameter name: (identifier) @local.definition)
(typed_parameter name: (identifier) @local.definition)
(splat_parameter name: (identifier) @local.definition)
(double_splat_parameter name: (identifier) @local.definition)
(block_parameters (identifier) @local.definition)
(destructured_parameter (identifier) @local.definition)
(typed_assignment name: (identifier) @local.definition)
(assignment . (identifier) @local.definition)
(require variable: (identifier) @local.definition)
(destructuring_assignment left: (identifier) @local.definition)
(destructured_target (identifier) @local.definition)
(splat_target (identifier) @local.definition)
(for variable: (identifier) @local.definition)
(rescue binding: (identifier) @local.definition)

(identifier) @local.reference
