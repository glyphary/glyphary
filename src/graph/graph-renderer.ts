import {
  GRAPH_LABEL_DEGREE,
  GRAPH_LABEL_ZOOM,
  globeRadius,
  nodeMatchesFilter,
  nodeRadius,
  type GraphLink,
  type GraphNode,
  type Point,
  type ProjectedNode,
} from "../lib/link-graph";
import type { GraphTheme } from "./graph-theme";

// Responsibilities:
// - Paint one frame of the graph onto a 2D canvas from a fully described scene:
//   backdrop, optional globe disc, edges, focus edges, nodes, and labels.
// Contracts:
// - Pure with respect to state: the renderer reads the scene and writes pixels.
//   It never mutates nodes and holds nothing between frames.
// - All sizes are expressed in world units divided by the zoom scale so strokes
//   and text stay a constant screen size.

export type GraphTransform = { x: number; y: number; k: number };

export type GraphScene = {
  width: number;
  height: number;
  transform: GraphTransform;
  nodes: readonly GraphNode[];
  links: readonly GraphLink[];
  linksByCluster: ReadonlyMap<number, readonly GraphLink[]>;
  /** Globe projection indexed by node id, or null for the flat layout. */
  projected: readonly ProjectedNode[] | null;
  focus: GraphNode | null;
  activePath: string | null;
  query: string;
  tag: string | null;
  /** Local mode labels every node regardless of zoom. */
  labelEverything: boolean;
  theme: GraphTheme;
};

type Geometry = {
  k: number;
  pos: (node: GraphNode) => Point;
  depthOf: (node: GraphNode) => number;
  inView: (node: GraphNode) => boolean;
  frontFacing: (link: GraphLink) => boolean;
  emphasized: (node: GraphNode) => boolean;
  filtering: boolean;
};

// Culling margin in world units so nodes whose label or glow straddles the
// viewport edge are still painted.
const VIEW_MARGIN = 20;

function sceneGeometry(scene: GraphScene): Geometry {
  const { transform, projected, focus, query, tag } = scene;
  const k = transform.k;
  const left = -transform.x / k - VIEW_MARGIN;
  const top = -transform.y / k - VIEW_MARGIN;
  const right = (scene.width - transform.x) / k + VIEW_MARGIN;
  const bottom = (scene.height - transform.y) / k + VIEW_MARGIN;

  const pos = (node: GraphNode): Point =>
    projected ? projected[node.id] : { x: node.x ?? 0, y: node.y ?? 0 };
  const depthOf = (node: GraphNode) => (projected ? projected[node.id].depth : 1);
  const inView = (node: GraphNode) => {
    const { x, y } = pos(node);
    // depth <= 0 is the far hemisphere of the globe; flat layouts report 1.
    return depthOf(node) > 0 && x >= left && x <= right && y >= top && y <= bottom;
  };
  const frontFacing = (link: GraphLink) =>
    !projected || (depthOf(link.source) > 0 && depthOf(link.target) > 0);
  const emphasized = (node: GraphNode) =>
    focus ? node === focus || focus.neighbors.has(node.id) : nodeMatchesFilter(node, query, tag);

  return {
    k,
    pos,
    depthOf,
    inView,
    frontFacing,
    emphasized,
    filtering: Boolean(query) || tag !== null,
  };
}

function drawBackdrop(context: CanvasRenderingContext2D, scene: GraphScene) {
  const { width, height, theme } = scene;
  const backdrop = context.createRadialGradient(
    width / 2,
    height / 2,
    0,
    width / 2,
    height / 2,
    Math.max(width, height) * 0.75,
  );
  backdrop.addColorStop(0, theme.surface);
  backdrop.addColorStop(1, theme.background);
  context.fillStyle = backdrop;
  context.fillRect(0, 0, width, height);
}

