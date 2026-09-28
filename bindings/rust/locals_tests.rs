use super::{LANGUAGE, LOCALS_QUERY};
use std::ops::Range;
use tree_sitter::{Parser, Query, QueryCursor, StreamingIterator};
use tree_sitter_highlight::{HighlightConfiguration, HighlightEvent, Highlighter};

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
    assert!(
        !tree.root_node().has_error(),
        "{}",
        tree.root_node().to_sexp()
    );
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

#[test]
fn structured_targets_define_every_nested_binding() {
    for (source, expected) in [
        ("first, *rest = items", vec!["first", "rest"]),
        ("*rest = items", vec!["rest"]),
        (
            "First, (Second, [Third, *Rest]) = items",
            vec!["First", "Second", "Third", "Rest"],
        ),
        ("x, (y, [z, *tail]) = value", vec!["x", "y", "z", "tail"]),
        ("(first, *rest) = items", vec!["first", "rest"]),
        ("first, * = items", vec!["first"]),
        (
            "for Upper, (Nested, *Rest) in rows\nUpper\nend",
            vec!["Upper", "Nested", "Rest"],
        ),
        (
            "for (x, (y, *tail)), *rest in rows\n  x\nend",
            vec!["x", "y", "tail", "rest"],
        ),
        (
            "items.each { |(head, [middle, *tail])| head }",
            vec!["head", "middle", "tail"],
        ),
        (
            "first, (obj.value, items[index], *items[index]) = values",
            vec!["first"],
        ),
        ("obj.first, items[index], *obj.rest = values", vec![]),
    ] {
        assert_definitions(source, &expected);
    }
}

#[test]
fn assignments_define_names_but_not_mutation_receivers() {
    for (source, expected) in [
        (
            "plain = value\nTYPED: int = 1\nlocal: int = 2\nCONSTANT = 3",
            vec!["plain", "TYPED", "local", "CONSTANT"],
        ),
        (
            "obj.field = value\nitems[index] = value\n@field = value\n@@field = value",
            vec![],
        ),
        (
            "obj.field += value\nitems[index] //= value\n@field += value",
            vec![],
        ),
        (
            "(plain) = value\n((UPPER)) = value\n(((nested))) += value",
            vec!["plain", "UPPER", "nested"],
        ),
        (
            "(obj.field) = value\n((items[index])) = value\n(@field) += value\n((items[index])) //= value\nvalue = (read)",
            vec!["value"],
        ),
    ] {
        assert_definitions(source, &expected);
    }
    for operator in ["+=", "-=", "*=", "/=", "//=", "%=", "**=", "||=", "&&="] {
        assert_definitions(&format!("total {operator} value"), &["total"]);
        assert_definitions(&format!("((TOTAL)) {operator} value"), &["TOTAL"]);
    }
}

#[test]
fn all_parameter_spellings_define_only_their_names() {
    for (source, expected) in [
        ("def f(required: int, defaulted: int = fallback, *, keyword: string = text, **options: hash<string, int>, &block: (int, string) -> bool)\nend", vec!["required", "defaulted", "keyword", "options", "block"]),
        ("def f(*rest: array<int>, keyword: int = 1, **options: hash<string, int>)\nend", vec!["rest", "keyword", "options"]),
        ("def f(*Rest: array<int>, Keyword: int = 1, **Options: hash<string, int>, &Block: () -> int)\nend", vec!["Rest", "Keyword", "Options", "Block"]),
        ("def f value: int, *, option: string = text\nend", vec!["value", "option"]),
        ("class C\ndef initialize(@field: int, Value: int)\nend\ndef self.f(value: int, &block?: () -> int)\nend\nend", vec!["C", "Value", "value", "block?"]),
        ("items.each { |plain, Typed: int, (head, (nested, *rest))| plain }", vec!["plain", "Typed", "head", "nested", "rest"]),
        ("items.each { |Upper, (Nested, *rest: array<int>)| Upper }", vec!["Upper", "Nested", "rest"]),
    ] {
        assert_definitions(source, &expected);
    }
}

