//! Expression engine for Obsidian Bases filters and formulas.
//!
//! Responsibilities:
//! - Own the value model and the evaluator: identifier resolution, member and
//!   index access, calls, operators, list callbacks, and memoized formulas.
//! - `parser` turns source text into `Expr`; `functions` holds the function
//!   catalog; `time` holds durations, civil dates, and date formatting.
//!
//! Contracts:
//! - Pure: no filesystem or clock access except `now()`/`today()`.
//! - Errors are strings meant for the base editor, never panics.
//! - Missing properties evaluate to null; null is falsy, `!=` anything, and
//!   `==` only null, matching how Obsidian treats absent frontmatter.
//! - Dates are instants in ms; `tz_offset_ms` (local minus UTC) is applied only
//!   when parsing wall-clock text or formatting for display.
//! - Not supported, by design: regular expression literals, `this`, files other
//!   than the evaluated note (`file(...)`, `link().asFile()`, backlinks).
mod functions;
mod parser;
mod time;

pub(crate) use parser::{parse, Expr};
pub(crate) use time::{civil_to_wall_ms, parse_duration, parse_wall_clock};

use parser::BinOp;
use std::cell::RefCell;
use std::collections::HashMap;
use time::{format_duration, Civil};

#[derive(Clone, Debug, PartialEq)]
pub(crate) enum Value {
    Null,
    Bool(bool),
    Number(f64),
    Str(String),
    /// Instant in milliseconds since the Unix epoch.
    Date(i64),
    /// Length of time in milliseconds.
    Duration(i64),
    List(Vec<Value>),
    Object(Vec<(String, Value)>),
    /// The note being evaluated; members resolve through `Note`.
    File,
}

pub(crate) struct Note {
    pub(crate) name: String,
    pub(crate) path: String,
    pub(crate) folder: String,
    pub(crate) ext: String,
    pub(crate) size: f64,
    pub(crate) ctime: i64,
    pub(crate) mtime: i64,
    /// Lowercased property names to typed values.
    pub(crate) properties: HashMap<String, Value>,
    pub(crate) tags: Vec<String>,
    pub(crate) links: Vec<String>,
}

pub(crate) struct Formula {
    pub(crate) name: String,
    pub(crate) compiled: Result<Expr, String>,
}

pub(crate) struct Evaluator<'a> {
    note: &'a Note,
    formulas: &'a [Formula],
    tz_offset_ms: i64,
    memo: RefCell<HashMap<String, Result<Value, String>>>,
    // Formulas currently on the evaluation stack; a name already here means a
    // reference cycle rather than a legitimate nested reference.
    evaluating: RefCell<Vec<String>>,
}

impl Value {
    pub(crate) fn truthy(&self) -> bool {
        match self {
            Value::Null => false,
            Value::Bool(value) => *value,
            Value::Number(value) => *value != 0.0,
            Value::Str(value) => !value.is_empty(),
            Value::Date(_) | Value::File => true,
            Value::Duration(value) => *value != 0,
            Value::List(values) => !values.is_empty(),
            Value::Object(entries) => !entries.is_empty(),
        }
    }

    fn type_name(&self) -> &'static str {
        match self {
            Value::Null => "null",
            Value::Bool(_) => "boolean",
            Value::Number(_) => "number",
            Value::Str(_) => "string",
            Value::Date(_) => "date",
            Value::Duration(_) => "duration",
            Value::List(_) => "list",
            Value::Object(_) => "object",
            Value::File => "file",
        }
    }

    fn as_number(&self) -> Option<f64> {
        match self {
            Value::Number(value) => Some(*value),
            Value::Bool(value) => Some(if *value { 1.0 } else { 0.0 }),
            Value::Str(text) => text.trim().parse().ok(),
            Value::Date(ms) | Value::Duration(ms) => Some(*ms as f64),
            _ => None,
        }
    }

    fn as_string(&self) -> Option<&str> {
        match self {
            Value::Str(text) => Some(text),
            _ => None,
        }
    }

    fn as_list(&self) -> Vec<Value> {
        match self {
            Value::List(values) => values.clone(),
            Value::Null => Vec::new(),
            other => vec![other.clone()],
        }
    }
}

impl<'a> Evaluator<'a> {
    pub(crate) fn new(note: &'a Note, formulas: &'a [Formula], tz_offset_ms: i64) -> Self {
        Self {
            note,
            formulas,
            tz_offset_ms,
            memo: RefCell::new(HashMap::new()),
            evaluating: RefCell::new(Vec::new()),
        }
    }