function drawGlobeDisc(context: CanvasRenderingContext2D, scene: GraphScene, geometry: Geometry) {
  const radius = globeRadius(scene.width, scene.height);
  const shade = context.createRadialGradient(
    -radius * 0.35,
    -radius * 0.35,
    radius * 0.1,
    0,
    0,
    radius,
  );
  shade.addColorStop(0, scene.theme.surface);
  shade.addColorStop(1, scene.theme.background);
  context.globalAlpha = 1;
  context.fillStyle = shade;
  context.beginPath();
  context.arc(0, 0, radius, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = scene.theme.label;
  context.globalAlpha = 0.15;
  context.lineWidth = 1 / geometry.k;
  context.stroke();
}

function strokeLinks(
  context: CanvasRenderingContext2D,
  links: Iterable<GraphLink>,
  geometry: Geometry,
  include: (link: GraphLink) => boolean,
) {
  context.beginPath();
  for (const link of links) {
    if (!include(link) || !geometry.frontFacing(link)) {
      continue;
    }
    const from = geometry.pos(link.source);
    const to = geometry.pos(link.target);
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
  }
  context.stroke();
}

function drawEdges(context: CanvasRenderingContext2D, scene: GraphScene, geometry: Geometry) {
  const { focus, theme } = scene;
  context.lineWidth = 1 / geometry.k;
  // Edges drop to near-invisible whenever attention is on a subset so the
  // highlighted connections drawn next stand out against them.
  context.globalAlpha = focus || geometry.filtering ? 0.08 : 0.28;
  for (const [cluster, bucket] of scene.linksByCluster) {
    context.strokeStyle = theme.clusterColor(cluster);
    strokeLinks(context, bucket, geometry, () => true);
  }

  if (!focus) {
    return;
  }
  context.globalAlpha = 0.9;
  context.strokeStyle = theme.accent;
  context.lineWidth = 1.5 / geometry.k;
  strokeLinks(
    context,
    scene.links,
    geometry,
    (link) => link.source === focus || link.target === focus,
  );
}

function drawNodes(context: CanvasRenderingContext2D, scene: GraphScene, geometry: Geometry) {
  const { focus, activePath, theme } = scene;
  const { k } = geometry;

  for (const node of scene.nodes) {
    if (!geometry.inView(node)) {
      continue;
    }
    const highlighted = geometry.emphasized(node);
    const isActive = node.relativePath === activePath;
    const fill = theme.clusterColor(node.cluster);
    const { x, y } = geometry.pos(node);
    // Nodes near the globe's rim shrink and fade as a depth cue.
    const depthScale = 0.6 + 0.4 * geometry.depthOf(node);
    const radius = nodeRadius(node.degree) * depthScale;
    // Outer rings of a local graph fade so link distance reads at a glance.
    const ringAlpha = Math.max(0.45, 1 - Math.max(0, node.ring - 1) * 0.25);

    context.globalAlpha = (highlighted ? ringAlpha : 0.12) * depthScale;
    context.fillStyle = fill;
    if (highlighted && (focus || isActive)) {
      context.shadowColor = fill;
      context.shadowBlur = node === focus || isActive ? 18 : 8;
    }
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
    // Shadows are expensive and persist on the context; clear immediately so
    // only the handful of focused nodes pay for the glow.
    context.shadowBlur = 0;
    // A thin background ring keeps edges from visually piercing the disc.
    context.strokeStyle = theme.background;
    context.lineWidth = 1.2 / k;
    context.stroke();

    if (isActive) {
      context.strokeStyle = theme.accent;
      context.lineWidth = 2 / k;
      context.beginPath();
      context.arc(x, y, radius + 4 / k, 0, Math.PI * 2);
      context.stroke();
    }
  }
}

function drawLabels(context: CanvasRenderingContext2D, scene: GraphScene, geometry: Geometry) {
  const { focus, activePath, labelEverything, theme } = scene;
  const { k } = geometry;
  const showAll = k >= GRAPH_LABEL_ZOOM;

  context.font = `${11 / k}px ${theme.fontFamily}`;
  context.textAlign = "center";
  context.textBaseline = "top";
  context.lineJoin = "round";

  for (const node of scene.nodes) {
    if (!geometry.inView(node)) {
      continue;
    }
    const highlighted = geometry.emphasized(node);
    const forced =
      focus || geometry.filtering
        ? highlighted
        : labelEverything || node.relativePath === activePath;
    if (!forced && !showAll && node.degree < GRAPH_LABEL_DEGREE) {
      continue;
    }
    const point = geometry.pos(node);
    const y = point.y + nodeRadius(node.degree) + 3 / k;
    context.globalAlpha = (highlighted ? 0.95 : 0.2) * geometry.depthOf(node);
    // Background-coloured halo under the text keeps labels legible over edges.
    context.strokeStyle = theme.background;
    context.lineWidth = 3 / k;
    context.strokeText(node.name, point.x, y);
    context.fillStyle = theme.label;
    context.fillText(node.name, point.x, y);
  }
}

export function drawGraphScene(context: CanvasRenderingContext2D, scene: GraphScene) {
  const dpr = window.devicePixelRatio || 1;
  // setTransform replaces, rather than multiplies, the previous frame's
  // translate/scale, and the DPR factor maps CSS pixels onto the HiDPI bitmap.
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawBackdrop(context, scene);
  context.translate(scene.transform.x, scene.transform.y);
  context.scale(scene.transform.k, scene.transform.k);

  const geometry = sceneGeometry(scene);
  if (scene.projected) {
    drawGlobeDisc(context, scene, geometry);
  }
  drawEdges(context, scene, geometry);
  drawNodes(context, scene, geometry);
  drawLabels(context, scene, geometry);
  context.globalAlpha = 1;
}
