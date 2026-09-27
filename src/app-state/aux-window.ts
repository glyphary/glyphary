import { LogicalPosition } from "@tauri-apps/api/dpi";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";

// Responsibilities:
// - Open or focus one of the app's auxiliary windows (settings, task board)
//   with the chrome every one of them shares.
// Contracts:
// - A window that already exists is shown and focused, never duplicated.
// - Windows start hidden; the App instance inside shows itself after its
//   first paint so no unstyled frame flashes.

export type AuxiliaryWindowSpec = {
  label: string;
  view: string;
  title: string;
  width: number;
  height: number;
  minWidth: number;
  minHeight: number;
};

export async function openAuxiliaryWindow(spec: AuxiliaryWindowSpec, onError: (message: string) => void) {
  const existing = await WebviewWindow.getByLabel(spec.label);

  if (existing) {
    await existing.show();
    await existing.setFocus();
    return;
  }

  const created = new WebviewWindow(spec.label, {
    url: `index.html?view=${spec.view}`,
    title: spec.title,
    width: spec.width,
    height: spec.height,
    minWidth: spec.minWidth,
    minHeight: spec.minHeight,
    center: true,
    decorations: true,
    focus: true,
    hiddenTitle: true,
    resizable: true,
    skipTaskbar: true,
    titleBarStyle: "overlay",
    trafficLightPosition: new LogicalPosition(20, 28),
    acceptFirstMouse: true,
    transparent: true,
    visible: false,
  });

  created.once("tauri://error", (event) => onError(String(event.payload)));
}