    pub(crate) fn evaluate(&self, expr: &Expr) -> Result<Value, String> {
        self.eval(expr, &[])
    }

    pub(crate) fn formula(&self, name: &str) -> Result<Value, String> {
        if let Some(result) = self.memo.borrow().get(name) {
            return result.clone();
        }

        if self.evaluating.borrow().iter().any(|active| active == name) {
            return Err(format!("Formula `{name}` refers to itself"));
        }

        let Some(formula) = self.formulas.iter().find(|formula| formula.name == name) else {
            return Err(format!("Unknown formula `{name}`"));
        };

        self.evaluating.borrow_mut().push(name.to_string());
        let result = match &formula.compiled {
            Ok(expr) => self.eval(expr, &[]),
            Err(error) => Err(error.clone()),
        };
        self.evaluating.borrow_mut().pop();
        self.memo
            .borrow_mut()
            .insert(name.to_string(), result.clone());

        result
    }

    pub(crate) fn display(&self, value: &Value) -> String {
        match value {
            Value::Null => String::new(),
            Value::Bool(value) => value.to_string(),
            Value::Number(value) => format_number(*value),
            Value::Str(text) => text.clone(),
            Value::Date(ms) => {
                let civil = Civil::from_instant(*ms, self.tz_offset_ms);
                if civil.hour == 0 && civil.minute == 0 && civil.second == 0 {
                    format!("{:04}-{:02}-{:02}", civil.year, civil.month, civil.day)
                } else {
                    format!(
                        "{:04}-{:02}-{:02} {:02}:{:02}",
                        civil.year, civil.month, civil.day, civil.hour, civil.minute
                    )
                }
            }
            Value::Duration(ms) => format_duration(*ms),
            Value::List(values) => values
                .iter()
                .map(|value| self.display(value))
                .collect::<Vec<_>>()
                .join(", "),
            Value::Object(entries) => entries
                .iter()
                .map(|(key, value)| format!("{key}: {}", self.display(value)))
                .collect::<Vec<_>>()
                .join(", "),
            Value::File => self.note.name.clone(),
        }
    }

    fn eval(&self, expr: &Expr, scope: &[(&str, Value)]) -> Result<Value, String> {
        match expr {
            Expr::Lit(value) => Ok(value.clone()),
            Expr::Ident(name) => {
                if let Some((_, value)) = scope.iter().rev().find(|(key, _)| *key == name) {
                    return Ok(value.clone());
                }
                Ok(match name.as_str() {
                    "file" => Value::File,
                    "this" => Value::Null,
                    _ => self.property(name),
                })
            }
            // `note.` and `formula.` are namespaces, not values, unless a list
            // callback happens to bind a variable with that name.
            Expr::Member(object, name) => match object.as_ref() {
                Expr::Ident(prefix) if prefix == "note" && !scope_has(scope, prefix) => {
                    Ok(self.property(name))
                }
                Expr::Ident(prefix) if prefix == "formula" && !scope_has(scope, prefix) => {
                    self.formula(name)
                }
                _ => {
                    let value = self.eval(object, scope)?;
                    self.member(&value, name)
                }
            },
            Expr::Index(object, index) => {
                let value = self.eval(object, scope)?;
                let index = self.eval(index, scope)?;
                Ok(match (&value, &index) {
                    (Value::List(values), Value::Number(position)) => {
                        let position = *position as i64;
                        // Negative indexes count from the end, as in JavaScript slices.
                        let position = if position < 0 {
                            values.len() as i64 + position
                        } else {
                            position
                        };
                        usize::try_from(position)
                            .ok()
                            .and_then(|position| values.get(position))
                            .cloned()
                            .unwrap_or(Value::Null)
                    }
                    (Value::Object(_), Value::Str(key)) => self.member(&value, key)?,
                    (Value::File, Value::Str(key)) => self.member(&value, key)?,
                    (Value::Str(text), Value::Number(position)) => text
                        .chars()
                        .nth(*position as usize)
                        .map(|character| Value::Str(character.to_string()))
                        .unwrap_or(Value::Null),
                    _ => Value::Null,
                })
            }
            Expr::Call(callee, args) => self.call(callee, args, scope),
            Expr::Not(inner) => Ok(Value::Bool(!self.eval(inner, scope)?.truthy())),
            Expr::Neg(inner) => match self.eval(inner, scope)? {
                Value::Number(value) => Ok(Value::Number(-value)),
                Value::Duration(value) => Ok(Value::Duration(-value)),
                Value::Null => Ok(Value::Null),
                other => Err(format!("Cannot negate a {}", other.type_name())),
            },
            Expr::Bin(op, left, right) => self.binary(*op, left, right, scope),
            Expr::ListLit(items) => Ok(Value::List(
                items
                    .iter()
                    .map(|item| self.eval(item, scope))
                    .collect::<Result<_, _>>()?,
            )),
            Expr::ObjectLit(entries) => Ok(Value::Object(
                entries
                    .iter()
                    .map(|(key, value)| Ok((key.clone(), self.eval(value, scope)?)))
                    .collect::<Result<_, String>>()?,
            )),
        }
    }

