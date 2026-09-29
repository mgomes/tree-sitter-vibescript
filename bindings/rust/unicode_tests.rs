use super::LANGUAGE;
use tree_sitter::{Parser, Tree};

fn parse(parser: &mut Parser, source: &str) -> Tree {
    let tree = parser.parse(source, None).unwrap();
    assert!(
        !tree.root_node().has_error(),
        "{source}: {}",
        tree.root_node().to_sexp()
    );
    tree
}

#[test]
fn unicode_declarations_and_contextual_keywords_share_name_categories() {
    let mut parser = Parser::new();
    parser.set_language(&LANGUAGE.into()).unwrap();
    for (name, kind) in [
        ("A", "constant"),
        ("É", "constant"),
        ("Λ", "constant"),
        ("Ж", "constant"),
        ("Ａ", "constant"),
        ("𐐀", "constant"),
        ("𝐀", "constant"),
        ("Ᲊ", "constant"),
        ("a", "identifier"),
        ("é", "identifier"),
        ("λ", "identifier"),
        ("ж", "identifier"),
        ("ａ", "identifier"),
        ("𐐨", "identifier"),
        ("𝐚", "identifier"),
        ("ǅ", "identifier"),
        ("名", "identifier"),
        ("ʰ", "identifier"),
        ("𑼄", "identifier"),
    ] {
        let tree = parse(&mut parser, name);
        assert_eq!(
            tree.root_node().named_child(0).unwrap().kind(),
            kind,
            "{name}"
        );
        for declaration in ["class", "enum"] {
            let members = if declaration == "enum" { "; Ready" } else { "" };
            let source = format!("{declaration} {name}{members}; end");
            let tree = parse(&mut parser, &source);
            let node = tree.root_node().named_child(0).unwrap();
            assert_eq!(node.kind(), declaration, "{source}");
            assert_eq!(
                node.child_by_field_name("name").unwrap().kind(),
                kind,
                "{source}"
            );
        }
        let source = if kind == "constant" {
            format!("module {name}; end")
        } else {
            format!("module {name}")
        };
        let tree = parse(&mut parser, &source);
        let node = tree.root_node().named_child(0).unwrap();
        assert_eq!(
            node.kind(),
            if kind == "constant" {
                "module"
            } else {
                "command_call"
            },
            "{source}"
        );
        if kind == "constant" {
            assert_eq!(node.child_by_field_name("name").unwrap().kind(), "constant");
        } else {
            assert_eq!(
                node.child_by_field_name("method")
                    .unwrap()
                    .utf8_text(source.as_bytes())
                    .unwrap(),
                "module"
            );
        }
        for keyword in ["public", "protected", "module?"] {
            let source = format!("{keyword} {name}");
            let tree = parse(&mut parser, &source);
            assert_eq!(
                tree.root_node().named_child(0).unwrap().kind(),
                "command_call",
                "{source}"
            );
        }
        for source in [
            format!("module = {name}"),
            format!("alias :{name} :other"),
            format!("class C; public :{name}; end"),
            format!("f(module: {name})"),
        ] {
            parse(&mut parser, &source);
        }
    }
}
