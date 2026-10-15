# FlowNote

Éditeur façon Notion pour un vault Obsidian. Tauri 2 (Rust) + React + Tiptap 3, TypeScript 7. Livré pour **macOS Apple Silicon uniquement** (le build Linux a été retiré).

## Règles

- **Répondre en français.**
- **Fidélité des fichiers avant tout** : tout reste du texte lisible dans Obsidian et propre dans Git. Une note non modifiée est réécrite à l'octet près ; une note modifiée ne change que dans les blocs touchés. Seule exception : les emoji restent en `:shortcode:`.
- **Ne jamais modifier `.obsidian`** : il est en lecture seule.
- **Commit, push, merge ou release seulement sur demande** (« commit et push », « merge », « release »). Fin des messages de commit : `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Grosse fonctionnalité** : poser des questions avant de coder.
- **Style Notion partout** : pas de `<select>` bruts, des menus cohérents avec l'app, des fenêtres qui ne débordent pas, des alignements soignés.
- **Bugs propres à WebKit** : les vérifier dans l'app de bureau, pas seulement dans Chrome.

## Vérifications

```
npm run lint        # oxlint (--deny-warnings), config .oxlintrc.json
npm run typecheck   # tsc --noEmit
npm test            # vitest
~/.cargo/bin/cargo test --manifest-path src-tauri/Cargo.toml
npx vite --port 1430   # serveur de dev ; « Essayer avec un exemple » ouvre le vault de démo en mémoire
```

## Architecture

- `src-tauri/src/vault.rs` : fichiers du vault (lecture, écriture atomique avec contrôle de conflit, corbeille, arbre, `vault_stats`).
- `src/markdown/` : moteur de fidélité (remark/mdast, re-sérialisation bloc par bloc).
- `src/editor/` : Tiptap/ProseMirror. Les vues de nœuds sont dans `views.ts`, le pont vers l'app dans `bridge.ts`.
- `src/vault/` : accès au vault, résolution des liens façon Obsidian (`links.ts`), opérations sur les pages (`pageOps.ts`).
- Types de page, un dossier chacun : `base/` (`.base`), `drawing/` (`.excalidraw.md`), `mindmap/` (`.mindmap.md`), `ticket/` (`type: ticket`), `presentation/` (`marp: true`), plus `reading/` et `graph/`.
- `src/App.tsx` : état global, onglets, choix du type de page. Les vues hors page sont des pseudo-chemins `flownote:tickets`, `flownote:graph`, `flownote:reading`.
- Styles : `src/styles/*.css`, importés depuis `src/styles.css`.

## Pièges connus

- **Glisser-déposer** : utiliser des pointer events, pas le drag HTML5 (WebKit le refuse sur les `<button>`). Ajouter `user-select: none` et `-webkit-user-select: none` pour qu'aucun texte ne reste sélectionné.
- **Versions figées** : TanStack Table en v8 (la v9 change d'API), mind-elixir 5.15.x. Marp avec `inlineSVG: false` (WebKit dessine mal `foreignObject`).
- **Plotly 3+** n'affiche plus les titres écrits en texte simple (`title: Ventes`) : `src/editor/plotly.ts` les convertit en `{ text }` au dessin.
- **Thème sombre écrit deux fois** dans `base.css` (sombre du système et sombre choisi) : garder les deux listes identiques.
- **Format des bases** (vérifié dans le code d'Obsidian 1.14.4) :
  - types de vue natifs : `table`, `cards`, `list`, `kanban` ;
  - `groupBy` exige `property` **et** `direction` ;
  - noms de calculs : Average, Min, Max, Sum, Range, Median, Stddev, Earliest, Latest, Checked, Unchecked, Empty, Filled, Unique ;
  - Obsidian conserve les clés qu'il ne connaît pas ;
  - FlowNote écrit `type: kanban`, et le calendrier comme `type: cards` + `flownoteView: calendar`. Couleurs et types des colonnes sous `flownote: properties:`. Modifier le YAML via l'API Document de `yaml`, pour garder les clés inconnues.
- **Bases et dossiers** : les lignes de `X.base` sont les notes du dossier `X/` (filtre `file.inFolder("X")`). Renommer une base réécrit ce filtre.

## Publier une version

1. Mettre la version et ses changements en tête de `CHANGELOG.md`, et mettre à jour le README si besoin.
2. Changer la version dans `package.json`, `package-lock.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` et `src-tauri/Cargo.lock`.
3. Commit « Version X.Y.Z », merge dans `main`, puis `git tag vX.Y.Z && git push origin vX.Y.Z`.
4. Le workflow `release.yml` construit le `.dmg` et crée une release en **brouillon**. L'utilisateur la publie lui-même.

## État actuel (15 octobre 2026)

- v0.12.0 taguée (graphiques Plotly au format obsidian-plotly avec éditeur visuel, mode sombre réparé pour toute l'app). Le workflow de release crée un brouillon à publier.
- Pistes ouvertes :
  - alerte Dependabot `glib` (Rust) : compilé seulement pour Linux, sans correctif possible côté Tauri ; à fermer comme « non utilisé » ;
  - renommer ou supprimer le dossier des tickets par son menu ne met pas à jour le réglage « Dossier des tickets » ;
  - branche `feature/notebooks` (notebooks Python marimo) jamais fusionnée, 41 commits de retard ;
  - suppression d'une base « en plusieurs fois » dans l'app de bureau : rendue robuste mais pas reproduite, à confirmer ;
  - kanban et calendrier des bases à vérifier dans Obsidian ;
  - l'ordre manuel des lignes (`rowOrder`, par chemin) se perd quand on renomme une page ;
  - nouveautés des 0.10 à 0.12 testées dans Chrome seulement, à vérifier dans l'app de bureau (⌘,, clic droit, glisser-déposer, Finder, défilement de la fenêtre, menu du fil d'Ariane, graphiques, thème de la fenêtre) ;
  - un graphique Plotly déjà affiché garde ses couleurs si on change de thème, jusqu'à son prochain rendu.
- L'historique détaillé des sessions est dans `.remember/` (à lire sur demande).
