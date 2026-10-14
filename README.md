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

Un gestionnaire Git intégré permet de versionner le vault : statut, diff, commit, pull/push, historique d'une note et résolution des conflits.

## Fonctionnalités

**Éditeur de blocs**
- Titres, listes, tâches, citations, callouts Obsidian (`> [!note]`), toggles (callouts repliables), séparateurs
- Menu `/` pour insérer ou transformer un bloc, raccourcis Markdown à la frappe (`#`, `-`, `[]`, `>`, ```` ``` ````)
- Poignée de bloc : glisser-déposer avec imbrication, dupliquer, transformer, supprimer
- Mise en forme en ligne : gras, italique, barré, surligné, code, liens
- Tableaux éditables avec poignées de lignes et de colonnes (insérer, déplacer, aligner, supprimer)
- Blocs de code avec coloration syntaxique, diagrammes **Mermaid**, maths, emoji (`:calendrier`)
- Propriétés YAML (frontmatter) éditables, tags, `[[wikilinks]]` et `![[embeds]]` avec autocomplétion
- Sous-pages et arborescence dans la barre latérale

**Dessins**
- Une page peut être une note ou un **dessin** à main levée, avec [Excalidraw](https://excalidraw.com) intégré : formes, flèches, crayon, texte, images
- Les outils de dessin prennent place dans la barre d'outils de FlowNote
- Format du plugin Obsidian « Excalidraw » (`Nom.excalidraw.md`) : avec ce plugin, les dessins s'ouvrent aussi dans Obsidian ; sans lui, on voit le JSON du dessin

**Notebooks**
- Une page peut être un **notebook** : du texte Markdown et des cellules **Python** et **SQL** exécutables, comme dans Jupyter
- Format Markdown de [marimo](https://marimo.io) : le même fichier s'ouvre avec `marimo edit` (bouton « Ouvrir dans marimo »), et reste lisible dans Obsidian
- Sorties sous les cellules (console, erreurs, tableaux paginés, graphiques matplotlib, HTML/plotly), jamais écrites dans le fichier
- SQL avec DuckDB : les requêtes lisent les DataFrames Python et les fichiers (CSV, Parquet…) ; le résultat devient un DataFrame polars
- « Figer » écrit un tableau de résultats en Markdown sous la cellule, visible dans Obsidian
- Python et les paquets sont gérés par [uv](https://docs.astral.sh/uv/), livré avec l'app : `pyproject.toml` à la racine du vault, et dépendances propres à chaque notebook

**Correction**
- Grammaire et orthographe en français avec [Grammalecte](https://grammalecte.net), entièrement sur votre Mac, sans service en ligne
- Clic sur un mot souligné pour voir les suggestions, l'ignorer ou l'ajouter à votre dictionnaire

**Navigation**
- Recherche de page (`⌘P`), recherche et remplacement dans la note (`⌘F` / `⌘⌥F`), recherche dans tout le vault (`⌘⇧F`)
- Fil d'Ariane cliquable, plan de la note, historique précédent/suivant
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
- Exceptions assumées : les codes emoji (`:warning:`) et les dessins (`.excalidraw.md`) demandent un plugin Obsidian pour être rendus ; sans lui, on voit leur texte.
- Le dossier `.obsidian` n'est jamais modifié. FlowNote lit seulement ses réglages de liens et de pièces jointes.
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
| `npm run fidelity -- <vault>` | Vérifie, en lecture seule, que chaque note d'un vault est réécrite à l'identique |
| `npm run tauri build` | Construit `FlowNote.app` et le `.dmg` dans `src-tauri/target/release/bundle/` |

### Architecture

- **`src-tauri/`** : backend Rust (Tauri 2). Il gère l'accès aux fichiers du vault, le Git système et la recherche plein texte.
- **`src/markdown/`** : moteur de fidélité Markdown. Il parse avec remark/mdast, conserve la source de chaque bloc et ne re-sérialise que les blocs modifiés, en vérifiant l'équivalence.
- **`src/editor/`** : éditeur basé sur Tiptap/ProseMirror. Il contient le schéma, les vues de blocs, le menu `/`, le glisser-déposer, les poignées de tableau et la recherche.
- **`src/vault/`** : accès au vault, résolution des liens façon Obsidian, opérations sur les pages et client Git.
- **`grammar/`** : petit programme compagnon qui fait tourner Grammalecte. FlowNote lui envoie les paragraphes par l'entrée standard.
- **`src/notebook/`** et **`src-tauri/resources/kernel/`** : notebooks. Un kernel Python par notebook ouvert, lancé avec `uv run` dans l'environnement du vault ; il échange des messages JSON avec l'app par l'entrée et la sortie standard.

### Publier une version

1. Mettez à jour la version dans `package.json`, `src-tauri/tauri.conf.json` et `src-tauri/Cargo.toml`.
2. Commitez, puis poussez un tag : `git tag v0.2.0 && git push origin v0.2.0`.
3. Le workflow GitHub Actions construit le `.dmg` (Apple Silicon) et prépare une release en brouillon. Relisez-la, puis publiez-la sur GitHub.

## Licence

[MIT](LICENSE) © 2026 Florent Fougères

Les notebooks suivent le format Markdown de [marimo](https://github.com/marimo-team/marimo) (licence Apache 2.0), qui a servi de référence fonctionnelle ; aucun code de marimo n'est repris. [uv](https://github.com/astral-sh/uv) (licences MIT et Apache 2.0) est livré avec l'application.

Le correcteur livré avec l'application est un programme séparé, sous licence GPL v3 : [Grammalecte](https://grammalecte.net) d'Olivier R., et son lanceur `grammar/flownote_grammar.py`. Son code source est disponible sur le site de Grammalecte et dans le dossier `grammar/`.
