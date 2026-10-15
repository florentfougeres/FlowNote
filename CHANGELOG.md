# Changelog

Les changements notables de FlowNote, version par version. Le format suit [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) et la numérotation suit [Semantic Versioning](https://semver.org/lang/fr/).

## [Non publié]

### Ajouté
- **Split view** : deux pages côte à côte, une seule barre d'onglets. `⌥-clic` sur une page (ou « Ouvrir à droite ») l'affiche à droite, clic droit sur un onglet : « Afficher à droite ». Un clic sur l'onglet de droite échange les côtés, le séparateur se déplace, `⌘⌥\` ouvre ou ferme le panneau.
- **Documentation** de toutes les fonctionnalités, en lecture seule, sous « Graphe » dans la barre latérale.
- **Admonitions HedgeDoc** (`:::info` … `:::`, `success`, `warning`, `danger`, `spoiler`) affichées comme des callouts ; le fichier garde leur syntaxe. `:::type` suivi d'un espace en crée une, « Admonition HedgeDoc » dans le menu `/`.
- `⌘K` sur un texte sélectionné : adresse du lien (sur un lien : le modifier ou le retirer).
- Réglage **Taille de l'interface** (petite, normale, grande, très grande).
- **Sélecteur de date** au style de l'app (calendrier du mois, date tapée, clavier) pour les propriétés, les bases et l'échéance des tickets.
- Menu du vault : les vaults récents en un clic et « Ouvrir un autre vault… ».
- Bouton **Colonnes** sur le tableau des tickets.

### Modifié
- Barre latérale : Accueil en haut, nouvelle icône pour « Rechercher dans les notes », dossier des tickets et note des lectures masqués.
- Accueil, Tickets, Lectures et Graphe s'ouvrent dans un nouvel onglet quand une page est ouverte.
- Plan et historique s'affichent dans une même colonne ; l'historique est plus étroit.
- `⌫` au début d'une ligne remonte au bout de la ligne du dessus, aussi sous une liste, une citation ou un callout ; sous un tableau, le curseur va dans la dernière cellule ; un séparateur est sélectionné au lieu d'être supprimé.
- `` ` `` tapé sur une sélection la met en code ; tapé avant un texte déjà suivi d'un `` ` ``, ce texte devient du code (aussi avec la touche morte du clavier Mac).
- Croquis : menu du clic droit au style de l'app, bibliothèque retirée.
- Bases : les lignes d'une base ont leur propre icône dans la barre latérale.

### Corrigé
- Plus de `\` isolé quand on vide un bloc qui contenait un saut de ligne.
- « Ajouter des propriétés » s'affiche sur une note sans propriétés.
- Mind map : le texte reste net après un zoom (+ / −).
- Bases : le menu « Calculer » ne passe plus sous les onglets de vue.

## [0.13.0] - 2026-10-15

### Ajouté
- **Sommaire** : un paragraphe `[TOC]` (comme HedgeDoc) affiche les titres de la note, cliquables ; `/sommaire` l'insère. Le fichier garde `[TOC]`.
- **Notes liées** sous chaque note : les pages qui pointent vers elle, avec la ligne du lien, et les mentions non liées (le titre cité sans lien), avec un bouton « Lier ».
- **Export PDF** (menu « … » de la page) par le panneau d'impression : une note telle qu'affichée, une présentation (une diapo par page), un dessin ou une mind map ajustés à la page.
- **Copier en HTML** (menu « … ») : la note mise en forme pour un mail ou un document, son Markdown en texte simple.
- **Pleine largeur** par page et **mode focus** (`⌘⇧M`, Échap pour en sortir).
- Import d'un **CSV** dans l'éditeur visuel des graphiques (`;`, `,` ou tabulation ; virgule décimale).
- `⌥↑` / `⌥↓` déplacent le bloc.
- Mots et caractères de la sélection dans la pastille d'état.

### Modifié
- Mind map : fond et police de l'app, texte net (la carte n'est plus posée entre deux pixels).
- Recherche de page (`⌘P`), recherche dans le vault (`⌘⇧F`) et barre `⌘F` au style des autres fenêtres : icônes des pages, raccourcis en bas, champs sans cadre.
- La recherche dans le vault ignore les données des dessins et des mind maps (JSON).
- Les notes ne sont lues en entier qu'une fois pour l'accueil, le graphe, les tickets, les bases et les notes liées (relues au retour dans l'app).
- Les emoji des présentations restent ceux du système (plus d'images téléchargées).

### Corrigé
- `⌫` sur une ligne vide en tête de note la supprime.
- Renommer ou déplacer le dossier des tickets met à jour le réglage « Dossier des tickets ».
- L'ordre manuel des lignes d'une base et la pleine largeur suivent une page renommée ou déplacée.
- Un graphique Plotly ou un diagramme Mermaid prend les couleurs du nouveau thème.

### Sécurité
- L'app n'accède qu'aux vaults : un dossier avec `.obsidian` ou choisi dans « Ouvrir un vault » (un dossier choisi auparavant sans `.obsidian` est à rouvrir une fois par ce bouton).
- git ne lance jamais de programme désigné par la configuration du dépôt (`core.fsmonitor`).

## [0.12.0] - 2026-10-15

### Ajouté
- **Graphiques Plotly**, au format du plugin Obsidian [obsidian-plotly](https://github.com/Dmytro-Shulha/obsidian-plotly) : un bloc ```` ```plotly ```` (YAML ou JSON) s'affiche en graphique interactif (survol, zoom, export en image), aux couleurs de l'app.
  - « Graphique » dans le menu `/`.
  - Éditeur visuel : type (lignes, barres, aire, points, camembert), titres, tableau des valeurs par série. Le bloc est réécrit dans son format, commentaires et réglages inconnus gardés.
  - L'éditeur visuel ou le texte s'affiche au-dessus du graphique, l'un ou l'autre.
  - Le mode `dataviewjs` du plugin (JavaScript) n'est pas exécuté.
- Un clic dans le vide sous la dernière ligne d'une note place le curseur sur une ligne vide en fin de note.

### Corrigé
- Le mode sombre choisi dans les réglages s'applique à toute l'app (bande des onglets, barre latérale, fenêtre), pas seulement à la page.
- Les titres de graphique écrits en texte simple s'affichent (Plotly 3+).

## [0.11.0] - 2026-10-15

### Ajouté
- **Favoris** : les fichiers mis en favoris dans Obsidian apparaissent en haut de la barre latérale.
- Menu des pages (« … » et clic droit) : **Dupliquer**, **Copier le lien** (`[[…]]`) et **Afficher dans le Finder** (aussi pour les dossiers).
- **Pastille d'état** en bas à droite de la page : enregistrement et nombre de mots (temps de lecture au survol), et les messages comme « Lien copié » pendant quelques secondes. Elle s'estompe pendant la frappe.
- Coller une URL sur du texte sélectionné en fait un lien.
- « Date du jour » et « Date et heure » dans le menu `/`.

### Modifié
- Le menu des dossiers du fil d'Ariane est opaque et au style des autres menus, avec les icônes des pages ; il liste aussi les bases.
- Les tickets et leur dossier ne se déplacent plus par glisser-déposer, et rien ne se dépose dans ce dossier.

### Corrigé
- L'interface ne glisse plus sous les boutons de la fenêtre : le tiroir Git dépassait de la fenêtre, qui devenait défilable avec la barre latérale.

## [0.10.0] - 2026-10-15

### Ajouté
- **Dossiers dans l'arborescence** : créer un dossier (bouton à côté de « Pages », sous-dossier, ou clic droit dans le vide de l'arbre), le renommer ou le supprimer. Renommer un dossier met à jour les liens vers ses pages et le filtre des bases qu'il contient. Les dossiers vides sont affichés.
- **Glisser-déposer dans l'arborescence** : une page (avec ses sous-pages) ou un dossier se dépose dans un dossier ou à la racine ; les liens suivent. Un dossier replié s'ouvre au survol, Échap annule.
- **Clic droit** sur une page ou un dossier : le même menu que son bouton « … ».
- **Tags des lectures** : des `#tags` Obsidian sur chaque lien, posés à l'ajout (`⌘⇧L`) ou sur un lien existant, avec suggestions ; filtre par tags dans la vue Lectures.
- **Réglages dans un onglet** (`⌘,`), avec les catégories à gauche (Général, Éditeur, Tickets, Lectures, Vault) et des interrupteurs façon macOS.

### Modifié
- Fenêtre « Nouvelle page » refaite : les types de page en cartes avec les icônes de l'accueil, et le dossier choisi dans un menu filtrable.
- Aucun clic ne sélectionne de texte dans la barre latérale.

### Sécurité
- Dépendances mises à jour : `@xmldom/xmldom` (via Marp) et `braces` (via Excalidraw, en forçant une version récente de `sass`).

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
