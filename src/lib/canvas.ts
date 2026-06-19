/**
 * JSON Canvas format and React Flow conversion helpers.
 *
 * Responsibilities:
 * - Normalize Obsidian-compatible `.canvas` JSON into predictable arrays.
 * - Convert between JSON Canvas nodes/edges and the smaller React Flow data
 *   shape used by Glyphary's canvas view.
 * - Preserve unknown JSON Canvas fields while serializing edits back to disk.
 *
 * Contracts:
 * - Unknown document, node, and edge fields are preserved so Obsidian plugins
 *   can round-trip metadata Glyphary does not understand.
 * - Unsupported node types are filtered at the view boundary, not treated as a
 *   parse failure.
 * - File/media classification is extension-based and intentionally avoids file
 *   system access; callers decide whether a referenced vault path may load.
 */

import type { Edge, Node } from "@xyflow/react";
import type { VaultEntry } from "./app-types.js";

export type JsonCanvasSide = "top" | "right" | "bottom" | "left";

export type JsonCanvasNode = {
  id: string;
  type: "text" | "file" | "link" | "group";
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
  file?: string;
  url?: string;
  label?: string;
  color?: string;
  [key: string]: unknown;
};

export type JsonCanvasEdge = {
  id: string;
  fromNode: string;
  toNode: string;
  fromSide?: JsonCanvasSide;
  toSide?: JsonCanvasSide;
  label?: string;
  color?: string;
  [key: string]: unknown;
};

export type JsonCanvasDocument = {
  nodes?: JsonCanvasNode[];
  edges?: JsonCanvasEdge[];
  [key: string]: unknown;
};

export type CanvasFlowNodeData = {
  label: string;
  text?: string;
  file?: string;
  url?: string;
  color?: string;
};

export const maxCanvasPreviewChars = 1200;
export const maxCanvasPreviewLines = 12;
export const defaultCanvasNodeWidth = 260;
export const defaultCanvasNodeHeight = 160;
export const defaultCanvasGroupWidth = 420;
export const defaultCanvasGroupHeight = 260;
export const canvasSnapGridSize = 20;
export const canvasVaultRootDirectory = "";

export const obsidianCanvasColors: Record<string, string> = {
  "1": "#fb464c",
  "2": "#e9973f",
  "3": "#e0de71",
  "4": "#44cf6e",
  "5": "#53dfdd",
  "6": "#a882ff",
};

export const mediaExtensions = {
  image: new Set(["avif", "gif", "jpeg", "jpg", "png", "svg", "webp"]),
  video: new Set(["mov", "mp4", "m4v", "webm"]),
  audio: new Set(["aac", "flac", "m4a", "mp3", "ogg", "wav", "webm"]),
};

export function parseCanvasDocument(raw: string): JsonCanvasDocument {
  const parsed = JSON.parse(raw) as JsonCanvasDocument;

  return {
    ...parsed,
    nodes: Array.isArray(parsed.nodes) ? parsed.nodes : [],
    edges: Array.isArray(parsed.edges) ? parsed.edges : [],
  };
}

export function canvasSideHandleId(side: JsonCanvasSide | undefined, fallback: JsonCanvasSide) {
  return side ?? fallback;
}

export function canvasHandleSide(handle: string | null | undefined, fallback: JsonCanvasSide) {
  return ["top", "right", "bottom", "left"].includes(handle ?? "")
    ? (handle as JsonCanvasSide)
    : fallback;
}

export function isSupportedCanvasNode(node: JsonCanvasNode) {
  return ["text", "file", "link", "group"].includes(node.type);
}

export function isSupportedCanvasNodeType(type: string | undefined): type is JsonCanvasNode["type"] {
  return type === "text" || type === "file" || type === "link" || type === "group";
}

export function canvasColorValue(color: string | undefined) {
  const trimmed = color?.trim();

  if (!trimmed) {
    return "";
  }

  if (obsidianCanvasColors[trimmed]) {
    return obsidianCanvasColors[trimmed];
  }

  return /^#[0-9a-f]{3,8}$/i.test(trimmed) ? trimmed : "";
}

export function fileExtension(file: string | undefined) {
  return file?.split("?")[0]?.split("#")[0]?.split(".").pop()?.toLowerCase() ?? "";
}

export function canvasFileKind(file: string | undefined) {
  const extension = fileExtension(file);

  if (["md", "markdown"].includes(extension)) {
    return "markdown";
  }

  if (mediaExtensions.image.has(extension)) {
    return "image";
  }

  if (mediaExtensions.video.has(extension)) {
    return "video";
  }

  if (mediaExtensions.audio.has(extension)) {
    return "audio";
  }

  return "other";
}

export function canvasVaultPickerFileVisible(kind: "note" | "media", entry: VaultEntry) {
  if (entry.isDir) {
    return true;
  }

  const extension = fileExtension(entry.relativePath);

  if (kind === "note") {
    return extension === "md" || extension === "markdown";
  }

  return (
    mediaExtensions.image.has(extension) ||
    mediaExtensions.video.has(extension) ||
    mediaExtensions.audio.has(extension)
  );
}

