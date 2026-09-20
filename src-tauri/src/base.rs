//! Obsidian Bases-style query support.
//!
//! Responsibilities:
//! - Parse the `.base` definition: nested `filters:` groups, `formulas:`,
//!   views with `order:`, `sort:`, `image:` and their own filters.
//! - Render a structured definition back to `.base` YAML for editing.
//! - Query visible Markdown notes through the expression engine in
//!   `base_expr.rs` and return view-ready rows for cards and tables.
//!
//! Contracts:
//! - This is a line-oriented reader for the YAML shape Obsidian writes, not a
//!   YAML implementation. Lines it does not model are kept verbatim in `extra`
//!   so a structured save never drops what another tool wrote.
//! - Base-level and view-level filters are combined with AND, as documented.
//! - `limit:` is parsed here but applied by the frontend after its sort, so
//!   the pane's session sort decides which rows make the cut.
//! - A filter that fails to parse or evaluate narrows results (matches
//!   nothing) and is reported in `errors`, never silently widened.
//! - Rows remain vault-relative and Markdown-only.
use super::*;
use crate::base_expr::{
    link_target, parse as parse_expression, parse_wall_clock, Evaluator, Expr, Formula, Note,
    Value,
};
use std::collections::BTreeSet;
use std::time::{SystemTime, UNIX_EPOCH};

struct Line<'a> {
    indent: usize,
    text: &'a str,
    raw: &'a str,
}

fn read_lines(content: &str) -> Vec<Line<'_>> {
    content
        .lines()
        .map(|raw| raw.trim_end())
        .filter(|raw| !raw.trim().is_empty() && !raw.trim().starts_with('#'))
        .map(|raw| Line {
            indent: raw.len() - raw.trim_start().len(),
            text: raw.trim(),
            raw,
        })
        .collect()
}

/// Index one past the last line that is nested under `lines[start]`. YAML
/// lets a key's list items sit at the key's own indent (`views:` then
/// `- type:`), so a bare `key:` line also owns same-indent `- ` lines.
fn block_end(lines: &[Line], start: usize) -> usize {
    let indent = lines[start].indent;
    let owns_items = lines[start].text.ends_with(':') && !lines[start].text.starts_with("- ");
    lines[start + 1..]
        .iter()
        .position(|line| {
            line.indent < indent
                || (line.indent == indent && !(owns_items && line.text.starts_with("- ")))
        })
        .map(|offset| start + 1 + offset)
        .unwrap_or(lines.len())
}

/// Unquotes a YAML scalar as Obsidian writes them: `'a''b'` and `"a\"b"`.
fn yaml_string(raw: &str) -> String {
    let raw = raw.trim();

    if let Some(inner) = raw.strip_prefix('\'').and_then(|rest| rest.strip_suffix('\'')) {
        return inner.replace("''", "'");
    }

    if let Some(inner) = raw.strip_prefix('"').and_then(|rest| rest.strip_suffix('"')) {
        return inner.replace("\\\"", "\"").replace("\\\\", "\\");
    }

    raw.to_string()
}

/// Quotes an expression the way Obsidian does: single quotes unless the text
/// itself contains one.
fn yaml_expression(text: &str) -> String {
    if !text.contains('\'') {
        format!("'{text}'")
    } else {
        format!("\"{}\"", text.replace('\\', "\\\\").replace('"', "\\\""))
    }
}

fn yaml_scalar(value: &str) -> String {
    let needs_quotes = value.is_empty()
        || value != value.trim()
        || value.contains(": ")
        || value.ends_with(':')
        || value.contains(" #")
        || value.starts_with(|character| "-?:,[]{}#&*!|>'\"%@`".contains(character));

    if needs_quotes {
        format!("\"{}\"", value.replace('\\', "\\\\").replace('"', "\\\""))
    } else {
        value.to_string()
    }
}

fn group_kind(text: &str) -> Option<&str> {
    let key = text.strip_prefix("- ").unwrap_or(text).trim();
    let kind = key.strip_suffix(':')?;
    matches!(kind, "and" | "or" | "not").then_some(kind)
}

fn make_group(kind: &str, filters: Vec<BaseFilter>) -> BaseFilter {
    match kind {
        "or" => BaseFilter::Or { filters },
        "not" => BaseFilter::Not { filters },
        _ => BaseFilter::And { filters },
    }
}