#[test]
fn declarations_define_names_in_the_enclosing_scope() {
    let source = "type Alias = int\nmodule Outer\n  LIMIT = 1\n  type Inner = string\n  class Nested\n    VALUE: int = 2\n  end\nend\nclass lower\nend\nenum status\nReady\nDone\nend\n";
    assert_definitions(
        source,
        &[
            "Alias", "Outer", "LIMIT", "Inner", "Nested", "VALUE", "lower", "status",
        ],
    );
    let captures = captures(source);
    for (name, expected_scope) in [
        ("Alias", "program"),
        ("Outer", "program"),
        ("LIMIT", "module_body"),
        ("Inner", "module_body"),
        ("Nested", "module_body"),
        ("VALUE", "class_body"),
        ("lower", "program"),
        ("status", "program"),
    ] {
        let definition = captures
            .iter()
            .find(|capture| capture.name == "local.definition" && capture.text == name)
            .unwrap();
        let scope = captures
            .iter()
            .filter(|capture| {
                capture.name == "local.scope"
                    && capture.range.start <= definition.range.start
                    && definition.range.end <= capture.range.end
            })
            .min_by_key(|capture| capture.range.len())
            .unwrap();
        assert_eq!(scope.kind, expected_scope, "{name}");
    }
}

#[test]
fn loops_and_conditionals_do_not_hide_bindings() {
    let source = "for variable in items\n  assigned = variable\nend\nif ready\n  branch = value\nend\ncase assigned\nwhen variable then matched = branch\nelse other = branch\nend\n";
    assert_definitions(
        source,
        &["variable", "assigned", "branch", "matched", "other"],
    );
    let scopes: Vec<_> = captures(source)
        .into_iter()
        .filter(|capture| capture.name == "local.scope")
        .map(|capture| capture.kind)
        .collect();
    assert_eq!(scopes, ["program"]);
}

#[test]
fn rescue_bindings_have_handler_scopes() {
    assert_definitions(
        "begin\nraise \"bad\"\nrescue => Error\nError.message\nend",
        &["Error"],
    );
    let source = "error = 1\nbegin\n  raise \"bad\"\nrescue TypeError => error\n  error.message\nrescue => other\n  other.message\nensure\n  error\nend\nerror\n";
    assert_definitions(source, &["error", "error", "other"]);
    let scopes: Vec<_> = captures(source)
        .into_iter()
        .filter(|capture| capture.name == "local.scope")
        .map(|capture| capture.kind)
        .collect();
    assert_eq!(scopes, ["program", "rescue", "rescue"]);
}

#[test]
fn require_aliases_define_only_static_unescaped_names() {
    assert_definitions("Helpers = require(\"./helpers\")", &["Helpers"]);
    for (source, expected) in [
        (
            "helpers = require(\"./helpers\", as: \"Tools\")",
            vec!["helpers", "Tools"],
        ),
        ("require(\"./helpers\", as: \"tools\")", vec!["tools"]),
        ("require \"./helpers\", as: \"tools\"", vec!["tools"]),
        ("other(\"./helpers\", as: \"tools\")", vec![]),
        ("obj.require(\"./helpers\", as: \"tools\")", vec![]),
        ("require(\"./helpers\", as: \"t\\u006fools\")", vec![]),
    ] {
        assert_definitions(source, &expected);
    }
}

fn colors_for(source: &str, name: &str) -> Vec<&'static str> {
    const COLORS: [&str; 5] = [
        "unresolved",
        "binding",
        "parameter",
        "handler",
        "declaration",
    ];
    let highlights = r#"
        [(identifier) (constant)] @unresolved
        (assignment . [(identifier) (constant)] @binding)
        (typed_parameter name: [(identifier) (constant)] @parameter)
        (block_parameters [(identifier) (constant)] @parameter)
        (rescue binding: (identifier) @handler)
        (class name: (_) @declaration)
        (module name: (_) @declaration)
        (enum name: (_) @declaration)
        (type_alias name: (_) @declaration)
    "#;
    colors_for_query(source, name, highlights, &COLORS)
}

