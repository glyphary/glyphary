import { useEffect, useMemo, useState } from "react";
import type { BaseQueryResult, BaseRow, BaseViewResult } from "../lib/app-types";
import { vaultImagePathCandidates } from "../app-state/documents";
import { isUrlLike } from "../lib/paths";
import { queryBase } from "../vault/persistence";
import { baseFieldLabel, baseFieldValue } from "./base";

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

  const activeView = result?.views[activeViewIndex] ?? result?.views[0] ?? null;
  const visibleFields = useMemo(
    () => (activeView?.order.length ? activeView.order : ["file.name"]),
    [activeView],
  );

  if (loading) {
    return <div className="base-view base-view-state">Loading base...</div>;
  }

  if (error) {
    return <div className="base-view base-view-state">{error}</div>;
  }

  if (!result || !activeView) {
    return <div className="base-view base-view-state">No base view.</div>;
  }

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
      {activeView.rows.length === 0 ? (
        <div className="base-view-empty">No matching notes.</div>
      ) : activeView.type === "table" ? (
        <BaseTable fields={visibleFields} onOpenFile={onOpenFile} view={activeView} />
      ) : (
        <BaseCards
          fields={visibleFields}
          assetDirectory={assetDirectory}
          imageLayout={imageLayout}
          onOpenFile={onOpenFile}
          vaultRoot={vaultRoot}
          view={activeView}
        />
      )}
    </div>
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
