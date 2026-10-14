/**
 * A notebook's own dependencies: the `pyproject` key of its front matter, a
 * PEP 723 TOML fragment, as marimo writes it:
 *
 *   pyproject: |-
 *     requires-python = ">=3.12"
 *     dependencies = [
 *         "polars",
 *     ]
 */

const DEPENDENCIES = /^dependencies\s*=\s*\[([\s\S]*?)\]/m;

export function readDependencies(pyproject: string | null | undefined): string[] {
  const match = pyproject ? DEPENDENCIES.exec(pyproject) : null;
  if (!match) return [];
  return [...match[1].matchAll(/"([^"]+)"|'([^']+)'/g)].map((m) => (m[1] ?? m[2]).trim()).filter(Boolean);
}

/** Bare package name of a requirement: "polars>=1.0" → "polars". */
export const packageName = (requirement: string) => requirement.trim().split(/[\s<>=!~;[]/)[0].toLowerCase();

/** The fragment with `requirement` added (or replacing the same package). */
export function withDependency(pyproject: string | null | undefined, requirement: string): string {
  const name = packageName(requirement);
  const current = readDependencies(pyproject);
  const next = [...current.filter((d) => packageName(d) !== name), requirement.trim()];
  const block = `dependencies = [\n${next.map((d) => `    "${d}",`).join("\n")}\n]`;
  if (!pyproject || !pyproject.trim()) return `requires-python = ">=3.12"\n${block}`;
  if (DEPENDENCIES.test(pyproject)) return pyproject.replace(DEPENDENCIES, block);
  return `${pyproject.replace(/\s+$/, "")}\n${block}`;
}

export function withoutDependency(pyproject: string, requirement: string): string {
  const name = packageName(requirement);
  const next = readDependencies(pyproject).filter((d) => packageName(d) !== name);
  return pyproject.replace(DEPENDENCIES, `dependencies = [\n${next.map((d) => `    "${d}",`).join("\n")}${next.length ? "\n" : ""}]`);
}