/// `lines` are everything nested under a `filters:` key; the first line names
/// the group and the rest are its items.
fn parse_filter_block(lines: &[Line]) -> Option<BaseFilter> {
    let first = lines.first()?;
    let kind = group_kind(first.text)?;
    let end = block_end(lines, 0);

    Some(make_group(kind, parse_filter_items(&lines[1..end])))
}

fn parse_filter_items(lines: &[Line]) -> Vec<BaseFilter> {
    let mut filters = Vec::new();
    let mut index = 0;

    while index < lines.len() {
        let line = &lines[index];
        let end = block_end(lines, index);

        if let Some(rest) = line.text.strip_prefix("- ") {
            filters.push(match group_kind(rest) {
                Some(kind) => make_group(kind, parse_filter_items(&lines[index + 1..end])),
                None => BaseFilter::Expression {
                    source: yaml_string(rest),
                },
            });
        }

        index = end;
    }

    filters
}

fn parse_formulas(lines: &[Line]) -> Vec<BaseFormula> {
    lines
        .iter()
        .filter_map(|line| {
            let (name, expression) = line.text.split_once(':')?;
            let name = yaml_string(name.trim());
            (!name.is_empty() && !expression.trim().is_empty()).then(|| BaseFormula {
                name: name.to_string(),
                expression: yaml_string(expression),
            })
        })
        .collect()
}

fn parse_view(lines: &[Line]) -> BaseViewDefinition {
    // The item line carries the first key (`- type:`), so the real key column
    // is only known from the second line.
    let key_indent = lines.get(1).map(|line| line.indent).unwrap_or(lines[0].indent + 2);
    let mut view = BaseViewDefinition::default();
    let mut index = 0;

    while index < lines.len() {
        let line = &lines[index];
        // The item line owns every other line, so its "block" is just itself.
        let end = if index == 0 { 1 } else { block_end(lines, index) };
        let text = if index == 0 {
            line.text.strip_prefix("- ").unwrap_or(line.text)
        } else {
            line.text
        };
        let children = &lines[index + 1..end];

        if let Some(value) = text.strip_prefix("type:") {
            view.view_type = yaml_string(value.trim());
        } else if let Some(value) = text.strip_prefix("name:") {
            view.name = yaml_string(value.trim());
        } else if let Some(value) = text.strip_prefix("image:") {
            view.image = Some(yaml_string(value.trim()));
        } else if let Some(value) = text.strip_prefix("limit:") {
            view.limit = yaml_string(value.trim()).parse().ok();
        } else if text == "filters:" {
            view.filters = parse_filter_block(children);
        } else if text == "order:" {
            view.order = children
                .iter()
                .filter_map(|child| child.text.strip_prefix('-'))
                .map(|field| yaml_string(field.trim()))
                .collect();
        } else if text == "sort:" {
            for child in children {
                if let Some(property) = child.text.strip_prefix("- property:") {
                    view.sort.push(BaseSort {
                        property: yaml_string(property.trim()),
                        direction: "ASC".into(),
                    });
                } else if let Some(direction) = child.text.strip_prefix("direction:") {
                    if let Some(last) = view.sort.last_mut() {
                        last.direction = yaml_string(direction.trim()).to_uppercase();
                    }
                }
            }
        } else if index > 0 {
            // Unknown keys such as `groupBy:` are kept so a structured save
            // never drops what Obsidian wrote; indentation is made relative so
            // the serializer can re-nest them under any view.
            for kept in &lines[index..end] {
                view.extra.push(kept.raw[key_indent.min(kept.indent)..].to_string());
            }
        }

        index = end;
    }

    view
}

fn parse_base_definition(content: &str) -> BaseDefinition {
    let lines = read_lines(content);
    let mut definition = BaseDefinition::default();
    let mut index = 0;

    while index < lines.len() {
        let line = &lines[index];
        let end = block_end(&lines, index);
        let children = &lines[index + 1..end];

        match line.text {
            _ if line.indent != 0 => definition.extra.push(line.raw.to_string()),
            "filters:" => definition.filters = parse_filter_block(children),
            "formulas:" => definition.formulas = parse_formulas(children),
            "views:" => {
                let mut item = 0;
                while item < children.len() {
                    let item_end = block_end(children, item);
                    if children[item].text.starts_with("- ") {
                        definition.views.push(parse_view(&children[item..item_end]));
                    }
                    item = item_end;
                }
            }
            _ => definition
                .extra
                .extend(lines[index..end].iter().map(|kept| kept.raw.to_string())),
        }

        index = end;
    }

    definition
}