export function createCanvasEdgeId(source: string | null, target: string | null) {
  return `edge:${source ?? "unknown"}:${target ?? "unknown"}:${Date.now().toString(36)}`;
}

export function createCanvasNodeId(type: JsonCanvasNode["type"]) {
  return `${type}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`;
}

export function flowNodeDimension(value: unknown, fallback: number) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value);
  }

  if (typeof value === "string") {
    const parsed = Number(value);

    if (Number.isFinite(parsed)) {
      return Math.round(parsed);
    }
  }

  return fallback;
}

export function canvasNodeFromFlowNode<Data extends CanvasFlowNodeData>(
  flowNode: Node<Data>,
): JsonCanvasNode | null {
  if (!isSupportedCanvasNodeType(flowNode.type)) {
    return null;
  }

  const widthFallback = flowNode.type === "group" ? defaultCanvasGroupWidth : defaultCanvasNodeWidth;
  const heightFallback = flowNode.type === "group" ? defaultCanvasGroupHeight : defaultCanvasNodeHeight;
  const baseNode: JsonCanvasNode = {
    id: flowNode.id,
    type: flowNode.type,
    x: Math.round(flowNode.position.x),
    y: Math.round(flowNode.position.y),
    width: flowNodeDimension(flowNode.style?.width, widthFallback),
    height: flowNodeDimension(flowNode.style?.height, heightFallback),
    ...(flowNode.data.color ? { color: flowNode.data.color } : {}),
  };

  if (flowNode.type === "text") {
    return { ...baseNode, text: flowNode.data.text ?? "" };
  }

  if (flowNode.type === "file") {
    return { ...baseNode, file: flowNode.data.file ?? "" };
  }

  if (flowNode.type === "link") {
    return { ...baseNode, url: flowNode.data.url ?? "", label: flowNode.data.label };
  }

  return { ...baseNode, label: flowNode.data.label };
}

export function serializeCanvasDocument<Data extends CanvasFlowNodeData>(
  canvas: JsonCanvasDocument,
  flowNodes: Array<Node<Data>>,
  flowEdges: Edge[],
) {
  const flowNodeById = new Map(flowNodes.map((node) => [node.id, node]));
  const canvasNodeIds = new Set((canvas.nodes ?? []).map((node) => node.id));
  const canvasEdgeById = new Map((canvas.edges ?? []).map((edge) => [edge.id, edge]));
  const nextNodes = (canvas.nodes ?? [])
    .map((node) => {
      const flowNode = flowNodeById.get(node.id);

      // If an original JSON Canvas node no longer exists in React Flow, the user
      // deleted it. Preserving it here would make the node blink and reappear.
      if (!flowNode) {
        return null;
      }

      const nextNode: JsonCanvasNode = {
        ...node,
        x: Math.round(flowNode.position.x),
        y: Math.round(flowNode.position.y),
        width: flowNodeDimension(flowNode.style?.width, node.width),
        height: flowNodeDimension(flowNode.style?.height, node.height),
        ...(node.type === "text" ? { text: flowNode.data.text ?? "" } : {}),
        ...(node.type === "file" ? { file: flowNode.data.file ?? "" } : {}),
        ...(node.type === "link"
          ? { label: flowNode.data.label, url: flowNode.data.url ?? "" }
          : {}),
        ...(node.type === "group" ? { label: flowNode.data.label } : {}),
      };

      if (flowNode.data.color) {
        nextNode.color = flowNode.data.color;
      } else {
        delete nextNode.color;
      }

      return nextNode;
    })
    .filter((node): node is JsonCanvasNode => Boolean(node));
  const addedNodes = flowNodes
    .filter((node) => !canvasNodeIds.has(node.id))
    .map((node) => canvasNodeFromFlowNode(node))
    .filter((node): node is JsonCanvasNode => Boolean(node));
  const nextEdges = flowEdges
    .filter((edge) => edge.source && edge.target)
    .map((edge) => {
      const original = canvasEdgeById.get(edge.id);

      return {
        ...(original ?? {}),
        id: edge.id,
        fromNode: edge.source,
        toNode: edge.target,
        fromSide: canvasHandleSide(edge.sourceHandle, "right"),
        toSide: canvasHandleSide(edge.targetHandle, "left"),
        ...(edge.label ? { label: String(edge.label) } : {}),
      };
    });

  return `${JSON.stringify({ ...canvas, nodes: [...nextNodes, ...addedNodes], edges: nextEdges }, null, 2)}\n`;
}

export function isCanvasPath(relativePath: string | null | undefined) {
  return Boolean(relativePath?.toLowerCase().endsWith(".canvas"));
}

export function canvasTitle(fileName: string) {
  return fileName.replace(/\.canvas$/i, "");
}
