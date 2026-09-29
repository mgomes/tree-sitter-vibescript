use super::LANGUAGE;
use tree_sitter::Parser;

fn parse(source: &str) -> tree_sitter::Tree {
    let mut parser = Parser::new();
    parser.set_language(&LANGUAGE.into()).unwrap();
    parser.parse(source, None).unwrap()
}

#[test]
fn suffixes_are_method_names_or_explicit_string_labels() {
    for source in [
        "def ok? -> bool; true; end; ok?==true",
        "def save! -> bool; true; end; save!==true",
        "text?=~/yes/",
        "text!=~/yes/",
        "def ok?(n: int); n; end; ok? 1",
        "save!(1)",
        "user.valid?",
        "list&.empty?",
        "user.Ready?",
        "def Ready?; true; end",
        "def self.save!; true; end",
        "alias ready? ok?",
        ":ok?",
        ":save!",
        "\"#{ok?==true}\"",
        "café?",
        "def é!; true; end",
        "{ready?: true, save!: false}",
        "f(ready?: true)",
        "f ready?: true",
        "def f(&block?: () -> bool); yield; end",
        "value: User? = nil",
        "h: {ready?: bool} = {}",
        "{value: comparable?}",
    ] {
        let tree = parse(source);
        assert!(
            !tree.root_node().has_error(),
            "{source}: {}",
            tree.root_node().to_sexp()
        );
    }
}

#[test]
fn suffixes_are_rejected_in_every_binding_namespace() {
    for source in [
        "READY? = 1",
        "x! = 3",
        "x?=3",
        "é! = 3",
        "x?: bool = true",
        "x! += 3",
        "x!, y = [1, 2]",
        "for x! in [1]; end",
        "[1].each { |x!| x }",
        "def f(ok?: bool); end",
        "def f(*ok!: array<int>); end",
        "def f(**ok?: hash<string, bool>); end",
        "def f(*, ok?: bool); end",
        "def f(&block!: ()); end",
        "@done? = true",
        "@@done! = true",
        "@done?",
        "@@done!",
        "class A; @done?: bool = true; end",
        "class A; @@done!: bool = true; end",
        "class A; property done?: bool; end",
        "class A; def initialize(@done?: bool); end; end",
        "class Ready?; end",
        "module Ready!; end",
        "enum Ready; Done?; end",
        "type Ready! = bool",
        "begin; 1; rescue => error!; 2; end",
        "{ready?:}",
        "f(ready?:)",
        "(x!) = 1",
        "$global?",
    ] {
        let tree = parse(source);
        assert!(
            tree.root_node().has_error(),
            "accepted {source}: {}",
            tree.root_node().to_sexp()
        );
    }
}

#[test]
fn adjacent_inequalities_never_become_assignments_or_suffixed_names() {
    for source in [
        "a!=b",
        "LIMIT!=OTHER",
        "@left!=@right",
        "@@left!=@@right",
        "user.left!=user.right",
        "M::LEFT!=M::RIGHT",
        "café!=autre",
        ":ok!=:other",
    ] {
        let tree = parse(source);
        let root = tree.root_node();
        assert!(!root.has_error(), "{source}: {}", root.to_sexp());
        let binary = root.named_child(0).unwrap();
        assert_eq!(root.named_child_count(), 1, "{source}");
        assert_eq!(binary.kind(), "binary", "{source}");
        assert_eq!(
            binary
                .child(1)
                .unwrap()
                .utf8_text(source.as_bytes())
                .unwrap(),
            "!=",
            "{source}"
        );
    }
}

#[test]
fn suffix_boundary_changes_reparse_incrementally() {
    let mut parser = Parser::new();
    parser.set_language(&LANGUAGE.into()).unwrap();
    for (before, after) in [("ok!=true", "ok!==true"), ("ok!==true", "ok!=true")] {
        let mut old = parser.parse(before, None).unwrap();
        let old_end = if before.len() > after.len() { 5 } else { 4 };
        let new_end = if after.len() > before.len() { 5 } else { 4 };
        old.edit(&tree_sitter::InputEdit {
            start_byte: 4,
            old_end_byte: old_end,
            new_end_byte: new_end,
            start_position: tree_sitter::Point::new(0, 4),
            old_end_position: tree_sitter::Point::new(0, old_end),
            new_end_position: tree_sitter::Point::new(0, new_end),
        });
        let edited = parser.parse(after, Some(&old)).unwrap();
        let fresh = parser.parse(after, None).unwrap();
        assert!(!edited.root_node().has_error());
        assert_eq!(edited.root_node().to_sexp(), fresh.root_node().to_sexp());
        let operand = edited
            .root_node()
            .named_child(0)
            .unwrap()
            .named_child(0)
            .unwrap();
        assert_eq!(
            operand.kind(),
            if after.contains("!==") {
                "method_name"
            } else {
                "identifier"
            }
        );
    }
}

#[test]
fn keyword_prefixes_do_not_turn_suffixed_methods_into_control_flow() {
    for word in [
        "def",
        "end",
        "class",
        "module",
        "enum",
        "if",
        "elsif",
        "else",
        "then",
        "while",
        "for",
        "in",
        "case",
        "when",
        "begin",
        "rescue",
        "ensure",
        "raise",
        "return",
        "yield",
        "private",
        "public",
        "protected",
        "alias",
        "alias_method",
        "property",
        "getter",
        "setter",
        "export",
        "type",
        "break",
        "next",
        "retry",
        "true",
        "false",
        "nil",
        "self",
        "require",
        "as",
    ] {
        for suffix in ['?', '!'] {
            let name = format!("{word}{suffix}");
            let source = format!("def {name} -> bool; true; end; {name}");
            let tree = parse(&source);
            let root = tree.root_node();
            assert!(!root.has_error(), "{source}: {}", root.to_sexp());
            assert_eq!(root.named_child_count(), 2, "{source}");
            assert_eq!(
                root.named_child(1).unwrap().kind(),
                "method_name",
                "{source}"
            );
        }
    }
}
