import { useEffect, useState, type MouseEvent as ReactMouseEvent } from "react";
import type { ActivityDay, ActivityFile } from "../lib/activity-heatmap";
import { ActivityHeatmap } from "./ActivityHeatmap";
import { VaultFileEntry } from "./VaultFileEntry";

// Responsibilities:
// - Show the activity heatmap and, once a day is picked, the notes modified
//   that day.
// Contracts:
// - The selected day is local UI state and clears whenever a fresh scan
//   arrives, so a stale day never lists files from an older listing.

type VaultActivityPanelProps = {
  files: readonly ActivityFile[];
  onOpenFile: (relativePath: string, event: ReactMouseEvent<HTMLButtonElement>) => void;
};

export function VaultActivityPanel({ files, onOpenFile }: VaultActivityPanelProps) {
  const [selectedDay, setSelectedDay] = useState<ActivityDay | null>(null);

  useEffect(() => {
    setSelectedDay(null);
  }, [files]);

  return (
    <>
      <ActivityHeatmap files={files} selectedDay={selectedDay?.key ?? null} onSelectDay={setSelectedDay} />
      {selectedDay ? (
        <div className="activity-day" role="group" aria-label="Notes modified on the selected day">
          <div className="activity-day-header">
            <strong>
              {selectedDay.date.toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </strong>
            <button type="button" className="inline-action" onClick={() => setSelectedDay(null)}>
              Clear
            </button>
          </div>
          {selectedDay.files.map((relativePath) => (
            <VaultFileEntry
              key={relativePath}
              relativePath={relativePath}
              onClick={(event) => onOpenFile(relativePath, event)}
            />
          ))}
          {selectedDay.files.length === 0 ? (
            <p className="empty-vault">No notes were modified that day.</p>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
