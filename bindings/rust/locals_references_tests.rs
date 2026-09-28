use super::{captures, colors_for, LANGUAGE};
use crate::NODE_TYPES;
use std::collections::BTreeSet;
use std::ops::Range;
use tree_sitter::{Node, Parser};

// Each marked name must be a reference ($r), definition ($d), or syntactic name
// ($n). Both identifier and constant spellings exercise the same value slots.
const EXPRESSIONS: &[(&str, &str)] = &[
    ("method body", "$r"),
    ("yield", "yield $r"),
    ("parenthesized yield", "yield($r)"),
    ("multiple yield operands", "yield $r, $r"),
    ("yield keyword", "yield(key: $r)"),
    ("yield splats", "yield(*$r, **$r)"),
    ("return", "return $r"),
    ("tuple return", "return $r, $r"),
    ("parenthesized return", "return ($r)"),
    ("break", "break $r"),
    ("next", "next $r"),
    ("raise", "raise $r"),
    ("parenthesized raise", "raise($r)"),
    ("multiple raise operands", "raise $r, $r"),
    ("unary minus", "-$r"),
    ("unary plus", "+$r"),
    ("unary not", "!$r"),
    ("binary", "$r + $r"),
    ("if condition and body", "if $r\n$r\nend"),
    ("negated condition", "if !$r\n$r\nend"),
    ("elsif and else", "if false\n1\nelsif $r\n$r\nelse\n$r\nend"),
    ("while condition and body", "while $r\n$r\nend"),
    ("for iterable and body", "for item in $r\n$r\nend"),
    (
        "case subject and when patterns",
        "case $r\nwhen $r, $r then $r\nelse $r\nend",
    ),
    ("when splat", "case 1\nwhen *$r then $r\nend"),
    ("if modifier", "$r if $r"),
    ("while modifier", "$r while $r"),
    (
        "begin and rescue body",
        "begin\n$r\nrescue\n$r\nelse\n$r\nensure\n$r\nend",
    ),
    ("rescue modifier", "$r rescue $r"),
    ("interpolation", "\"#{$r}\""),
    ("keyword argument", "other(key: $r)"),
    ("bare keyword argument", "other key: $r"),
    ("shorthand keyword argument", "other($r:)"),
    ("bare shorthand keyword argument", "other $r:"),
    ("array and tuple elements", "[$r, $r]"),
    ("hash value", "{key: $r}"),
    ("shorthand hash value", "{$r:}"),
    ("nested shorthand hash value", "{key: {$r:}}"),
    ("inclusive range", "$r..$r"),
    ("exclusive range", "$r...$r"),
    ("beginless range", "(..$r)"),
    ("endless range", "($r..)"),
    ("index receiver and indices", "$r[$r, $r]"),
    ("member receiver", "$r.member"),
    ("safe member receiver", "$r&.member"),
    ("call receiver and argument", "$r.other($r)"),
    ("safe call receiver and argument", "$r&.other($r)"),
    ("receiverless call arguments", "other($r, $r)"),
    ("command call arguments", "other $r, $r"),
    ("command member receiver and argument", "$r.other $r"),
    ("computed callee", "($r)(1)"),
    ("scope receiver", "$r::Other"),
    ("parenthesized expression", "($r)"),
    ("block body", "other { $r }"),
    ("splat argument", "other(*$r)"),
    ("bare splat argument", "other *$r"),
    ("double splat argument", "other(**$r)"),
    ("bare double splat argument", "other **$r"),
    ("cast receiver", "$r.as(int)"),
    ("bare cast receiver", "$r.as int"),
    ("cast argument", "other.as($r)"),
    ("ternary", "$r ? $r : $r"),
    ("assignment value", "other = $r"),
    ("typed assignment value", "other: int = $r"),
    ("compound assignment value", "other += $r"),
    ("destructuring values", "first, second = $r, $r"),
    ("instance assignment value", "@field = $r"),
    ("class assignment value", "@@field = $r"),
    ("type name", "other: $r"),
    ("generic type argument", "other: array<$r>"),
    ("tuple type elements", "other: [$r, $r]"),
    ("shape field type", "other: {key: $r}"),
    ("qualified type root", "other: $r::Other"),
];

