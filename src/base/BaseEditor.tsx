import { useEffect, useId, useState } from "react";
import type {
  BaseDefinition,
  BaseFilter,
  BaseFilterGroupKind,
  BaseFormula,
  BaseSort,
} from "../lib/app-types";
import {
  type SimpleCondition,
  type SimpleConditionOperator,
  addBaseView,
  baseFilterGroupLabels,
  baseImageField,
  basePropertyKey,
  baseViewTypes,
  emptyFilterGroup,
  parseSimpleCondition,
  removeAt,
  removeBaseView,
  replaceAt,
  replaceFilterAt,
  sameBaseDefinition,
  simpleConditionOperatorLabels,
  simpleConditionSource,
  simpleConditionTakesProperty,
  simpleConditionTakesValue,
  updateBaseView,
} from "../lib/base-definition";
import { baseFieldLabel } from "../lib/base";

// Responsibilities:
// - Structured editing of the active view, its sort keys, its filter tree, the
//   base-wide filter tree, and the formulas.
// Contracts:
// - Text fields commit on blur or Enter; selects and buttons commit at once.
// - A commit hands the whole definition to the parent, which owns the draft
//   and turns it into unsaved tab content. Saving is the tab's normal save.
// - A filter leaf the editor recognizes is shown as fields; any other
//   expression is edited as text and never rewritten.

