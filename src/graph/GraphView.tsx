import { useMemo, useState } from "react";
import type { LinkGraph } from "../lib/app-types";
import { LOCAL_GRAPH_DEPTHS, tagLegend, type GraphMode } from "../lib/link-graph";
import { ModalDialog } from "../ui/ModalDialog";
import { useGraphCanvas, type GraphCanvasCounts } from "./use-graph-canvas";
import { useLinkGraph } from "./use-link-graph";

// Responsibilities:
// - Present the graph overlay: scope, depth, globe, and filter controls, the
//   canvas stage, status text, and the tag legend.
// Contracts:
// - UI state only. Loading lives in useLinkGraph and the layout engine in
//   useGraphCanvas; this component never touches the canvas or persistence.
// - Clicking a node in local mode keeps the overlay open so the graph can
//   follow the note; vault mode closes it.

export type { GraphMode } from "../lib/link-graph";

type GraphViewProps = {
  root: string;
  activeRelativePath: string | null;
  initialMode?: GraphMode;
  onOpenFile: (relativePath: string, options: { keepOpen: boolean }) => void;
  onRequestClose: () => void;
};

function graphSubtitle(
  graph: LinkGraph | null,
  error: string | null,
  mode: GraphMode,
  depth: number,
  centerName: string | null,
  counts: GraphCanvasCounts,
) {
  if (error) {
    return error;
  }
  if (!graph) {
    return "Scanning vault...";
  }
  if (mode === "vault") {
    return `${graph.nodes.length} notes, ${graph.edges.length} links`;
  }
  if (!centerName) {
    return "Open a Markdown note to see its local graph";
  }
  return `${counts.nodes} notes within ${depth} of ${centerName}`;
}

function stageMessage(graph: LinkGraph | null, localCenterMissing: boolean) {
  if (graph && graph.nodes.length === 0) {
    return "No Markdown notes in this vault yet.";
  }
  if (localCenterMissing) {
    return "Open a Markdown note to see its local graph.";
  }
  return null;
}

type TagLegendProps = {
  legend: [string, number][];
  selectedTag: string | null;
  onSelect: (tag: string | null) => void;
};

function TagLegend({ legend, selectedTag, onSelect }: TagLegendProps) {
  return (
    <div className="graph-view-legend" role="group" aria-label="Filter by tag">
      {legend.map(([tag, count]) => (
        <button
          key={tag}
          type="button"
          className={selectedTag === tag ? "graph-view-chip active" : "graph-view-chip"}
          aria-pressed={selectedTag === tag}
          onClick={() => onSelect(selectedTag === tag ? null : tag)}
        >
          #{tag}
          <span className="graph-view-chip-count">{count}</span>
        </button>
      ))}
    </div>
  );
}

export function GraphView({
  root,
  activeRelativePath,
  initialMode = "vault",
  onOpenFile,
  onRequestClose,
}: GraphViewProps) {
  const { graph, error } = useLinkGraph(root);
  const [filter, setFilter] = useState("");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [mode, setMode] = useState<GraphMode>(initialMode);
  const [depth, setDepth] = useState(LOCAL_GRAPH_DEPTHS[0]);
  const [globe, setGlobe] = useState(false);

  const localCenter = mode === "local" ? activeRelativePath : null;
  const centerNode = graph?.nodes.find((node) => node.relativePath === localCenter) ?? null;
  const localCenterMissing = mode === "local" && graph !== null && centerNode === null;
  const legend = useMemo(() => (graph ? tagLegend(graph.nodes) : []), [graph]);

  const { stageRef, canvasRef, counts } = useGraphCanvas({
    graph,
    mode,
    depth,
    localCenter,
    globe,
    filter,
    tag: selectedTag,
    activePath: activeRelativePath,
    onOpenFile: (node) => onOpenFile(node.relativePath, { keepOpen: mode === "local" }),
  });

  const message = stageMessage(graph, localCenterMissing);

  return (
    <ModalDialog className="graph-view-screen" aria-label="Graph view" onRequestClose={onRequestClose}>
      <section className="graph-view-card">
        <header className="graph-view-header">
          <div>
            <h2>{mode === "local" ? "Local Graph" : "Graph"}</h2>
            <p>{graphSubtitle(graph, error, mode, depth, centerNode?.name ?? null, counts)}</p>
          </div>
          <div className="graph-view-actions">
            <div className="graph-view-segment" role="group" aria-label="Graph scope">
              <button
                type="button"
                className={mode === "vault" ? "active" : ""}
                aria-pressed={mode === "vault"}
                onClick={() => setMode("vault")}
              >
                Vault
              </button>
              <button
                type="button"
                className={mode === "local" ? "active" : ""}
                aria-pressed={mode === "local"}
                disabled={!activeRelativePath}
                title={activeRelativePath ? undefined : "Open a note first"}
                onClick={() => setMode("local")}
              >
                Local
              </button>
            </div>
            <button
              type="button"
              className={globe ? "graph-view-toggle active" : "graph-view-toggle"}
              aria-pressed={globe}
              onClick={() => setGlobe(!globe)}
            >
              Globe
            </button>
            {mode === "local" ? (
              <select
                className="graph-view-depth"
                aria-label="Link depth"
                value={depth}
                onChange={(event) => setDepth(Number(event.target.value))}
              >
                {LOCAL_GRAPH_DEPTHS.map((value) => (
                  <option key={value} value={value}>
                    Depth {value}
                  </option>
                ))}
              </select>
            ) : null}
            <input
              className="graph-view-filter"
              type="search"
              placeholder="Filter notes"
              aria-label="Filter graph nodes"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
            />
            <button className="inline-action" type="button" onClick={onRequestClose}>
              Close
            </button>
          </div>
        </header>
        <div className="graph-view-stage" ref={stageRef}>
          <canvas className="graph-view-canvas" ref={canvasRef} />
          {message ? <p className="graph-view-empty">{message}</p> : null}
        </div>
        {legend.length > 0 && mode === "vault" ? (
          <footer className="graph-view-footer">
            <TagLegend legend={legend} selectedTag={selectedTag} onSelect={setSelectedTag} />
            <p className="graph-view-hint">
              {globe
                ? "Scroll to zoom. Drag to rotate the globe. Click a note to open it."
                : "Scroll to zoom. Drag the canvas to pan. Click a note to open it."}
            </p>
          </footer>
        ) : null}
      </section>
    </ModalDialog>
  );
}
