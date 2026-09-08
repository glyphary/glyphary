/**
 * Link graph view-model helpers.
 *
 * Responsibilities:
 * - Turn the backend LinkGraph DTO into simulation nodes and links with neighbour sets.
 * - Compute local neighbourhoods, tag legends, node sizing, cluster hues, and the
 *   globe projection used by the graph view.
 *
 * Contracts:
 * - Node objects returned by buildGraphModel are the mutable simulation state; every
 *   other helper treats its inputs as read-only and returns new values.
 * - Nothing here touches the DOM, the canvas, or Tauri.
 */
import type { LinkGraph } from "./app-types";

export type GraphMode = "vault" | "local";

export type Point = { x: number; y: number };

export type GraphNode = {
  id: number;
  name: string;
  relativePath: string;
  cluster: number;
  tags: string[];
  degree: number;
  /** Breadth-first distance from the local-graph centre; 0 in vault mode. */
  ring: number;
  neighbors: Set<number>;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
};

export type GraphLink = { source: GraphNode; target: GraphNode };

export type GraphModel = { nodes: GraphNode[]; links: GraphLink[] };

export type LocalGraphModel = GraphModel & { center: GraphNode };

export type GlobeRotation = { lambda: number; phi: number };

export type ProjectedNode = Point & { depth: number };

export type Rgb = [number, number, number];

export const GRAPH_HIT_RADIUS = 12;
export const GRAPH_LABEL_ZOOM = 1.6;
export const GRAPH_LABEL_DEGREE = 12;
export const GRAPH_LEGEND_LIMIT = 12;
export const LOCAL_GRAPH_DEPTHS = [1, 2, 3];
/** Fraction of the shorter stage side used as the globe radius. */
export const GLOBE_RADIUS_RATIO = 0.42;
/** How much of the longitude and latitude range the flat layout is stretched across. */
export const GLOBE_LONGITUDE_SPAN = Math.PI * 0.98;
export const GLOBE_LATITUDE_SPAN = Math.PI * 0.4;
export const GLOBE_PITCH_LIMIT = 1.2;
const GOLDEN_ANGLE = 137.508;

export function nodeRadius(degree: number) {
  // Square root keeps hubs sub-linear so a 1,000-link index note stays a dot,
  // not a disc that hides its neighbours; the cap bounds the worst case.
  return 2.5 + Math.min(9, Math.sqrt(degree) * 1.4);
}

export function buildGraphModel(
  graph: LinkGraph,
  positions: ReadonlyMap<string, Point> = new Map(),
): GraphModel {
  const nodes: GraphNode[] = graph.nodes.map((node, id) => ({
    id,
    name: node.name,
    relativePath: node.relativePath,
    cluster: node.cluster,
    tags: node.tags,
    degree: 0,
    ring: 0,
    neighbors: new Set<number>(),
    // Seeding x/y from the previous layout makes d3 continue from there instead
    // of re-randomising, so recenters and depth changes do not scatter nodes.
    ...positions.get(node.relativePath),
  }));
  const links: GraphLink[] = graph.edges.map((edge) => ({
    source: nodes[edge.source],
    target: nodes[edge.target],
  }));

  for (const link of links) {
    link.source.neighbors.add(link.target.id);
    link.target.neighbors.add(link.source.id);
  }
  for (const node of nodes) {
    node.degree = node.neighbors.size;
  }

  return { nodes, links };
}

/**
 * Nodes within `depth` links of the note at `centerPath`, with `ring` set to
 * each node's distance. Returns null when the centre is not in the graph.
 */
export function localNeighborhood(
  model: GraphModel,
  centerPath: string | null,
  depth: number,
): LocalGraphModel | null {
  const center = model.nodes.find((node) => node.relativePath === centerPath);
  if (!center) {
    return null;
  }

  const rings = new Map<number, number>([[center.id, 0]]);
  let frontier = [center];
  for (let ring = 1; ring <= depth && frontier.length > 0; ring += 1) {
    const next: GraphNode[] = [];
    for (const node of frontier) {
      for (const neighborId of node.neighbors) {
        if (!rings.has(neighborId)) {
          rings.set(neighborId, ring);
          next.push(model.nodes[neighborId]);
        }
      }
    }
    frontier = next;
  }

  const nodes = model.nodes.filter((node) => rings.has(node.id));
  // Rings are written onto the shared simulation nodes rather than copied so
  // the renderer reads distance from the same objects d3 positions.
  for (const node of nodes) {
    node.ring = rings.get(node.id)!;
  }
  const links = model.links.filter(
    (link) => rings.has(link.source.id) && rings.has(link.target.id),
  );

  return { nodes, links, center };
}

export function groupLinksByCluster(links: readonly GraphLink[]) {
  // Batched by the source's cluster so the renderer can stroke each colour as
  // one path; the target's cluster is ignored because most edges are intra-cluster.
  const groups = new Map<number, GraphLink[]>();
  for (const link of links) {
    const bucket = groups.get(link.source.cluster);
    if (bucket) {
      bucket.push(link);
    } else {
      groups.set(link.source.cluster, [link]);
    }
  }
  return groups;
}