/// `properties:` stays verbatim in `extra` (its other keys are not modeled),
/// so the labels are read back out of those raw lines.
fn display_names(definition: &BaseDefinition) -> HashMap<String, String> {
    let mut names = HashMap::new();
    let mut field: Option<String> = None;
    let mut inside = false;

    for raw in &definition.extra {
        let indent = raw.len() - raw.trim_start().len();
        let text = raw.trim();

        if indent == 0 {
            inside = text == "properties:";
            continue;
        }

        if !inside {
            continue;
        }

        if let Some(value) = text.strip_prefix("displayName:") {
            if let Some(field) = &field {
                names.insert(field.clone(), yaml_string(value));
            }
        } else if let Some(key) = text.strip_suffix(':') {
            field = Some(yaml_string(key.trim()));
        }
    }

    names
}

fn write_filter(out: &mut String, filter: &BaseFilter, indent: usize) {
    let pad = " ".repeat(indent);
    let (kind, filters) = match filter {
        BaseFilter::And { filters } => ("and", filters),
        BaseFilter::Or { filters } => ("or", filters),
        BaseFilter::Not { filters } => ("not", filters),
        BaseFilter::Expression { source } => {
            out.push_str(&format!("{pad}{}\n", yaml_expression(source)));
            return;
        }
    };

    out.push_str(&format!("{pad}{kind}:\n"));

    for child in filters {
        match child {
            BaseFilter::Expression { source } => {
                out.push_str(&format!("{pad}  - {}\n", yaml_expression(source)));
            }
            group => {
                let mut nested = String::new();
                write_filter(&mut nested, group, indent + 4);
                // The nested group's key sits on the list item line.
                out.push_str(&format!("{pad}  - {}", nested.trim_start()));
            }
        }
    }
}

fn serialize_base_definition(definition: &BaseDefinition) -> String {
    let mut out = String::new();

    if let Some(filters) = &definition.filters {
        out.push_str("filters:\n");
        write_filter(&mut out, filters, 2);
    }

    if !definition.formulas.is_empty() {
        out.push_str("formulas:\n");
        for formula in &definition.formulas {
            out.push_str(&format!(
                "  {}: {}\n",
                yaml_scalar(&formula.name),
                yaml_expression(&formula.expression)
            ));
        }
    }

    for line in &definition.extra {
        out.push_str(line);
        out.push('\n');
    }

    out.push_str("views:\n");

    for view in &definition.views {
        out.push_str(&format!("  - type: {}\n", yaml_scalar(&view.view_type)));

        if !view.name.is_empty() {
            out.push_str(&format!("    name: {}\n", yaml_scalar(&view.name)));
        }

        if let Some(limit) = view.limit {
            out.push_str(&format!("    limit: {limit}\n"));
        }

        if let Some(filters) = &view.filters {
            out.push_str("    filters:\n");
            write_filter(&mut out, filters, 6);
        }

        if !view.order.is_empty() {
            out.push_str("    order:\n");
            for field in &view.order {
                out.push_str(&format!("      - {}\n", yaml_scalar(field)));
            }
        }

        if !view.sort.is_empty() {
            out.push_str("    sort:\n");
            for sort in &view.sort {
                out.push_str(&format!(
                    "      - property: {}\n        direction: {}\n",
                    yaml_scalar(&sort.property),
                    if sort.direction.eq_ignore_ascii_case("desc") { "DESC" } else { "ASC" }
                ));
            }
        }

        if let Some(image) = view.image.as_deref().filter(|image| !image.trim().is_empty()) {
            out.push_str(&format!("    image: {}\n", yaml_scalar(image)));
        }

        for line in &view.extra {
            out.push_str("    ");
            out.push_str(line);
            out.push('\n');
        }
    }

    out
}