    fn property(&self, name: &str) -> Value {
        self.note
            .properties
            .get(&name.to_lowercase())
            .cloned()
            .unwrap_or(Value::Null)
    }

    pub(crate) fn file_field(&self, name: &str) -> Result<Value, String> {
        Ok(match name {
            "name" | "basename" => Value::Str(self.note.name.clone()),
            "path" => Value::Str(self.note.path.clone()),
            "folder" => Value::Str(self.note.folder.clone()),
            "ext" => Value::Str(self.note.ext.clone()),
            "size" => Value::Number(self.note.size),
            "ctime" => Value::Date(self.note.ctime),
            "mtime" => Value::Date(self.note.mtime),
            "tags" => Value::List(self.note.tags.iter().cloned().map(Value::Str).collect()),
            "links" => Value::List(self.note.links.iter().cloned().map(Value::Str).collect()),
            "properties" => Value::Object(
                self.note
                    .properties
                    .iter()
                    .map(|(key, value)| (key.clone(), value.clone()))
                    .collect(),
            ),
            "file" => Value::File,
            "backlinks" | "embeds" => Value::List(Vec::new()),
            _ => return Err(format!("Unknown file field `{name}`")),
        })
    }

    fn member(&self, value: &Value, name: &str) -> Result<Value, String> {
        Ok(match value {
            Value::File => self.file_field(name)?,
            Value::Null => Value::Null,
            Value::Str(text) if name == "length" => Value::Number(text.chars().count() as f64),
            Value::List(values) if name == "length" => Value::Number(values.len() as f64),
            Value::Object(entries) => entries
                .iter()
                .find(|(key, _)| key == name)
                .map(|(_, value)| value.clone())
                .unwrap_or(Value::Null),
            Value::Date(ms) => {
                let civil = Civil::from_instant(*ms, self.tz_offset_ms);
                Value::Number(match name {
                    "year" => civil.year as f64,
                    "month" => civil.month as f64,
                    "day" => civil.day as f64,
                    "hour" => civil.hour as f64,
                    "minute" => civil.minute as f64,
                    "second" => civil.second as f64,
                    "millisecond" => civil.millisecond as f64,
                    _ => return Err(format!("Unknown date field `{name}`")),
                })
            }
            other => {
                return Err(format!(
                    "`{name}` is not a field of a {}",
                    other.type_name()
                ))
            }
        })
    }

    fn call(&self, callee: &Expr, args: &[Expr], scope: &[(&str, Value)]) -> Result<Value, String> {
        match callee {
            Expr::Ident(name) if !scope_has(scope, name) => {
                let values = self.eval_args(args, scope)?;
                self.global(name, &values)
            }
            Expr::Member(object, method) => {
                let receiver = self.eval(object, scope)?;

                if receiver == Value::File {
                    let values = self.eval_args(args, scope)?;
                    return self.file_method(method, &values);
                }

                // List callbacks receive expressions, not values, so `value`,
                // `index` and `acc` can be bound per element.
                if let Value::List(items) = &receiver {
                    match method.as_str() {
                        "filter" | "map" | "reduce" => {
                            return self.list_callback(method, items, args, scope)
                        }
                        _ => {}
                    }
                }

                let values = self.eval_args(args, scope)?;
                self.method(&receiver, method, &values)
            }
            _ => Err("Only names and methods can be called".into()),
        }
    }

    fn eval_args(&self, args: &[Expr], scope: &[(&str, Value)]) -> Result<Vec<Value>, String> {
        args.iter().map(|arg| self.eval(arg, scope)).collect()
    }

