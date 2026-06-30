//! Obsidian Bases-style query support.
//!
//! Responsibilities:
//! - Parse the small `.base` definition subset Glyphary can render today.
//! - Query visible Markdown notes by frontmatter properties.
//! - Return view-ready rows for cards and tables without mutating the vault.
//!
//! Contracts:
//! - This is intentionally not a full YAML or Obsidian Bases interpreter.
//! - Unsupported filter expressions are ignored instead of broadening results.
//! - Rows remain vault-relative and Markdown-only.
use super::*;

#[derive(Clone, Debug)]
enum BaseCondition {
    HasProperty(String),
    Equals(String, String),
    Unsupported,
}

#[derive(Clone, Debug, Default)]
struct BaseViewDefinition {
    name: String,
    view_type: String,
    order: Vec<String>,
    image: Option<String>,
    filters: Vec<BaseCondition>,
}

#[derive(Clone, Debug, Default)]
struct BaseDefinition {
    filters: Vec<BaseCondition>,
    views: Vec<BaseViewDefinition>,
}

#[derive(Debug)]
struct BaseCandidate {
    name: String,
    relative_path: String,
    properties: HashMap<String, String>,
}

#[derive(Clone, Copy, Eq, PartialEq)]
enum BaseParseSection {
    None,
    GlobalFilters,
    Views,
    ViewOrder,
    ViewFilters,
}

fn parse_base_definition(content: &str) -> BaseDefinition {
    let mut definition = BaseDefinition::default();
    let mut section = BaseParseSection::None;

    for raw_line in content.lines() {
        let line = raw_line.trim_end();
        let trimmed = line.trim();

        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }

        if line == "filters:" {
            section = BaseParseSection::GlobalFilters;
            continue;
        }

        if line == "views:" {
            section = BaseParseSection::Views;
            continue;
        }

        if let Some(view_type) = trimmed.strip_prefix("- type:") {
            definition.views.push(BaseViewDefinition {
                view_type: strip_quotes(view_type.trim()).to_string(),
                ..Default::default()
            });
            section = BaseParseSection::Views;
            continue;
        }

        let Some(view) = definition.views.last_mut() else {
            if section == BaseParseSection::GlobalFilters {
                if let Some(condition) = parse_filter_line(trimmed) {
                    definition.filters.push(condition);
                }
            }
            continue;
        };

        if let Some(value) = trimmed.strip_prefix("name:") {
            view.name = strip_quotes(value.trim()).to_string();
            section = BaseParseSection::Views;
        } else if trimmed == "order:" {
            section = BaseParseSection::ViewOrder;
        } else if trimmed == "filters:" {
            section = BaseParseSection::ViewFilters;
        } else if let Some(value) = trimmed.strip_prefix("image:") {
            view.image = Some(strip_quotes(value.trim()).to_string());
            section = BaseParseSection::Views;
        } else if section == BaseParseSection::ViewOrder {
            if let Some(field) = trimmed.strip_prefix('-') {
                view.order.push(strip_quotes(field.trim()).to_string());
            }
        } else if section == BaseParseSection::ViewFilters {
            if let Some(condition) = parse_filter_line(trimmed) {
                view.filters.push(condition);
            }
        }
    }

    definition
}

fn parse_filter_line(line: &str) -> Option<BaseCondition> {
    let expression = line.strip_prefix('-').unwrap_or(line).trim();

    if let Some(property) = expression
        .strip_prefix("file.hasProperty(\"")
        .and_then(|value| value.strip_suffix("\")"))
    {
        return Some(BaseCondition::HasProperty(property.to_lowercase()));
    }

    let Some((property, value)) = expression.split_once("==") else {
        return line
            .trim_start()
            .starts_with('-')
            .then_some(BaseCondition::Unsupported);
    };
    let value = strip_quotes(value.trim());

    Some(BaseCondition::Equals(
        property.trim().trim_start_matches("note.").to_lowercase(),
        value.to_string(),
    ))
}

fn strip_quotes(value: &str) -> &str {
    value
        .strip_prefix('"')
        .and_then(|value| value.strip_suffix('"'))
        .or_else(|| {
            value
                .strip_prefix('\'')
                .and_then(|value| value.strip_suffix('\''))
        })
        .unwrap_or(value)
}

