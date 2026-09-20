import { useEffect, useState } from "react";
import type { MouseEvent as ReactMouseEvent, ReactElement } from "react";
import type { BaseRow, BaseViewResult } from "../lib/app-types";
import { vaultImagePathCandidates } from "../app-state/documents";
import { isUrlLike } from "../lib/paths";
import {
  nativeMenuSeparator,
  popupNativeMenu,
  type NativeMenuEntry,
} from "../native/native-menus";
import { type BaseSortKey, baseFieldLabel, baseFieldValue } from "../lib/base";
import { updateBaseView } from "../lib/base-definition";
import { BaseEditor } from "./BaseEditor";
import { useBaseDocument } from "./use-base-document";
import { type BaseControlKind, useBaseViewSession } from "./use-base-view-session";

// Responsibilities:
// - Render a `.base` query result as cards or a table with its toolbar.
// Contracts:
// - Loading, the draft, and save wiring live in `useBaseDocument`; search,
//   sort, and displayed fields live in `useBaseViewSession`. This file only
//   renders.
// - Base rows are read-only navigation surfaces; opening a row delegates to App.
// - Images use the same vault-relative resolver as Markdown banners/previews.

export function BaseView({
  assetDirectory,
  content,
  dirty,
  imageLayout,
  onChange,
  onOpenFile,
  relativePath,
  vaultRoot,
}: {
  assetDirectory: string;
  content: string;
  dirty: boolean;
  imageLayout: "side" | "top";
  onChange: (nextContent: string, dirty: boolean) => void;
  onOpenFile: (relativePath: string) => void;
  relativePath: string;
  vaultRoot: string;
}) {
  const document = useBaseDocument({ content, dirty, onChange, relativePath, vaultRoot });
  const { activeViewIndex, draft, editing, result } = document;
  const activeView = result?.views[activeViewIndex] ?? null;
  const savedView = result?.definition.views[activeViewIndex];
  const session = useBaseViewSession(activeView, savedView);

  function changeSelectedFields(fields: string[]) {
    session.setSelectedFields(fields);

    if (editing && draft) {
      document.applyDraft(updateBaseView(draft, activeViewIndex, { order: fields }));
    }
  }

  if (document.loading && !result) {
    return <div className="base-view base-view-state">Loading base...</div>;
  }

  if (document.error) {
    return <div className="base-view base-view-state">{document.error}</div>;
  }

  if (!result || !draft) {
    return <div className="base-view base-view-state">No base view.</div>;
  }

  return (
    <div className="base-view">
      <div className="base-view-header">
        <h1>{result.name}</h1>
        <div className="base-view-tabs" role="tablist" aria-label="Base views">
          {draft.views.map((view, index) => (
            <button
              className={index === activeViewIndex ? "active" : ""}
              key={`${view.name}:${index}`}
              type="button"
              role="tab"
              aria-selected={index === activeViewIndex}
              onClick={() => document.setActiveViewIndex(index)}
            >
              {view.name || view.type}
            </button>
          ))}
        </div>
      </div>
      <BaseControls
        defaultSortKey={session.defaultSortKey}
        displayNames={result.displayNames}
        fieldOptions={session.fieldOptions}
        resultCount={session.visibleRows.length}
        selectedFields={session.visibleFields}
        sortDirection={session.sortDirection}
        sortField={session.sortField}
        titleQuery={session.titleQuery}
        totalCount={activeView?.rows.length ?? 0}
        openControl={session.openControl}
        editing={editing}
        onEditingChange={(next) => {
          document.setEditing(next);
          session.setOpenControl(null);
        }}
        onOpenControlChange={session.setOpenControl}
        onSelectedFieldsChange={changeSelectedFields}
        onSortDirectionChange={session.setSortDirection}
        onSortFieldChange={session.setSortField}
        onTitleQueryChange={session.setTitleQuery}
      />
      {editing ? (
        <BaseEditor
          activeViewIndex={activeViewIndex}
          definition={draft}
          dirty={dirty}
          displayNames={result.displayNames}
          error={document.editError}
          errors={result.errors}
          fieldOptions={session.fieldOptions}
          onChange={document.applyDraft}
          onDiscard={document.discardDraft}
        />
      ) : null}
      <BaseRows
        assetDirectory={assetDirectory}
        displayNames={result.displayNames}
        fields={session.visibleFields}
        imageLayout={imageLayout}
        rows={session.visibleRows}
        vaultRoot={vaultRoot}
        view={activeView}
        onOpenFile={onOpenFile}
      />
    </div>
  );
}

