import { pointer, select } from "d3-selection";
import { zoom, type ZoomTransform } from "d3-zoom";
import { GRAPH_HIT_RADIUS, type GraphNode, type Point } from "../lib/link-graph";

// Responsibilities:
// - Own the canvas pointer lifecycle for the graph: wheel zoom, pan or rotate on
//   empty space, node hover, node drag, and click-to-open.
// Contracts:
// - The interaction knows nothing about layout or drawing. It asks the host to
//   hit-test world coordinates and reports gestures back through callbacks.
// - On the globe, empty-space drags rotate instead of panning and nodes cannot
//   be dragged, so a press there only arms a click that survives small jitter.

export type GraphInteractionHost = {
  isGlobe: () => boolean;
  hitTest: (point: Point, radius: number) => GraphNode | null;
  hover: (node: GraphNode | null) => void;
  dragStart: (node: GraphNode) => void;
  dragMove: (node: GraphNode, point: Point) => void;
  dragEnd: (node: GraphNode) => void;
  click: (node: GraphNode) => void;
  /** Screen-space drag delta on the globe. */
  rotate: (dx: number, dy: number) => void;
  transformChanged: () => void;
};

export type GraphInteraction = {
  transform: () => ZoomTransform;
  detach: () => void;
};

const CLICK_TOLERANCE_PX = 3;
const ZOOM_EXTENT: [number, number] = [0.05, 10];

export function attachGraphInteraction(
  canvas: HTMLCanvasElement,
  initialTransform: ZoomTransform,
  host: GraphInteractionHost,
): GraphInteraction {
  let transform = initialTransform;
  let hovered: GraphNode | null = null;
  let dragging: GraphNode | null = null;
  let dragMoved = false;
  let rotating: Point | null = null;
  let pressAt: Point = { x: 0, y: 0 };

  const worldPoint = (event: Event): Point => {
    const [x, y] = transform.invert(pointer(event, canvas));
    return { x, y };
  };
  // Dividing by the zoom scale keeps the hit target a constant screen size.
  const nodeAt = (event: Event) => host.hitTest(worldPoint(event), GRAPH_HIT_RADIUS / transform.k);

  const selection = select(canvas);
  const zoomBehavior = zoom<HTMLCanvasElement, unknown>()
    .scaleExtent(ZOOM_EXTENT)
    // Pointer-down on a node starts a drag, not a pan; on the globe, empty
    // space rotates instead of panning, so only the wheel reaches zoom.
    .filter(
      (event: Event & { button?: number }) =>
        !event.button && (event.type === "wheel" || (!host.isGlobe() && !nodeAt(event))),
    )
    .on("zoom", (event: { transform: ZoomTransform }) => {
      transform = event.transform;
      host.transformChanged();
    });
  // d3-zoom's default double-click jump would fire on a fast second click of a
  // node and yank the view away from the note the user is opening.
  selection.call(zoomBehavior).on("dblclick.zoom", null);
  selection.call(zoomBehavior.transform, initialTransform);

  function setHovered(node: GraphNode | null) {
    if (hovered === node) {
      return;
    }
    hovered = node;
    canvas.style.cursor = node ? "pointer" : "";
    canvas.title = node ? node.relativePath : "";
    host.hover(node);
  }

  function onPointerDown(event: PointerEvent) {
    if (event.button !== 0) {
      return;
    }
    const node = nodeAt(event);
    if (!node) {
      if (host.isGlobe()) {
        rotating = { x: event.clientX, y: event.clientY };
        canvas.setPointerCapture(event.pointerId);
      }
      return;
    }
    dragging = node;
    dragMoved = false;
    pressAt = { x: event.clientX, y: event.clientY };
    // Capture keeps move/up events flowing when a drag leaves the canvas.
    canvas.setPointerCapture(event.pointerId);
    if (!host.isGlobe()) {
      host.dragStart(node);
    }
  }

  function onPointerMove(event: PointerEvent) {
    if (rotating) {
      host.rotate(event.clientX - rotating.x, event.clientY - rotating.y);
      rotating = { x: event.clientX, y: event.clientY };
      return;
    }
    if (!dragging) {
      setHovered(nodeAt(event));
      return;
    }
    if (host.isGlobe()) {
      if (Math.hypot(event.clientX - pressAt.x, event.clientY - pressAt.y) > CLICK_TOLERANCE_PX) {
        dragMoved = true;
      }
      return;
    }
    dragMoved = true;
    host.dragMove(dragging, worldPoint(event));
  }

  function onPointerUp(event: PointerEvent) {
    if (rotating) {
      rotating = null;
      canvas.releasePointerCapture(event.pointerId);
      return;
    }
    const node = dragging;
    if (!node) {
      return;
    }
    dragging = null;
    canvas.releasePointerCapture(event.pointerId);
    if (!host.isGlobe()) {
      host.dragEnd(node);
    }
    if (!dragMoved) {
      host.click(node);
    }
  }

  const onPointerLeave = () => setHovered(null);

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);
  canvas.addEventListener("pointerleave", onPointerLeave);

  return {
    transform: () => transform,
    detach: () => {
      selection.on(".zoom", null);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      canvas.style.cursor = "";
      canvas.title = "";
    },
  };
}
