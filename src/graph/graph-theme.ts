import { clusterColor, hueOf, luminance, parseNormalizedColor } from "../lib/link-graph";

// Responsibilities:
// - Read the graph's colours and font from the theme's CSS variables once per
//   layout, and hand out a memoized cluster colour function.
// Contracts:
// - Colours are normalized through the canvas so any CSS colour syntax the
//   theme uses resolves to something the hue math can read.

export type GraphTheme = {
  accent: string;
  background: string;
  surface: string;
  label: string;
  fontFamily: string;
  clusterColor: (cluster: number) => string;
};

function normalizeCssColor(context: CanvasRenderingContext2D, value: string) {
  // The canvas parses any CSS colour and reads back `#rrggbb` or `rgba(...)`.
  // Resetting first matters: an unparseable value leaves the previous fillStyle
  // in place, which would silently inherit whatever was drawn last.
  context.fillStyle = "#000000";
  context.fillStyle = value;
  return parseNormalizedColor(String(context.fillStyle));
}

export function readGraphTheme(
  canvas: HTMLCanvasElement,
  context: CanvasRenderingContext2D,
): GraphTheme {
  const style = getComputedStyle(canvas);
  const variable = (name: string, fallback: string) =>
    style.getPropertyValue(name).trim() || fallback;

  const accent = variable("--accent", "#2f6846");
  const background = variable("--app-bg", "#f3f1eb");
  const accentHue = hueOf(normalizeCssColor(context, accent));
  const dark = luminance(normalizeCssColor(context, background)) < 0.5;
  const cache = new Map<number, string>();

  return {
    accent,
    background,
    surface: variable("--surface", "#faf8f3"),
    label: variable("--heading", "#213227"),
    fontFamily: variable("--glyphary-font-ui", "system-ui, sans-serif"),
    clusterColor: (cluster) => {
      let color = cache.get(cluster);
      if (!color) {
        color = clusterColor(accent, accentHue, dark, cluster);
        cache.set(cluster, color);
      }
      return color;
    },
  };
}
