import { isTauri } from "@tauri-apps/api/core";
import { LogicalPosition } from "@tauri-apps/api/dpi";
import {
  CheckMenuItem,
  Menu,
  MenuItem,
  PredefinedMenuItem,
  Submenu,
} from "@tauri-apps/api/menu";
import { getCurrentWindow } from "@tauri-apps/api/window";

// Responsibilities:
// - Translate app-owned callbacks into Tauri native context menus.
// - Keep native menu API details out of feature components.
//
// Contracts:
// - Callers own command availability and mutations; this module only displays
//   menu entries and reports whether a native popup was opened.
// - Browser/dev fallback remains the caller's responsibility.

type NativeMenuCommand = {
  kind?: "item";
  id: string;
  text: string;
  enabled?: boolean;
  action: () => void | Promise<void>;
};

type NativeMenuCheckCommand = {
  kind: "check";
  id: string;
  text: string;
  checked: boolean;
  enabled?: boolean;
  action: () => void | Promise<void>;
};

type NativeMenuSeparator = {
  kind: "separator";
};

type NativeMenuSubmenu = {
  kind: "submenu";
  id: string;
  text: string;
  enabled?: boolean;
  items: NativeMenuEntry[];
};

export type NativeMenuEntry =
  | NativeMenuCommand
  | NativeMenuCheckCommand
  | NativeMenuSeparator
  | NativeMenuSubmenu;

export const nativeMenuSeparator: NativeMenuSeparator = { kind: "separator" };

async function createNativeMenuItems(
  entries: NativeMenuEntry[],
): Promise<Array<MenuItem | PredefinedMenuItem | Submenu>> {
  return Promise.all(
    entries.map(async (entry) => {
      if (entry.kind === "separator") {
        return PredefinedMenuItem.new({ item: "Separator" });
      }

      if (entry.kind === "submenu") {
        return Submenu.new({
          id: entry.id,
          text: entry.text,
          enabled: entry.enabled ?? entry.items.length > 0,
          items: await createNativeMenuItems(entry.items),
        });
      }

      if (entry.kind === "check") {
        return CheckMenuItem.new({
          id: entry.id,
          text: entry.text,
          checked: entry.checked,
          enabled: entry.enabled ?? true,
          action: () => {
            void entry.action();
          },
        });
      }

      return MenuItem.new({
        id: entry.id,
        text: entry.text,
        enabled: entry.enabled ?? true,
        action: () => {
          void entry.action();
        },
      });
    }),
  );
}

export async function popupNativeMenu(
  entries: NativeMenuEntry[],
  position?: { x: number; y: number },
) {
  if (!isTauri()) {
    return false;
  }

  const enabledEntries = entries.filter((entry) => {
    if (entry.kind === "separator") {
      return true;
    }

    if (entry.kind === "submenu") {
      return entry.items.length > 0;
    }

    return entry.enabled !== false;
  });

  if (enabledEntries.length === 0) {
    return false;
  }

  const menu = await Menu.new({ items: await createNativeMenuItems(enabledEntries) });
  await menu.popup(
    position ? new LogicalPosition(position.x, position.y) : undefined,
    getCurrentWindow(),
  );
  return true;
}
