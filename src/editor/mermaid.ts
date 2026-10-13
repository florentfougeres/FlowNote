/**
 * Mermaid diagrams (```mermaid code blocks, rendered natively by Obsidian).
 * The library is loaded on first use; the Markdown stays a plain code block.
 */

type Mermaid = typeof import("mermaid").default;

let loading: Promise<Mermaid> | null = null;
let configuredTheme: string | null = null;
let counter = 0;

function isDark(): boolean {
  const theme = document.documentElement.dataset.theme;
  if (theme) return theme === "dark";
  return matchMedia("(prefers-color-scheme: dark)").matches;
}

async function load(): Promise<Mermaid> {
  loading ??= import("mermaid").then((module) => module.default);
  const mermaid = await loading;
  const theme = isDark() ? "dark" : "default";
  if (configuredTheme !== theme) {
    mermaid.initialize({ startOnLoad: false, theme, securityLevel: "strict", fontFamily: "inherit" });
    configuredTheme = theme;
  }
  return mermaid;
}

/** SVG markup of the diagram, or throws with Mermaid's error message. */
export async function renderMermaid(source: string): Promise<string> {
  const mermaid = await load();
  const id = `flownote-mermaid-${++counter}`;
  try {
    const { svg } = await mermaid.render(id, source);
    return svg;
  } finally {
    // A failed render leaves its temporary element behind.
    document.getElementById(`d${id}`)?.remove();
    document.getElementById(id)?.remove();
  }
}