fn colors_for_query<'a>(
    source: &str,
    name: &str,
    highlights: &str,
    colors: &[&'a str],
) -> Vec<&'a str> {
    let mut config =
        HighlightConfiguration::new(LANGUAGE.into(), "vibescript", highlights, "", LOCALS_QUERY)
            .unwrap();
    config.configure(colors);
    let mut highlighter = Highlighter::new();
    let mut ranges = Vec::new();
    let mut stack = Vec::new();
    for event in highlighter
        .highlight(&config, source.as_bytes(), None, |_| None)
        .unwrap()
    {
        match event.unwrap() {
            HighlightEvent::HighlightStart(color) => stack.push(colors[color.0]),
            HighlightEvent::HighlightEnd => {
                stack.pop();
            }
            HighlightEvent::Source { start, end } => {
                ranges.push((start..end, stack.last().copied()))
            }
        }
    }
    source
        .match_indices(name)
        .map(|(offset, _)| {
            ranges
                .iter()
                .find(|(range, _)| range.contains(&offset))
                .unwrap()
                .1
                .unwrap_or("none")
        })
        .collect()
}

#[test]
fn method_locals_do_not_inherit_script_locals_or_escape_the_method() {
    let source = "value = 1\ndef f(arg: int)\narg\nvalue\nend\nvalue\narg\n";
    assert_eq!(
        colors_for(source, "value"),
        ["binding", "unresolved", "binding"]
    );
    assert_eq!(
        colors_for(source, "arg"),
        ["parameter", "parameter", "unresolved"]
    );
}

#[test]
fn blocks_inherit_outer_locals_but_keep_their_parameters_and_new_locals() {
    let source = "outer = 1\nitems.each { |item|\nouter\ninner = item\n}\nouter\nitem\ninner\n";
    assert_eq!(
        colors_for(source, "outer"),
        ["binding", "binding", "binding"]
    );
    assert_eq!(
        colors_for(source, "item"),
        ["unresolved", "parameter", "parameter", "unresolved"]
    );
    assert_eq!(colors_for(source, "inner"), ["binding", "unresolved"]);
}

#[test]
fn rescue_shadowing_ends_before_ensure_and_following_code() {
    let source =
        "error = 1\nbegin\nraise \"bad\"\nrescue => error\nerror\nensure\nerror\nend\nerror\n";
    assert_eq!(
        colors_for(source, "error"),
        ["binding", "handler", "handler", "binding", "binding"]
    );
}

#[test]
fn namespace_declarations_are_visible_outside_but_members_do_not_leak() {
    let source = "module Outer\nVALUE = 1\nclass Inner\nend\nend\nOuter\nInner\nVALUE\n";
    assert_eq!(colors_for(source, "Outer"), ["declaration", "declaration"]);
    assert_eq!(colors_for(source, "Inner"), ["declaration", "unresolved"]);
    assert_eq!(colors_for(source, "VALUE"), ["binding", "unresolved"]);
}

#[test]
fn type_aliases_and_enum_names_resolve_in_the_enclosing_scope() {
    let source = "type Alias = int\nvalue: Alias = 1\nenum Status\nReady\nend\nStatus\n";
    assert_eq!(colors_for(source, "Alias"), ["declaration", "declaration"]);
    assert_eq!(colors_for(source, "Status"), ["declaration", "declaration"]);
}

#[test]
fn import_alias_references_inherit_module_highlighting() {
    for source in [
        "helpers = require(\"./helper\", as: \"Tools\")\nTools.format(1)",
        "require(\"./helper\", as: \"Tools\")\nTools.format(1)",
        "require \"./helper\", as: \"Tools\"\nTools.format(1)",
    ] {
        assert_eq!(
            colors_for_query(
                source,
                "Tools",
                super::HIGHLIGHTS_QUERY,
                &["string", "type"]
            ),
            ["type", "type"]
        );
    }
}

#[test]
fn parameter_highlights_follow_names_and_not_default_expressions() {
    for source in [
        "def f(Value: int = fallback)\nValue\nend",
        "def f(*Value: array<int>)\nValue\nend",
        "def f(**Value: hash<string, int>)\nValue\nend",
        "items.each { |Value| Value }",
        "items.each { |(Value, rest)| Value }",
    ] {
        assert_eq!(
            colors_for_query(
                source,
                "Value",
                super::HIGHLIGHTS_QUERY,
                &["variable.parameter", "type"]
            ),
            ["variable.parameter", "variable.parameter"],
            "{source}"
        );
    }
    assert_eq!(
        colors_for_query(
            "def f(value: int = fallback)\nend",
            "fallback",
            super::HIGHLIGHTS_QUERY,
            &["variable.parameter", "type"]
        ),
        ["none"]
    );
}
