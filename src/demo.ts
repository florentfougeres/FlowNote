import { demoDrawing } from "./drawing/demo";
import { FULL_NOTE } from "./markdown/fixtures";

/** The simulated remote changed the same line of "Projets.md": edit it locally, commit, then pull to see a conflict. */
export const DEMO_REMOTE = { "Projets.md": "# Projets\n\n[[Mon Notion]] — modifié sur un autre ordinateur\n" };

export const DEMO_FILES = {
  "Exemple.md": FULL_NOTE,
  "Projets.md": "# Projets\n\n[[Mon Notion]]\n",
  "Projets/Mon Notion.md": "Une sous-page de [[Projets]].\n",
  "Croquis.excalidraw.md": demoDrawing(),
  "Tickets/1 - Exporter en PDF.md": `---\ntype: ticket\nid: 1\nstatus: open\ntags: [idée, export]\ndue: ${new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10)}\ncreated: 2026-10-14T09:00\n---\n\nPouvoir exporter une note en PDF depuis la barre d'outils.\n\n- [x] Regarder les options d'impression\n- [ ] Choisir une mise en page 📅 ${new Date().toISOString().slice(0, 10)}\n\n## Commentaires\n\n> [!comment] 14/10/2026 09:12\n> Bonne idée, à prévoir pour la prochaine version.\n>\n> > [!comment] 14/10/2026 10:30\n> > Il faudra garder les callouts en couleur.\n`,
};