function BaseRows({
  assetDirectory,
  displayNames,
  fields,
  imageLayout,
  onOpenFile,
  rows,
  vaultRoot,
  view,
}: {
  assetDirectory: string;
  displayNames: Record<string, string>;
  fields: string[];
  imageLayout: "side" | "top";
  onOpenFile: (relativePath: string) => void;
  rows: BaseRow[];
  vaultRoot: string;
  view: BaseViewResult | null;
}) {
  if (!view) {
    return <div className="base-view-empty">Save the base to load this view.</div>;
  }

  if (rows.length === 0) {
    return <div className="base-view-empty">No matching notes.</div>;
  }

  if (view.type === "table") {
    return <BaseTable displayNames={displayNames} fields={fields} onOpenFile={onOpenFile} rows={rows} />;
  }

  return (
    <div className="base-card-grid">
      {rows.map((row) => (
        <BaseCard
          assetDirectory={assetDirectory}
          displayNames={displayNames}
          fields={fields}
          imageField={view.image ?? null}
          imageLayout={imageLayout}
          key={row.relativePath}
          onOpenFile={onOpenFile}
          row={row}
          vaultRoot={vaultRoot}
        />
      ))}
    </div>
  );
}

function BaseControls({
  defaultSortKey,
  displayNames,
  editing,
  fieldOptions,
  onEditingChange,
  onOpenControlChange,
  onSelectedFieldsChange,
  onSortDirectionChange,
  onSortFieldChange,
  onTitleQueryChange,
  openControl,
  resultCount,
  selectedFields,
  sortDirection,
  sortField,
  titleQuery,
  totalCount,
}: {
  defaultSortKey: BaseSortKey;
  displayNames: Record<string, string>;
  editing: boolean;
  fieldOptions: string[];
  onEditingChange: (editing: boolean) => void;
  openControl: BaseControlKind | null;
  onOpenControlChange: (control: BaseControlKind | null) => void;
  onSelectedFieldsChange: (fields: string[]) => void;
  onSortDirectionChange: (direction: "asc" | "desc") => void;
  onSortFieldChange: (field: string) => void;
  onTitleQueryChange: (query: string) => void;
  resultCount: number;
  selectedFields: string[];
  sortDirection: "asc" | "desc";
  sortField: string;
  titleQuery: string;
  totalCount: number;
}) {
  function toggleField(field: string) {
    if (selectedFields.includes(field)) {
      if (selectedFields.length === 1) {
        return;
      }

      onSelectedFieldsChange(selectedFields.filter((selected) => selected !== field));
      return;
    }

    onSelectedFieldsChange([...selectedFields, field]);
  }

  function toggleControl(control: BaseControlKind) {
    onOpenControlChange(openControl === control ? null : control);
  }

  // The native popup is preferred; the in-pane menu is the fallback when the
  // platform cannot show one.
  async function openMenu(
    control: BaseControlKind,
    entries: NativeMenuEntry[],
    event: ReactMouseEvent<HTMLButtonElement>,
  ) {
    const opened = await popupNativeMenu(entries, { x: event.clientX, y: event.clientY });

    if (opened) {
      onOpenControlChange(null);
      return;
    }

    toggleControl(control);
  }

  const sortEntries: NativeMenuEntry[] = [
    ...fieldOptions.map((field) => ({
      kind: "check" as const,
      id: `base-sort-field-${field}`,
      text: baseFieldLabel(field, displayNames),
      checked: sortField === field,
      action: () => onSortFieldChange(field),
    })),
    nativeMenuSeparator,
    ...(["asc", "desc"] as const).map((direction) => ({
      kind: "check" as const,
      id: `base-sort-${direction}`,
      text: direction === "asc" ? "Ascending" : "Descending",
      checked: sortDirection === direction,
      action: () => onSortDirectionChange(direction),
    })),
  ];
  const fieldEntries: NativeMenuEntry[] = fieldOptions.map((field) => {
    const checked = selectedFields.includes(field);

    return {
      kind: "check" as const,
      id: `base-field-${field}`,
      text: baseFieldLabel(field, displayNames),
      checked,
      enabled: !checked || selectedFields.length > 1,
      action: () => toggleField(field),
    };
  });

  return (
    <div className="base-controls" aria-label="Base view controls">
      <span className="base-result-count">
        {resultCount} of {totalCount}
      </span>
      <div className="base-control-group">
        <div className="base-control">
          <button
            aria-expanded={openControl === "search"}
            aria-label="Search titles"
            className={openControl === "search" || titleQuery ? "active" : ""}
            title="Search titles"
            type="button"
            onClick={() => toggleControl("search")}
          >
            {baseControlIcon("search")}
          </button>
          {openControl === "search" ? (
            <div className="base-control-menu compact" role="dialog" aria-label="Search titles">
              <input
                autoFocus
                type="search"
                value={titleQuery}
                placeholder="Title"
                onChange={(event) => onTitleQueryChange(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    onOpenControlChange(null);
                  }
                }}
              />
            </div>
          ) : null}
        </div>
        <div className="base-control">
          <button
            aria-expanded={openControl === "sort"}
            aria-label="Sort"
            className={
              openControl === "sort" ||
              sortField !== defaultSortKey.field ||
              sortDirection !== defaultSortKey.direction
                ? "active"
                : ""
            }
            title="Sort"
            type="button"
            onClick={(event) => void openMenu("sort", sortEntries, event)}
          >
            {baseControlIcon("sort")}
          </button>
          {openControl === "sort" ? (
            <div className="base-control-menu" role="dialog" aria-label="Sort">
              <label>
                <span>Sort by</span>
                <select
                  value={sortField}
                  onChange={(event) => onSortFieldChange(event.currentTarget.value)}
                >
                  {fieldOptions.map((field) => (
                    <option key={field} value={field}>
                      {baseFieldLabel(field, displayNames)}
                    </option>
                  ))}
                </select>
              </label>
              <div className="base-sort-options" aria-label="Sort direction">
                <button
                  className={sortDirection === "asc" ? "active" : ""}
                  type="button"
                  onClick={() => onSortDirectionChange("asc")}
                >
                  Asc
                </button>
                <button
                  className={sortDirection === "desc" ? "active" : ""}
                  type="button"
                  onClick={() => onSortDirectionChange("desc")}
                >
                  Desc
                </button>
              </div>
            </div>
          ) : null}
        </div>
        <div className="base-control">
          <button
            aria-expanded={openControl === "fields"}
            aria-label="Displayed properties"
            className={openControl === "fields" ? "active" : ""}
            title="Displayed properties"
            type="button"
            onClick={(event) => void openMenu("fields", fieldEntries, event)}
          >
            {baseControlIcon("fields")}
          </button>
          {openControl === "fields" ? (
            <div className="base-control-menu properties" role="dialog" aria-label="Displayed properties">
              {fieldOptions.map((field) => (
                <label key={field}>
                  <input
                    type="checkbox"
                    checked={selectedFields.includes(field)}
                    onChange={() => toggleField(field)}
                  />
                  <span>{baseFieldLabel(field, displayNames)}</span>
                </label>
              ))}
            </div>
          ) : null}
        </div>
        <div className="base-control">
          <button
            aria-pressed={editing}
            aria-label="Edit base"
            className={editing ? "active" : ""}
            title="Edit base"
            type="button"
            onClick={() => onEditingChange(!editing)}
          >
            {baseControlIcon("edit")}
          </button>
        </div>
      </div>
    </div>
  );
}

