# FlowNote

Éditeur façon Notion pour un vault Obsidian. Tauri 2 (Rust) + React + Tiptap 3, TypeScript 7. Livré pour **macOS Apple Silicon** (`.dmg`) et **Ubuntu 26.04** (`.deb`, sans bibliothèques embarquées ; réglages Linux dans `src-tauri/tauri.linux.conf.json`). L'AppImage a été abandonnée : 100 Mo.

## Règles

- **Répondre en français.**
- **Fidélité des fichiers avant tout** : tout reste du texte lisible dans Obsidian et propre dans Git. Une note non modifiée est réécrite à l'octet près ; une note modifiée ne change que dans les blocs touchés. Seule exception : les emoji restent en `:shortcode:`.
- **Ne jamais modifier `.obsidian`** : il est en lecture seule.
- **Commit, push ou merge seulement sur demande** (« commit et push », « merge »). Les releases demandées, Claude les fait de bout en bout (version, CHANGELOG, commit, tag, push). Fin des messages de commit : `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
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

- `src-tauri/core/` : **le backend**, bibliothèque `flownote-core` sans Tauri. Elle couvre les fichiers du vault (`vault.rs` : lecture, écriture atomique avec contrôle de conflit, corbeille, arbre, `vault_stats`), Git (`git.rs`), Grammalecte (`grammar.rs`) et le web (`web.rs`). Un aiguillage unique, `backend.rs` (`dispatch` et `COMMANDS`), sert toutes les commandes. Côté web, on passe toujours par `backend()` dans `src/platform.ts`. `src-tauri/src/lib.rs` n'expose que la commande `backend`, plus ce qui est propre à Tauri (sélecteur de dossier, lecture binaire brute, `startup_note`, `log_frontend`).
- `src/menus.ts` : menus des pages, des dossiers et des onglets, écrits une fois (barre latérale et barre d'onglets).
- `src/shortcuts.ts` : les raccourcis clavier, écrits une fois : l'aide (⌘/) les liste, le gestionnaire d'`App.tsx` lance leurs actions (`globalAction`).
- `src/hooks/usePageOps.ts` : créer, renommer, déplacer, dupliquer et supprimer pages et dossiers ; `App.tsx` lui fournit `followMoves` et `forgetRemoved` (onglets et historique).
- `tauriVault(root)` (`src/vault/tauriVault.ts`) et `backendGit(root)` (`git.ts`) : l'API du vault et de Git sur `backend()`, la racine envoyée avec chaque commande. Les octets des pièces jointes passent par la commande Tauri `vault_read_binary`, sans JSON.
- `src/markdown/` : moteur de fidélité (remark/mdast, re-sérialisation bloc par bloc).
- `src/editor/` : Tiptap/ProseMirror. Les vues de nœuds sont dans `views/` (un fichier par vue, `createNodeViews` dans `index.ts`), le pont vers l'app dans `bridge.ts`.
- `src/vault/` : accès au vault, résolution des liens façon Obsidian (`links.ts`), opérations sur les pages (`pageOps.ts`), notes liées (`backlinks.ts`), copie des notes en mémoire (`noteCache.ts` : le vault ouvert est enveloppé, ses écritures tiennent la copie à jour).
- `src/print.ts` : export PDF par le panneau d'impression (styles dans `styles/print.css`).
- `src/tabs.ts` : la liste d'onglets et le split view en fonctions pures (testées). `src/pageExport.ts` : exports PDF, PNG et HTML d'une page, partagés par les deux côtés du split view.
- `src/SplitPane.tsx` : côté droit du split view (lecture et enregistrement propres, barre d'outils) ; la page de droite est le champ `split` de l'onglet (`Tab` dans `TabBar.tsx`) : la paire forme un seul onglet.
- `src/editor/syntaxMarks.ts` : `#` des titres et `` ` `` du code affichés autour du curseur, pour changer de niveau ou retirer le code sans la vue brute.
- `src/DatePicker.tsx` : sélecteur de date de l'app (jamais d'`<input type="date">`).
- `src/query/` : requêtes Dataview et Tasks (index du vault, langages, rendu sous les blocs de code) ; `src/markdown/sections.ts` : la partie d'une note montrée par `![[Note#Titre]]` ou `![[Note#^id]]`.
- `src/CommandPalette.tsx` : palette de commandes (`⌘⇧P`), commandes construites par `App.tsx`.
- `src/docs/documentation.md` : documentation affichée dans l'app (`flownote:docs`). **La mettre à jour avec chaque fonctionnalité.**
- `src/docs/images/` : captures de la doc, `nom.light.webp` et `nom.dark.webp` (1600 px de large, densité 2), intégrées par `![[nom.webp]]` (`docsBridge.ts` sert celle du thème). Refaites dans Chrome sur le vault de démo (`src/demo.ts`), fenêtre 1280×800, puis converties en WebP (`sips` ne sait pas écrire le WebP : passer par un canvas).
- Types de page, un dossier chacun : `base/` (`.base`), `drawing/` (`.excalidraw.md`), `mindmap/` (`.mindmap.md`), `canvas/` (`.canvas`, écrit comme Obsidian), `ticket/` (`type: ticket`), `presentation/` (`marp: true`), `dashboardPage/` (`.dashboard.md`), plus `reading/` et `graph/`.
- `src/App.tsx` : état global, onglets, choix du type de page. Les vues hors page sont des pseudo-chemins `flownote:tickets`, `flownote:graph`, `flownote:reading`, `flownote:settings`, `flownote:docs`.
- Styles : `src/styles/*.css`, importés depuis `src/styles.css`.
- `docs/sous-le-capot.md` : documentation technique du dépôt (bibliothèques, moteur de fidélité, formats des pages, backend). Hors de l'app. **La mettre à jour quand une bibliothèque ou un format change.**

