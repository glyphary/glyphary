import { useEffect, useMemo, useState } from "react";
import type { BaseQueryResult, BaseRow, BaseViewResult } from "../lib/app-types";
import { vaultImagePathCandidates } from "../app-state/documents";
import { isUrlLike } from "../lib/paths";
import { queryBase } from "../vault/persistence";
import {
  baseAvailableFields,
  baseFieldLabel,
  baseFieldValue,
  baseRowsMatchingTitle,
  baseSortedRows,
} from "./base";

// Responsibilities:
// - Render supported `.base` query results as cards or tables.
// - Keep base loading/error state local to the pane.
// Contracts:
// - Base rows are read-only navigation surfaces; opening a row delegates to App.
// - Images use the same vault-relative resolver as Markdown banners/previews.

export function BaseView({
  onOpenFile,
  relativePath,
  assetDirectory,
  imageLayout,
  vaultRoot,
}: {
  assetDirectory: string;
  imageLayout: "side" | "top";
  onOpenFile: (relativePath: string) => void;
  relativePath: string;
  vaultRoot: string;
}) {
  const [result, setResult] = useState<BaseQueryResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeViewIndex, setActiveViewIndex] = useState(0);
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [titleQuery, setTitleQuery] = useState("");
  const [sortField, setSortField] = useState("file.name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [openControl, setOpenControl] = useState<"search" | "sort" | "fields" | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (!vaultRoot || !relativePath) {
      setResult(null);
      return;
    }

    setLoading(true);
    setError("");
    queryBase(vaultRoot, relativePath)
      .then((nextResult) => {
        if (cancelled) {
          return;
        }

        setResult(nextResult);
        setActiveViewIndex(0);
      })
      .catch((nextError) => {
        if (cancelled) {
          return;
        }

        setError(nextError instanceof Error ? nextError.message : String(nextError));
        setResult(null);
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [relativePath, vaultRoot]);

  useEffect(() => {
    if (!openControl) {
      return;
    }

    function closeBaseControl(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented) {
        return;
      }

      event.preventDefault();
      setOpenControl(null);
    }

    window.addEventListener("keydown", closeBaseControl, { capture: true });

    return () => {
      window.removeEventListener("keydown", closeBaseControl, { capture: true });
    };
  }, [openControl]);

  const activeView = result?.views[activeViewIndex] ?? result?.views[0] ?? null;
  const fieldOptions = useMemo(
    () => (activeView ? baseAvailableFields(activeView) : ["file.name"]),
    [activeView],
  );
  const visibleFields = useMemo(() => {
    const selected = selectedFields.filter((field) => fieldOptions.includes(field));

    return selected.length ? selected : ["file.name"];
  }, [fieldOptions, selectedFields]);
  const visibleRows = useMemo(() => {
    if (!activeView) {
      return [];
    }

    return baseSortedRows(
      baseRowsMatchingTitle(activeView.rows, titleQuery),
      sortField,
      sortDirection,
    );
  }, [activeView, sortDirection, sortField, titleQuery]);
  const visibleView = useMemo(
    () => (activeView ? { ...activeView, rows: visibleRows } : null),
    [activeView, visibleRows],
  );

  useEffect(() => {
    if (!activeView) {
      return;
    }

    const nextFields = activeView.order.length ? activeView.order : ["file.name"];
    setSelectedFields(nextFields.filter((field) => fieldOptions.includes(field)));
    setSortField("file.name");
    setSortDirection("asc");
    setTitleQuery("");
  }, [activeView, fieldOptions]);

  if (loading) {
    return <div className="base-view base-view-state">Loading base...</div>;
  }

  if (error) {
    return <div className="base-view base-view-state">{error}</div>;
  }

  if (!result || !activeView) {
    return <div className="base-view base-view-state">No base view.</div>;
  }

  const renderedView = visibleView ?? activeView;

  return (
    <div className="base-view">
      <div className="base-view-header">
        <h1>{result.name}</h1>
        <div className="base-view-tabs" role="tablist" aria-label="Base views">
          {result.views.map((view, index) => (
            <button
              className={index === activeViewIndex ? "active" : ""}
              key={`${view.name}:${index}`}
              type="button"
              role="tab"
              aria-selected={index === activeViewIndex}
              onClick={() => setActiveViewIndex(index)}
            >
              {view.name}
            </button>
          ))}
        </div>
      </div>
      <BaseControls
        fieldOptions={fieldOptions}
        resultCount={visibleRows.length}
        selectedFields={visibleFields}
        sortDirection={sortDirection}
        sortField={sortField}
        titleQuery={titleQuery}
        totalCount={activeView.rows.length}
        openControl={openControl}
        onOpenControlChange={setOpenControl}
        onSelectedFieldsChange={setSelectedFields}
        onSortDirectionChange={setSortDirection}
        onSortFieldChange={setSortField}
        onTitleQueryChange={setTitleQuery}
      />
      {renderedView.rows.length === 0 ? (
        <div className="base-view-empty">No matching notes.</div>
      ) : activeView.type === "table" ? (
        <BaseTable fields={visibleFields} onOpenFile={onOpenFile} view={renderedView} />
      ) : (
        <BaseCards
          fields={visibleFields}
          assetDirectory={assetDirectory}
          imageLayout={imageLayout}
          onOpenFile={onOpenFile}
          vaultRoot={vaultRoot}
          view={renderedView}
        />
      )}
    </div>
  );
}

