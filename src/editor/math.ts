/**
 * Math of the notes, drawn by KaTeX: `$…$` in a line, `$$…$$` as a block
 * (remark-math's `inlineMath` and `math`). The file keeps the source as
 * written; KaTeX and its style sheet load with the first formula shown.
 */

type Katex = typeof import("katex").default;

let katex: Katex | null = null;
let loading: Promise<Katex> | null = null;

function loadKatex(): Promise<Katex> {
  loading ??= Promise.all([import("katex"), import("katex/dist/katex.min.css")]).then(([module]) => (katex = module.default));
  return loading;
}

/** The TeX of a formula's source, without its `$` or `$$` delimiters. */
export function texOf(source: string): string {
  const block = /^\s*\$\$([\s\S]*?)\$\$\s*$/.exec(source);
  if (block) return block[1].trim();
  const inline = /^\$([\s\S]*)\$$/.exec(source.trim());
  return (inline ? inline[1] : source).trim();
}

/** Draws the formula in `element`: an error shows in red with its message, never throws. */
export function renderMath(element: HTMLElement, tex: string, display: boolean): void {
  const draw = (k: Katex) => {
    if (!tex.trim()) {
      element.textContent = display ? "Formule vide : double-cliquez pour l'écrire." : "$ $";
      element.classList.add("math-empty");
      return;
    }
    element.classList.remove("math-empty");
    k.render(tex, element, { displayMode: display, throwOnError: false, output: "htmlAndMathml", strict: "ignore" });
  };
  if (katex) return draw(katex);
  element.textContent = tex;
  void loadKatex().then(draw);
}

/**
 * MathML of a formula, for the exported HTML page (browsers draw it without
 * a style sheet); null while KaTeX has not loaded (no formula shown yet).
 */
export function mathMarkup(tex: string, display: boolean): string | null {
  return katex ? katex.renderToString(tex, { displayMode: display, throwOnError: false, output: "mathml", strict: "ignore" }) : null;
}
