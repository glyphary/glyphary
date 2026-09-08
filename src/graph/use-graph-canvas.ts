import { useEffect, useRef, useState } from "react";
import { forceLink, forceManyBody, forceSimulation, forceX, forceY } from "d3-force";
import { zoomIdentity, type ZoomTransform } from "d3-zoom";
import type { LinkGraph } from "../lib/app-types";
import {
  buildGraphModel,
  globeRadius,
  groupLinksByCluster,
  localNeighborhood,
  nearestProjectedNode,
  projectOntoGlobe,
  rotateGlobe,
  type GlobeRotation,
  type GraphLink,
  type GraphMode,
  type GraphModel,
  type GraphNode,
  type Point,
  type ProjectedNode,
} from "../lib/link-graph";
import { attachGraphInteraction } from "./graph-interaction";
import { drawGraphScene } from "./graph-renderer";
import { readGraphTheme } from "./graph-theme";

// Responsibilities:
// - Run the graph engine for a canvas: build the model for the requested scope,
//   drive the d3-force simulation, schedule frames through the renderer, and
//   translate interaction gestures into layout changes.
// Contracts:
// - The engine restarts only when the graph, scope, depth, or local centre
//   change. Every other input reaches it through refs so React re-renders never
//   disturb the layout.
// - Node positions and the zoom transform survive restarts within a scope, so
//   walking a local graph does not jump; switching scope resets the zoom.
// - Reduced motion settles the layout synchronously instead of animating.

export type GraphCanvasOptions = {
  graph: LinkGraph | null;
  mode: GraphMode;
  depth: number;
  localCenter: string | null;
  globe: boolean;
  filter: string;
  tag: string | null;
  activePath: string | null;
  onOpenFile: (node: GraphNode) => void;
};

export type GraphCanvasCounts = { nodes: number; edges: number };

const SETTLE_TICKS = 120;
const DRAG_TICKS = 3;

function createSimulation(model: GraphModel, local: boolean) {
  return forceSimulation(model.nodes)
    .force("link", forceLink<GraphNode, GraphLink>(model.links).distance(local ? 60 : 30))
    // ponytail: Barnes-Hut is ~40ms/tick at 10k nodes, fine for a settle;
    // move layout to a worker if vaults much larger than that show up.
    .force("charge", forceManyBody().strength(local ? -160 : -40).distanceMax(400))
    // Weak pull to the origin keeps disconnected components and orphans from
    // drifting off-screen; forceCenter would fight the pinned local centre.
    .force("x", forceX(0).strength(0.03))
    .force("y", forceY(0).strength(0.03))
    .stop();
}

function scopedModel(
  graph: LinkGraph,
  mode: GraphMode,
  localCenter: string | null,
  depth: number,
  positions: ReadonlyMap<string, Point>,
): GraphModel | null {
  const model = buildGraphModel(graph, positions);
  if (mode === "vault") {
    return model;
  }
  const local = localNeighborhood(model, localCenter, depth);
  if (!local) {
    return null;
  }
  // Pinning the centre at the origin gives every recenter the same anchor, so
  // the initial zoom transform always frames the note being walked from.
  local.center.fx = 0;
  local.center.fy = 0;
  return local;
}

