use super::LANGUAGE;
use std::collections::BTreeSet;
use tree_sitter::Parser;

#[test]
fn highlight_fixtures_parse_and_cover_the_named_node_inventory() {
    let language = LANGUAGE.into();
    let mut parser = Parser::new();
    parser.set_language(&language).unwrap();
    let mut covered = BTreeSet::new();
    for (name, source) in [
        ("calls", include_str!("../../test/highlight/calls.vibe")),
        (
            "capitalized_methods",
            include_str!("../../test/highlight/capitalized_methods.vibe"),
        ),
        (
            "control_and_imports",
            include_str!("../../test/highlight/control_and_imports.vibe"),
        ),
        (
            "definitions",
            include_str!("../../test/highlight/definitions.vibe"),
        ),
        (
            "literals",
            include_str!("../../test/highlight/literals.vibe"),
        ),
        (
            "member_access",
            include_str!("../../test/highlight/member_access.vibe"),
        ),
        (
            "parameters",
            include_str!("../../test/highlight/parameters.vibe"),
        ),
        (
            "structure",
            include_str!("../../test/highlight/structure.vibe"),
        ),
        ("types", include_str!("../../test/highlight/types.vibe")),
    ] {
        let tree = parser.parse(source, None).unwrap();
        assert!(!tree.root_node().has_error(), "{name}");
        let mut nodes = vec![tree.root_node()];
        while let Some(node) = nodes.pop() {
            if node.is_named() {
                covered.insert(node.kind().to_owned());
            }
            nodes.extend(node.children(&mut node.walk()));
        }
    }
    let expected: BTreeSet<_> = (0..language.node_kind_count() as u16)
        .filter(|id| language.node_kind_is_named(*id) && language.node_kind_is_visible(*id))
        .map(|id| language.node_kind_for_id(id).unwrap().to_owned())
        // First-line directives currently parse as ordinary comments.
        .filter(|name| name != "directive_comment")
        .collect();
    assert_eq!(
        covered, expected,
        "New node kinds need highlight audit fixtures"
    );
}
