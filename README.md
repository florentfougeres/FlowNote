<p align="center">
  <img src="assets/icon.png" width="128" alt="Icône de FlowNote">
</p>

<h1 align="center">FlowNote</h1>

<p align="center">
  L'édition par blocs de Notion, directement sur votre vault Obsidian.<br>
  Vos fichiers Markdown restent la seule source de vérité.
</p>

---

FlowNote est une application de bureau macOS qui ouvre un dossier de notes Obsidian et permet de les éditer comme dans Notion : blocs, menu `/`, glisser-déposer, tableaux, callouts… Il n'y a ni base de données ni format caché : chaque note reste un fichier `.md` que vous pouvez continuer à ouvrir dans Obsidian, sans plugin.

Autour de l'éditeur : des bases façon Notion (tableau, kanban, galerie, calendrier), des dessins Excalidraw, des mind maps, des tickets façon GitHub avec un tableau kanban, une liste de lectures, des présentations Marp, un graphe des liens et un gestionnaire Git intégré. Tout reste du texte, lisible dans Obsidian et propre dans Git.

Les nouveautés de chaque version sont dans le [CHANGELOG](CHANGELOG.md).

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="src/docs/images/editeur.dark.webp">
  <img src="src/docs/images/editeur.light.webp" alt="Une note dans FlowNote : propriétés, callout, tâches, tableau">
</picture>

| | |
| --- | --- |
| <picture>  <source media="(prefers-color-scheme: dark)" srcset="src/docs/images/split-view.dark.webp">  <img src="src/docs/images/split-view.light.webp" alt="Deux pages côte à côte"></picture> | <picture>  <source media="(prefers-color-scheme: dark)" srcset="src/docs/images/base-kanban.dark.webp">  <img src="src/docs/images/base-kanban.light.webp" alt="Une base en kanban"></picture> |
| **Split view** : deux pages dans un onglet | **Bases** : tableau, kanban, galerie, calendrier |
| <picture>  <source media="(prefers-color-scheme: dark)" srcset="src/docs/images/croquis.dark.webp">  <img src="src/docs/images/croquis.light.webp" alt="Un dessin Excalidraw"></picture> | <picture>  <source media="(prefers-color-scheme: dark)" srcset="src/docs/images/tickets-tableau.dark.webp">  <img src="src/docs/images/tickets-tableau.light.webp" alt="Les tickets en tableau kanban"></picture> |
| **Dessins** Excalidraw | **Tickets** façon GitHub |

La documentation complète, illustrée, est dans l'app (« Documentation » dans la barre latérale) et dans [`src/docs/documentation.md`](src/docs/documentation.md).

## Fonctionnalités

