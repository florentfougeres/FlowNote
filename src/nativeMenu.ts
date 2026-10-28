import type { MenuItem } from "./Sidebar";

/** "⌘⇧M" as a menu accelerator ("CmdOrCtrl+Shift+M"), shown on the right of the item. */
export function accelerator(shortcut: string): string | undefined {
  const modifiers: Record<string, string> = { "⌘": "CmdOrCtrl", "⇧": "Shift", "⌥": "Alt", "⌃": "Ctrl" };
  const parts: string[] = [];
  let rest = shortcut;
  while (rest && modifiers[rest[0]]) {
    parts.push(modifiers[rest[0]]);
    rest = rest.slice(1);
  }
  if (!parts.length || rest.length !== 1) return undefined;
  return [...parts, rest.toUpperCase()].join("+");
}

/**
 * A right-click menu as the system's own menu (desktop app): the items in
 * order, a separator between sections, the current choice ticked. Resolves
 * once the menu has closed.
 */
export async function popupNativeMenu(items: MenuItem[]): Promise<void> {
  const { Menu } = await import("@tauri-apps/api/menu");
  const entries = items.flatMap((item, i) => {
    const separator = i > 0 && item.section !== items[i - 1].section ? [{ item: "Separator" as const }] : [];
    const base = { text: item.label, accelerator: item.shortcut ? accelerator(item.shortcut) : undefined, action: () => item.run() };
    return [...separator, item.checked === undefined ? base : { ...base, checked: item.checked }];
  });
  const menu = await Menu.new({ items: entries });
  await menu.popup();
}