/// A plain split would break `[[a, b]]` wikilinks inside an inline list.
fn split_inline_list(inner: &str) -> Vec<&str> {
    let mut parts = Vec::new();
    let mut depth = 0i32;
    let mut start = 0;

    for (index, character) in inner.char_indices() {
        match character {
            '[' => depth += 1,
            ']' => depth -= 1,
            ',' if depth <= 0 => {
                parts.push(&inner[start..index]);
                start = index + 1;
            }
            _ => {}
        }
    }

    parts.push(&inner[start..]);
    parts.into_iter().map(str::trim).filter(|part| !part.is_empty()).collect()
}

fn scalar_value(raw: &str, tz_offset_ms: i64) -> Value {
    let raw = raw.trim();

    if raw.is_empty() || raw == "null" || raw == "~" {
        return Value::Null;
    }

    if let Some(inner) = raw.strip_prefix('[').and_then(|rest| rest.strip_suffix(']')) {
        // `[[note]]` is a wikilink, not a one-element list.
        if !raw.starts_with("[[") {
            return Value::List(
                split_inline_list(inner)
                    .into_iter()
                    .map(|part| scalar_value(part, tz_offset_ms))
                    .collect(),
            );
        }
    }

        // A quoted scalar is always text, even when it looks like a number or date.
    if raw.starts_with('"') || raw.starts_with('\'') {
        return Value::Str(yaml_string(raw));
    }

    match raw {
        "true" | "yes" => return Value::Bool(true),
        "false" | "no" => return Value::Bool(false),
        _ => {}
    }

    if raw
        .chars()
        .all(|character| character.is_ascii_digit() || matches!(character, '.' | '-' | '+'))
    {
        if let Ok(number) = raw.parse::<f64>() {
            return Value::Number(number);
        }
    }

    if let Some(wall) = parse_wall_clock(raw) {
        return Value::Date(wall - tz_offset_ms);
    }

    Value::Str(raw.to_string())
}

fn parse_note_values(content: &str, tz_offset_ms: i64) -> HashMap<String, Value> {
    let mut properties = HashMap::new();

    if !content.starts_with("---\n") && !content.starts_with("---\r\n") {
        return properties;
    }

    let lines: Vec<&str> = content
        .lines()
        .skip(1)
        .take_while(|line| line.trim() != "---")
        .collect();
    let mut index = 0;

    while index < lines.len() {
        let line = lines[index];
        index += 1;

        if line.starts_with(|character: char| character.is_whitespace()) {
            continue;
        }

        let Some((key, value)) = line.split_once(':') else {
            continue;
        };
        // Property names are matched case-insensitively everywhere, so the map
        // is keyed lowercase once here.
        let key = key.trim().to_lowercase();

        if key.is_empty() {
            continue;
        }

        if !value.trim().is_empty() {
            properties.insert(key, scalar_value(value, tz_offset_ms));
            continue;
        }

        let mut items = Vec::new();
        let mut entries = Vec::new();

        while index < lines.len() {
            let child = lines[index];
            let trimmed = child.trim();
            if let Some(item) = trimmed.strip_prefix('-') {
                items.push(scalar_value(item, tz_offset_ms));
            } else if child.starts_with(|character: char| character.is_whitespace()) {
                if let Some((sub_key, sub_value)) = trimmed.split_once(':') {
                    entries.push((sub_key.trim().to_string(), scalar_value(sub_value, tz_offset_ms)));
                }
            } else {
                break;
            }
            index += 1;
        }

        properties.insert(
            key,
            if !items.is_empty() {
                Value::List(items)
            } else if !entries.is_empty() {
                Value::Object(entries)
            } else {
                Value::Null
            },
        );
    }

    properties
}

fn note_body(content: &str) -> &str {
    content
        .strip_prefix("---")
        .and_then(|rest| rest.split_once("\n---"))
        .map(|(_, body)| body)
        .unwrap_or(content)
}

fn wikilink_targets(content: &str) -> Vec<String> {
    let mut links = Vec::new();
    let mut rest = content;

    while let Some(start) = rest.find("[[") {
        let after = &rest[start + 2..];
        let Some(end) = after.find("]]") else {
            break;
        };
        let target = link_target(&after[..end]);
        if !target.is_empty() && !links.contains(&target) {
            links.push(target);
        }
        rest = &after[end + 2..];
    }

    links
}

