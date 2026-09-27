import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  buildActivityHeatmap,
  describeActivityDay,
  type ActivityDay,
  type ActivityFile,
} from "../lib/activity-heatmap";

// Responsibilities:
// - Draw the contribution-style grid of note activity and report which day
//   the user clicks.
// Contracts:
// - Layout math lives in lib/activity-heatmap; this only renders it.
// - The grid scrolls horizontally and opens scrolled to today so the recent
//   weeks are visible in a narrow drawer.
// - The day tooltip is drawn by hand because the native `title` tooltip never
//   appears in Tauri's WebKit view. It is fixed-positioned and portalled to the
//   body: the drawer carries a transform, which would otherwise anchor a fixed
//   element to the drawer instead of the viewport.

type ActivityHeatmapProps = {
  files: readonly ActivityFile[];
  selectedDay: string | null;
  onSelectDay: (day: ActivityDay | null) => void;
};

type Tooltip = { text: string; x: number; y: number };

export function ActivityHeatmap({ files, selectedDay, onSelectDay }: ActivityHeatmapProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const heatmap = useMemo(() => buildActivityHeatmap(files, new Date()), [files]);
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);

  function showTooltip(day: ActivityDay, cell: HTMLElement) {
    const rect = cell.getBoundingClientRect();
    setTooltip({ text: describeActivityDay(day), x: rect.left + rect.width / 2, y: rect.top });
  }

  useEffect(() => {
    const scroller = scrollRef.current;
    if (scroller) {
      scroller.scrollLeft = scroller.scrollWidth;
    }
  }, [heatmap]);

  return (
    <div className="activity-heatmap" ref={scrollRef} role="group" aria-label="Note activity by day">
      <div className="activity-heatmap-months" aria-hidden="true">
        {heatmap.months.map((month) => (
          <span key={`${month.label}-${month.column}`} style={{ gridColumnStart: month.column + 1 }}>
            {month.label}
          </span>
        ))}
      </div>
      <div className="activity-heatmap-grid">
        {heatmap.weeks.map((week, column) =>
          week.map((day, row) =>
            day ? (
              <button
                key={day.key}
                type="button"
                className={selectedDay === day.key ? "activity-cell selected" : "activity-cell"}
                data-level={day.level}
                aria-label={describeActivityDay(day)}
                aria-pressed={selectedDay === day.key}
                onClick={() => onSelectDay(selectedDay === day.key ? null : day)}
                onPointerEnter={(event) => showTooltip(day, event.currentTarget)}
                onPointerLeave={() => setTooltip(null)}
                onFocus={(event) => showTooltip(day, event.currentTarget)}
                onBlur={() => setTooltip(null)}
              />
            ) : (
              <span key={`empty-${column}-${row}`} className="activity-cell future" aria-hidden="true" />
            ),
          ),
        )}
      </div>
      {tooltip
        ? createPortal(
            <div className="activity-tooltip" role="tooltip" style={{ left: tooltip.x, top: tooltip.y }}>
              {tooltip.text}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