function BaseControls({
  fieldOptions,
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
  fieldOptions: string[];
  openControl: "search" | "sort" | "fields" | null;
  onOpenControlChange: (control: "search" | "sort" | "fields" | null) => void;
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

  function toggleControl(control: "search" | "sort" | "fields") {
    onOpenControlChange(openControl === control ? null : control);
  }

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
              openControl === "sort" || sortField !== "file.name" || sortDirection !== "asc"
                ? "active"
                : ""
            }
            title="Sort"
            type="button"
            onClick={() => toggleControl("sort")}
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
                      {baseFieldLabel(field)}
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
            onClick={() => toggleControl("fields")}
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
                  <span>{baseFieldLabel(field)}</span>
                </label>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function baseControlIcon(icon: "search" | "sort" | "fields") {
  if (icon === "search") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <circle cx="10.5" cy="10.5" r="5.2" />
        <path d="m15 15 4.5 4.5" />
      </svg>
    );
  }

  if (icon === "sort") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M7 5v14" />
        <path d="m4.5 16.5 2.5 2.5 2.5-2.5" />
        <path d="M12 7h7" />
        <path d="M12 12h5" />
        <path d="M12 17h3" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <rect x="4.5" y="5.5" width="15" height="13" rx="1.8" />
      <path d="M9.5 5.5v13" />
      <path d="M14.5 5.5v13" />
    </svg>
  );
}

function BaseCards({
  assetDirectory,
  fields,
  imageLayout,
  onOpenFile,
  vaultRoot,
  view,
}: {
  assetDirectory: string;
  fields: string[];
  imageLayout: "side" | "top";
  onOpenFile: (relativePath: string) => void;
  vaultRoot: string;
  view: BaseViewResult;
}) {
  return (
    <div className="base-card-grid">
      {view.rows.map((row) => {
        return (
          <BaseCard
            assetDirectory={assetDirectory}
            fields={fields}
            imageLayout={imageLayout}
            key={row.relativePath}
            onOpenFile={onOpenFile}
            row={row}
            vaultRoot={vaultRoot}
            view={view}
          />
        );
      })}
    </div>
  );
}

function BaseCard({
  assetDirectory,
  fields,
  imageLayout,
  onOpenFile,
  row,
  vaultRoot,
  view,
}: {
  assetDirectory: string;
  fields: string[];
  imageLayout: "side" | "top";
  onOpenFile: (relativePath: string) => void;
  row: BaseRow;
  vaultRoot: string;
  view: BaseViewResult;
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
            .filter((field) => field !== "file.name" && field !== view.image)
            .map((field) => (
              <div key={field}>
                <dt>{baseFieldLabel(field)}</dt>
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
  fields,
  onOpenFile,
  view,
}: {
  fields: string[];
  onOpenFile: (relativePath: string) => void;
  view: BaseViewResult;
}) {
  return (
    <div className="base-table-wrap">
      <table className="base-table">
        <thead>
          <tr>
            {fields.map((field) => (
              <th key={field}>{baseFieldLabel(field)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {view.rows.map((row) => (
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