/// Fenced code is skipped and tags go through the graph's normalizer so a
/// note's tags here agree with the Tags drawer.
fn inline_tags(body: &str) -> Vec<String> {
    let mut tags = Vec::new();
    let mut in_fence = false;

    for line in body.lines() {
        if line.trim_start().starts_with("```") {
            in_fence = !in_fence;
            continue;
        }
        if in_fence {
            continue;
        }

        let mut previous = ' ';
        for (index, character) in line.char_indices() {
            if character == '#' && previous.is_whitespace() {
                let token: String = line[index + 1..]
                    .chars()
                    .take_while(|c| c.is_alphanumeric() || matches!(c, '/' | '-' | '_'))
                    .collect();
                if let Some(tag) = normalize_tag(&token) {
                    if !tags.contains(&tag) {
                        tags.push(tag);
                    }
                }
            }
            previous = character;
        }
    }

    tags
}

fn frontmatter_tags(properties: &HashMap<String, Value>) -> Vec<String> {
    ["tags", "tag"]
        .iter()
        .filter_map(|key| properties.get(*key))
        .flat_map(|value| match value {
            Value::List(items) => items.clone(),
            Value::Str(text) => text
                .split(|c| c == ',' || c == ' ')
                .map(|part| Value::Str(part.to_string()))
                .collect(),
            _ => Vec::new(),
        })
        .filter_map(|value| match value {
            Value::Str(text) => normalize_tag(&text),
            _ => None,
        })
        .collect()
}

fn file_time_ms(time: std::io::Result<SystemTime>) -> Option<i64> {
    time.ok()?
        .duration_since(UNIX_EPOCH)
        .ok()
        .map(|duration| duration.as_millis() as i64)
}

fn load_note(root: &Path, file: &Path, tz_offset_ms: i64) -> Result<Note, String> {
    let content = fs::read_to_string(file)
        .map_err(|err| format!("Could not read note {}: {err}", file.display()))?;
    let metadata = fs::metadata(file).ok();
    let mtime = metadata
        .as_ref()
        .and_then(|metadata| file_time_ms(metadata.modified()))
        .unwrap_or(0);
    let ctime = metadata
        .as_ref()
        .and_then(|metadata| file_time_ms(metadata.created()))
        .unwrap_or(mtime);
    let properties = parse_note_values(&content, tz_offset_ms);
    let mut tags = frontmatter_tags(&properties);
    for tag in inline_tags(note_body(&content)) {
        if !tags.contains(&tag) {
            tags.push(tag);
        }
    }
    let path = relative_string(root, file)?;

    Ok(Note {
        name: note_name(file),
        folder: path.rsplit_once('/').map(|(folder, _)| folder.to_string()).unwrap_or_default(),
        ext: file
            .extension()
            .map(|ext| ext.to_string_lossy().into_owned())
            .unwrap_or_default(),
        size: metadata.map(|metadata| metadata.len() as f64).unwrap_or(0.0),
        ctime,
        mtime,
        properties,
        tags,
        links: wikilink_targets(&content),
        path,
    })
}

fn note_name(path: &Path) -> String {
    path.file_stem()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.to_string_lossy().into_owned())
}

enum CompiledFilter {
    And(Vec<CompiledFilter>),
    Or(Vec<CompiledFilter>),
    Not(Vec<CompiledFilter>),
    Expression {
        source: String,
        compiled: Option<Expr>,
    },
}

fn compile_filter(filter: &BaseFilter, errors: &mut BTreeSet<String>) -> CompiledFilter {
    let compile_all = |filters: &[BaseFilter], errors: &mut BTreeSet<String>| {
        filters
            .iter()
            .map(|child| compile_filter(child, errors))
            .collect()
    };

    match filter {
        BaseFilter::And { filters } => CompiledFilter::And(compile_all(filters, errors)),
        BaseFilter::Or { filters } => CompiledFilter::Or(compile_all(filters, errors)),
        BaseFilter::Not { filters } => CompiledFilter::Not(compile_all(filters, errors)),
        BaseFilter::Expression { source } => CompiledFilter::Expression {
            source: source.clone(),
            compiled: match parse_expression(source) {
                Ok(expr) => Some(expr),
                Err(error) => {
                    errors.insert(format!("Filter `{source}`: {error}"));
                    None
                }
            },
        },
    }
}

