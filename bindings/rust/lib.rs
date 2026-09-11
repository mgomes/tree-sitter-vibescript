//! Vibescript 0.70.0 grammar for the [Tree-sitter](https://tree-sitter.github.io/tree-sitter/) parser.
//!
//! ```
//! let mut parser = tree_sitter::Parser::new();
//! parser
//!     .set_language(&tree_sitter_vibescript::LANGUAGE.into())
//!     .expect("Error loading Vibescript grammar");
//! let tree = parser.parse("puts [1, 2, 3].map { |n| n * 2 }", None).unwrap();
//! assert!(!tree.root_node().has_error());
//! ```

use tree_sitter_language::LanguageFn;

extern "C" {
    fn tree_sitter_vibescript() -> *const ();
}

/// The Tree-sitter language for Vibescript.
pub const LANGUAGE: LanguageFn = unsafe { LanguageFn::from_raw(tree_sitter_vibescript) };

/// Descriptions of the grammar's named nodes and fields.
pub const NODE_TYPES: &str = include_str!("../../src/node-types.json");

/// Syntax highlighting query for Vibescript.
pub const HIGHLIGHTS_QUERY: &str = include_str!("../../queries/highlights.scm");

/// Embedded language injection query for comments and regular expressions.
pub const INJECTIONS_QUERY: &str = include_str!("../../queries/injections.scm");

/// Code folding query for Vibescript.
pub const FOLDS_QUERY: &str = include_str!("../../queries/folds.scm");

#[cfg(test)]
mod tests {
    use super::*;
    use tree_sitter::{Parser, Query, QueryCursor, StreamingIterator};

    #[test]
    fn parses_language_examples() {
        let mut parser = Parser::new();
        parser.set_language(&LANGUAGE.into()).unwrap();
        for source in [
            include_str!("../../test/examples/declarations.vibe"),
            include_str!("../../test/examples/language_tour.vibe"),
        ] {
            let tree = parser.parse(source, None).unwrap();
            assert!(
                !tree.root_node().has_error(),
                "{}",
                tree.root_node().to_sexp()
            );
        }
    }

    #[test]
    fn queries_match_the_generated_grammar() {
        let language = LANGUAGE.into();
        for source in [HIGHLIGHTS_QUERY, INJECTIONS_QUERY, FOLDS_QUERY] {
            Query::new(&language, source).unwrap();
        }
    }

    #[test]
    fn removed_names_have_no_builtin_highlighting() {
        let source = "proc(1)\nlambda(2)\nsleep(3)\nProc\nTasks\nand = 1\nor = 2\nnot = 3\n";
        let mut parser = Parser::new();
        let language = LANGUAGE.into();
        parser.set_language(&language).unwrap();
        let tree = parser.parse(source, None).unwrap();
        assert!(!tree.root_node().has_error());
        let query = Query::new(&language, HIGHLIGHTS_QUERY).unwrap();
        let mut cursor = QueryCursor::new();
        let mut captures = cursor.captures(&query, tree.root_node(), source.as_bytes());
        while let Some((matched, index)) = captures.next() {
            let capture = matched.captures[*index];
            let name = query.capture_names()[capture.index as usize];
            assert!(!name.ends_with(".builtin") && name != "keyword", "{name}");
        }
    }

    #[test]
    fn scanner_recovers_after_an_incremental_edit() {
        let mut parser = Parser::new();
        parser.set_language(&LANGUAGE.into()).unwrap();
        let source = "def code -> int\n  1\nend\nmatch /id/i\n";
        let mut tree = parser.parse(source, None).unwrap();
        assert!(!tree.root_node().has_error());
        let start = source.find("/id/i").unwrap();
        tree.edit(&tree_sitter::InputEdit {
            start_byte: start,
            old_end_byte: start + 5,
            new_end_byte: start + 6,
            start_position: tree_sitter::Point::new(3, 6),
            old_end_position: tree_sitter::Point::new(3, 11),
            new_end_position: tree_sitter::Point::new(3, 12),
        });
        let edited = source.replace("/id/i", "/ids/i");
        let incremental = parser.parse(&edited, Some(&tree)).unwrap();
        let fresh = parser.parse(&edited, None).unwrap();
        assert!(!incremental.root_node().has_error());
        assert_eq!(
            incremental.root_node().to_sexp(),
            fresh.root_node().to_sexp()
        );
    }
}
