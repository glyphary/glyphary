import { useEffect, useMemo, useRef } from "react";
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

type ActivityHeatmapProps = {
  files: readonly ActivityFile[];
  selectedDay: string | null;
  onSelectDay: (day: ActivityDay | null) => void;
};

export function ActivityHeatmap({ files, selectedDay, onSelectDay }: ActivityHeatmapProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const heatmap = useMemo(() => buildActivityHeatmap(files, new Date()), [files]);

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
                title={describeActivityDay(day)}
                aria-label={describeActivityDay(day)}
                aria-pressed={selectedDay === day.key}
                onClick={() => onSelectDay(selectedDay === day.key ? null : day)}
              />
            ) : (
              <span key={`empty-${column}-${row}`} className="activity-cell future" aria-hidden="true" />
            ),
          ),
        )}
      </div>
    </div>
  );
}