/** Most-used tags first, ties alphabetical, as [tag, count] pairs. */
export function tagLegend(
  nodes: readonly { tags: readonly string[] }[],
  limit = GRAPH_LEGEND_LIMIT,
): [string, number][] {
  const counts = new Map<string, number>();
  for (const node of nodes) {
    for (const tag of node.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit);
}

export function nodeMatchesFilter(node: GraphNode, query: string, tag: string | null) {
  return (
    (!query || node.name.toLowerCase().includes(query)) &&
    (tag === null || node.tags.includes(tag))
  );
}

/** Parses a canvas-normalized colour: `#rrggbb` or `rgb(a)(r, g, b[, a])`. */
export function parseNormalizedColor(value: string): Rgb {
  if (value.startsWith("#")) {
    return [1, 3, 5].map((offset) => parseInt(value.slice(offset, offset + 2), 16)) as Rgb;
  }
  const parts = value.match(/[\d.]+/g) ?? ["0", "0", "0"];
  return [Number(parts[0]), Number(parts[1]), Number(parts[2])];
}

export function hueOf([r, g, b]: Rgb) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) {
    // Grey accents have no hue; anchor on green so the fan-out still matches
    // the default Glyphary palette instead of starting at red.
    return 150;
  }
  const delta = max - min;
  const hue =
    max === r
      ? ((g - b) / delta) % 6
      : max === g
        ? (b - r) / delta + 2
        : (r - g) / delta + 4;
  return (hue * 60 + 360) % 360;
}

export function luminance([r, g, b]: Rgb) {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/**
 * Cluster 0 is the largest and takes the accent verbatim; the rest fan out
 * around the hue wheel by the golden angle so neighbouring ids never share a hue.
 */
export function clusterColor(accent: string, accentHue: number, dark: boolean, cluster: number) {
  if (cluster === 0) {
    return accent;
  }
  const hue = Math.round((accentHue + GOLDEN_ANGLE * cluster) % 360);
  return `hsl(${hue} ${dark ? 52 : 56}% ${dark ? 66 : 48}%)`;
}

export function globeRadius(width: number, height: number) {
  return Math.min(width, height) * GLOBE_RADIUS_RATIO;
}

/**
 * Maps the settled plane onto a sphere: x becomes longitude and y latitude,
 * normalized by the layout extent so any vault fills the globe. The result is
 * indexed by node id; `depth` is positive for front-facing nodes.
 */
export function projectOntoGlobe(
  nodes: readonly GraphNode[],
  radius: number,
  rotation: GlobeRotation,
): ProjectedNode[] {
  // Extents start at 1 so a single node or an unsettled layout at the origin
  // cannot divide by zero; they track the live layout so the globe fills as it settles.
  let maxX = 1;
  let maxY = 1;
  for (const node of nodes) {
    maxX = Math.max(maxX, Math.abs(node.x ?? 0));
    maxY = Math.max(maxY, Math.abs(node.y ?? 0));
  }

  const cosPitch = Math.cos(rotation.phi);
  const sinPitch = Math.sin(rotation.phi);
  const projected: ProjectedNode[] = [];
  for (const node of nodes) {
    const longitude = ((node.x ?? 0) / maxX) * GLOBE_LONGITUDE_SPAN + rotation.lambda;
    const latitude = ((node.y ?? 0) / maxY) * GLOBE_LATITUDE_SPAN;
    const cosLat = Math.cos(latitude);
    const x = cosLat * Math.sin(longitude);
    const y = Math.sin(latitude);
    const z = cosLat * Math.cos(longitude);
    projected[node.id] = {
      x: radius * x,
      y: -radius * (y * cosPitch - z * sinPitch),
      depth: y * sinPitch + z * cosPitch,
    };
  }
  return projected;
}

/** Applies a screen-space drag of (dx, dy) pixels at the given pixel-per-radian scale. */
export function rotateGlobe(
  rotation: GlobeRotation,
  dx: number,
  dy: number,
  scale: number,
): GlobeRotation {
  return {
    lambda: rotation.lambda + dx / scale,
    // Screen y grows downward, hence the subtraction; the clamp stops the globe
    // flipping over the poles where the projection would mirror itself.
    phi: Math.max(-GLOBE_PITCH_LIMIT, Math.min(GLOBE_PITCH_LIMIT, rotation.phi - dy / scale)),
  };
}

/** Nearest front-facing projected node within `radius` of `point`, or null. */
export function nearestProjectedNode(
  nodes: readonly GraphNode[],
  projected: readonly ProjectedNode[],
  point: Point,
  radius: number,
) {
  let best: GraphNode | null = null;
  let bestDistance = radius * radius;
  for (const node of nodes) {
    const candidate = projected[node.id];
    if (!candidate || candidate.depth <= 0) {
      continue;
    }
    const distance = (candidate.x - point.x) ** 2 + (candidate.y - point.y) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = node;
    }
  }
  return best;
}
