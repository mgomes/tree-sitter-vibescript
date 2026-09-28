use super::{LANGUAGE, LOCALS_QUERY};
use std::ops::Range;
use tree_sitter::{Parser, Query, QueryCursor, StreamingIterator};

#[derive(Debug, PartialEq)]
struct Capture {
    name: String,
    kind: String,
    text: String,
    range: Range<usize>,
}

fn captures(source: &str) -> Vec<Capture> {
    let language = LANGUAGE.into();
    let mut parser = Parser::new();
    parser.set_language(&language).unwrap();
    let tree = parser.parse(source, None).unwrap();
    assert!(!tree.root_node().has_error(), "{}", tree.root_node().to_sexp());
    let query = Query::new(&language, LOCALS_QUERY).unwrap();
    let mut cursor = QueryCursor::new();
    let mut matches = cursor.captures(&query, tree.root_node(), source.as_bytes());
    let mut result = Vec::new();
    while let Some((matched, index)) = matches.next() {
        let capture = matched.captures[*index];
        result.push(Capture {
            name: query.capture_names()[capture.index as usize].into(),
            kind: capture.node.kind().into(),
            text: capture.node.utf8_text(source.as_bytes()).unwrap().into(),
            range: capture.node.byte_range(),
        });
    }
    result
}

fn assert_definitions(source: &str, expected: &[&str]) {
    let actual: Vec<_> = captures(source)
        .into_iter()
        .filter(|capture| capture.name == "local.definition")
        .map(|capture| capture.text)
        .collect();
    assert_eq!(actual, expected, "{source}");
}

#[test]
fn require_defines_its_variable_and_captures_later_uses() {
    let source = "helpers = require(\"./helpers\")\nhelpers.format(1)\n";
    assert_definitions(source, &["helpers"]);
    let reference = source.rfind("helpers").unwrap();
    assert!(captures(source).iter().any(|capture| {
        capture.name == "local.reference" && capture.range == (reference..reference + 7)
    }));
}