// These roles include definitions and names that deliberately do not perform
// lexical lookup. The last column restricts spellings where the grammar does.
const OTHER_ROLES: &[(&str, &str, &[&str])] = &[
    ("program", "$d = 1\n$r", &["localref", "Localref"]),
    (
        "class body",
        "class Box\n$d = 1\n$r\nend",
        &["localref", "Localref"],
    ),
    (
        "class variable initializer",
        "class Box\n@@field: int = $r\nend",
        &["localref", "Localref"],
    ),
    (
        "module body",
        "module Box\n$d = 1\n$r\nend",
        &["localref", "Localref"],
    ),
    ("class name", "class $d\nend", &["localref", "Localref"]),
    ("module name", "module $d\nend", &["Localref"]),
    (
        "enum name",
        "enum $d\nReady\nend",
        &["localref", "Localref"],
    ),
    ("type alias name", "type $d = int", &["Localref"]),
    (
        "require variable",
        "$d = require(\"./helper\")",
        &["localref", "Localref"],
    ),
    ("typed local", "$d: int = 1", &["localref", "Localref"]),
    ("assignment", "$d = $r", &["localref", "Localref"]),
    ("compound assignment", "$d += $r", &["localref", "Localref"]),
    ("destructuring", "$d, other = $r", &["localref", "Localref"]),
    (
        "nested destructuring",
        "(other, ($d, *$d)) = $r",
        &["localref", "Localref"],
    ),
    (
        "parenthesized target",
        "(($d)) = $r",
        &["localref", "Localref"],
    ),
    (
        "for target",
        "for $d in $r\n$r\nend",
        &["localref", "Localref"],
    ),
    (
        "block parameter",
        "other { |$d| $r }",
        &["localref", "Localref"],
    ),
    (
        "destructured parameter",
        "other { |(first, $d)| $r }",
        &["localref", "Localref"],
    ),
    (
        "method name and parameter",
        "def $n($d: int)\n$r\nend",
        &["localref", "Localref"],
    ),
    (
        "typed parameter default",
        "def other($d: int, second: int = $r)\nend",
        &["localref", "Localref"],
    ),
    (
        "bare parameter default",
        "def other $d: int, second: int = $r\nend",
        &["localref", "Localref"],
    ),
    (
        "ivar default",
        "def other($d: int, @field: int = $r)\nend",
        &["localref", "Localref"],
    ),
    (
        "rest parameter",
        "def other(*$d: array<int>)\n$r\nend",
        &["localref", "Localref"],
    ),
    (
        "keyword parameter",
        "def other(*, $d: int)\n$r\nend",
        &["localref", "Localref"],
    ),
    (
        "keyword rest parameter",
        "def other(**$d: hash<string, int>)\n$r\nend",
        &["localref", "Localref"],
    ),
    (
        "block parameter declaration",
        "def other(&$d: int -> int)\nyield 1\nend",
        &["localref", "Localref"],
    ),
    (
        "rescue binding",
        "begin\n1\nrescue => $d\n$r\nend",
        &["localref", "Localref"],
    ),
    ("rescue type", "begin\n1\nrescue $r\nend", &["Localref"]),
    (
        "self method name",
        "def self.$n\nend",
        &["localref", "Localref"],
    ),
    ("setter name", "def $n=(other: int)\nend", &["localref"]),
    (
        "accessor name",
        "class Box\nproperty $n: int\nend",
        &["localref"],
    ),
    ("alias names", "alias $n $n", &["localref"]),
    ("call name", "$n(1)", &["localref", "Localref"]),
    ("command call name", "$n 1", &["localref", "Localref"]),
    ("member name", "other.$n", &["localref", "Localref"]),
    ("scope suffix", "other::$n", &["localref", "Localref"]),
    ("constant scope root and suffix", "$r::$n", &["Localref"]),
    (
        "scoped rescue type",
        "begin\n1\nrescue $r::$n\nend",
        &["Localref"],
    ),
    ("qualified type suffix", "other: Outer::$n", &["Localref"]),
    ("hash label", "{$n: 1}", &["localref", "Localref"]),
    ("keyword label", "other($n: 1)", &["localref", "Localref"]),
    (
        "type field name",
        "other: {$n: int}",
        &["localref", "Localref"],
    ),
];

fn expand(template: &str, name: &str) -> (String, Vec<(Range<usize>, char)>) {
    let mut source = String::new();
    let mut expected = Vec::new();
    let mut rest = template;
    while let Some(index) = rest.find('$') {
        source.push_str(&rest[..index]);
        let role = rest.as_bytes()[index + 1] as char;
        assert!(matches!(role, 'r' | 'd' | 'n'));
        let start = source.len();
        source.push_str(name);
        expected.push((start..source.len(), role));
        rest = &rest[index + 2..];
    }
    source.push_str(rest);
    (source, expected)
}

