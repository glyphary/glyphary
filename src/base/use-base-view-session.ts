import { useEffect, useMemo, useState } from "react";
import type { BaseViewDefinition, BaseViewResult } from "../lib/app-types";
import { type BaseSortKey, baseAvailableFields, baseSortKeys, baseVisibleRows } from "../lib/base";

// Responsibilities:
// - Hold the per-session state of the active base view: title search, sort
//   override, displayed fields, and which toolbar control is open.
// Contracts:
// - Nothing here is persisted; it resets whenever the active view changes.
// - The view's own `sort:` keys stay as tie-breaks behind the session sort key.

export type BaseControlKind = "search" | "sort" | "fields";

const nameSortKey: BaseSortKey = { field: "file.name", direction: "asc" };

export function useBaseViewSession(activeView: BaseViewResult | null, savedView?: BaseViewDefinition) {
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [titleQuery, setTitleQuery] = useState("");
  const [sortField, setSortField] = useState(nameSortKey.field);
  const [sortDirection, setSortDirection] = useState<BaseSortKey["direction"]>(nameSortKey.direction);
  const [openControl, setOpenControl] = useState<BaseControlKind | null>(null);
  const viewSortKeys = useMemo(() => baseSortKeys(savedView?.sort ?? []), [savedView]);
  const defaultSortKey = viewSortKeys[0] ?? nameSortKey;
  const fieldOptions = useMemo(
    () => (activeView ? baseAvailableFields(activeView) : [nameSortKey.field]),
    [activeView],
  );
  const visibleFields = useMemo(() => {
    const selected = selectedFields.filter((field) => fieldOptions.includes(field));

    return selected.length ? selected : [nameSortKey.field];
  }, [fieldOptions, selectedFields]);
  const visibleRows = useMemo(
    () =>
      activeView
        ? baseVisibleRows(activeView.rows, {
            limit: savedView?.limit,
            sortKey: { field: sortField, direction: sortDirection },
            titleQuery,
            viewSortKeys,
          })
        : [],
    [activeView, savedView?.limit, sortDirection, sortField, titleQuery, viewSortKeys],
  );

  // A new active view (switching tabs, or a reload after save) starts from the
  // view's own order and sort.
  useEffect(() => {
    if (!activeView) {
      return;
    }

    const nextFields = activeView.order.length ? activeView.order : [nameSortKey.field];
    setSelectedFields(nextFields.filter((field) => fieldOptions.includes(field)));
    setSortField(defaultSortKey.field);
    setSortDirection(defaultSortKey.direction);
    setTitleQuery("");
  }, [activeView, defaultSortKey.direction, defaultSortKey.field, fieldOptions]);

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

  return {
    defaultSortKey,
    fieldOptions,
    openControl,
    setOpenControl,
    setSelectedFields,
    setSortDirection,
    setSortField,
    setTitleQuery,
    sortDirection,
    sortField,
    titleQuery,
    visibleFields,
    visibleRows,
  };
}