fn filter_matches(filter: &CompiledFilter, evaluator: &Evaluator, errors: &mut BTreeSet<String>) -> bool {
    match filter {
        CompiledFilter::And(children) => children
            .iter()
            .all(|child| filter_matches(child, evaluator, errors)),
        CompiledFilter::Or(children) => children
            .iter()
            .any(|child| filter_matches(child, evaluator, errors)),
        // `not` passes only when none of its items match, per the Bases docs.
        CompiledFilter::Not(children) => !children
            .iter()
            .any(|child| filter_matches(child, evaluator, errors)),
        CompiledFilter::Expression { source, compiled } => match compiled {
            Some(expr) => match evaluator.evaluate(expr) {
                Ok(value) => value.truthy(),
                Err(error) => {
                    errors.insert(format!("Filter `{source}`: {error}"));
                    false
                }
            },
            None => false,
        },
    }
}

fn normalize_property(field: &str) -> String {
    field.trim().trim_start_matches("note.").to_lowercase()
}

fn resolve_base_file(root: &str, relative: &str) -> Result<(PathBuf, PathBuf), String> {
    let (root, base_path) = resolve_existing(root, relative)?;

    if base_path
        .extension()
        .and_then(|extension| extension.to_str())
        .is_none_or(|extension| !extension.eq_ignore_ascii_case("base"))
    {
        return Err("Selected file is not a base definition".into());
    }

    Ok((root, base_path))
}

const FILE_DISPLAY_FIELDS: [&str; 8] =
    ["path", "folder", "ext", "size", "ctime", "mtime", "tags", "links"];

/// Everything parsed once per query rather than once per note.
struct CompiledBase {
    formulas: Vec<Formula>,
    global_filter: Option<CompiledFilter>,
    view_filters: Vec<Option<CompiledFilter>>,
    errors: BTreeSet<String>,
}

fn compile_base(definition: &BaseDefinition) -> CompiledBase {
    let mut errors = BTreeSet::new();
    let formulas = definition
        .formulas
        .iter()
        .map(|formula| Formula {
            name: formula.name.clone(),
            compiled: parse_expression(&formula.expression).map_err(|error| {
                errors.insert(format!("Formula `{}`: {error}", formula.name));
                error
            }),
        })
        .collect();
    let global_filter = definition
        .filters
        .as_ref()
        .map(|filter| compile_filter(filter, &mut errors));
    let view_filters = definition
        .views
        .iter()
        .map(|view| {
            view.filters
                .as_ref()
                .map(|filter| compile_filter(filter, &mut errors))
        })
        .collect();

    CompiledBase {
        formulas,
        global_filter,
        view_filters,
        errors,
    }
}

/// Rows carry display strings, not typed values, so the frontend can show,
/// sort, and toggle any field without knowing the value model.
fn row_display_values(
    evaluator: &Evaluator,
    note: &Note,
    formulas: &[Formula],
    errors: &mut BTreeSet<String>,
) -> HashMap<String, String> {
    let mut values: HashMap<String, String> = note
        .properties
        .iter()
        .map(|(key, value)| (key.clone(), evaluator.display(value)))
        .collect();

    for formula in formulas {
        let text = match evaluator.formula(&formula.name) {
            Ok(value) => evaluator.display(&value),
            Err(error) => {
                errors.insert(format!("Formula `{}`: {error}", formula.name));
                String::new()
            }
        };
        values.insert(format!("formula.{}", formula.name.to_lowercase()), text);
    }

    for field in FILE_DISPLAY_FIELDS {
        if let Ok(value) = evaluator.file_field(field) {
            values.insert(format!("file.{field}"), evaluator.display(&value));
        }
    }

    values
}

fn image_reference(view: &BaseViewDefinition, values: &HashMap<String, String>) -> Option<String> {
    let field = view.image.as_deref()?;

    if field == "file.name" {
        return None;
    }

    values.get(&normalize_property(field)).cloned()
}

