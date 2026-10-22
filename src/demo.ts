import { demoDrawing } from "./drawing/demo";
import { FULL_NOTE } from "./markdown/fixtures";
import { defaultView, newBaseFile, parseBase, reparse, serializeBase, writeColumn, writeView } from "./base/baseFile";
import { newMindmapData, serializeMindmap } from "./mindmap/format";

/** A date `days` from today (yyyy-mm-dd), so the demo's calendar and due dates stay current. */
const day = (days: number) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

/** The demo's base: trips, as a table, a kanban by status and a calendar. */
function tripsBase(): string {
  let file = parseBase(newBaseFile("Voyages"));
  writeColumn(file, "statut", { type: "select", options: [{ value: "Idée", color: "gray" }, { value: "Réservé", color: "blue" }, { value: "Fait", color: "green" }] });
  writeColumn(file, "pays", { type: "text", options: [] });
  writeColumn(file, "budget", { type: "number", options: [] });
  writeColumn(file, "depart", { type: "date", options: [] });
  file = reparse(file);
  const order = ["file.name", "statut", "pays", "depart", "budget"];
  writeView(file, 0, { ...defaultView("table", "Tableau", order), summaries: { budget: "Sum" } });
  writeView(file, 1, { ...defaultView("board", "Kanban", order), groupBy: "statut" });
  writeView(file, 2, { ...defaultView("calendar", "Calendrier", order), dateProperty: "depart" });
  return serializeBase(file);
}

const trip = (statut: string, pays: string, depart: string, budget: number, body: string) =>
  `---\nstatut: ${statut}\npays: ${pays}\ndepart: ${depart}\nbudget: ${budget}\n---\n\n${body}\n`;

const ticket = (id: number, status: string, tags: string, body: string, due?: string) =>
  `---\ntype: ticket\nid: ${id}\nstatus: ${status}\ntags: [${tags}]\n${due ? `due: ${due}\n` : ""}created: 2026-10-1${id}T09:00\n---\n\n${body}\n`;

function ideasMap(): string {
  const data = newMindmapData("Lancer le blog");
  const branch = (id: string, topic: string, leaves: string[]) => ({ id, topic, children: leaves.map((leaf, i) => ({ id: `${id}-${i}`, topic: leaf })) });
  data.nodeData.children = [
    branch("contenu", "Contenu", ["Premier article", "Rythme : 1 par semaine", "Brouillons dans le vault"]),
    branch("design", "Design", ["Thème clair et sombre", "Logo"]),
    branch("diffusion", "Diffusion", ["Newsletter", "Réseaux"]),
  ];
  return serializeMindmap({ prefix: "---\nmindmap-plugin: flownote\ntags: [mindmap]\n---\n\n", data, eol: "\n" });
}

const PROJECT_NOTE = `---
icon: 🚀
tags: [projet, site]
statut: en cours
---

Refonte du site perso, à publier avant la fin du mois.

> [!tip] Objectif
> Un site rapide, lisible sur mobile, écrit en Markdown.

## Étapes

- [x] Choisir le générateur
- [x] Maquette de la page d'accueil
- [ ] Rédiger les trois premiers articles
- [ ] Mettre en ligne

## Notes

| Page | État | Responsable |
| --- | --- | --- |
| Accueil | prête | Florent |
| Blog | en cours | Florent |
| Contact | à faire | — |

Idées rangées dans [[Idées.mindmap|la mind map]], échéances dans les [[Tickets]].

\`\`\`mermaid
graph LR
  Maquette --> Rédaction --> Relecture --> Publication
\`\`\`
`;

const PRESENTATION = `---
marp: true
theme: default
paginate: true
---

# Bilan du trimestre

Équipe produit — octobre

---

## Ce qui a avancé

- Nouvel éditeur par blocs
- Bases et vues kanban
- Export PDF

---

## La suite

1. Split view
2. Documentation illustrée
3. Version 1.0
`;

const READING = `# Lectures

## Outils
- [ ] [Obsidian Bases](https://help.obsidian.md/bases) #obsidian #doc
- [x] [Marp : présentations en Markdown](https://marp.app) #slides

## Écriture
- [ ] [Écrire pour le web](https://example.com/ecrire-pour-le-web) #article
- [ ] [Prendre des notes efficacement](https://example.com/notes) #méthode #video
`;

