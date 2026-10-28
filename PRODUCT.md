# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

Application de bureau Tauri 2 : l'interface est une webview (WebKit sur macOS, WebKitGTK sur Ubuntu), pas un langage de design natif. Livrée pour macOS Apple Silicon (`.dmg`) et Ubuntu 26.04 (`.deb`). Le serveur de dev (`npx vite --port 1430`) sert la même interface dans un navigateur, avec un vault de démo en mémoire.

## Users

D'abord son auteur, pour son propre vault Obsidian : prise de notes au quotidien, projets, tâches, lectures, versionnés avec Git. D'autres utilisateurs d'Obsidian pourront s'en servir, mais c'est cet usage personnel qui tranche les choix. Le vault de démo (carnet de Camille, freelance en sites et identités visuelles) illustre ce type d'usage ; c'est un personnage fictif, pas un utilisateur réel.

## Product Purpose

Éditer un vault Obsidian par blocs (menu `/`, glisser-déposer, tableaux, callouts) et y travailler avec des vues riches — bases, canevas, dessins Excalidraw, mind maps, tâches TaskNotes, kanban, présentations Marp, dashboards, graphe, Git intégré — sans jamais quitter le format du vault. Réussir, c'est une app agréable au quotidien dont chaque fichier reste lisible dans Obsidian et propre dans Git.

## Positioning

Le confort d'une app de notes par blocs tout-en-un et la fidélité absolue des fichiers, à égalité : l'un ne va pas sans l'autre. Une note non modifiée est réécrite à l'octet près, une note modifiée ne change que dans les blocs touchés, aucune base de données ni format caché, `.obsidian` jamais modifié, conflits jamais écrasés. Les formats des plugins Obsidian (TaskNotes, Kanban, Dataview, Tasks, Excalidraw, obsidian-plotly, Bases) sont lus et écrits tels quels.

## Operating Context

- Usage de bureau, fenêtre redimensionnable (captures de référence à 1280×800), thèmes clair et sombre, taille d'interface réglable par le zoom de la webview.
- Travail au clavier autant qu'à la souris : raccourcis (`⌘P`, `⌘⇧P`, `⌘N`, `⌘/`…), palette de commandes, onglets et split view.
- Le même vault est ouvert dans Obsidian et synchronisé par Git ; FlowNote doit cohabiter avec les deux.
- Langue de l'interface et de la documentation : français.

## Capabilities and Constraints

- Fidélité des fichiers avant tout ; seule exception : les emoji restent en `:shortcode:`.
- Finition d'une app de bureau soignée : pas de contrôles bruts du navigateur (`<select>`, `<input type="date">`), menus cohérents avec l'app, fenêtres qui ne débordent pas, alignements soignés.
- Comportements WebKit à vérifier dans l'app de bureau, pas seulement dans Chrome (glisser-déposer par pointer events, netteté au zoom, menus natifs).
- CSP stricte : toute ressource externe nouvelle doit y être déclarée.
- Documentation intégrée (`src/docs/documentation.md`) et vault de démo tenus à jour avec chaque fonctionnalité.
- Non décidé : diffusion publique (pour l'instant des releases GitHub pour usage personnel, licence MIT) ; version iPad ; FlowNote web servi sur le réseau local.

## Brand Commitments

- Nom : FlowNote ; icône existante (`assets/icon.png`).
- Voix : français sobre et direct, phrases courtes, termes concrets (« page », « vault », « bloc »).
- Aucune comparaison avec d'autres outils dans le dépôt ni dans l'app ; seul « vault Obsidian » est nommé.
- Police « Clarika » proposée dans les réglages : licence à régler avant toute diffusion.

## Evidence on Hand

- Vault de démo complet : `src/demo/vault/` (note `Bienvenue.md` comme guide).
- Captures de la documentation, clair et sombre : `src/docs/images/*.light.webp` / `*.dark.webp`.
- Documentation utilisateur : `src/docs/documentation.md` ; technique : `docs/sous-le-capot.md` ; historique : `CHANGELOG.md`.
- Aucun témoignage, utilisateur externe, chiffre d'usage ni prix : ne pas en inventer.

## Product Principles

1. Le fichier d'abord : aucune fonctionnalité ne justifie un octet changé sans raison ni un format propriétaire.
2. Le confort compte autant : une vue riche ou un geste fluide mérite d'exister s'il reste du texte lisible ailleurs.
3. Cohérence de l'app : un menu, un sélecteur, une fenêtre se comportent et se ressemblent partout.
4. Vérifié là où ça tourne : une fonctionnalité n'est finie que dans l'app de bureau, sur WebKit.
5. Montré et documenté : chaque fonctionnalité apparaît dans la documentation et dans le vault de démo.
