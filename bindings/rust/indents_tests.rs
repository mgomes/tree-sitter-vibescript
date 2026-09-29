use super::{INDENTS_QUERY, LANGUAGE};
use tree_sitter::{Parser, Query, QueryCursor, StreamingIterator};

#[test]
fn outdents_generic_closers_without_capturing_expression_operators() {
    let source = "type Catalog = hash<\n  string,\n  array<\n    int\n  >\n>\n\
                  type Compact = hash<string, array<int>>\n\
                  larger = left > right\n\
                  compare = left >= right\n\
                  ordered = left <=> right\n\
                  def positive(value: int) -> bool\n  value > 0\nend\n";
    let language = LANGUAGE.into();
    let mut parser = Parser::new();
    parser.set_language(&language).unwrap();
    let tree = parser.parse(source, None).unwrap();
    assert!(!tree.root_node().has_error());
    let query = Query::new(&language, INDENTS_QUERY).unwrap();
    let mut cursor = QueryCursor::new();
    let mut captures = cursor.captures(&query, tree.root_node(), source.as_bytes());
    let mut closers = Vec::new();
    while let Some((matched, index)) = captures.next() {
        let capture = matched.captures[*index];
        if query.capture_names()[capture.index as usize] == "outdent"
            && capture.node.utf8_text(source.as_bytes()).unwrap() == ">"
        {
            let point = capture.node.start_position();
            closers.push((point.row, point.column));
        }
    }
    assert_eq!(closers, [(4, 2), (5, 0), (6, 37), (6, 38)]);
}
