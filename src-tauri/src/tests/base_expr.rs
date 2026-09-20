//! Expression engine tests.
//!
//! Responsibilities:
//! - Lock operator precedence, coercion, null handling, dates and durations,
//!   formulas, and the function catalog against documented Bases examples.
//!
//! Contracts:
//! - Every case evaluates through the public `parse` + `Evaluator` path.
use super::*;
use crate::base_expr::{parse, Evaluator, Formula, Note, Value};

const TZ: i64 = -7 * 60 * 60 * 1000;

fn note() -> Note {
    Note {
        name: "Article One".into(),
        path: "Refs/Article One.md".into(),
        folder: "Refs".into(),
        ext: "md".into(),
        size: 2048.0,
        // 2025-05-27 14:30:00 in the -07:00 zone.
        ctime: crate::base_expr::civil_to_wall_ms(2025, 5, 27, 14, 30, 0) - TZ,
        mtime: crate::base_expr::civil_to_wall_ms(2025, 6, 1, 0, 0, 0) - TZ,
        properties: HashMap::from([
            ("status".to_string(), Value::Str("done".into())),
            ("price".to_string(), Value::Number(12.5)),
            ("age".to_string(), Value::Number(5.0)),
            ("first_name".to_string(), Value::Str("Ada".into())),
            (
                "tasks".to_string(),
                Value::List(vec![Value::Str("a".into()), Value::Str("b".into())]),
            ),
            (
                "due".to_string(),
                Value::Date(crate::base_expr::civil_to_wall_ms(2025, 6, 10, 0, 0, 0) - TZ),
            ),
        ]),
        tags: vec!["book".into(), "reading/fiction".into()],
        links: vec!["textbook".into()],
    }
}

fn formulas() -> Vec<Formula> {
    [
        ("ppu", "(price / age).toFixed(2)"),
        ("formatted_price", "if(price, price.toFixed(2) + \" dollars\")"),
        ("double_ppu", "formula.ppu * 2"),
        ("loop_a", "formula.loop_b"),
        ("loop_b", "formula.loop_a"),
    ]
    .into_iter()
    .map(|(name, source)| Formula {
        name: name.into(),
        compiled: parse(source),
    })
    .collect()
}

fn eval(source: &str) -> Result<Value, String> {
    let note = note();
    let formulas = formulas();
    let evaluator = Evaluator::new(&note, &formulas, TZ);
    evaluator.evaluate(&parse(source)?)
}

fn display(source: &str) -> String {
    let note = note();
    let formulas = formulas();
    let evaluator = Evaluator::new(&note, &formulas, TZ);
    let value = evaluator
        .evaluate(&parse(source).expect("expression should parse"))
        .expect("expression should evaluate");
    evaluator.display(&value)
}

#[test]
fn evaluates_operators_with_precedence_and_coercion() {
    assert_eq!(eval("1 + 2 * 3").unwrap(), Value::Number(7.0));
    assert_eq!(eval("(1 + 2) * 3").unwrap(), Value::Number(9.0));
    assert_eq!(eval("10 % 4 - -1").unwrap(), Value::Number(3.0));
    assert_eq!(display("(price / age).toFixed(2)"), "2.50");
    assert_eq!(display("first_name + \" \" + \"Lovelace\""), "Ada Lovelace");
    assert_eq!(display("\"$\" + price"), "$12.5");
    assert_eq!(eval("price > 10 && status == \"done\"").unwrap(), Value::Bool(true));
    assert_eq!(eval("price > 100 || !completed").unwrap(), Value::Bool(true));
    assert_eq!(eval("status != 'done'").unwrap(), Value::Bool(false));
    assert_eq!(eval("missing == \"x\"").unwrap(), Value::Bool(false));
    assert_eq!(eval("missing != \"x\"").unwrap(), Value::Bool(true));
    assert_eq!(eval("missing > 1").unwrap(), Value::Bool(false));
    assert_eq!(eval("price == \"12.5\"").unwrap(), Value::Bool(true));
    assert_eq!(eval("note.price == price").unwrap(), Value::Bool(true));
    assert_eq!(eval("[1, 2, 3][1]").unwrap(), Value::Number(2.0));
    assert_eq!(eval("{\"a\": 1}.a").unwrap(), Value::Number(1.0));
    assert!(parse("price +").is_err());
    assert!(parse("/abc/.matches(\"x\")").is_err());
    assert!(eval("nope()").is_err());
}

