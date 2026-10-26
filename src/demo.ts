import { demoDrawing } from "./drawing/demo";
import { FULL_NOTE } from "./markdown/fixtures";
import { defaultView, newBaseFile, parseBase, reparse, serializeBase, writeColumn, writeFormula, writeView } from "./base/baseFile";
import { newMindmapData, serializeMindmap } from "./mindmap/format";

/** A date `days` from today (yyyy-mm-dd), so the demo's calendar and due dates stay current. */
const day = (days: number) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

/** The demo's base: trips, as a table (with a formula), a kanban by status, a gallery and a calendar. */
function tripsBase(): string {
  let file = parseBase(newBaseFile("Voyages"));
  writeColumn(file, "statut", { type: "select", options: [{ value: "Idée", color: "gray" }, { value: "Réservé", color: "blue" }, { value: "Fait", color: "green" }] });
  writeColumn(file, "pays", { type: "text", options: [] });
  writeColumn(file, "budget", { type: "number", options: [] });
  writeColumn(file, "depart", { type: "date", options: [] });
  writeFormula(file, "par_jour", "budget / 7");
  file = reparse(file);
  const order = ["file.name", "statut", "pays", "depart", "budget", "formula.par_jour"];
  writeView(file, 0, { ...defaultView("table", "Tableau", order), summaries: { budget: "Sum", "formula.par_jour": "Average" } });
  writeView(file, 1, { ...defaultView("board", "Kanban", order), groupBy: "statut" });
  writeView(file, 2, { ...defaultView("cards", "Galerie", order) });
  writeView(file, 3, { ...defaultView("calendar", "Calendrier", order), dateProperty: "depart" });
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

const LAUNCH_NOTE = `---
tags: [projet]
statut: en cours
budget: 1200
---
# Lancement

Responsable:: [[Mon Notion]]

## À faire

- [ ] Écrire l'annonce #com 📅 ${day(-1)} ⏫
- [ ] Préparer les visuels #design 📅 ${day(0)}
- [ ] Relire les pages ⏳ ${day(2)} 📅 ${day(5)}
- [ ] Faire le point de la semaine 🔁 every week 📅 ${day(6)}
- [x] Réserver le nom de domaine ✅ ${day(-3)}

## Décisions

Le site sera publié en français d'abord, l'anglais viendra ensuite. ^decision
`;

/** What FlowNote reads like Obsidian and its plugins: embeds, footnotes, Dataview and Tasks. */
const OBSIDIAN_NOTE = `# Fonctionnalités Obsidian

Cette note montre ce que FlowNote lit et affiche comme Obsidian et ses plugins. Cliquez dans un bloc de requête pour voir sa source.

## Intégrer une note

Une section d'une autre note, toujours à jour :

![[Site web#Étapes]]

Un seul bloc, repéré par son identifiant \`^decision\` :

![[Lancement#^decision]]

## Notes de bas de page

FlowNote affiche les notes de bas de page[^1] d'Obsidian : survolez l'appel pour lire la note, cliquez pour y aller[^2].

## Dataview

Les voyages, avec leurs propriétés :

\`\`\`dataview
TABLE pays AS "Pays", depart AS "Départ", budget AS "Budget", statut AS "Statut"
FROM "Voyages"
SORT depart ASC
\`\`\`

Les projets en cours :

\`\`\`dataview
LIST statut
FROM #projet
WHERE statut = "en cours"
\`\`\`

## Tasks

Ce qui est à faire d'ici une semaine, dans tout le vault (cochez une tâche : sa note est modifiée) :

\`\`\`tasks
not done
due before in 7 days
sort by due
\`\`\`

Les tâches des projets, par note (requête Dataview TASK) :

\`\`\`dataview
TASK
FROM #projet
WHERE !completed
\`\`\`

## Organigramme

Un bloc de code \`flow\`, dessiné par flowchart.js (comme HedgeDoc) :

\`\`\`flow
st=>start: Idée
op=>operation: Brouillon
cond=>condition: Relu ?
e=>end: Publié

st->op->cond
cond(yes)->e
cond(no)->op
\`\`\`

## Fluo et HTML

Du fluo ==jaune==, ==🟢vert== ou ==🔵bleu== (comme Bear), du texte <u>souligné</u> et du <span style="color: #d9480f">HTML en ligne</span>.

<div style="padding: 12px 16px; border-radius: 10px; background: rgba(0, 122, 255, 0.08)">
  <strong>Un bloc HTML</strong>, mis en page comme dans MarkText ou HedgeDoc.
  <details><summary>Cliquez pour déplier</summary>Le HTML est affiché sans ses scripts.</details>
</div>

[^1]: Écrites \`[^1]\` dans le texte et \`[^1]: …\` en bas de la note.
[^2]: Le menu \`/\` en ajoute une : « Note de bas de page ».
`;

/** Every block and every inline format of the editor, one after the other. */
const EDITOR_TOUR = `---
icon: ✍️
tags: [démo, éditeur]
auteur: Florent
pages: 12
relu: true
publication: ${day(14)}
reunion: ${day(2)}T14:30
lecteurs: [équipe, clients]
---
# Tour de l'éditeur

Tout ce que l'éditeur sait afficher, dans une seule note. Ouvrez-la aussi en Markdown brut (\`⌘⇧E\`) : c'est du Markdown ordinaire, lisible dans Obsidian. Le sommaire ci-dessous se construit tout seul :

[TOC]

## Mise en forme

Du **gras**, de l'*italique*, du <u>souligné</u>, du ~~barré~~, du \`code\` et du ==fluo==. Le fluo prend aussi une couleur, comme dans Bear : ==🟢vert==, ==🔴rouge==, ==🔵bleu==, ==🟣violet==. Sélectionnez du texte : la barre de mise en forme apparaît au-dessus.

Des liens : vers une note, [[Site web]] ou [[Lancement|avec un autre texte]] ; vers le web, [Obsidian](https://obsidian.md) ou une adresse tapée, https://flowchart.js.org. Des emoji en code court :rocket: :sparkles: et un tag #démo.

Une note de bas de page[^1], la date du jour (\`/date\`) : ${day(0)}.

## Titres

Cliquez dans un titre : son niveau s'affiche dans la marge, un clic en choisit un autre.

### Titre de niveau 3

#### Titre de niveau 4

## Listes

- Une liste à puces
  - imbriquée avec \`⇥\`
- [[Projets|Un lien]] dans une liste

1. Une liste numérotée
2. Deuxième élément

- [ ] Une tâche à faire 📅 ${day(3)}
- [x] Une tâche faite
  - [ ] Une sous-tâche

> Une citation, sur une ligne.

---

## Callouts et toggles

> [!info] Info
> Cliquez sur l'icône pour changer de type.

> [!tip] Astuce
> \`> [!tip]\` puis espace en crée un.

> [!warning] Attention
> Un callout de mise en garde.

> [!success] Réussi
> Les types d'Obsidian ont chacun leur couleur.

> [!question]- Un toggle (callout repliable)
> Cliquez sur la flèche à gauche pour le déplier.

:::info
Une admonition **HedgeDoc** (\`:::info\` … \`:::\`), affichée comme un callout.
:::

:::spoiler Un spoiler HedgeDoc
Replié par défaut.
:::

## Tableau

| Page | État | Visites |
| :--- | :---: | ---: |
| Accueil | prête | 1 204 |
| Blog | en cours | 310 |
| Contact | à faire | 0 |

## Code

\`\`\`typescript
export function bonjour(nom: string): string {
  return \`Bonjour \${nom} !\`;
}
\`\`\`

\`\`\`python
def bonjour(nom):
    return f"Bonjour {nom} !"
\`\`\`

## Maths

La formule $E = mc^2$ en ligne (cliquez dessus pour la modifier), et en bloc (double-cliquez) :

$$
\\sum_{k=1}^{n} k = \\frac{n(n+1)}{2}
$$

## Diagrammes

Un diagramme Mermaid :

\`\`\`mermaid
graph LR
  Idée --> Brouillon --> Relecture --> Publication
\`\`\`

Un organigramme flowchart.js, modifiable avec son éditeur visuel (survolez le bloc) :

\`\`\`flow
st=>start: Début
op=>operation: Écrire
cond=>condition: Relu ?
e=>end: Publier

st->op->cond
cond(yes)->e
cond(no)->op
\`\`\`

## Graphique

Un graphique Plotly, avec son éditeur visuel (« Éditeur visuel » en haut du bloc) :

\`\`\`plotly
data:
  - type: bar
    x: [Janv., Févr., Mars, Avr.]
    y: [12, 19, 7, 15]
    name: Articles
  - type: scatter
    mode: lines
    x: [Janv., Févr., Mars, Avr.]
    y: [8, 11, 10, 14]
    name: Visites (centaines)
layout:
  title: Le blog
\`\`\`

## HTML

Du HTML en ligne : <kbd>⌘</kbd> + <kbd>K</kbd>, <sup>exposant</sup>, <span style="color: #2f9e44">texte coloré</span>.

<details>
<summary>Un bloc <code>&lt;details&gt;</code></summary>
Le HTML s'affiche mis en page, sans ses scripts.
</details>

## Intégrations

Une base, un croquis et une mind map du vault, intégrés par \`![[…]]\` :

![[Voyages.base]]

![[Croquis.excalidraw.md]]

![[Idées.mindmap.md]]

[^1]: Survolez l'appel pour la lire, cliquez pour venir ici. La barre de mise en forme en ajoute une sur le texte sélectionné.
`;

/** The to-do list (« Tâches » in the sidebar): a section per category, tasks in the Tasks plugin's format. */
const TODO = `## Perso

- [ ] Prendre rendez-vous chez le dentiste 📅 ${day(4)} #santé
- [ ] Rappeler Paul 📅 ${day(0)}
- [x] Payer le loyer 📅 ${day(-2)}

## Travail

- [ ] Préparer la réunion d'équipe 📅 ${day(1)} #réunion
- [ ] Relire le devis 📅 ${day(-1)} #client
`;

/** The simulated remote changed the same line of "Projets.md": edit it locally, commit, then pull to see a conflict. */
export const DEMO_REMOTE = { "Projets.md": "# Projets\n\n[[Mon Notion]] — modifié sur un autre ordinateur\n" };

export const DEMO_FILES = {
  ".obsidian/bookmarks.json": JSON.stringify({ items: [{ type: "file", path: "Exemple.md" }, { type: "file", path: "Projets/Site web.md" }, { type: "file", path: "Fonctionnalités Obsidian.md" }, { type: "file", path: "Tour de l'éditeur.md" }] }),
  "Exemple.md": FULL_NOTE,
  "Projets.md": "# Projets\n\n[[Mon Notion]]\n",
  "Projets/Mon Notion.md": "Une sous-page de [[Projets]].\n",
  "Projets/Site web.md": PROJECT_NOTE,
  "Projets/Lancement.md": LAUNCH_NOTE,
  "Fonctionnalités Obsidian.md": OBSIDIAN_NOTE,
  "Tour de l'éditeur.md": EDITOR_TOUR,
  "Todo.md": TODO,
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
  "Suivi.dashboard.md":
    "---\nflownote-dashboard:\n  Objectifs: [0, 0, 4, 9]\n  Budget: [4, 0, 8, 9]\n  Voyages: [0, 9, 12, 10]\n  Idées: [0, 19, 6, 10]\n  Croquis: [6, 19, 6, 10]\n---\n## Objectifs\n\n- Site en ligne avant décembre\n- Deux voyages par an\n\n## Budget\n\n```plotly\ndata:\n  - type: bar\n    x: [Lisbonne, Kyoto, Montréal, Islande]\n    y: [650, 2400, 1300, 1800]\n```\n\n## Voyages\n\n![[Voyages.base]]\n\n## Idées\n\n![[Idées.mindmap.md]]\n\n## Croquis\n\n![[Croquis.excalidraw.md]]\n",
  "Tickets/2 - Mode sombre des graphiques.md": ticket(2, "in-progress", "bug", "Les graphiques Plotly restent clairs en mode sombre.", day(1)),
  "Tickets/3 - Import CSV.md": ticket(3, "closed", "idée", "Importer un fichier CSV dans un graphique."),
  "Tickets/4 - Raccourci de recherche.md": ticket(4, "open", "ux", "⌘P pour chercher une page, comme dans VS Code.", day(6)),
  "Tickets/5 - Documentation illustrée.md": ticket(5, "in-progress", "doc", "Des captures d'écran dans la documentation."),
  "Tickets/1 - Exporter en PDF.md": `---\ntype: ticket\nid: 1\nstatus: open\ntags: [idée, export]\ndue: ${new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10)}\ncreated: 2026-10-14T09:00\n---\n\nPouvoir exporter une note en PDF depuis la barre d'outils.\n\n- [x] Regarder les options d'impression\n- [ ] Choisir une mise en page 📅 ${new Date().toISOString().slice(0, 10)}\n\n## Commentaires\n\n> [!comment] 14/10/2026 09:12\n> Bonne idée, à prévoir pour la prochaine version.\n>\n> > [!comment] 14/10/2026 10:30\n> > Il faudra garder les callouts en couleur.\n`,
};
