/**
 * Activity heatmap helpers.
 *
 * Responsibilities:
 * - Bucket note modification times into local calendar days and lay them out
 *   as GitHub-style week columns with month labels and intensity levels.
 *
 * Contracts:
 * - Days are keyed as `YYYY-MM-DD` in the local timezone of the supplied dates.
 * - The grid always ends on `today`; cells after it in the final column are null.
 * - Helpers are deterministic for a supplied `today` and never read the clock.
 */

export type ActivityFile = { relativePath: string; modifiedMs: number };

export type ActivityDay = {
  key: string;
  date: Date;
  files: string[];
  /** 0 for no activity, then 1..4 by quartile of the busiest day. */
  level: number;
};

export type ActivityMonthLabel = { label: string; column: number };

export type ActivityHeatmap = {
  /** One column per week, Sunday first; null cells fall after `today`. */
  weeks: (ActivityDay | null)[][];
  months: ActivityMonthLabel[];
  busiest: number;
};

export const ACTIVITY_WEEKS = 53;
export const ACTIVITY_LEVELS = 4;
const DAYS_PER_WEEK = 7;

export function localDayKey(date: Date) {
  const pad = (value: number) => value.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function bucketActivityByDay(files: readonly ActivityFile[]) {
  const days = new Map<string, string[]>();
  for (const file of files) {
    const key = localDayKey(new Date(file.modifiedMs));
    const bucket = days.get(key);
    if (bucket) {
      bucket.push(file.relativePath);
    } else {
      days.set(key, [file.relativePath]);
    }
  }
  return days;
}

export function activityLevel(count: number, busiest: number) {
  if (count === 0 || busiest === 0) {
    return 0;
  }
  return Math.min(ACTIVITY_LEVELS, Math.ceil((count / busiest) * ACTIVITY_LEVELS));
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

export function buildActivityHeatmap(
  files: readonly ActivityFile[],
  today: Date,
  weeks = ACTIVITY_WEEKS,
): ActivityHeatmap {
  const byDay = bucketActivityByDay(files);
  const end = startOfDay(today);
  // Back up to the Sunday that starts the first column so every column is a
  // full week except the last, which ends on today.
  const start = addDays(end, -(weeks - 1) * DAYS_PER_WEEK - end.getDay());

  let busiest = 0;
  for (const [key, paths] of byDay) {
    if (key >= localDayKey(start) && key <= localDayKey(end)) {
      busiest = Math.max(busiest, paths.length);
    }
  }

  const columns: (ActivityDay | null)[][] = [];
  const months: ActivityMonthLabel[] = [];
  let previousMonth = -1;
  for (let week = 0; week < weeks; week += 1) {
    const column: (ActivityDay | null)[] = [];
    for (let weekday = 0; weekday < DAYS_PER_WEEK; weekday += 1) {
      const date = addDays(start, week * DAYS_PER_WEEK + weekday);
      if (date > end) {
        column.push(null);
        continue;
      }
      const key = localDayKey(date);
      const dayFiles = byDay.get(key) ?? [];
      column.push({ key, date, files: dayFiles, level: activityLevel(dayFiles.length, busiest) });
    }
    columns.push(column);

    // A month label sits over the first column whose Sunday starts a new
    // month, which is how GitHub keeps labels from crowding at month ends.
    const first = column[0];
    if (!first || first.date.getMonth() === previousMonth) {
      continue;
    }
    months.push({
      label: first.date.toLocaleDateString(undefined, { month: "short" }),
      column: week,
    });
    previousMonth = first.date.getMonth();
  }

  return { weeks: columns, months, busiest };
}

export function describeActivityDay(day: ActivityDay) {
  const date = day.date.toLocaleDateString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const count = day.files.length;
  return `${count === 0 ? "No notes" : count === 1 ? "1 note" : `${count} notes`} modified on ${date}`;
}