fn parse_note_properties(content: &str) -> HashMap<String, String> {
    let mut properties = HashMap::new();

    if !content.starts_with("---\n") && !content.starts_with("---\r\n") {
        return properties;
    }

    for line in content
        .lines()
        .skip(1)
        .take_while(|line| line.trim() != "---")
    {
        let Some((key, value)) = line.split_once(':') else {
            continue;
        };
        let key = key.trim().to_lowercase();
        let value = strip_quotes(value.trim()).to_string();

        if !key.is_empty() {
            properties.insert(key, value);
        }
    }

    properties
}

fn condition_matches(properties: &HashMap<String, String>, condition: &BaseCondition) -> bool {
    match condition {
        BaseCondition::HasProperty(property) => properties
            .get(property)
            .is_some_and(|value| !value.trim().is_empty()),
        BaseCondition::Equals(property, expected) => {
            properties.get(property).is_some_and(|value| value == expected)
        }
        BaseCondition::Unsupported => false,
    }
}

fn conditions_match(properties: &HashMap<String, String>, conditions: &[BaseCondition]) -> bool {
    conditions
        .iter()
        .all(|condition| condition_matches(properties, condition))
}

fn field_property_name(field: &str) -> Option<String> {
    if field == "file.name" {
        None
    } else {
        Some(field.trim_start_matches("note.").to_lowercase())
    }
}

fn image_reference(candidate: &BaseCandidate, image_field: Option<&String>) -> Option<String> {
    let property = field_property_name(image_field?)?;

    candidate.properties.get(&property).cloned()
}

fn row_from_candidate(candidate: &BaseCandidate, view: &BaseViewDefinition) -> BaseRow {
    BaseRow {
        name: candidate.name.clone(),
        relative_path: candidate.relative_path.clone(),
        properties: candidate.properties.clone(),
        image_reference: image_reference(candidate, view.image.as_ref()),
    }
}

fn note_name(path: &Path) -> String {
    path.file_stem()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.to_string_lossy().into_owned())
}

#[tauri::command]
pub(crate) fn query_base(root: String, relative: String) -> Result<BaseQueryResult, String> {
    let (root, base_path) = resolve_existing(&root, &relative)?;

    if base_path
        .extension()
        .and_then(|extension| extension.to_str())
        .is_none_or(|extension| !extension.eq_ignore_ascii_case("base"))
    {
        return Err("Selected file is not a base definition".into());
    }

    let content = fs::read_to_string(&base_path)
        .map_err(|err| format!("Could not read base definition: {err}"))?;
    let definition = parse_base_definition(&content);

    if definition.views.is_empty() {
        return Err("Base has no views".into());
    }

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

    let mut candidates = Vec::new();

    for file in files {
        let content = fs::read_to_string(&file)
            .map_err(|err| format!("Could not read note {}: {err}", file.display()))?;
        let properties = parse_note_properties(&content);

        if !conditions_match(&properties, &definition.filters) {
            continue;
        }

        candidates.push(BaseCandidate {
            name: note_name(&file),
            relative_path: relative_string(&root, &file)?,
            properties,
        });
    }

    candidates.sort_by(|left, right| left.name.to_lowercase().cmp(&right.name.to_lowercase()));

    let views = definition
        .views
        .into_iter()
        .map(|view| {
            let order = if view.order.is_empty() {
                vec!["file.name".into()]
            } else {
                view.order.clone()
            };
            let rows = candidates
                .iter()
                .filter(|candidate| conditions_match(&candidate.properties, &view.filters))
                .map(|candidate| row_from_candidate(candidate, &view))
                .collect();

            BaseViewResult {
                name: if view.name.is_empty() {
                    view.view_type.clone()
                } else {
                    view.name.clone()
                },
                r#type: view.view_type,
                order,
                image: view.image,
                rows,
            }
        })
        .collect();

    Ok(BaseQueryResult {
        relative_path: relative_string(&root, &base_path)?,
        name: base_path
            .file_stem()
            .map(|name| name.to_string_lossy().into_owned())
            .unwrap_or_else(|| "Base".into()),
        views,
    })
}
