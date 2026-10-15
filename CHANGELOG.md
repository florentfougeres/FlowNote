# Changelog

Les changements notables de FlowNote, version par version. Le format suit [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) et la numérotation suit [Semantic Versioning](https://semver.org/lang/fr/).

## [0.9.0] - 2026-10-15

### Ajouté
- **Bases**, comme les bases de données de Notion : un nouveau type de page (`Nom.base`, au format des Bases d'Obsidian), dont les lignes sont les notes d'un dossier.
  - Vues Tableau, Kanban, Galerie et Calendrier, en onglets ; recherche, filtres et tris par vue.
  - Propriétés typées : texte, nombre, sélection et multi-sélection colorées, date, case à cocher, lien. Les valeurs sont écrites dans les propriétés YAML des notes.
  - Tableau : saisie au clavier (flèches, Tab, Entrée), colonnes redimensionnables et déplaçables, ordre manuel des lignes, groupes repliables, ligne de calcul (somme, moyenne, min, max, cochées…).
  - Formules (un sous-ensemble du langage d'Obsidian) et propriétés du fichier en colonnes : création, modification, dossier, tags, liens.
  - Kanban avec glisser-déposer entre colonnes et dans une colonne ; calendrier avec glisser-déposer d'un jour à l'autre et création sur un jour ; galerie avec image de couverture.
  - La page d'une ligne montre les propriétés de sa base avec leurs éditeurs.
  - Une base s'intègre dans une note avec `![[Nom.base]]`, modifiable sur place.
  - Compatible Obsidian : tableau, galerie et kanban s'ouvrent dans Obsidian ; le calendrier y apparaît en galerie.

### Corrigé
- Renommer une mind map ne lui fait plus perdre son extension `.mindmap.md`.
- Supprimer une page avec ses sous-pages va jusqu'au bout même si une partie échoue, et la barre latérale est toujours remise à jour.

## [0.8.0] - 2026-10-14

### Ajouté
- **Mind maps** : un nouveau type de page (`Nom.mindmap.md`), éditée à la souris et au clavier avec [Mind Elixir](https://mind-elixir.com).
  - Tab ajoute un enfant, Entrée un frère ; double-clic pour renommer ; glisser pour déplacer une branche ; clic droit pour le reste (parent, résumé, liens entre nœuds…).
  - Stockée au format de Mind Elixir (JSON) dans la note, précédée d'un plan lisible régénéré : dans Obsidian, on lit le plan, le JSON est masqué.
  - Ajuster la carte à la fenêtre, export en image PNG, thème clair ou sombre de l'app.

### Corrigé
- Barre latérale : tout tient dans la fenêtre ; seul l'arbre des pages défile, Git, Réglages et Aide restent en bas.
- Fenêtre « Nouvelle page » élargie : les types de page ne dépassent plus.

## [0.7.2] - 2026-10-14

### Corrigé
- Kanban des tickets : faire glisser une carte ne sélectionne plus le texte de la page.

### Documentation
- Ce changelog, et un README à jour avec toutes les fonctionnalités.

## [0.7.1] - 2026-10-14

### Corrigé
- Kanban des tickets : les colonnes se partagent toute la largeur de la fenêtre au lieu d'une largeur fixe (défilement horizontal en dessous de 240 px par colonne).

Note : le fichier de cette release s'appelle `FlowNote_0.7.0_aarch64.dmg` (numéro de version non mis à jour dans l'app).

## [0.7.0] - 2026-10-14

### Ajouté
- **Présentations** (Marp) : un nouveau type de page, qui reste une note Markdown avec `marp: true`. Les diapos sont séparées par `---` et les notes de l'orateur sont écrites en commentaires HTML.
  - Miniatures des diapos à côté de la note, à jour pendant l'écriture ; séparateurs de diapos numérotés dans l'éditeur.
  - Mode Présenter (`⌘⇧P`) en plein écran, vue présentateur (`P`) avec diapo suivante, notes et chronomètre, écran noir (`B`).
  - Export en un fichier HTML autonome, images incluses.
  - Callouts Obsidian, images du vault et `![[embeds]]` affichés dans les diapos.
  - « Transformer en présentation » sur n'importe quelle note.
- **Liste de lectures** : une note unique (`Lectures.md`), une section par thème, une case à cocher par lien.
  - Ajout rapide (`⌘⇧L`) avec titre de la page lu automatiquement (désactivable).
  - Vue « Lectures » : thèmes repliables avec avancement, recherche, « Masquer les lus », « Au hasard ».
  - Carte « À lire » sur l'accueil ; les liens s'ouvrent dans le navigateur.
- **Kanban des tickets** : bascule Liste / Tableau, glisser-déposer entre colonnes et dans une colonne. Les colonnes sont personnalisables dans les réglages (la dernière ferme le ticket) et l'ordre manuel est gardé dans la propriété `order`. Le badge d'état d'un ticket permet aussi de changer de colonne.
- **Graphe des notes**, comme celui d'Obsidian : aperçu sur l'accueil et vue en plein onglet, avec zoom, déplacement, survol des voisines et filtres (notes sans lien, notes inexistantes).

## [0.6.0] - 2026-10-14

### Ajouté
- **Ergonomie inspirée de Notion** :
  - onglets en haut de la fenêtre, alignés sur les boutons de fenêtre macOS ;
  - barre latérale plate avec vault, nouvelle page, Rechercher / Accueil / Tickets, menu « … » des pages, Git / Réglages / Aide en bas ;
  - aperçu de la barre latérale au survol quand elle est masquée.
- **Icônes de page** : un emoji choisi au-dessus du titre (propriété `icon`), affiché dans la barre latérale, les onglets, la recherche et l'accueil.
- Renommer une page depuis la barre latérale.

### Modifié
- Menus système de macOS (clic droit, suggestions d'orthographe) en français.
- FlowNote est livré pour macOS Apple Silicon uniquement : le build Linux (AppImage) est retiré.

## [0.5.2] - 2026-10-14

### Ajouté
- Nouvelle icône de l'application.
- Raccourcis affichés avec Ctrl, Alt et Shift en dehors de macOS.

### Corrigé
- Tickets : une citation ou un callout dans un commentaire, le texte avant ou après les commentaires et les fins de ligne Windows sont conservés quand on ajoute un commentaire.
- Tickets : « ## Commentaires » dans un bloc de code n'est plus pris pour la section des commentaires ; un ticket renommé sans son numéro ne voit plus son numéro réutilisé.

### Technique
- Intégration continue à chaque push (lint, typage, tests JS et Rust) et vérification de fidélité Markdown sur un vault d'exemple.
- Dépendances mises à jour (Mermaid 12.2, versions corrigées de nanoid, lodash-es et KaTeX), lint avec oxlint, code réorganisé.

## [0.5.1] - 2026-10-14

### Corrigé
- Linux : texte flou sous WebKitGTK (build Linux retiré depuis).

## [0.5.0] - 2026-10-14

### Ajouté
- **Tickets**, comme les issues GitHub :
  - fichiers Markdown dans `Tickets/`, avec état, tags et échéance (format `📅` du plugin Tasks) ;
  - fils de commentaires en callouts `[!comment]` ;
  - vue de tous les tickets, et tickets sur l'accueil.
- **Onglets** et **tableau de bord d'accueil** : créer, récents, à faire, Git, activité, statistiques du vault.
- Bouton pour couper ou réactiver la correction orthographique sans changer le correcteur choisi.
- Build Linux en AppImage (retiré en 0.6.0).

### Corrigé
- Une note vide avec propriétés n'est plus abîmée à la première ligne tapée.

## [0.4.0] - 2026-10-14

### Ajouté
- **Dessins Excalidraw** intégrés, au format du plugin Obsidian Excalidraw (`Nom.excalidraw.md`).

### Technique
- Passage à Tiptap 3, TypeScript 7, Vitest 4 et Mermaid 12.

## [0.3.1] - 2026-10-14

### Modifié
- Panneau Git : boutons d'action en icônes.

### Technique
- Mises à jour automatiques des dépendances (Dependabot).

## [0.3.0] - 2026-10-13

### Ajouté
- Barre latérale Liquid Glass, nouvel écran d'accueil, panneau Git plus clair.

## [0.2.0] - 2026-10-13

### Ajouté
- Correction grammaticale et orthographique en français avec **Grammalecte**, embarqué et hors ligne, et choix du correcteur (Grammalecte, système ou aucun).
- Emoji en `:shortcode:` et prise en charge de tous les callouts Obsidian.

### Modifié
- Release pour Mac Apple Silicon uniquement.

## [0.1.0] - 2026-10-13

### Ajouté
- Première version : éditeur de blocs façon Notion sur un vault Obsidian, avec un moteur de fidélité Markdown qui réécrit à l'identique ce qui n'a pas été modifié.
- Menu `/`, raccourcis Markdown, poignée de bloc et glisser-déposer.
- Liens `[[wikilinks]]`, sous-pages, pièces jointes, tags.
- Tableaux éditables, propriétés YAML, blocs de code colorés, Mermaid.
- Recherche, plan de la note, mode Markdown brut.
- Gestionnaire Git : statut, diff, commit, pull/push, historique d'une note, résolution des conflits.

[0.9.0]: https://github.com/florentfougeres/FlowNote/compare/v0.8.0...v0.9.0
[0.8.0]: https://github.com/florentfougeres/FlowNote/compare/v0.7.2...v0.8.0
[0.7.2]: https://github.com/florentfougeres/FlowNote/compare/v0.7.1...v0.7.2
[0.7.1]: https://github.com/florentfougeres/FlowNote/compare/v0.7.0...v0.7.1
[0.7.0]: https://github.com/florentfougeres/FlowNote/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/florentfougeres/FlowNote/compare/v0.5.2...v0.6.0
[0.5.2]: https://github.com/florentfougeres/FlowNote/compare/v0.5.1...v0.5.2
[0.5.1]: https://github.com/florentfougeres/FlowNote/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/florentfougeres/FlowNote/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/florentfougeres/FlowNote/compare/v0.3.1...v0.4.0
[0.3.1]: https://github.com/florentfougeres/FlowNote/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/florentfougeres/FlowNote/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/florentfougeres/FlowNote/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/florentfougeres/FlowNote/releases/tag/v0.1.0