**Interface façon Notion**
- Onglets en haut de la fenêtre, barre latérale avec le vault (et ses vaults récents), Accueil, Rechercher, Tickets, Lectures, Graphe, Documentation et l'arbre des pages
- **Split view** : deux pages côte à côte (`⌥-clic` sur une page, `⌘⌥\` pour fermer le panneau)
- Documentation intégrée de toutes les fonctionnalités
- Arbre des pages : menu « … » ou clic droit (renommer, supprimer, dupliquer, copier le lien, afficher dans le Finder, sous-page, nouveau dossier), glisser-déposer des pages et des dossiers, liens mis à jour à chaque déplacement
- Favoris d'Obsidian en haut de la barre latérale
- Pastille d'état en bas à droite de la page : enregistrement, nombre de mots, messages
- Réglages dans un onglet (`⌘,`), rangés par catégorie, dont la taille de l'interface
- Barre latérale masquable (`⌘\`), qui réapparaît au survol du bord gauche
- Pleine largeur par page et mode focus (`⌘⇧M`, Échap pour en sortir)
- Menu « … » de la page : export en **PDF** (note, présentation, dessin, mind map) et copie de la note en HTML pour un mail ou un document
- Icône de page : un emoji choisi au-dessus du titre (propriété `icon`)
- Accueil : créer, récents, à faire, tickets, à lire, graphe, Git, activité et statistiques du vault

**Éditeur de blocs**
- Titres, listes, tâches, citations, callouts Obsidian (`> [!note]`), admonitions HedgeDoc (`:::info`), toggles (callouts repliables), séparateurs
- Menu `/` pour insérer ou transformer un bloc, raccourcis Markdown à la frappe (`#`, `-`, `[]`, `>`, ```` ``` ````)
- Poignée de bloc : glisser-déposer avec imbrication, dupliquer, transformer, supprimer ; `⌥↑` / `⌥↓` déplacent le bloc
- Sommaire : `[TOC]` (comme HedgeDoc) affiche les titres de la note, `/sommaire` l'insère
- Mise en forme en ligne : gras, italique, barré, surligné, code, liens (`⌘K` sur une sélection, ou coller une URL sur du texte sélectionné)
- Tableaux éditables avec poignées de lignes et de colonnes (insérer, déplacer, aligner, supprimer)
- Blocs de code avec coloration syntaxique, diagrammes **Mermaid**, maths, emoji (`:calendrier`), date du jour (`/date`)
- **Graphiques Plotly** (`/graphique`) au format du plugin Obsidian [obsidian-plotly](https://github.com/Dmytro-Shulha/obsidian-plotly) : blocs ```` ```plotly ```` en YAML ou JSON, graphiques interactifs, éditeur visuel (type, titres, tableau des valeurs, import d'un CSV)
- Propriétés YAML (frontmatter) éditables, tags, `[[wikilinks]]` et `![[embeds]]` avec autocomplétion
- Sous-pages et arborescence dans la barre latérale

**Dessins**
- Une page peut être une note ou un **dessin** à main levée, avec [Excalidraw](https://excalidraw.com) intégré : formes, flèches, crayon, texte, images
- Les outils de dessin prennent place dans la barre d'outils de FlowNote
- Format du plugin Obsidian « Excalidraw » (`Nom.excalidraw.md`) : avec ce plugin, les dessins s'ouvrent aussi dans Obsidian ; sans lui, on voit le JSON du dessin

**Tickets**
- Comme les issues GitHub : un ticket est une note de `Tickets/` (« 12 - Titre.md ») avec état, tags, échéance (`📅` du plugin Tasks) et fil de commentaires en callouts `[!comment]`
- Vue liste (ouverts / fermés, tri, recherche, tags) ou **tableau kanban** avec glisser-déposer ; colonnes personnalisables depuis le tableau ou les réglages

**Lectures**
- Une note `Lectures.md` : une section par thème, une case à cocher par lien, cochée une fois lu
- Tags Obsidian (`#tag`) sur chaque lien, et filtre par tags dans la vue Lectures
- Ajout rapide (`⌘⇧L`) avec le titre de la page lu automatiquement, vue dédiée et carte « À lire » sur l'accueil

**Présentations**
- Une note avec `marp: true` devient une présentation [Marp](https://marp.app) : diapos séparées par `---`, notes de l'orateur en commentaires
- Miniatures à jour pendant l'écriture, mode Présenter (`⌘⇧P`) avec vue présentateur, export en HTML autonome

**Bases**
- Des bases de données comme dans Notion, au format des Bases d'Obsidian (`Nom.base`) : chaque ligne est une note d'un dossier, chaque colonne une propriété YAML
- Vues Tableau, Kanban, Galerie et Calendrier ; filtres, tris, groupes, calculs en bas de colonne, formules
- Sélections colorées, saisie au clavier, glisser-déposer des colonnes, lignes et cartes
- Une base s'intègre dans une note avec `![[Nom.base]]`, et la page d'une ligne affiche les propriétés de sa base

**Mind maps**
- Des cartes mentales éditées à la souris et au clavier ([Mind Elixir](https://mind-elixir.com)) : Tab pour un enfant, Entrée pour un frère, glisser pour réorganiser, export PNG
- Stockées dans une note `Nom.mindmap.md`, avec un plan lisible pour Obsidian

**Graphe**
- Le graphe des liens entre les notes, comme dans Obsidian : aperçu sur l'accueil et vue complète (zoom, survol, filtres)

**Correction**
- Grammaire et orthographe en français avec [Grammalecte](https://grammalecte.net), entièrement sur votre Mac, sans service en ligne
- Clic sur un mot souligné pour voir les suggestions, l'ignorer ou l'ajouter à votre dictionnaire
- Un bouton de la barre de page coupe ou réactive la correction sans changer le correcteur choisi

**Navigation**
- Recherche de page (`⌘P`), recherche et remplacement dans la note (`⌘F` / `⌘⌥F`), recherche dans tout le vault (`⌘⇧F`)
- Fil d'Ariane cliquable, plan de la note, historique précédent/suivant
- **Notes liées** sous chaque note (les pages qui pointent vers elle) et mentions non liées, avec un bouton pour en faire un lien
- Mots et caractères de la sélection dans la pastille d'état
- Mode Markdown brut (`⌘⇧E`) avec numéros de ligne

**Git**
- Statut, diff, indexation et commit
- Pull (par fusion) et push
- Historique d'une note et restauration d'une version
- Résolution simple des conflits de fusion

## Compatibilité avec Obsidian

C'est le cœur du projet : **une note que FlowNote n'a pas modifiée est réécrite à l'octet près**, et une note modifiée ne change que dans les blocs touchés. Le reste du fichier (espacements, style des listes, marqueurs, fins de ligne, BOM…) est conservé tel quel.

- Frontmatter YAML, `[[wikilinks]]`, `![[embeds]]`, `#tags`, pièces jointes : tout reste lisible et éditable dans Obsidian.
- Les blocs sans équivalent Markdown standard utilisent une syntaxe qu'Obsidian affiche nativement (callouts pour les toggles, blocs ```` ```mermaid ````…).
- Tickets, lectures et présentations sont des notes ordinaires : propriétés YAML (`type: ticket`, `status`, `marp: true`…), cases à cocher et callouts, que les plugins Tasks et Marp Slides savent aussi lire.
- Exceptions assumées : les codes emoji (`:warning:`) et les dessins (`.excalidraw.md`) demandent un plugin Obsidian pour être rendus ; sans lui, on voit leur texte.
- Les bases utilisent le format des Bases d'Obsidian : tableau, galerie et kanban s'y ouvrent tels quels. Le calendrier, qu'Obsidian n'a pas, y apparaît en galerie ; les couleurs et types des colonnes sont rangés sous une clé `flownote:` qu'Obsidian conserve.
- Le dossier `.obsidian` n'est jamais modifié. FlowNote lit seulement ses réglages de liens et de pièces jointes.
- FlowNote n'accède qu'au vault ouvert : un vault Obsidian (avec `.obsidian`) ou un dossier choisi dans « Ouvrir un vault ».
- Une note modifiée ailleurs (Obsidian, git) n'est jamais écrasée : l'écriture est refusée et la différence est signalée.

## Installation

1. Téléchargez le fichier `FlowNote_x.y.z_aarch64.dmg` depuis la page [Releases](https://github.com/florentfougeres/FlowNote/releases).
2. Ouvrez le `.dmg` et glissez FlowNote dans le dossier **Applications**.
3. **Premier lancement** : l'application n'est pas encore signée par un certificat Apple Developer, donc macOS la bloque. Ouvrez *Réglages Système → Confidentialité et sécurité*, puis cliquez sur **Ouvrir quand même** en face de FlowNote. Si macOS indique que l'application « est endommagée », exécutez une fois :

   ```sh
   xattr -cr /Applications/FlowNote.app
   ```

Configuration requise : Mac Apple Silicon (M1 et suivants), macOS 11 (Big Sur) ou plus récent. Git doit être installé pour utiliser les fonctions Git (`xcode-select --install` ou Homebrew).

## Développement

Prérequis : [Node.js](https://nodejs.org) 20+, [Rust](https://rustup.rs), [uv](https://docs.astral.sh/uv/) et les outils en ligne de commande Xcode.

Au premier lancement, `scripts/build-grammar.sh` télécharge Grammalecte (version fixée, empreinte vérifiée) et le compile en un exécutable embarqué dans l'app (`src-tauri/binaries/`).

```sh
npm install
npm run tauri dev      # application de bureau avec rechargement à chaud
npm run dev            # version navigateur (Chrome) sur http://localhost:1420
```

| Commande | Rôle |
| --- | --- |
| `npm test` | Tests unitaires (Vitest) |
| `npm run typecheck` | Vérification TypeScript |
| `npm run lint` | Analyse du code (oxlint) |
| `npm run fidelity -- <vault>` | Vérifie, en lecture seule, que chaque note d'un vault est réécrite à l'identique |
| `cargo test --manifest-path src-tauri/Cargo.toml` | Tests Rust (fichiers du vault, Git, Grammalecte, liens web) |
| `npm run tauri build` | Construit `FlowNote.app` et le `.dmg` dans `src-tauri/target/release/bundle/` |

### Construire le `.dmg` en local

Sans passer par GitHub Actions (mêmes prérequis que ci-dessus, sur un Mac Apple Silicon) :

```sh
npm install
npm run tauri build -- --bundles dmg
```

Le fichier est créé dans `src-tauri/target/release/bundle/dmg/FlowNote_x.y.z_aarch64.dmg` (l'app seule dans `bundle/macos/FlowNote.app`). La première construction prend plusieurs minutes (compilation Rust et de Grammalecte). Pour l'ajouter à une release existante : `gh release upload vx.y.z src-tauri/target/release/bundle/dmg/*.dmg`.

### Architecture

Le fonctionnement interne (bibliothèques, moteur de fidélité Markdown, formats des types de page, backend Rust) est détaillé dans [docs/sous-le-capot.md](docs/sous-le-capot.md).

- **`src-tauri/`** : backend Rust (Tauri 2). Il gère l'accès aux fichiers du vault, le Git système, la recherche plein texte, l'ouverture des liens et la lecture du titre des pages web.
- **`src/markdown/`** : moteur de fidélité Markdown. Il parse avec remark/mdast, conserve la source de chaque bloc et ne re-sérialise que les blocs modifiés, en vérifiant l'équivalence.
- **`src/editor/`** : éditeur basé sur Tiptap/ProseMirror. Il contient le schéma, les vues de blocs, le menu `/`, le glisser-déposer, les poignées de tableau et la recherche.
- **`src/vault/`** : accès au vault, résolution des liens façon Obsidian, opérations sur les pages et client Git.
- **`src/base/`**, **`src/ticket/`**, **`src/reading/`**, **`src/presentation/`**, **`src/mindmap/`**, **`src/graph/`**, **`src/drawing/`** : bases, tickets et kanban, liste de lectures, présentations Marp, mind maps, graphe des liens, dessins Excalidraw.
- **`grammar/`** : petit programme compagnon qui fait tourner Grammalecte. FlowNote lui envoie les paragraphes par l'entrée standard.

### Publier une version

1. Ajoutez la version et ses changements en tête de `CHANGELOG.md`.
2. Mettez à jour la version dans `package.json`, `package-lock.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` et `src-tauri/Cargo.lock`.
3. Commitez, puis poussez un tag : `git tag v0.9.0 && git push origin v0.9.0`.
4. Le workflow GitHub Actions lance les tests, construit le `.dmg` (Apple Silicon) et prépare une release en brouillon. Relisez-la, puis publiez-la sur GitHub.

## Licence

[MIT](LICENSE) © 2026 Florent Fougères

Le correcteur livré avec l'application est un programme séparé, sous licence GPL v3 : [Grammalecte](https://grammalecte.net) d'Olivier R., et son lanceur `grammar/flownote_grammar.py`. Son code source est disponible sur le site de Grammalecte et dans le dossier `grammar/`.