export function useGraphCanvas(options: GraphCanvasOptions) {
  const { graph, mode, depth, localCenter, globe, filter, tag, activePath, onOpenFile } = options;
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [counts, setCounts] = useState<GraphCanvasCounts>({ nodes: 0, edges: 0 });

  // Written during render on purpose: the engine effect closes over this ref
  // once and reads the latest values per frame, so these inputs never restart it.
  const viewRef = useRef({ globe, filter, tag, activePath, onOpenFile });
  viewRef.current = { globe, filter, tag, activePath, onOpenFile };

  const positionsRef = useRef(new Map<string, Point>());
  const transformRef = useRef<ZoomTransform | null>(null);
  const rotationRef = useRef<GlobeRotation>({ lambda: 0, phi: 0 });
  const lastModeRef = useRef<GraphMode | null>(null);
  const redrawRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    redrawRef.current();
  }, [globe, filter, tag, activePath]);

  useEffect(() => {
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!stage || !canvas || !context || !graph) {
      return;
    }

    const model = scopedModel(graph, mode, localCenter, depth, positionsRef.current);
    if (!model) {
      setCounts({ nodes: 0, edges: 0 });
      return;
    }
    setCounts({ nodes: model.nodes.length, edges: model.links.length });
    // A vault zoom can sit thousands of units from the origin where a fresh
    // local graph is laid out, so scope changes drop it; recenters keep it.
    if (lastModeRef.current !== mode) {
      transformRef.current = null;
      lastModeRef.current = mode;
    }

    const local = mode === "local";
    const theme = readGraphTheme(canvas, context);
    const linksByCluster = groupLinksByCluster(model.links);
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const simulation = createSimulation(model, local);

    let width = 0;
    let height = 0;
    let frame = 0;
    let focus: GraphNode | null = null;
    let projected: ProjectedNode[] | null = null;

    function draw() {
      frame = 0;
      const view = viewRef.current;
      projected = view.globe
        ? projectOntoGlobe(model!.nodes, globeRadius(width, height), rotationRef.current)
        : null;
      drawGraphScene(context!, {
        width,
        height,
        transform: interaction.transform(),
        nodes: model!.nodes,
        links: model!.links,
        linksByCluster,
        projected,
        focus,
        activePath: view.activePath,
        query: view.filter.trim().toLowerCase(),
        tag: view.tag,
        labelEverything: local,
        theme,
      });
    }

    // Coalesces simulation ticks, hover changes, and zoom events into at most
    // one paint per animation frame.
    function requestDraw() {
      if (!frame) {
        frame = window.requestAnimationFrame(draw);
      }
    }
    redrawRef.current = requestDraw;
    simulation.on("tick", requestDraw);

    function resize() {
      const dpr = window.devicePixelRatio || 1;
      width = stage!.clientWidth;
      height = stage!.clientHeight;
      canvas!.width = Math.round(width * dpr);
      canvas!.height = Math.round(height * dpr);
      requestDraw();
    }
    const observer = new ResizeObserver(resize);
    observer.observe(stage);
    resize();

    const interaction = attachGraphInteraction(
      canvas,
      transformRef.current ?? zoomIdentity.translate(width / 2, height / 2),
      {
        isGlobe: () => viewRef.current.globe,
        hitTest: (point, radius) =>
          viewRef.current.globe
            // Projection is refreshed by draw(); before the first frame there is
            // nothing to hit, which the empty array expresses.
            ? nearestProjectedNode(model.nodes, projected ?? [], point, radius)
            : (simulation.find(point.x, point.y, radius) ?? null),
        hover: (node) => {
          focus = node;
          requestDraw();
        },
        dragStart: (node) => {
          focus = node;
          node.fx = node.x;
          node.fy = node.y;
          // Reheat so neighbours follow the dragged node; alphaTarget(0) on
          // release lets it cool back down instead of stopping dead.
          if (!reduceMotion) {
            simulation.alphaTarget(0.3).restart();
          }
        },
        dragMove: (node, point) => {
          node.fx = point.x;
          node.fy = point.y;
          if (reduceMotion) {
            simulation.tick(DRAG_TICKS);
          }
          requestDraw();
        },
        dragEnd: (node) => {
          node.fx = null;
          node.fy = null;
          simulation.alphaTarget(0);
          requestDraw();
        },
        click: (node) => viewRef.current.onOpenFile(node),
        rotate: (dx, dy) => {
          const scale = globeRadius(width, height) * interaction.transform().k;
          rotationRef.current = rotateGlobe(rotationRef.current, dx, dy, scale);
          requestDraw();
        },
        transformChanged: () => {
          transformRef.current = interaction.transform();
          requestDraw();
        },
      },
    );

    if (reduceMotion) {
      simulation.tick(SETTLE_TICKS);
      requestDraw();
    } else {
      simulation.alpha(1).restart();
    }

    return () => {
      simulation.stop();
      for (const node of model.nodes) {
        positionsRef.current.set(node.relativePath, { x: node.x ?? 0, y: node.y ?? 0 });
      }
      observer.disconnect();
      interaction.detach();
      window.cancelAnimationFrame(frame);
      redrawRef.current = () => undefined;
    };
  }, [graph, mode, depth, localCenter]);

  return { stageRef, canvasRef, counts };
}
