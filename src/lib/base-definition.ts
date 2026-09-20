/**
 * Base definition edit helpers.
 *
 * Responsibilities:
 * - Immutable edits to a parsed `.base` definition for the structured editor:
 *   views, the nested filter tree, sort keys, and formulas.
 * - Recognize the simple filter shapes the editor can show as property,
 *   operator and value fields, and turn those fields back into expressions.
 * - Normalize field spellings so `cover` and `note.cover` mean the same property.
 *
 * Contracts:
 * - Rust parses, evaluates, and serializes; these helpers only reshape the DTO.
 * - Filter leaves are expression strings; anything not recognized as a simple
 *   condition is edited as text, never rewritten.
 * - Rows with an empty expression, property, or formula are dropped before
 *   saving so a half-typed row never narrows or scrambles the view.
 */
import type { BaseDefinition, BaseFilter, BaseFilterGroupKind, BaseViewDefinition } from "./app-types";

export const baseViewTypes = ["table", "cards"] as const;

export const baseFilterGroupLabels: Record<BaseFilterGroupKind, string> = {
  and: "All of",
  or: "Any of",
  not: "None of",
};

export function basePropertyKey(field: string) {
  return field.trim().replace(/^note\./, "").toLowerCase();
}

export function baseImageField(field: string) {
  const key = basePropertyKey(field);

  return key && key !== "file.name" ? `note.${key}` : "";
}

export function updateBaseView(
  definition: BaseDefinition,
  index: number,
  patch: Partial<BaseViewDefinition>,
): BaseDefinition {
  return {
    ...definition,
    views: definition.views.map((view, viewIndex) =>
      viewIndex === index ? { ...view, ...patch } : view,
    ),
  };
}

export function addBaseView(definition: BaseDefinition, type: string): BaseDefinition {
  const label = type.charAt(0).toUpperCase() + type.slice(1);
  const taken = new Set(definition.views.map((view) => view.name));
  let name = label;

  for (let counter = 2; taken.has(name); counter += 1) {
    name = `${label} ${counter}`;
  }

  return {
    ...definition,
    views: [
      ...definition.views,
      {
        name,
        type,
        order: ["file.name"],
        sort: [],
        limit: null,
        image: null,
        filters: null,
        extra: [],
      },
    ],
  };
}

export function removeBaseView(definition: BaseDefinition, index: number): BaseDefinition {
  if (definition.views.length <= 1) {
    return definition;
  }

  return {
    ...definition,
    views: definition.views.filter((_, viewIndex) => viewIndex !== index),
  };
}

export function replaceAt<T>(list: T[], index: number, item: T): T[] {
  return list.map((existing, existingIndex) => (existingIndex === index ? item : existing));
}

export function removeAt<T>(list: T[], index: number): T[] {
  return list.filter((_, existingIndex) => existingIndex !== index);
}

export function emptyFilterGroup(kind: BaseFilterGroupKind = "and"): BaseFilter {
  return { kind, filters: [] };
}

/** Replaces the node at `path` (child indices from the root); `null` removes it. */
export function replaceFilterAt(
  root: BaseFilter,
  path: number[],
  next: BaseFilter | null,
): BaseFilter | null {
  if (path.length === 0) {
    return next;
  }

  if (root.kind === "expression") {
    return root;
  }

  const [index, ...rest] = path;
  const filters = root.filters.flatMap((child, childIndex) => {
    if (childIndex !== index) {
      return [child];
    }

    const replaced = replaceFilterAt(child, rest, next);

    return replaced ? [replaced] : [];
  });

  return { ...root, filters };
}

export type SimpleConditionOperator =
  | "hasProperty"
  | "hasTag"
  | "inFolder"
  | "isEmpty"
  | "notEmpty"
  | "contains"
  | "equals"
  | "notEquals"
  | "greaterThan"
  | "lessThan";

export type SimpleCondition = {
  operator: SimpleConditionOperator;
  property: string;
  value: string;
};