#[test]
fn evaluates_file_fields_and_functions() {
    assert_eq!(display("file.name"), "Article One");
    assert_eq!(display("file.folder"), "Refs");
    assert_eq!(display("file.ext"), "md");
    assert_eq!(eval("file.size > 1000").unwrap(), Value::Bool(true));
    assert_eq!(eval("file.hasTag(\"reading\")").unwrap(), Value::Bool(true));
    assert_eq!(eval("file.hasTag(\"nope\", \"#book\")").unwrap(), Value::Bool(true));
    assert_eq!(eval("file.inFolder(\"Refs\")").unwrap(), Value::Bool(true));
    assert_eq!(eval("file.inFolder(\"Ref\")").unwrap(), Value::Bool(false));
    assert_eq!(eval("file.hasLink(\"[[Textbook]]\")").unwrap(), Value::Bool(true));
    assert_eq!(eval("file.hasProperty(\"Status\")").unwrap(), Value::Bool(true));
    assert_eq!(eval("file.tags.length").unwrap(), Value::Number(2.0));
    assert_eq!(display("file.tags.join(\", \")"), "book, reading/fiction");
    assert_eq!(eval("file.properties.keys().contains(\"price\")").unwrap(), Value::Bool(true));
}

#[test]
fn evaluates_string_number_and_list_functions() {
    assert_eq!(display("\"hello\".contains(\"ell\")"), "true");
    assert_eq!(display("\"hello\".containsAll(\"h\", \"e\")"), "true");
    assert_eq!(display("\"hello\".containsAny(\"x\", \"e\")"), "true");
    assert_eq!(display("\"hello world\".title()"), "Hello World");
    assert_eq!(display("\"a:b:c\".replace(\":\", \"-\")"), "a-b-c");
    assert_eq!(display("\"hello\".slice(1, 4)"), "ell");
    assert_eq!(display("\"a,b,c,d\".split(\",\", 3).length"), "3");
    assert_eq!(display("\"123\".repeat(2)"), "123123");
    assert_eq!(display("\" hi \".trim().reverse()"), "ih");
    assert_eq!(display("\"HELLO\".lower().startsWith(\"he\")"), "true");
    assert_eq!(display("(2.3333).round(2)"), "2.33");
    assert_eq!(display("(2.1).ceil() + (2.9).floor()"), "5");
    assert_eq!(display("(-5).abs()"), "5");
    assert_eq!(display("number(\"3.4\") + 1"), "4.4");
    assert_eq!(display("max(5, 10, 3) - min(5, 10, 3)"), "7");
    assert_eq!(display("[1,2,3,4].filter(value > 2).map(value + 1).join(\",\")"), "4,5");
    assert_eq!(display("[1,2,3].reduce(acc + value, 0)"), "6");
    assert_eq!(display("[3,1,2].sort().reverse().join(\"\")"), "321");
    assert_eq!(display("[1,[2,3]].flat().unique().length"), "3");
    assert_eq!(display("[1,2,3].containsAll(2, 3) && [1,2].containsAny(3, 2)"), "true");
    assert_eq!(display("tasks.length"), "2");
    assert_eq!(display("list(\"x\").length"), "1");
    assert_eq!(display("missing.isEmpty() && !\"\".isTruthy()"), "true");
    assert_eq!(display("\"x\".isType(\"string\")"), "true");
    assert_eq!(display("if(price, \"$\" + price.toFixed(2), \"\")"), "$12.50");
}

#[test]
fn evaluates_dates_and_durations() {
    assert_eq!(display("file.ctime.format(\"YYYY-MM-DD HH:mm\")"), "2025-05-27 14:30");
    assert_eq!(display("file.ctime.format(\"ddd, MMM D [at] h:mm a\")"), "Tue, May 27 at 2:30 pm");
    assert_eq!(display("file.ctime"), "2025-05-27 14:30");
    assert_eq!(display("file.mtime"), "2025-06-01");
    assert_eq!(display("file.ctime.date()"), "2025-05-27");
    assert_eq!(display("file.ctime.year * 100 + file.ctime.month"), "202505");
    assert_eq!(display("date(\"2025-01-01\") + \"1M\" + \"4h\""), "2025-01-31 04:00");
    assert_eq!(display("(due - file.mtime)"), "1 week 2 days");
    assert_eq!(eval("due - file.mtime > \"1w\"").unwrap(), Value::Bool(true));
    assert_eq!(eval("due > file.mtime && file.mtime < now()").unwrap(), Value::Bool(true));
    assert_eq!(eval("file.mtime > now() - '7d'").unwrap(), Value::Bool(false));
    assert_eq!(display("duration(\"1d\") * 2"), "2 days");
    assert_eq!(display("today() == today().date()"), "true");
    assert!(eval("date(\"not a date\")").is_err());
}

#[test]
fn evaluates_formulas_with_memo_and_cycle_guard() {
    assert_eq!(display("formula.ppu"), "2.50");
    assert_eq!(display("formula.formatted_price"), "12.50 dollars");
    assert_eq!(display("formula.double_ppu"), "5");
    assert!(eval("formula.loop_a").unwrap_err().contains("refers to itself"));
    assert!(eval("formula.nope").unwrap_err().contains("Unknown formula"));
}
