//! The Bases function catalog.
//!
//! Responsibilities:
//! - Global functions (`if`, `now`, `date`, `max`, ...), file methods
//!   (`hasTag`, `inFolder`, ...), and the per-type methods on strings, numbers,
//!   dates, lists, and objects.
//!
//! Contracts:
//! - Each function is dispatched by the receiver's type; a method that does not
//!   exist for that type is an error naming the type.
//! - Null receivers return null so a missing property never aborts a formula.
use super::time::{format_date, now_ms, relative_time, Civil};
use super::{compare, loose_equal, Evaluator, Value};
use std::time::{SystemTime, UNIX_EPOCH};

impl Evaluator<'_> {
    pub(super) fn global(&self, name: &str, args: &[Value]) -> Result<Value, String> {
        let first = args.first().cloned().unwrap_or(Value::Null);

        Ok(match name {
            "if" => {
                if first.truthy() {
                    args.get(1).cloned().unwrap_or(Value::Null)
                } else {
                    args.get(2).cloned().unwrap_or(Value::Null)
                }
            }
            "now" => Value::Date(now_ms()),
            "today" => Value::Date(self.start_of_day(now_ms())),
            "date" => match &first {
                Value::Date(_) => first,
                Value::Str(text) => Value::Date(
                    super::parse_wall_clock(text)
                        .map(|wall| wall - self.tz_offset_ms)
                        .ok_or_else(|| format!("Cannot read `{text}` as a date"))?,
                ),
                Value::Number(ms) => Value::Date(*ms as i64),
                other => return Err(format!("date() cannot read a {}", other.type_name())),
            },
            "duration" => Value::Duration(
                first
                    .as_string()
                    .and_then(super::parse_duration)
                    .ok_or_else(|| format!("Cannot read {} as a duration", self.display(&first)))?,
            ),
            "number" => first
                .as_number()
                .map(Value::Number)
                .ok_or_else(|| format!("Cannot read {} as a number", self.display(&first)))?,
            "list" => Value::List(first.as_list()),
            "max" | "min" => {
                let numbers: Vec<f64> = args
                    .iter()
                    .flat_map(Value::as_list)
                    .filter_map(|value| value.as_number())
                    .collect();
                let picked = if name == "max" {
                    numbers.iter().cloned().fold(f64::NEG_INFINITY, f64::max)
                } else {
                    numbers.iter().cloned().fold(f64::INFINITY, f64::min)
                };
                if numbers.is_empty() {
                    Value::Null
                } else {
                    Value::Number(picked)
                }
            }
            "link" => Value::Str(match (args.first(), args.get(1)) {
                (Some(path), Some(display)) => {
                    format!("[[{}|{}]]", self.display(path), self.display(display))
                }
                (Some(path), None) => format!("[[{}]]", self.display(path)),
                _ => String::new(),
            }),
            // Rendered types have no renderer here; their text is the best stand-in.
            "image" | "icon" | "html" | "escapeHTML" => Value::Str(self.display(&first)),
            "file" => Value::Null,
            "random" => Value::Number(pseudo_random()),
            _ => return Err(format!("Unknown function `{name}()`")),
        })
    }

    pub(super) fn file_method(&self, method: &str, args: &[Value]) -> Result<Value, String> {
        let first = args.first().map(|value| self.display(value)).unwrap_or_default();

        Ok(match method {
            "hasProperty" => Value::Bool(self.note.properties.contains_key(&first.to_lowercase())),
            "hasTag" => Value::Bool(args.iter().any(|arg| {
                let wanted = self.display(arg).trim_start_matches('#').to_lowercase();
                // A nested tag matches its parents: `#reading/fiction` has tag `reading`.
                self.note
                    .tags
                    .iter()
                    .any(|tag| *tag == wanted || tag.starts_with(&format!("{wanted}/")))
            })),
            "inFolder" => {
                let folder = first.trim_matches('/');
                Value::Bool(
                    folder.is_empty()
                        || self.note.folder == folder
                        || self.note.folder.starts_with(&format!("{folder}/")),
                )
            }
            "hasLink" => {
                let wanted = super::link_target(&first);
                Value::Bool(self.note.links.iter().any(|link| *link == wanted))
            }
            "asLink" => Value::Str(format!("[[{}]]", self.note.path.trim_end_matches(".md"))),
            "isEmpty" => Value::Bool(false),
            "toString" => Value::Str(self.note.name.clone()),
            "isType" => Value::Bool(first == "file"),
            "isTruthy" => Value::Bool(true),
            _ => return Err(format!("Unknown file function `{method}()`")),
        })
    }

    /// The `any` functions are checked first so `isEmpty()` on a null property
    /// answers instead of falling into the null-receiver arm.
    pub(super) fn method(&self, receiver: &Value, method: &str, args: &[Value]) -> Result<Value, String> {
        if let Some(shared) = self.shared_method(receiver, method, args) {
            return Ok(shared);
        }

        match receiver {
            Value::Null => Ok(Value::Null),
            Value::Str(text) => self.string_method(text, method, args),
            Value::Number(number) => number_method(*number, method, args),
            Value::Date(ms) => self.date_method(*ms, method, args),
            Value::Duration(ms) => match method {
                "toFixed" | "round" => Ok(Value::Number(*ms as f64)),
                _ => Err(format!("Unknown duration function `{method}()`")),
            },
            Value::List(values) => self.list_method(values, method, args),
            Value::Object(entries) => match method {
                "keys" => Ok(Value::List(
                    entries.iter().map(|(key, _)| Value::Str(key.clone())).collect(),
                )),
                "values" => Ok(Value::List(entries.iter().map(|(_, value)| value.clone()).collect())),
                _ => Err(format!("Unknown object function `{method}()`")),
            },
            other => Err(format!(
                "`{method}()` is not a function of a {}",
                other.type_name()
            )),
        }
    }

    fn shared_method(&self, receiver: &Value, method: &str, args: &[Value]) -> Option<Value> {
        let first = args.first().map(|value| self.display(value)).unwrap_or_default();

        Some(match method {
            "isTruthy" => Value::Bool(receiver.truthy()),
            "isType" => Value::Bool(receiver.type_name() == first),
            "toString" => Value::Str(self.display(receiver)),
            "isEmpty" => Value::Bool(match receiver {
                Value::Null => true,
                Value::Str(text) => text.is_empty(),
                Value::List(values) => values.is_empty(),
                Value::Object(entries) => entries.is_empty(),
                _ => false,
            }),
            _ => return None,
        })
    }

    fn string_method(&self, text: &str, method: &str, args: &[Value]) -> Result<Value, String> {
        let first = args.first().cloned().unwrap_or(Value::Null);
        let first_text = self.display(&first);
        let has = |arg: &Value| text.contains(self.display(arg).as_str());

        Ok(match method {
            "contains" => Value::Bool(text.contains(first_text.as_str())),
            "containsAll" => Value::Bool(args.iter().all(has)),
            "containsAny" => Value::Bool(args.iter().any(has)),
            "startsWith" => Value::Bool(text.starts_with(first_text.as_str())),
            "endsWith" => Value::Bool(text.ends_with(first_text.as_str())),
            "lower" => Value::Str(text.to_lowercase()),
            "upper" => Value::Str(text.to_uppercase()),
            "title" => Value::Str(title_case(text)),
            "trim" => Value::Str(text.trim().to_string()),
            "replace" => Value::Str(text.replace(
                first_text.as_str(),
                &args.get(1).map(|value| self.display(value)).unwrap_or_default(),
            )),
            "repeat" => Value::Str(text.repeat(first.as_number().unwrap_or(0.0).max(0.0) as usize)),
            "reverse" => Value::Str(text.chars().rev().collect()),
            "slice" => {
                let chars: Vec<char> = text.chars().collect();
                let (start, end) = slice_bounds(chars.len(), &first, args.get(1));
                Value::Str(chars[start..end].iter().collect())
            }
            "split" => {
                let limit = args.get(1).and_then(Value::as_number).map(|n| n as usize);
                let parts = text
                    .split(first_text.as_str())
                    .map(|part| Value::Str(part.to_string()));
                Value::List(match limit {
                    Some(limit) => parts.take(limit).collect(),
                    None => parts.collect(),
                })
            }
            _ => return Err(format!("Unknown string function `{method}()`")),
        })
    }

    fn date_method(&self, ms: i64, method: &str, args: &[Value]) -> Result<Value, String> {
        let pattern = args.first().map(|value| self.display(value)).unwrap_or_default();
        let civil = Civil::from_instant(ms, self.tz_offset_ms);

        Ok(match method {
            "date" => Value::Date(self.start_of_day(ms)),
            "format" => Value::Str(format_date(&civil, &pattern)),
            "time" => Value::Str(format!("{:02}:{:02}", civil.hour, civil.minute)),
            "relative" => Value::Str(relative_time(ms - now_ms())),
            _ => return Err(format!("Unknown date function `{method}()`")),
        })
    }

    fn list_method(&self, values: &[Value], method: &str, args: &[Value]) -> Result<Value, String> {
        let first = args.first().cloned().unwrap_or(Value::Null);
        let has = |arg: &Value| values.iter().any(|value| loose_equal(value, arg));

        Ok(match method {
            "contains" => Value::Bool(has(&first)),
            "containsAll" => Value::Bool(args.iter().all(has)),
            "containsAny" => Value::Bool(args.iter().any(has)),
            "join" => Value::Str(
                values
                    .iter()
                    .map(|value| self.display(value))
                    .collect::<Vec<_>>()
                    .join(&self.display(&first)),
            ),
            "flat" => Value::List(
                values
                    .iter()
                    .flat_map(|value| match value {
                        Value::List(inner) => inner.clone(),
                        other => vec![other.clone()],
                    })
                    .collect(),
            ),
            "reverse" => Value::List(values.iter().rev().cloned().collect()),
            "sort" => {
                let mut sorted = values.to_vec();
                sorted.sort_by(|left, right| {
                    compare(left, right).unwrap_or(std::cmp::Ordering::Equal)
                });
                Value::List(sorted)
            }
            "unique" => {
                let mut unique: Vec<Value> = Vec::new();
                for value in values {
                    if !unique.iter().any(|seen| loose_equal(seen, value)) {
                        unique.push(value.clone());
                    }
                }
                Value::List(unique)
            }
            "slice" => {
                let (start, end) = slice_bounds(values.len(), &first, args.get(1));
                Value::List(values[start..end].to_vec())
            }
            _ => return Err(format!("Unknown list function `{method}()`")),
        })
    }
}