export const simpleConditionOperatorLabels: Record<SimpleConditionOperator, string> = {
  hasProperty: "has property",
  hasTag: "has tag",
  inFolder: "is in folder",
  isEmpty: "is empty",
  notEmpty: "is not empty",
  contains: "contains",
  equals: "equals",
  notEquals: "does not equal",
  greaterThan: "is greater than",
  lessThan: "is less than",
};

const fileArgumentOperators: Partial<Record<SimpleConditionOperator, string>> = {
  hasProperty: "hasProperty",
  hasTag: "hasTag",
  inFolder: "inFolder",
};

const comparisonOperators: Record<string, SimpleConditionOperator> = {
  "==": "equals",
  "!=": "notEquals",
  ">": "greaterThan",
  "<": "lessThan",
};

export function simpleConditionTakesValue(operator: SimpleConditionOperator) {
  return operator !== "isEmpty" && operator !== "notEmpty";
}

/** Property-free operators put their argument in `value`. */
export function simpleConditionTakesProperty(operator: SimpleConditionOperator) {
  return !(operator in fileArgumentOperators);
}

export function parseSimpleCondition(source: string): SimpleCondition | null {
  const text = source.trim();
  const fileCall = /^file\.(hasProperty|hasTag|inFolder)\("([^"]*)"\)$/.exec(text);

  if (fileCall) {
    return { operator: fileCall[1] as SimpleConditionOperator, property: "", value: fileCall[2] };
  }

  const empty = /^(!?)([\w.]+)\.isEmpty\(\)$/.exec(text);

  if (empty) {
    return { operator: empty[1] ? "notEmpty" : "isEmpty", property: empty[2], value: "" };
  }

  const contains = /^([\w.]+)\.contains\("([^"]*)"\)$/.exec(text);

  if (contains) {
    return { operator: "contains", property: contains[1], value: contains[2] };
  }

  const comparison = /^([\w.]+)\s*(==|!=|>|<)\s*(?:"([^"]*)"|'([^']*)'|(-?\d+(?:\.\d+)?))$/.exec(text);

  if (comparison) {
    return {
      operator: comparisonOperators[comparison[2]],
      property: comparison[1],
      value: comparison[3] ?? comparison[4] ?? comparison[5] ?? "",
    };
  }

  return null;
}

export function simpleConditionSource(condition: SimpleCondition): string {
  const { operator, property } = condition;
  const literal = condition.value.replace(/"/g, "");
  const quoted = /^-?\d+(?:\.\d+)?$/.test(literal) ? literal : `"${literal}"`;

  switch (operator) {
    case "hasProperty":
    case "hasTag":
    case "inFolder":
      return `file.${fileArgumentOperators[operator]}("${literal}")`;
    case "isEmpty":
      return `${property}.isEmpty()`;
    case "notEmpty":
      return `!${property}.isEmpty()`;
    case "contains":
      return `${property}.contains("${literal}")`;
    case "equals":
      return `${property} == ${quoted}`;
    case "notEquals":
      return `${property} != ${quoted}`;
    case "greaterThan":
      return `${property} > ${quoted}`;
    case "lessThan":
      return `${property} < ${quoted}`;
  }
}

function stripEmptyFilters(filter: BaseFilter | null): BaseFilter | null {
  if (!filter) {
    return null;
  }

  if (filter.kind === "expression") {
    return filter.source.trim() ? filter : null;
  }

  return {
    ...filter,
    filters: filter.filters.flatMap((child) => {
      const stripped = stripEmptyFilters(child);

      return stripped ? [stripped] : [];
    }),
  };
}

export function stripEmptyBaseConditions(definition: BaseDefinition): BaseDefinition {
  return {
    ...definition,
    filters: stripEmptyFilters(definition.filters),
    formulas: definition.formulas.filter(
      (formula) => formula.name.trim() !== "" && formula.expression.trim() !== "",
    ),
    views: definition.views.map((view) => ({
      ...view,
      filters: stripEmptyFilters(view.filters),
      sort: view.sort.filter((entry) => entry.property.trim() !== ""),
    })),
  };
}

export function sameBaseDefinition(left: BaseDefinition, right: BaseDefinition) {
  return JSON.stringify(left) === JSON.stringify(right);
}
