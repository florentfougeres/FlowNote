/**
 * The demo vault ("Essayer avec un exemple"): the files of src/demo/vault, a
 * freelance designer's vault that shows every feature. Dates are written
 * relative to today, so due dates and calendars stay current: `{{J+3}}` is
 * in three days (yyyy-mm-dd, in names too), `{{D-2}}` two days ago
 * (dd/mm/yyyy, for task comments). Obsidian's own `{{date}}` is left alone.
 */
const RAW = import.meta.glob<string>(["./demo/vault/**/*", "./demo/vault/.obsidian/*"], { query: "?raw", import: "default", eager: true });

const pad = (n: number) => String(n).padStart(2, "0");

/** The text with its relative dates written out, `today` being day 0. */
export function withDates(text: string, today = new Date()): string {
  return text.replace(/\{\{([JD])([+-]\d+)?\}\}/g, (_, kind: string, offset?: string) => {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() + Number(offset ?? 0));
    const [y, m, d] = [date.getFullYear(), pad(date.getMonth() + 1), pad(date.getDate())];
    return kind === "J" ? `${y}-${m}-${d}` : `${d}/${m}/${y}`;
  });
}

export const DEMO_FILES: Record<string, string> = Object.fromEntries(Object.entries(RAW).map(([path, text]) => [withDates(path.slice("./demo/vault/".length)), withDates(text)]));

/** The simulated remote changed the same line of "Projets.md": edit it locally, commit, then pull to see a conflict. */
export const DEMO_REMOTE = { "Projets.md": DEMO_FILES["Projets.md"].replace("site vitrine et commande en ligne", "site vitrine, commande et paiement en ligne (modifié sur un autre ordinateur)") };