    fn list_callback(
        &self,
        method: &str,
        items: &[Value],
        args: &[Expr],
        scope: &[(&str, Value)],
    ) -> Result<Value, String> {
        let Some(callback) = args.first() else {
            return Err(format!("{method}() needs an expression"));
        };
        match method {
            "reduce" => {
                let mut acc = match args.get(1) {
                    Some(initial) => self.eval(initial, &scope)?,
                    None => Value::Null,
                };
                for (index, item) in items.iter().enumerate() {
                    let mut inner = scope.to_vec();
                    inner.push(("value", item.clone()));
                    inner.push(("index", Value::Number(index as f64)));
                    inner.push(("acc", acc));
                    acc = self.eval(callback, &inner)?;
                }
                Ok(acc)
            }
            _ => {
                let mut output = Vec::new();
                for (index, item) in items.iter().enumerate() {
                    let mut inner = scope.to_vec();
                    inner.push(("value", item.clone()));
                    inner.push(("index", Value::Number(index as f64)));
                    let result = self.eval(callback, &inner)?;
                    if method == "map" {
                        output.push(result);
                    } else if result.truthy() {
                        output.push(item.clone());
                    }
                }
                Ok(Value::List(output))
            }
        }
    }

    fn binary(
        &self,
        op: BinOp,
        left: &Expr,
        right: &Expr,
        scope: &[(&str, Value)],
    ) -> Result<Value, String> {
        // `&&` and `||` short-circuit, so the right side is not evaluated up front.
        if op == BinOp::And {
            let left = self.eval(left, scope)?;
            return Ok(Value::Bool(left.truthy() && self.eval(right, scope)?.truthy()));
        }

        if op == BinOp::Or {
            let left = self.eval(left, scope)?;
            return Ok(Value::Bool(left.truthy() || self.eval(right, scope)?.truthy()));
        }

        let left = self.eval(left, scope)?;
        let right = self.eval(right, scope)?;

        match op {
            BinOp::Eq => Ok(Value::Bool(loose_equal(&left, &right))),
            BinOp::Ne => Ok(Value::Bool(!loose_equal(&left, &right))),
            BinOp::Lt | BinOp::Gt | BinOp::Le | BinOp::Ge => {
                let Some(ordering) = compare(&left, &right) else {
                    return Ok(Value::Bool(false));
                };
                Ok(Value::Bool(match op {
                    BinOp::Lt => ordering.is_lt(),
                    BinOp::Gt => ordering.is_gt(),
                    BinOp::Le => ordering.is_le(),
                    _ => ordering.is_ge(),
                }))
            }
            BinOp::Add => self.add(left, right),
            BinOp::Sub => self.subtract(left, right),
            BinOp::Mul | BinOp::Div | BinOp::Rem => match (&left, &right) {
                (Value::Null, _) | (_, Value::Null) => Ok(Value::Null),
                (Value::Duration(ms), scalar) if op == BinOp::Mul || op == BinOp::Div => {
                    let factor = scalar
                        .as_number()
                        .ok_or_else(|| "Durations scale by numbers only".to_string())?;
                    Ok(Value::Duration(if op == BinOp::Mul {
                        (*ms as f64 * factor) as i64
                    } else {
                        (*ms as f64 / factor) as i64
                    }))
                }
                _ => {
                    let (a, b) = self.numbers(&left, &right)?;
                    Ok(Value::Number(match op {
                        BinOp::Mul => a * b,
                        BinOp::Div => a / b,
                        _ => a % b,
                    }))
                }
            },
            BinOp::And | BinOp::Or => unreachable!(),
        }
    }

    fn numbers(&self, left: &Value, right: &Value) -> Result<(f64, f64), String> {
        match (left.as_number(), right.as_number()) {
            (Some(a), Some(b)) => Ok((a, b)),
            _ => Err(format!(
                "Cannot do arithmetic on {} and {}",
                left.type_name(),
                right.type_name()
            )),
        }
    }

