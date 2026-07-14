/**
 * Toolbar icon names and SVG rendering.
 *
 * Responsibilities:
 * - Keep editor toolbar icon markup out of the main app shell.
 * - Provide a closed set of icon names used by toolbar actions.
 *
 * Contracts:
 * - Icons are decorative; callers provide accessible labels on the wrapping
 *   button rather than inside these SVGs.
 * - This module stays pure React markup and must not depend on editor state.
 */

export type ToolbarIconName =
  | "bullet-list"
  | "ordered-list"
  | "task-list"
  | "quote"
  | "code"
  | "html"
  | "table"
  | "columns"
  | "callout"
  | "file-plus"
  | "folder-plus"
  | "refresh"
  | "task-open"
  | "task-done";

export function renderToolbarIcon(icon: ToolbarIconName) {
  switch (icon) {
    case "bullet-list":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <circle cx="6" cy="7" r="1.2" />
          <circle cx="6" cy="12" r="1.2" />
          <circle cx="6" cy="17" r="1.2" />
          <path d="M10 7h8" />
          <path d="M10 12h8" />
          <path d="M10 17h8" />
        </svg>
      );
    case "ordered-list":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M5.2 8V4.8L4.4 5.3" />
          <path d="M4.2 11.2h2.2l-2.2 2.6h2.4" />
          <path d="M4.2 16.2h2.1l-1.2 1.2c.8 0 1.4.4 1.4 1.1 0 .8-.7 1.3-1.7 1.3-.4 0-.8-.1-1.1-.2" />
          <path d="M10 6h8" />
          <path d="M10 12h8" />
          <path d="M10 18h8" />
        </svg>
      );
    case "task-list":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <rect x="4.5" y="5.2" width="3.5" height="3.5" rx="0.7" />
          <rect x="4.5" y="10.2" width="3.5" height="3.5" rx="0.7" />
          <rect x="4.5" y="15.2" width="3.5" height="3.5" rx="0.7" />
          <path d="m5.3 6.9 1 1 2-2.3" />
          <path d="M10.5 7h8" />
          <path d="M10.5 12h8" />
          <path d="M10.5 17h8" />
        </svg>
      );
    case "quote":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M8.5 7.5c-1.7 1.4-2.6 3-2.6 5v3.2h4.5v-4.5H8c.1-1 .7-2 1.9-3.1z" />
          <path d="M16.4 7.5c-1.7 1.4-2.6 3-2.6 5v3.2h4.5v-4.5h-2.4c.1-1 .7-2 1.9-3.1z" />
        </svg>
      );
    case "code":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="m9 8-4 4 4 4" />
          <path d="m15 8 4 4-4 4" />
          <path d="m13 6-2 12" />
        </svg>
      );
    case "html":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M6 4.5h8.2L18 8.3v11.2H6z" />
          <path d="M14 4.5V8h4" />
          <path d="M8.2 12.1h1.1v4.1H8.2z" />
          <path d="M10.4 12.1h3" />
          <path d="M11.4 12.1v4.1" />
          <path d="M14.1 16.2v-4.1l1.2 2 1.2-2v4.1" />
        </svg>
      );
    case "table":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <rect x="4.5" y="5.5" width="15" height="13" rx="1.6" />
          <path d="M4.5 10h15" />
          <path d="M9.5 5.5v13" />
          <path d="M14.5 5.5v13" />
          <path d="M4.5 14.2h15" />
        </svg>
      );
    case "columns":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <rect x="4.5" y="5.5" width="15" height="13" rx="1.8" />
          <path d="M12 5.5v13" />
          <path d="M7.4 9h2" />
          <path d="M7.4 12h2" />
          <path d="M14.6 9h2" />
          <path d="M14.6 12h2" />
        </svg>
      );
    case "callout":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <rect x="4.5" y="5.5" width="15" height="13" rx="2" />
          <path d="M8 5.5v13" />
          <path d="M11 9h5.2" />
          <path d="M11 12.4h4" />
          <path d="m8.2 18.5 2.2 2" />
        </svg>
      );
    case "file-plus":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M13 5H7.5A2.5 2.5 0 0 0 5 7.5v9A2.5 2.5 0 0 0 7.5 19h9a2.5 2.5 0 0 0 2.5-2.5V11" />
          <path d="m10.5 14.8.5-2.6 5.9-5.9a1.55 1.55 0 0 1 2.2 2.2l-5.9 5.9z" />
          <path d="m16 7.2 2 2" />
        </svg>
      );
    case "folder-plus":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M3.5 8.5V7.3c0-1 .8-1.8 1.8-1.8h4.2l2 2h7.2c1 0 1.8.8 1.8 1.8v3.2" />
          <path d="M3.5 8.5v8.2c0 1 .8 1.8 1.8 1.8h8.2" />
          <circle cx="17.5" cy="16.5" r="3.5" />
          <path d="M17.5 14.7v3.6" />
          <path d="M15.7 16.5h3.6" />
        </svg>
      );
    case "refresh":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M20 7.5v5h-5" />
          <path d="M19.1 12.2a7.1 7.1 0 0 0-12-4.7L4.5 10" />
          <path d="M4 16.5v-5h5" />
          <path d="M4.9 11.8a7.1 7.1 0 0 0 12 4.7l2.6-2.5" />
        </svg>
      );
    case "task-open":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <rect x="5.5" y="5.5" width="13" height="13" rx="3" />
        </svg>
      );
    case "task-done":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <rect x="5.5" y="5.5" width="13" height="13" rx="3" />
          <path d="m8.7 12.3 2.3 2.3 4.6-5.1" />
        </svg>
      );
  }
}