fn number_method(number: f64, method: &str, args: &[Value]) -> Result<Value, String> {
    let digits = args
        .first()
        .and_then(Value::as_number)
        .unwrap_or(0.0)
        .max(0.0);

    Ok(match method {
        "abs" => Value::Number(number.abs()),
        "ceil" => Value::Number(number.ceil()),
        "floor" => Value::Number(number.floor()),
        "round" => {
            let scale = 10f64.powi(digits as i32);
            Value::Number((number * scale).round() / scale)
        }
        // `.0$` takes the precision from the first positional argument.
        "toFixed" => Value::Str(format!("{number:.0$}", digits as usize)),
        _ => return Err(format!("Unknown number function `{method}()`")),
    })
}

fn slice_bounds(len: usize, start: &Value, end: Option<&Value>) -> (usize, usize) {
    let clamp = |value: f64| -> usize {
        let value = if value < 0.0 { len as f64 + value } else { value };
        (value.max(0.0) as usize).min(len)
    };
    let start = clamp(start.as_number().unwrap_or(0.0));
    let end = end
        .and_then(Value::as_number)
        .map(clamp)
        .unwrap_or(len)
        .max(start);
    (start, end)
}

fn title_case(text: &str) -> String {
    let mut output = String::with_capacity(text.len());
    let mut at_word_start = true;
    for character in text.chars() {
        if character.is_whitespace() {
            at_word_start = true;
            output.push(character);
        } else if at_word_start {
            output.extend(character.to_uppercase());
            at_word_start = false;
        } else {
            output.push(character);
        }
    }
    output
}

fn pseudo_random() -> f64 {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.subsec_nanos())
        .unwrap_or(0);
    (nanos as f64 / 1e9).fract()
}