/** The simulated remote changed the same line of "Projets.md": edit it locally, commit, then pull to see a conflict. */
export const DEMO_REMOTE = { "Projets.md": "# Projets\n\n[[Mon Notion]] — modifié sur un autre ordinateur\n" };

export const DEMO_FILES = {
  ".obsidian/bookmarks.json": JSON.stringify({ items: [{ type: "file", path: "Exemple.md" }, { type: "file", path: "Projets/Site web.md" }] }),
  "Exemple.md": FULL_NOTE,
  "Projets.md": "# Projets\n\n[[Mon Notion]]\n",
  "Projets/Mon Notion.md": "Une sous-page de [[Projets]].\n",
  "Projets/Site web.md": PROJECT_NOTE,
  "Voyages.base": tripsBase(),
  "Voyages/Lisbonne.md": trip("Réservé", "Portugal", day(9), 650, "Quatre jours en ville, puis la côte."),
  "Voyages/Kyoto.md": trip("Idée", "Japon", day(24), 2400, "Au printemps, pour les cerisiers."),
  "Voyages/Montréal.md": trip("Fait", "Canada", day(-12), 1300, "Le festival de jazz."),
  "Voyages/Islande.md": trip("Idée", "Islande", day(3), 1800, "En van, le tour de l'île."),
  "Idées.mindmap.md": ideasMap(),
  "Plan du projet.canvas": `{
	"nodes":[
		{"id":"5a1e0c2b9d3f4e61","x":-60,"y":-80,"width":1000,"height":520,"color":"5","type":"group","label":"Lancement du site"},
		{"id":"8c3f1a7e2b6d4091","x":-20,"y":0,"width":280,"height":150,"color":"4","type":"text","text":"## Objectif\\n\\nMettre le site en ligne **avant décembre**."},
		{"id":"2e9b4d7c1a8f3065","x":360,"y":-20,"width":400,"height":420,"type":"file","file":"Projets/Site web.md"},
		{"id":"b7d2e5f8a1c94360","x":-20,"y":230,"width":280,"height":130,"type":"link","url":"https://help.obsidian.md/canvas"},
		{"id":"f1a4c7e0d3b65829","x":1060,"y":40,"width":320,"height":300,"type":"file","file":"Exemple.md"}
	],
	"edges":[
		{"id":"c4e7a0d3f6b91825","fromNode":"8c3f1a7e2b6d4091","fromSide":"right","toNode":"2e9b4d7c1a8f3065","toSide":"left","label":"suivi dans"},
		{"id":"9d2f5b8e1c4a7360","fromNode":"2e9b4d7c1a8f3065","fromSide":"right","toNode":"f1a4c7e0d3b65829","toSide":"left","color":"6","label":"exemple"}
	]
}`,
  "Bilan du trimestre.md": PRESENTATION,
  "Lectures.md": READING,
  "Croquis.excalidraw.md": demoDrawing(),
  "Tickets/2 - Mode sombre des graphiques.md": ticket(2, "in-progress", "bug", "Les graphiques Plotly restent clairs en mode sombre.", day(1)),
  "Tickets/3 - Import CSV.md": ticket(3, "closed", "idée", "Importer un fichier CSV dans un graphique."),
  "Tickets/4 - Raccourci de recherche.md": ticket(4, "open", "ux", "⌘P pour chercher une page, comme dans VS Code.", day(6)),
  "Tickets/5 - Documentation illustrée.md": ticket(5, "in-progress", "doc", "Des captures d'écran dans la documentation."),
  "Tickets/1 - Exporter en PDF.md": `---\ntype: ticket\nid: 1\nstatus: open\ntags: [idée, export]\ndue: ${new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10)}\ncreated: 2026-10-14T09:00\n---\n\nPouvoir exporter une note en PDF depuis la barre d'outils.\n\n- [x] Regarder les options d'impression\n- [ ] Choisir une mise en page 📅 ${new Date().toISOString().slice(0, 10)}\n\n## Commentaires\n\n> [!comment] 14/10/2026 09:12\n> Bonne idée, à prévoir pour la prochaine version.\n>\n> > [!comment] 14/10/2026 10:30\n> > Il faudra garder les callouts en couleur.\n`,
};