    fn add(&self, left: Value, right: Value) -> Result<Value, String> {
        Ok(match (&left, &right) {
            // A string on either side concatenates, except `date + "7d"`, which
            // the docs treat as date arithmetic.
            (Value::Str(_), _) | (_, Value::Str(_))
                if !matches!((&left, &right), (Value::Date(_), Value::Str(text)) if parse_duration(text).is_some()) =>
            {
                Value::Str(format!("{}{}", self.display(&left), self.display(&right)))
            }
            (Value::Null, other) | (other, Value::Null) => other.clone(),
            (Value::Date(ms), other) | (other, Value::Date(ms)) => {
                Value::Date(ms + as_duration(other).ok_or("Only durations add to dates")?)
            }
            (Value::Duration(a), other) | (other, Value::Duration(a)) => {
                Value::Duration(a + as_duration(other).ok_or("Only durations add to durations")?)
            }
            (Value::List(a), other) => {
                let mut items = a.clone();
                items.extend(other.as_list());
                Value::List(items)
            }
            _ => {
                let (a, b) = self.numbers(&left, &right)?;
                Value::Number(a + b)
            }
        })
    }

    fn subtract(&self, left: Value, right: Value) -> Result<Value, String> {
        Ok(match (&left, &right) {
            (Value::Null, _) | (_, Value::Null) => Value::Null,
            (Value::Date(a), Value::Date(b)) => Value::Duration(a - b),
            (Value::Date(ms), other) => {
                Value::Date(ms - as_duration(other).ok_or("Only durations subtract from dates")?)
            }
            (Value::Duration(a), other) => Value::Duration(
                a - as_duration(other).ok_or("Only durations subtract from durations")?,
            ),
            _ => {
                let (a, b) = self.numbers(&left, &right)?;
                Value::Number(a - b)
            }
        })
    }

    fn start_of_day(&self, instant: i64) -> i64 {
        let civil = Civil::from_instant(instant, self.tz_offset_ms);
        civil_to_wall_ms(civil.year, civil.month, civil.day, 0, 0, 0) - self.tz_offset_ms
    }
}

fn scope_has(scope: &[(&str, Value)], name: &str) -> bool {
    scope.iter().any(|(key, _)| *key == name)
}

fn as_duration(value: &Value) -> Option<i64> {
    match value {
        Value::Duration(ms) => Some(*ms),
        Value::Str(text) => parse_duration(text),
        Value::Number(ms) => Some(*ms as i64),
        _ => None,
    }
}

/// `==` is loose across types because frontmatter values arrive as whatever
/// YAML made of them: `5 == "5"`, a one-element list equals its element, and
/// duration text equals a duration.
fn loose_equal(left: &Value, right: &Value) -> bool {
    match (left, right) {
        (Value::Null, Value::Null) => true,
        (Value::Null, _) | (_, Value::Null) => false,
        (Value::Str(a), Value::Str(b)) => a == b,
        (Value::Number(_), Value::Str(_)) | (Value::Str(_), Value::Number(_)) => {
            match (left.as_number(), right.as_number()) {
                (Some(a), Some(b)) => a == b,
                _ => false,
            }
        }
        (Value::Bool(a), Value::Str(b)) | (Value::Str(b), Value::Bool(a)) => a.to_string() == *b,
        (Value::Duration(a), other) | (other, Value::Duration(a)) => as_duration(other) == Some(*a),
        (Value::List(a), Value::List(b)) => {
            a.len() == b.len() && a.iter().zip(b).all(|(x, y)| loose_equal(x, y))
        }
        (Value::List(items), single) | (single, Value::List(items)) if items.len() == 1 => {
            loose_equal(&items[0], single)
        }
        _ => left == right,
    }
}

fn compare(left: &Value, right: &Value) -> Option<std::cmp::Ordering> {
    match (left, right) {
        (Value::Str(a), Value::Str(b)) => Some(a.cmp(b)),
        (Value::Date(a), Value::Date(b)) => Some(a.cmp(b)),
        (Value::Duration(a), other) => as_duration(other).map(|b| a.cmp(&b)),
        (other, Value::Duration(b)) => as_duration(other).map(|a| a.cmp(b)),
        (Value::Null, _) | (_, Value::Null) => None,
        _ => left.as_number()?.partial_cmp(&right.as_number()?),
    }
}

pub(crate) fn link_target(markup: &str) -> String {
    markup
        .trim()
        .trim_start_matches("[[")
        .trim_end_matches("]]")
        .split('|')
        .next()
        .unwrap_or("")
        .split('#')
        .next()
        .unwrap_or("")
        .trim()
        .trim_end_matches(".md")
        .to_lowercase()
}

fn format_number(value: f64) -> String {
    if value.is_finite() && value.fract() == 0.0 && value.abs() < 1e15 {
        format!("{}", value as i64)
    } else {
        let text = format!("{value:.6}");
        text.trim_end_matches('0').trim_end_matches('.').to_string()
    }
}