fn view_result(view: &BaseViewDefinition, mut rows: Vec<BaseRow>) -> BaseViewResult {
    rows.sort_by_key(|row| row.name.to_lowercase());

    BaseViewResult {
        name: if view.name.is_empty() {
            view.view_type.clone()
        } else {
            view.name.clone()
        },
        r#type: view.view_type.clone(),
        order: if view.order.is_empty() {
            vec!["file.name".into()]
        } else {
            view.order.clone()
        },
        image: view.image.clone(),
        rows,
    }
}

/// `tz_offset_minutes` is local time minus UTC, as the frontend knows it;
/// Rust has no timezone database of its own.
#[tauri::command]
pub(crate) fn query_base(
    root: String,
    relative: String,
    tz_offset_minutes: Option<i64>,
) -> Result<BaseQueryResult, String> {
    let tz_offset_ms = tz_offset_minutes.unwrap_or(0) * 60_000;
    let (root, base_path) = resolve_base_file(&root, &relative)?;
    let content = fs::read_to_string(&base_path)
        .map_err(|err| format!("Could not read base definition: {err}"))?;
    let definition = parse_base_definition(&content);

    if definition.views.is_empty() {
        return Err("Base has no views".into());
    }

    let mut compiled = compile_base(&definition);
    let mut files = Vec::new();
    walk_files(
        &root,
        &root,
        &mut files,
        SearchFileFilter {
            markdown_only: true,
            exclude_dot_paths: true,
        },
    )?;

    let mut view_rows: Vec<Vec<BaseRow>> = definition.views.iter().map(|_| Vec::new()).collect();

    for file in files {
        let note = load_note(&root, &file, tz_offset_ms)?;
        let evaluator = Evaluator::new(&note, &compiled.formulas, tz_offset_ms);

        if let Some(filter) = &compiled.global_filter {
            if !filter_matches(filter, &evaluator, &mut compiled.errors) {
                continue;
            }
        }

        let values = row_display_values(&evaluator, &note, &compiled.formulas, &mut compiled.errors);

        for (index, view) in definition.views.iter().enumerate() {
            if let Some(filter) = &compiled.view_filters[index] {
                if !filter_matches(filter, &evaluator, &mut compiled.errors) {
                    continue;
                }
            }

            view_rows[index].push(BaseRow {
                name: note.name.clone(),
                relative_path: note.path.clone(),
                image_reference: image_reference(view, &values),
                properties: values.clone(),
            });
        }
    }

    Ok(BaseQueryResult {
        relative_path: relative_string(&root, &base_path)?,
        name: note_name(&base_path),
        display_names: display_names(&definition),
        errors: compiled.errors.into_iter().collect(),
        views: definition
            .views
            .iter()
            .zip(view_rows)
            .map(|(view, rows)| view_result(view, rows))
            .collect(),
        definition,
    })
}

/// Serializes a structured definition for the frontend to save through the
/// normal document write path, so base tabs share dirty state and Cmd+S.
#[tauri::command]
pub(crate) fn render_base_definition(definition: BaseDefinition) -> Result<String, String> {
    if definition.views.is_empty() {
        return Err("A base needs at least one view".into());
    }

    if definition
        .views
        .iter()
        .any(|view| view.view_type.trim().is_empty())
    {
        return Err("Every base view needs a type".into());
    }

    Ok(serialize_base_definition(&definition))
}

#[tauri::command]
pub(crate) fn create_base_in_directory(
    root: String,
    relative: String,
    base_name: String,
) -> Result<OpenedFile, String> {
    let (root_path, dir) = resolve_existing(&root, &relative)?;

    if !dir.is_dir() {
        return Err("Vault path is not a directory".into());
    }

    let path = dir.join(sanitize_base_file_name(&base_name)?);

    if path.exists() {
        return Err("A base with that name already exists in this folder".into());
    }

    let starter = BaseDefinition {
        views: vec![BaseViewDefinition {
            name: "Table".into(),
            view_type: "table".into(),
            ..Default::default()
        }],
        ..Default::default()
    };

    fs::write(&path, serialize_base_definition(&starter))
        .map_err(|err| format!("Could not create base: {err}"))?;

    read_vault_file(
        root_path.to_string_lossy().into_owned(),
        relative_string(&root_path, &path)?,
    )
}