const controlIcons: Record<BaseControlKind | "edit", ReactElement> = {
  edit: (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-4-4L4 16v4z" />
      <path d="m13 7 4 4" />
    </svg>
  ),
  search: (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <circle cx="10.5" cy="10.5" r="5.2" />
      <path d="m15 15 4.5 4.5" />
    </svg>
  ),
  sort: (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M7 5v14" />
      <path d="m4.5 16.5 2.5 2.5 2.5-2.5" />
      <path d="M12 7h7" />
      <path d="M12 12h5" />
      <path d="M12 17h3" />
    </svg>
  ),
  fields: (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <rect x="4.5" y="5.5" width="15" height="13" rx="1.8" />
      <path d="M9.5 5.5v13" />
      <path d="M14.5 5.5v13" />
    </svg>
  ),
};

function baseControlIcon(icon: BaseControlKind | "edit") {
  return controlIcons[icon];
}

function BaseCard({
  assetDirectory,
  displayNames,
  fields,
  imageField,
  imageLayout,
  onOpenFile,
  row,
  vaultRoot,
}: {
  assetDirectory: string;
  displayNames: Record<string, string>;
  fields: string[];
  imageField: string | null;
  imageLayout: "side" | "top";
  onOpenFile: (relativePath: string) => void;
  row: BaseRow;
  vaultRoot: string;
}) {
  const imageSources = baseImageSources(vaultRoot, row, assetDirectory);
  const [imageIndex, setImageIndex] = useState(0);
  const imageSrc = imageSources[imageIndex] ?? "";

  useEffect(() => setImageIndex(0), [row.imageReference, row.relativePath, vaultRoot]);

  return (
    <button
      className={[
        "base-card",
        imageSrc ? "with-image" : "",
        imageSrc && imageLayout === "top" ? "image-top" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      type="button"
      onClick={() => onOpenFile(row.relativePath)}
    >
      <div className="base-card-body">
        <h2>{row.name}</h2>
        <dl>
          {fields
            .filter((field) => field !== "file.name" && field !== imageField)
            .map((field) => (
              <div key={field}>
                <dt>{baseFieldLabel(field, displayNames)}</dt>
                <dd>{baseFieldValue(row, field) || "-"}</dd>
              </div>
            ))}
        </dl>
      </div>
      {imageSrc ? (
        <img
          alt=""
          src={imageSrc}
          loading="lazy"
          decoding="async"
          onError={() => {
            const nextIndex = imageIndex + 1;

            if (nextIndex < imageSources.length) {
              setImageIndex(nextIndex);
            }
          }}
        />
      ) : null}
    </button>
  );
}

function baseImageSources(root: string, row: BaseRow, assetDirectory: string) {
  const reference = row.imageReference?.trim() ?? "";

  if (!reference || reference === "null" || reference === "~") {
    return [];
  }

  if (isUrlLike(reference)) {
    return [reference];
  }

  return vaultImagePathCandidates(root, reference, {
    assetDirectory,
    relativePath: row.relativePath,
  });
}

function BaseTable({
  displayNames,
  fields,
  onOpenFile,
  rows,
}: {
  displayNames: Record<string, string>;
  fields: string[];
  onOpenFile: (relativePath: string) => void;
  rows: BaseRow[];
}) {
  return (
    <div className="base-table-wrap">
      <table className="base-table">
        <thead>
          <tr>
            {fields.map((field) => (
              <th key={field}>{baseFieldLabel(field, displayNames)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.relativePath} onClick={() => onOpenFile(row.relativePath)}>
              {fields.map((field) => (
                <td key={field}>{baseFieldValue(row, field) || "-"}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