## Pièges connus

- **Rendus** : `Sidebar` et `SplitPane` sont enveloppés dans `memo` pour ne pas se redessiner à chaque frappe. Leur passer des valeurs stables : fonctions via `useHandlers` (`src/hooks/useHandlers.ts`), objets et tableaux via `useMemo`, jamais une fonction ou un objet créé dans le JSX.
- **CSP** (`tauri.conf.json`, `csp` et `devCsp`) : scripts de l'app seulement (`'wasm-unsafe-eval'` pour le WebAssembly d'Excalidraw), styles inline permis (`dangerousDisableAssetCspModification: ["style-src"]`, sinon Tauri ajoute un nonce qui les bloque), images de partout, polices de l'app plus `cdn.jsdelivr.net` (KaTeX des diapos) et `esm.sh` (polices CJK d'Excalidraw, non embarquées). Une nouvelle bibliothèque qui charge une ressource externe doit y être ajoutée : tester avec la CSP dans la console.
- **Glisser-déposer** : utiliser des pointer events, pas le drag HTML5 (WebKit le refuse sur les `<button>`). Ajouter `user-select: none` et `-webkit-user-select: none` pour qu'aucun texte ne reste sélectionné.
- **Versions figées** : TanStack Table en v8 (la v9 change d'API), mind-elixir 5.15.x. Marp avec `inlineSVG: false` (WebKit dessine mal `foreignObject`).
- **Plotly 3+** n'affiche plus les titres écrits en texte simple (`title: Ventes`) : `src/editor/plotly.ts` les convertit en `{ text }` au dessin.
- **Dependabot `glib` (Rust)** : tiré par la pile GTK de Tauri pour Linux, jamais compilé pour macOS. Toute alerte `glib`/`gtk` se ferme comme « non utilisé » (`gh api -X PATCH …/dependabot/alerts/N -f state=dismissed -f dismissed_reason=not_used`).
- **Thème sombre écrit deux fois** dans `base.css` (sombre du système et sombre choisi) : garder les deux listes identiques.
- **Format des bases** (vérifié dans le code d'Obsidian 1.14.4) :
  - types de vue natifs : `table`, `cards`, `list`, `kanban` ;
  - `groupBy` exige `property` **et** `direction` ;
  - noms de calculs : Average, Min, Max, Sum, Range, Median, Stddev, Earliest, Latest, Checked, Unchecked, Empty, Filled, Unique ;
  - Obsidian conserve les clés qu'il ne connaît pas ;
  - FlowNote écrit `type: kanban`, et le calendrier comme `type: cards` + `flownoteView: calendar`. Couleurs et types des colonnes sous `flownote: properties:`. Modifier le YAML via l'API Document de `yaml`, pour garder les clés inconnues.
- **Admonitions HedgeDoc** (`:::type` … `:::`) : masquées pour remark derrière un commentaire HTML de même longueur (`maskContainers` dans `parse.ts`), puis lues comme des callouts `syntax: "hedgedoc"`.
- **Mind map** : Mind Elixir écrit `translate3d(…) scale(…)` en style inline ; l'affichage passe par `--map-transform` (2D, pixels entiers) pour rester net au zoom.
- **Bases et dossiers** : les lignes de `X.base` sont les notes du dossier `X/` (filtre `file.inFolder("X")`). Renommer une base réécrit ce filtre.

## Publier une version

Sur demande, **Claude fait la release** (version, CHANGELOG, commit, tag, push) en suivant `docs/publier-une-version.md`, puis suit le build ; tenir ce document à jour si le processus change.

## État actuel (25 octobre 2026)

- 0.20.0 : barre de mise en forme (`FormatBar.tsx`, `format.ts`), fluo en couleur façon Bear (`markdown/highlightColors.ts`), souligné et HTML en ligne en marque `inlineHtml` (`markdown/inlineHtml.ts`), HTML rendu par DOMPurify (`editor/html.ts`, `typedHtml.ts`), niveau des titres dans la marge (`HeadingLevel.tsx`), langages du code (`codeLanguages.ts`), taille des tableaux (`TableSizePicker.tsx`), polices et menu des blocs en grille dans les réglages, export HTML d'une note, PDF imprimé depuis une copie de la page (`print.ts`). Testé dans Chrome seulement : PDF, export HTML et `/` du bouton + à vérifier dans l'app de bureau.
- 0.15.3 : backend Rust sorti en bibliothèque `flownote-core` avec un aiguillage unique, menus partagés (`menus.ts`), API vault/Git construites une fois ; filigrane des titres vides après les `#`, emoji d'une lettre (`:x:`). FlowNote Swift essayé puis retiré.
- 0.15.2 : liens tapés cliquables, Tab dans un paragraphe, `#` des titres en ligne, guide de release (`docs/publier-une-version.md`). 0.15.1 : favoris, réglages de la barre latérale.
- 0.15.0 : titre et nom de fichier indépendants (`titleHeading.ts`, `title` dans l'arbre, réglage `showTitles`), mode lecture par onglet, panneau Git compact, puces dessinées en CSS (marqueurs WebKit). 0.14.1 (CSP activée, barre latérale et panneau de droite mémoïsés, `tabs.ts` et `pageExport.ts` sortis d'`App.tsx`). La 0.14.0 a apporté le split view en un onglet, les marques # et `, les liens cliquables, la copie en Markdown et la documentation illustrée. Le workflow de release crée un brouillon à publier.
- Sécurité côté Rust : `check_root` limite toutes les commandes (vault et git) à un dossier avec `.obsidian` ou choisi par `vault_pick` (sélecteur natif, liste dans `trusted-vaults.json` des données de l'app). git tourne avec `core.fsmonitor=false`.
- Pistes ouvertes :
  - **FlowNote web sur le réseau local (idée pour plus tard)** : servir l'app depuis le serveur Ubuntu où le vault est cloné, pour y accéder depuis n'importe quel navigateur du réseau.
    - Un petit serveur Rust (`server/`) sert `dist/` et expose `POST /backend`, qui appelle le même `backend::dispatch` que Tauri. La racine du vault est fixée côté serveur, jamais envoyée par le navigateur.
    - Côté web, une branche HTTP dans `platform.ts` (le serveur impose sa propre racine, quelle que soit celle reçue).
    - Déploiement retenu : Docker (`Dockerfile` avec l'app web, le serveur, Grammalecte pour Linux et git ; `docker compose` qui monte le vault, publie un port et lit un mot de passe dans `.env`). L'image pourrait être publiée par la CI sur ghcr.io.
    - Points à régler : un mot de passe au minimum ; les identifiants Git montés en lecture seule et l'utilisateur du conteneur égal au propriétaire du vault ; Grammalecte recompilé pour Linux (ou le correcteur du navigateur) ; les liens et exports qui s'ouvrent côté navigateur. Le contrôle de conflit protège déjà deux navigateurs sur la même note.
  - `App.tsx` (~1 660 lignes) : reste à sortir la navigation des onglets (`useTabs` : `select`, `switchTab`, `newTab`, historique), à vérifier dans l'app de bureau (déjà sortis : `usePageOps`, `shortcuts.ts`, `Titlebar`, `useSplitWidth`, `useSidebarPeek`, `tabs.ts`, `pageExport.ts`) ;
  - idées rapides : note du jour (`.obsidian/daily-notes.json`), nouvelle page depuis un modèle (`.obsidian/templates.json`), `/page` qui écrit `# Titre` comme « Nouvelle page » ;
  - CSP active depuis octobre 2026, validée dans Chrome : à vérifier dans l'app de bureau (protocoles `ipc:` et `asset:`) ;
  - **iPad / app native (idée pour plus tard)** : piste retenue, l'**hybride**. Une coquille Swift native (barre latérale, onglets, fichiers, iCloud, réglages) qui affiche l'éditeur et les vues lourdes (Excalidraw, Plotly, Mermaid, KaTeX, Marp, mind maps) dans une WKWebView. Ressenti plus natif que Tauri, pour un effort intermédiaire. Chemin prévu : d'abord Tauri 2 sur iPad (cible iOS, vault par le sélecteur de dossiers et signets de sécurité, Git par libgit2, Grammalecte en version JS), puis remplacer les morceaux par du natif un par un. Une réécriture tout en Swift est écartée : pas d'équivalent natif à ProseMirror ni au moteur de fidélité remark. Une coquille SwiftUI pour macOS (« FlowNote Swift », `native/`) a été essayée en octobre 2026 puis retirée : trop lourde à tenir à parité, rendu jugé moins beau. Code récupérable au commit `58f9768` ;
  - branche `feature/notebooks` (notebooks Python marimo) jamais fusionnée, très en retard sur `main` ; `feature/swift-shell-historique` garde l'historique de l'essai Swift ;
  - suppression d'une base « en plusieurs fois » dans l'app de bureau : rendue robuste mais pas reproduite, à confirmer ;
  - kanban et calendrier des bases à vérifier dans Obsidian ;
  - retours d'usage d'octobre (split view, sélecteur de date, taille de l'interface par le zoom de la webview, touche morte `` ` ``, menu du croquis, netteté de la mind map) testés dans Chrome seulement, à vérifier dans l'app de bureau ;
  - nouveautés des 0.10 à 0.13 testées dans Chrome seulement, à vérifier dans l'app de bureau (⌘,, clic droit, glisser-déposer, Finder, défilement de la fenêtre, menu du fil d'Ariane, graphiques, thème de la fenêtre, export PDF par le panneau d'impression, copie HTML, import CSV, mode focus).
- L'historique détaillé des sessions est dans `.remember/` (à lire sur demande).
