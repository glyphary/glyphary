import { useEffect, useRef, useState } from "react";
import { renderPluginBlocks } from "./render-blocks";

// Responsibilities:
// - Show the Markdown a host-runtime plugin returns for one of its panels.
// Contracts:
// - App owns running the plugin and choosing the panel; this component asks
//   for a fresh render when the panel or `revision` changes.

type PluginPanelProps = {
  /** Empty when no enabled plugin provides a panel. */
  panelKey: string;
  /** Bumped by App after a save or a note switch. */
  revision: number;
  load: () => Promise<string | null>;
  onOpenNote: (target: string) => void;
  onCommand: (commandId: string) => Promise<void>;
};

export function PluginPanel(props: PluginPanelProps) {
  const { panelKey, revision } = props;
  const [refresh, setRefresh] = useState(0);
  const [error, setError] = useState("");
  const bodyRef = useRef<HTMLDivElement>(null);
  // The callbacks change identity on every App render. Reading them through a
  // ref keeps them out of the effect's dependencies, so only a new panel,
  // revision, or Refresh press runs the plugin again.
  const propsRef = useRef(props);

  propsRef.current = props;

  useEffect(() => {
    let stale = false;

    if (!panelKey) {
      return;
    }

    propsRef.current.load().then(
      (markdown) => {
        if (stale || !bodyRef.current) {
          return;
        }

        setError("");
        renderPluginBlocks(bodyRef.current, markdown ?? "", "h3", {
          onOpenNote: (target) => propsRef.current.onOpenNote(target),
          onCommand: (commandId) =>
            void propsRef.current.onCommand(commandId).then(() => setRefresh((n) => n + 1)),
        });
      },
      (reason) => !stale && setError(reason instanceof Error ? reason.message : String(reason)),
    );

    return () => {
      stale = true;
    };
  }, [panelKey, revision, refresh]);

  if (!panelKey) {
    return (
      <div className="drawer-panel toc-panel">
        <p className="empty-toc">No enabled plugin provides a panel.</p>
      </div>
    );
  }

  return (
    <div className="drawer-panel toc-panel plugin-panel">
      <div className="plugin-panel-toolbar">
        <button className="inline-action" type="button" onClick={() => setRefresh((n) => n + 1)}>
          Refresh
        </button>
      </div>
      {error ? (
        <p className="empty-toc" role="alert">
          {error}
        </p>
      ) : null}
      <div className="toc-list plugin-panel-body" hidden={Boolean(error)} ref={bodyRef} />
    </div>
  );
}