fn assert_roles(source: &str, expected: &[(Range<usize>, char)]) {
    let actual = captures(source);
    for (range, role) in expected {
        for capture in ["local.reference", "local.definition"] {
            // Existing definition patterns can also have reference captures;
            // Tree-sitter resolves definitions before references at that point.
            if *role == 'd' && capture == "local.reference" {
                continue;
            }
            assert_eq!(
                actual
                    .iter()
                    .any(|item| item.range == *range && item.name == capture),
                matches!(
                    (*role, capture),
                    ('r', "local.reference") | ('d', "local.definition")
                ),
                "{capture} for {range:?} ({role}) in {source}"
            );
        }
    }
}

#[test]
fn expression_references_resolve_in_every_operand_context() {
    for (label, body) in EXPRESSIONS {
        for name in ["localref", "Localref"] {
            let template = format!("def example($d: any)\n{body}\nend\n");
            let (source, expected) = expand(&template, name);
            assert_roles(&source, &expected);
            assert_eq!(
                colors_for(&source, name),
                vec!["parameter"; expected.len()],
                "{label}: {source}"
            );
        }
    }
}

#[test]
fn declarations_and_syntactic_names_keep_their_roles() {
    for (label, template, names) in OTHER_ROLES {
        for name in *names {
            let (source, expected) = expand(template, name);
            assert_roles(&source, &expected);
            assert!(!expected.is_empty(), "{label}");
        }
    }
}

fn slot(node: Node) -> (String, String) {
    let parent = node.parent().unwrap();
    let mut cursor = parent.walk();
    assert!(cursor.goto_first_child());
    while cursor.node() != node {
        assert!(cursor.goto_next_sibling());
    }
    (
        parent.kind().into(),
        cursor.field_name().unwrap_or("").into(),
    )
}

#[test]
fn local_roles_cover_every_direct_identifier_slot_in_the_grammar() {
    let mut parser = Parser::new();
    parser.set_language(&LANGUAGE.into()).unwrap();
    let mut covered = BTreeSet::new();
    let expressions: Vec<_> = EXPRESSIONS
        .iter()
        .map(|(label, body)| (*label, format!("def example($d: any)\n{body}\nend\n")))
        .collect();
    let cases = expressions
        .iter()
        .map(|(_, source)| (source.as_str(), &["localref", "Localref"][..]))
        .chain(
            OTHER_ROLES
                .iter()
                .map(|(_, source, names)| (*source, *names)),
        );
    for (template, names) in cases {
        for name in names {
            let (source, expected) = expand(template, name);
            let tree = parser.parse(&source, None).unwrap();
            assert!(!tree.root_node().has_error(), "{source}");
            for (range, _) in expected {
                let node = tree
                    .root_node()
                    .descendant_for_byte_range(range.start, range.end)
                    .unwrap();
                assert!(matches!(node.kind(), "identifier" | "constant"), "{source}");
                covered.insert(slot(node));
            }
        }
    }
    let inventory: serde_json::Value = serde_json::from_str(NODE_TYPES).unwrap();
    let mut expected = BTreeSet::new();
    for node in inventory.as_array().unwrap() {
        let mut fields = Vec::new();
        if let Some(children) = node.get("children") {
            fields.push(("", children));
        }
        if let Some(object) = node.get("fields").and_then(|value| value.as_object()) {
            fields.extend(object.iter().map(|(field, types)| (field.as_str(), types)));
        }
        for (field, types) in fields {
            if types["types"]
                .as_array()
                .unwrap()
                .iter()
                .any(|kind| matches!(kind["type"].as_str(), Some("identifier" | "constant")))
            {
                expected.insert((node["type"].as_str().unwrap().to_owned(), field.to_owned()));
            }
        }
    }
    // Bare callees always prefer `call.method`. Computed calls expose a
    // parenthesized or compound expression instead, despite the schema union.
    let computed = ("computed_call".into(), "function".into());
    assert!(expected.remove(&computed));
    assert!(!covered.contains(&computed));
    assert_eq!(
        covered, expected,
        "Every new direct name slot needs a locals role test"
    );
}