export function BaseEditor({
  activeViewIndex,
  definition,
  dirty,
  displayNames,
  error,
  errors,
  fieldOptions,
  onChange,
  onDiscard,
}: {
  activeViewIndex: number;
  definition: BaseDefinition;
  dirty: boolean;
  displayNames: Record<string, string>;
  error: string;
  errors: string[];
  fieldOptions: string[];
  onChange: (next: BaseDefinition, nextViewIndex?: number) => void;
  onDiscard: () => void;
}) {
  // Text fields edit this local copy and hand it up on blur or Enter so the
  // tab is not re-rendered to file text on every keystroke.
  const [draft, setDraft] = useState(definition);
  const propertyListId = useId();
  const view = draft.views[activeViewIndex];
  const propertyNames = Array.from(
    new Set(fieldOptions.filter((field) => field !== "file.name").map(basePropertyKey)),
  );

  useEffect(() => setDraft(definition), [definition]);

  function commit(next: BaseDefinition, nextViewIndex?: number) {
    setDraft(next);

    if (!sameBaseDefinition(next, definition)) {
      onChange(next, nextViewIndex);
    }
  }

  function commitDraft() {
    commit(draft);
  }

  function change(next: BaseDefinition, immediate: boolean) {
    (immediate ? commit : setDraft)(next);
  }

  if (!view) {
    return null;
  }

  const imageValue = baseImageField(view.image ?? "");

  return (
    <div className="base-editor" aria-label="Edit base">
      <datalist id={propertyListId}>
        {propertyNames.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
      <section className="base-editor-section">
        <header className="base-editor-section-header">
          <h2>View</h2>
          <span className="base-editor-actions">
            <button
              className="settings-inline-action"
              type="button"
              onClick={() => commit(addBaseView(draft, "table"), draft.views.length)}
            >
              Add View
            </button>
            <button
              className="settings-inline-action"
              type="button"
              disabled={draft.views.length <= 1}
              onClick={() =>
                commit(removeBaseView(draft, activeViewIndex), Math.max(0, activeViewIndex - 1))
              }
            >
              Remove View
            </button>
          </span>
        </header>
        <div className="base-editor-row">
          <label>
            <span>Name</span>
            <input
              type="text"
              value={view.name}
              onChange={(event) =>
                setDraft(updateBaseView(draft, activeViewIndex, { name: event.currentTarget.value }))
              }
              {...commitOn(commitDraft)}
            />
          </label>
          <label>
            <span>Layout</span>
            <select
              value={baseViewTypes.includes(view.type as (typeof baseViewTypes)[number]) ? view.type : ""}
              onChange={(event) =>
                commit(updateBaseView(draft, activeViewIndex, { type: event.currentTarget.value }))
              }
            >
              {!baseViewTypes.includes(view.type as (typeof baseViewTypes)[number]) ? (
                <option value="">{view.type}</option>
              ) : null}
              {baseViewTypes.map((type) => (
                <option key={type} value={type}>
                  {baseFieldLabel(type)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Limit</span>
            <input
              min={0}
              placeholder="all"
              type="number"
              value={view.limit ?? ""}
              onChange={(event) =>
                setDraft(
                  updateBaseView(draft, activeViewIndex, {
                    limit: event.currentTarget.value ? Number(event.currentTarget.value) : null,
                  }),
                )
              }
              {...commitOn(commitDraft)}
            />
          </label>
          {view.type === "cards" ? (
            <label>
              <span>Image</span>
              <select
                value={imageValue}
                onChange={(event) =>
                  commit(
                    updateBaseView(draft, activeViewIndex, {
                      image: event.currentTarget.value || null,
                    }),
                  )
                }
              >
                <option value="">None</option>
                {imageValue && !propertyNames.includes(basePropertyKey(imageValue)) ? (
                  <option value={imageValue}>{baseFieldLabel(imageValue, displayNames)}</option>
                ) : null}
                {propertyNames.map((name) => (
                  <option key={name} value={`note.${name}`}>
                    {baseFieldLabel(name, displayNames)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      </section>
      <SortList
        propertyListId={propertyListId}
        sort={view.sort}
        onChange={(sort, immediate) =>
          change(updateBaseView(draft, activeViewIndex, { sort }), immediate)
        }
        onBlur={commitDraft}
      />
      <FilterTree
        propertyListId={propertyListId}
        root={view.filters}
        title="Filters for this view"
        onChange={(filters, immediate) =>
          change(updateBaseView(draft, activeViewIndex, { filters }), immediate)
        }
        onBlur={commitDraft}
      />
      <FilterTree
        propertyListId={propertyListId}
        root={draft.filters}
        title="Filters for all views"
        onChange={(filters, immediate) => change({ ...draft, filters }, immediate)}
        onBlur={commitDraft}
      />
      <FormulaList
        formulas={draft.formulas}
        onChange={(formulas, immediate) => change({ ...draft, formulas }, immediate)}
        onBlur={commitDraft}
      />
      <div className="base-editor-row base-editor-footer">
        <span className="base-editor-note">
          {dirty ? "Unsaved changes. Rows show the saved base until you save." : "Saved."}
        </span>
        <button
          className="settings-inline-action"
          type="button"
          disabled={!dirty}
          onClick={onDiscard}
        >
          Discard Changes
        </button>
      </div>
      {error ? <p className="base-editor-error">{error}</p> : null}
      {errors.length ? (
        <ul className="base-editor-errors" aria-label="Base problems">
          {errors.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function FilterTree({
  onBlur,
  onChange,
  propertyListId,
  root,
  title,
}: {
  onBlur: () => void;
  onChange: (next: BaseFilter | null, immediate: boolean) => void;
  propertyListId: string;
  root: BaseFilter | null;
  title: string;
}) {
  return (
    <section className="base-editor-section">
      <h2>{title}</h2>
      {root && root.kind !== "expression" ? (
        <FilterGroup
          group={root}
          path={[]}
          propertyListId={propertyListId}
          root={root}
          onBlur={onBlur}
          onChange={onChange}
        />
      ) : (
        <button
          className="base-editor-add"
          type="button"
          onClick={() => onChange(emptyFilterGroup("and"), false)}
        >
          <span>+</span>Add filters
        </button>
      )}
    </section>
  );
}

function FilterGroup({
  group,
  onBlur,
  onChange,
  path,
  propertyListId,
  root,
}: {
  group: Extract<BaseFilter, { filters: BaseFilter[] }>;
  onBlur: () => void;
  onChange: (next: BaseFilter | null, immediate: boolean) => void;
  path: number[];
  propertyListId: string;
  root: BaseFilter;
}) {
  function replace(next: BaseFilter | null, immediate: boolean) {
    onChange(replaceFilterAt(root, path, next), immediate);
  }

  return (
    <div className="base-filter-group">
      <div className="base-editor-row">
        <select
          aria-label="Group type"
          value={group.kind}
          onChange={(event) =>
            replace({ ...group, kind: event.currentTarget.value as BaseFilterGroupKind }, true)
          }
        >
          {(Object.keys(baseFilterGroupLabels) as BaseFilterGroupKind[]).map((kind) => (
            <option key={kind} value={kind}>
              {baseFilterGroupLabels[kind]}
            </option>
          ))}
        </select>
        <button
          className="base-editor-add"
          type="button"
          onClick={() =>
            replace(
              { ...group, filters: [...group.filters, { kind: "expression", source: "" }] },
              false,
            )
          }
        >
          <span>+</span>Condition
        </button>
        <button
          className="base-editor-add"
          type="button"
          onClick={() =>
            replace({ ...group, filters: [...group.filters, emptyFilterGroup("and")] }, false)
          }
        >
          <span>+</span>Group
        </button>
        <span className="base-editor-actions">
          <RemoveButton
            label={path.length ? "Remove group" : "Remove filters"}
            onClick={() => replace(null, true)}
          />
        </span>
      </div>
      {group.filters.map((child, index) =>
        child.kind === "expression" ? (
          <ConditionRow
            key={index}
            leaf={child}
            path={[...path, index]}
            propertyListId={propertyListId}
            root={root}
            onBlur={onBlur}
            onChange={onChange}
          />
        ) : (
          <FilterGroup
            key={index}
            group={child}
            path={[...path, index]}
            propertyListId={propertyListId}
            root={root}
            onBlur={onBlur}
            onChange={onChange}
          />
        ),
      )}
    </div>
  );
}

function ConditionRow({
  leaf,
  onBlur,
  onChange,
  path,
  propertyListId,
  root,
}: {
  leaf: Extract<BaseFilter, { kind: "expression" }>;
  onBlur: () => void;
  onChange: (next: BaseFilter | null, immediate: boolean) => void;
  path: number[];
  propertyListId: string;
  root: BaseFilter;
}) {
  const simple = parseSimpleCondition(leaf.source);
  const [rawMode, setRawMode] = useState(false);
  const useFields = simple !== null && !rawMode;
  const fields: SimpleCondition = simple ?? { operator: "hasProperty", property: "", value: "" };

  function replace(next: BaseFilter | null, immediate: boolean) {
    onChange(replaceFilterAt(root, path, next), immediate);
  }

  function setFields(next: SimpleCondition, immediate: boolean) {
    replace({ kind: "expression", source: simpleConditionSource(next) }, immediate);
  }

  return (
    <div className="base-editor-row base-filter-condition">
      {useFields ? (
        <>
          {simpleConditionTakesProperty(fields.operator) ? (
            <input
              aria-label="Property"
              list={propertyListId}
              placeholder="property"
              type="text"
              value={fields.property}
              onChange={(event) =>
                setFields({ ...fields, property: event.currentTarget.value }, false)
              }
              {...commitOn(onBlur)}
            />
          ) : null}
          <select
            aria-label="Operator"
            value={fields.operator}
            onChange={(event) =>
              setFields(
                { ...fields, operator: event.currentTarget.value as SimpleConditionOperator },
                true,
              )
            }
          >
            {(Object.keys(simpleConditionOperatorLabels) as SimpleConditionOperator[]).map(
              (operator) => (
                <option key={operator} value={operator}>
                  {simpleConditionOperatorLabels[operator]}
                </option>
              ),
            )}
          </select>
          {simpleConditionTakesValue(fields.operator) ? (
            <input
              aria-label="Value"
              list={simpleConditionTakesProperty(fields.operator) ? undefined : propertyListId}
              placeholder="value"
              type="text"
              value={fields.value}
              onChange={(event) => setFields({ ...fields, value: event.currentTarget.value }, false)}
              {...commitOn(onBlur)}
            />
          ) : null}
          <button
            className="base-editor-link"
            type="button"
            title="Edit as an expression"
            onClick={() => setRawMode(true)}
          >
            expression
          </button>
        </>
      ) : (
        <>
          <input
            aria-label="Filter expression"
            className="base-editor-wide"
            placeholder={'status == "done" && file.hasTag("book")'}
            spellCheck={false}
            type="text"
            value={leaf.source}
            onChange={(event) =>
              replace({ kind: "expression", source: event.currentTarget.value }, false)
            }
            {...commitOn(onBlur)}
          />
          {simple && rawMode ? (
            <button
              className="base-editor-link"
              type="button"
              title="Edit as fields"
              onClick={() => setRawMode(false)}
            >
              fields
            </button>
          ) : null}
        </>
      )}
      <RemoveButton
        label={`Remove filter ${leaf.source || path.join(".")}`}
        onClick={() => replace(null, true)}
      />
    </div>
  );
}

function FormulaList({
  formulas,
  onBlur,
  onChange,
}: {
  formulas: BaseFormula[];
  onBlur: () => void;
  onChange: (formulas: BaseFormula[], immediate: boolean) => void;
}) {
  function replace(index: number, formula: BaseFormula) {
    onChange(replaceAt(formulas, index, formula), false);
  }

  return (
    <section className="base-editor-section">
      <h2>Formulas</h2>
      {formulas.map((formula, index) => (
        <div className="base-editor-row" key={index}>
          <input
            aria-label="Formula name"
            placeholder="name"
            spellCheck={false}
            type="text"
            value={formula.name}
            onChange={(event) =>
              replace(index, { ...formula, name: event.currentTarget.value.replace(/\s+/g, "_") })
            }
            {...commitOn(onBlur)}
          />
          <input
            aria-label="Formula expression"
            className="base-editor-wide"
            placeholder={'if(price, "$" + price.toFixed(2), "")'}
            spellCheck={false}
            type="text"
            value={formula.expression}
            onChange={(event) => replace(index, { ...formula, expression: event.currentTarget.value })}
            {...commitOn(onBlur)}
          />
          <RemoveButton
            label={`Remove formula ${formula.name || index + 1}`}
            onClick={() => onChange(removeAt(formulas, index), true)}
          />
        </div>
      ))}
      <button
        className="base-editor-add"
        type="button"
        onClick={() => onChange([...formulas, { name: "", expression: "" }], false)}
      >
        <span>+</span>Add formula
      </button>
    </section>
  );
}

function SortList({
  onBlur,
  onChange,
  propertyListId,
  sort,
}: {
  onBlur: () => void;
  onChange: (sort: BaseSort[], immediate: boolean) => void;
  propertyListId: string;
  sort: BaseSort[];
}) {
  function replace(index: number, entry: BaseSort, immediate: boolean) {
    onChange(replaceAt(sort, index, entry), immediate);
  }

  return (
    <section className="base-editor-section">
      <h2>Sort</h2>
      {sort.map((entry, index) => (
        <div className="base-editor-row" key={index}>
          <input
            aria-label="Sort property"
            list={propertyListId}
            placeholder="property"
            type="text"
            value={entry.property}
            onChange={(event) =>
              replace(index, { ...entry, property: event.currentTarget.value }, false)
            }
            {...commitOn(onBlur)}
          />
          <select
            aria-label="Sort direction"
            value={entry.direction.toLowerCase() === "desc" ? "DESC" : "ASC"}
            onChange={(event) =>
              replace(index, { ...entry, direction: event.currentTarget.value }, true)
            }
          >
            <option value="ASC">Ascending</option>
            <option value="DESC">Descending</option>
          </select>
          <RemoveButton
            label={`Remove sort ${entry.property || index + 1}`}
            onClick={() => onChange(removeAt(sort, index), true)}
          />
        </div>
      ))}
      <button
        className="base-editor-add"
        type="button"
        onClick={() => onChange([...sort, { property: "file.name", direction: "ASC" }], true)}
      >
        <span>+</span>Add sort key
      </button>
    </section>
  );
}

function commitOn(onBlur: () => void) {
  return {
    onBlur,
    onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
      if (event.key === "Enter") {
        event.currentTarget.blur();
      }
    },
  };
}

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      aria-label={label}
      className="base-editor-remove"
      title={label}
      type="button"
      onClick={onClick}
    >
      −
    </button>
  );
}
