import { NULL_BRIDGE, type VaultBridge } from "../editor/bridge";

/**
 * The documentation's screenshots, bundled with the app: `name.light.webp`
 * and `name.dark.webp` in `images/`, embedded in the text as `![[name.webp]]`.
 * The one matching the app's theme is shown.
 */
const IMAGES = import.meta.glob<string>("./images/*.webp", { eager: true, query: "?url", import: "default" });

const NAMES = [...new Set(Object.keys(IMAGES).map((key) => key.replace(/^\.\/images\//, "").replace(/\.(light|dark)\.webp$/, ".webp")))];

export function docsBridge(dark: boolean): VaultBridge {
  return {
    ...NULL_BRIDGE,
    files: NAMES,
    loadImage: async (name) => {
      const base = name.replace(/\.webp$/, "");
      return IMAGES[`./images/${base}.${dark ? "dark" : "light"}.webp`] ?? IMAGES[`./images/${base}.light.webp`] ?? "";
    },
  };
}
