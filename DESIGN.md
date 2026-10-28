---
name: FlowNote
description: L'édition par blocs, directement sur votre vault Obsidian.
colors:
  system-blue: "#007aff"
  system-blue-soft: "rgba(0, 122, 255, 0.1)"
  system-blue-line: "rgba(0, 122, 255, 0.55)"
  on-accent: "#ffffff"
  paper: "#ffffff"
  paper-elevated: "#ffffff"
  window-chrome: "#f8f8f7"
  chrome-edge: "rgba(0, 0, 0, 0.06)"
  ink: "rgba(0, 0, 0, 0.85)"
  ink-secondary: "rgba(0, 0, 0, 0.55)"
  ink-tertiary: "rgba(0, 0, 0, 0.26)"
  hairline: "rgba(0, 0, 0, 0.1)"
  hover-fill: "rgba(0, 0, 0, 0.05)"
  selected-fill: "rgba(0, 0, 0, 0.08)"
  menu-glass: "rgba(252, 252, 253, 0.82)"
  toolbar-glass: "rgba(255, 255, 255, 0.72)"
  scrim: "rgba(0, 0, 0, 0.18)"
  code-fill: "rgba(0, 0, 0, 0.045)"
  code-ink: "#c4285a"
  success: "#248a3d"
  success-fill: "rgba(52, 199, 89, 0.12)"
  warning: "#a85500"
  warning-fill: "rgba(255, 149, 0, 0.1)"
  danger: "#d70015"
  danger-fill: "rgba(255, 59, 48, 0.08)"
  highlight: "rgba(255, 204, 0, 0.3)"
  callout-note: "#007aff"
  callout-tip: "#28a745"
  callout-warning: "#ff9500"
  callout-danger: "#ff3b30"
typography:
  page-title:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, system-ui, Segoe UI, Roboto, sans-serif"
    fontSize: "40px"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.022em"
  headline:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, system-ui, Segoe UI, Roboto, sans-serif"
    fontSize: "30px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.021em"
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, system-ui, Segoe UI, Roboto, sans-serif"
    fontSize: "24px"
    fontWeight: 650
    lineHeight: 1.25
    letterSpacing: "-0.019em"
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, system-ui, Segoe UI, Roboto, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "-0.011em"
  ui:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, system-ui, Segoe UI, Roboto, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "-0.003em"
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, system-ui, Segoe UI, Roboto, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.3
  mono:
    fontFamily: "ui-monospace, SF Mono, SFMono-Regular, Menlo, monospace"
    fontSize: "0.85em"
    fontWeight: 400
    letterSpacing: "0"
rounded:
  xs: "4px"
  sm: "6px"
  md: "8px"
  lg: "10px"
  xl: "12px"
  pill: "999px"
spacing:
  xxs: "4px"
  xs: "6px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "32px"
  xxl: "48px"
components:
  button:
    backgroundColor: "{colors.paper-elevated}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "4px 10px"
  button-primary:
    backgroundColor: "{colors.system-blue}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.sm}"
    padding: "4px 10px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink-secondary}"
    rounded: "{rounded.sm}"
    padding: "3px 6px"
  segmented:
    backgroundColor: "{colors.hover-fill}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "2px"
  segmented-selected:
    backgroundColor: "{colors.paper-elevated}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "3px 12px"
  sidebar-search:
    backgroundColor: "{colors.hover-fill}"
    textColor: "{colors.ink-secondary}"
    rounded: "{rounded.md}"
    height: "28px"
    padding: "0 8px"
  sidebar-icon:
    backgroundColor: "transparent"
    textColor: "{colors.ink-secondary}"
    rounded: "{rounded.sm}"
    height: "30px"
  sidebar-icon-active:
    backgroundColor: "{colors.selected-fill}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    height: "30px"
  page-row:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    height: "28px"
  tile:
    backgroundColor: "{colors.paper-elevated}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "10px 6px 8px"
  tile-selected:
    backgroundColor: "{colors.paper-elevated}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
  chip-tag:
    backgroundColor: "{colors.system-blue-soft}"
    textColor: "{colors.system-blue}"
    rounded: "{rounded.pill}"
    padding: "1px 4px 1px 8px"
  property-row:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    height: "30px"
  menu:
    backgroundColor: "{colors.menu-glass}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "5px"
  modal:
    backgroundColor: "{colors.menu-glass}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
    padding: "16px"
  page-bar:
    backgroundColor: "{colors.toolbar-glass}"
    textColor: "{colors.ink-secondary}"
    height: "44px"
    padding: "0 12px"
---

# Design System: FlowNote

## Overview

**Creative North Star : « Le carnet natif »**

FlowNote doit sembler sortir de chez Apple : une app de bureau macOS qui parle le langage du système plutôt qu'un site web posé dans une fenêtre. Palette système (labels, remplissages, séparateurs, bleu système), police du système avec un interlettrage ajusté à chaque taille, matériaux translucides pour ce qui flotte au-dessus du texte. Les gestes sont ceux qu'un utilisateur de Mac connaît déjà : contrôles segmentés, menus contextuels, barre latérale, onglets, palette de commandes.

Le caractère est **précis et retenu**. Filets de 0,5 px, contrastes doux, une seule couleur d'accent, aucun élément qui crie. La page de texte est blanche et calme. Le cadre autour d'elle (barre d'onglets, barre latérale) est une surface plate légèrement grisée. Ce qui flotte (menus, fenêtres, barre de page) est en verre. La densité est celle d'un outil qu'on utilise toute la journée : lignes de 28 à 30 px, texte d'interface à 13 px, texte des notes à 16 px.

L'app vit en clair et en sombre, en suivant le système ou au choix dans les réglages. Chaque couleur existe dans les deux thèmes, et les deux listes du thème sombre (`base.css`) restent identiques.

**Key Characteristics:**
- Palette système Apple, un seul accent : le bleu système.
- Police du système, interlettrage négatif ajusté à la taille.
- Plat au repos ; le verre et les ombres sont réservés à ce qui flotte.
- Filets fins (0,5 px) plutôt que des bordures épaisses ou des barres de couleur.
- Arrondis sur une seule échelle : 4, 6, 8, 10, 12 px.
- Icônes au trait maison (grille de 16, trait de 1,4), jamais d'emoji en guise d'icône.

## Colors

Une palette de labels et de remplissages en transparence sur le noir (ou le blanc en sombre), qui laisse toute la couleur au bleu système et aux signaux d'état.

### Primary
- **Bleu système** (system-blue) : la seule couleur d'action. Bouton principal, liens, tags, onglet ou vue sélectionnés, curseur de texte, case cochée. En sombre, `#0a84ff`.
- **Bleu voilé** (system-blue-soft) : fond des tags, de l'outil actif dans la barre de page, des puces de date à venir, de l'anneau de focus.
- **Trait bleu** (system-blue-line) : bord de focus des champs, poignée de redimensionnement au survol.

### Neutral
- **Papier** (paper) : le fond de la page et des notes. En sombre, `#1e1e1e`.
- **Papier surélevé** (paper-elevated) : boutons, cartes, segment sélectionné. En sombre, `#2a2a2c`.
- **Cadre de fenêtre** (window-chrome) : barre d'onglets et barre latérale, plates. En sombre, `#202020`.
- **Encre** (ink) : le texte. **Encre secondaire** (ink-secondary) : libellés, métadonnées, icônes au repos (contraste d'environ 4,7:1 sur le papier). **Encre tertiaire** (ink-tertiary) : indices, éléments désactivés, raccourcis discrets.
- **Filet** (hairline) : séparateurs et bords, toujours fins.
- **Survol** (hover-fill) et **Sélection** (selected-fill) : remplissages des lignes, des boutons fantômes et des segments.
- **Verre des menus** (menu-glass), **Verre de la barre** (toolbar-glass), **Voile** (scrim) : voir Elevation & Depth.

### Signaux d'état
- **Succès** (success, success-fill), **Attention** (warning, warning-fill), **Danger** (danger, danger-fill) : puces d'échéance (en retard, aujourd'hui), statuts Git, suppression. Toujours un texte coloré sur un fond voilé de la même teinte.
- **Callouts** (callout-note, callout-tip, callout-warning, callout-danger) : la palette des callouts d'Obsidian, sur fond teinté à 7 % et filet teinté à 24 %.
- **Fluo** (highlight) et **Code** (code-fill, code-ink) : marques dans le texte des notes.

### Named Rules
**La règle de l'accent unique.** Le bleu système est la seule couleur d'action. Une autre teinte n'apparaît que pour signaler un état (succès, attention, danger) ou distinguer un type (callouts, types de page).

**La règle des deux thèmes.** Aucune couleur n'est écrite en dur dans un composant : elle passe par un jeton de `base.css`, défini en clair et en sombre.

## Typography

**Police de l'interface :** la police du système (SF Pro sur macOS), avec Segoe UI et Roboto en repli (`--font-ui`). Les réglages proposent aussi Clarika, Open Sans et Inter.
**Police des notes :** celle de l'interface par défaut (`--font-note` pour le texte, `--font-note-heading` pour le titre de page et les titres). Elle se règle à part : système, serif (New York, Iowan Old Style, Georgia), Clarika, Open Sans ou Inter.
**Police de code :** ui-monospace (SF Mono, Menlo).

**Character :** une seule famille, réglée comme le fait Apple : un interlettrage de plus en plus serré à mesure que la taille augmente (de -0,003 em à 13 px jusqu'à -0,022 em pour le titre de page), et des graisses franches pour la hiérarchie.

### Hierarchy
- **Titre de page** (page-title, 700) : le titre d'une note, au-dessus de ses propriétés.
- **Titre 1** (headline, 700) et **Titre 2** (title, 650) : les titres dans les notes, à 1,875 em et 1,5 em. Le titre 3 (1,25 em, 650) suit la même courbe.
- **Texte** (body) : le texte des notes, dans une colonne de 720 px au plus.
- **Interface** (ui) : barre latérale, menus, barre de page, propriétés. Le corps de base de l'app est à 14 px, l'interface dense à 13 px.
- **Libellé** (label) : métadonnées, puces, légendes à 12 px. 11 px est le plus petit corps permis, réservé aux compteurs et aux indications de touches.
- **Code** (mono) : code en ligne et blocs de code, diffs Git.

### Named Rules
**La règle des deux voix.** L'interface parle avec `--font-ui`, les notes avec `--font-note`. Un élément qui fait partie du texte d'une note (titre de page, titres, corps) prend la police des notes ; tout le reste (menus, barres, propriétés, vues) garde celle de l'interface.

**La règle des pixels entiers.** Les tailles de texte sont entières (11, 12, 13, 14, 15, 16 px…), jamais 12,5 px.

**La règle des chiffres alignés.** Compteurs, dates de calendrier, numéros et colonnes de chiffres utilisent `font-variant-numeric: tabular-nums`.

## Layout

La fenêtre : la barre d'onglets en haut (les boutons de fenêtre à sa gauche), puis une grille avec la barre latérale (260 px par défaut, redimensionnable), la page et le panneau de droite (Git, plan, diapos). La fenêtre elle-même ne défile jamais : seuls les panneaux défilent.

La page : une barre de 44 px (fil d'Ariane à gauche, actions à droite), puis la colonne de texte de 720 px au plus avec 32 px de marge de chaque côté, centrée. Le titre de page, les propriétés et la note partagent exactement cette colonne. La pleine largeur et le mode focus sont des choix par page.

Le rythme suit une échelle de 4 px (4, 6, 8, 12, 16, 32, 48). Les lignes de liste font 28 px (barre latérale) ou 30 px (propriétés). Les vues larges (bases, canevas, kanban, dashboard) sortent de la colonne et prennent la largeur de la page.

## Elevation & Depth

**Plat au repos, l'ombre pour ce qui flotte.** Les surfaces posées (page, cartes de l'Accueil, colonnes de kanban, lignes) sont plates ou n'ont qu'un liseré. La profondeur vient de trois couches : le papier de la page, le cadre plat de la fenêtre autour, et le verre (translucide, flouté à 24 px et saturé à 180 %) pour la barre de page, les menus et les fenêtres. Un voile assombrit la page derrière une fenêtre modale.

### Shadow Vocabulary
- **Menu** (`--shadow-menu` : `0 0 0 0.5px rgba(0,0,0,0.12), 0 2px 6px rgba(0,0,0,0.06), 0 12px 32px rgba(0,0,0,0.14)`) : menus, popovers, fenêtres modales, palette de commandes.
- **Soulevé** (`--shadow-lift` : `0 1px 2px rgba(0,0,0,0.08), 0 12px 28px rgba(0,0,0,0.16)`) : un bloc ou une carte pendant qu'on le glisse.
- **Bouton** (`0 0.5px 1px rgba(0,0,0,0.06)`) et **Segment sélectionné** (`0 0.5px 2px rgba(0,0,0,0.15)`) : à peine un relief, pour détacher un contrôle de son fond.

### Named Rules
**La règle du verre utile.** Le flou et la transparence sont réservés à ce qui passe au-dessus du contenu (barre de page, menus, fenêtres). Jamais sur une surface posée pour faire joli.

**La règle de l'ombre décalée.** Une ombre a toujours un décalage vertical et un flou doux. Pas de halo coloré centré.

## Shapes

Des coins doucement arrondis, sur une seule échelle : 4 px pour les petits éléments (puces carrées, champs dans les propriétés, cellules), 6 px pour les boutons, lignes et segments, 8 px pour les callouts, tableaux et conteneurs de segments, 10 px pour les menus et les cartes, 12 px pour les fenêtres modales et les grandes cartes. Les tags et compteurs sont en pilule (999 px). Les arrondis imbriqués sont concentriques : un segment à 6 px dans un conteneur à 8 px avec 2 px de marge.

Les bords sont des filets de 0,5 à 1 px dans la couleur du filet. Une barre de couleur à gauche n'existe que pour les citations et les notes intégrées, à 2 px au plus.

## Components

### Buttons
Précis et retenus : un bouton ressemble à un bouton macOS, pas à un appel à l'action.
- **Shape :** coins doucement arrondis (6 px).
- **Par défaut :** papier surélevé, filet de 0,5 px, ombre d'un demi-pixel, 4 px × 10 px de marge.
- **Principal :** bleu système, texte blanc ; au survol, le bleu assombri de 12 %. Un seul par zone.
- **Fantôme :** sans fond ni bord, encre secondaire ; au survol, le remplissage de survol. C'est le bouton de la barre de page, des lignes et des menus.
- **États :** pression instantanée (`scale(0.97)` en 100 ms) ; focus en anneau bleu voilé de 3 px ; désactivé à 45 % d'opacité.

### Segmented control
Le choix exclusif entre quelques options (thème, taille, vues des tâches, mode du calendrier) : un fond de survol à 8 px, le segment choisi en papier surélevé avec une ombre d'un demi-pixel. Il remplace les boutons radio et les listes déroulantes brutes.

### Chips
- **Tag :** pilule bleu voilé, texte bleu, croix à 60 % d'opacité qui s'affirme au survol.
- **Date :** puce neutre à 6 px avec une icône de calendrier (ou de sablier pour une date prévue) ; colorée selon l'échéance : danger en retard, attention aujourd'hui, bleu bientôt.
- **Statut de base :** fond teinté et texte de la même teinte, à 4 px.

### Cards / Containers
- **Corner Style :** 10 à 12 px.
- **Background :** papier surélevé, ou le remplissage de survol pour une colonne de kanban.
- **Shadow Strategy :** aucune au repos (voir Elevation & Depth) ; un liseré de filet.
- **Internal Padding :** 12 à 16 px.

### Inputs / Fields
- **Style :** filet de 1 px, papier, 6 px d'arrondi ; dans les propriétés, sans bord ni fond jusqu'au focus.
- **Focus :** bord bleu à 70 % et anneau bleu voilé de 3 px.
- **Texte indicatif :** l'encre à 50 %.
- Jamais de `<select>` ni d'`<input type="date">` bruts : menus de l'app et sélecteur de date maison.

### Navigation
Faite pour les pages : tout ce qui n'est pas l'arbre se range en rangées compactes.
- **Barre latérale, de haut en bas :** le vault et Nouvelle page ; un **champ Rechercher** (remplissage de survol, 8 px, raccourci ⌘P à droite) ; les **vues en rangée d'icônes** (Accueil, Tâches, Liens, Graphe), réparties sur toute la largeur, leur nom dans l'infobulle et l'état actif sur le remplissage de sélection ; Favoris et Pages en sections repliables (titres en encre tertiaire, 12 px) ; l'arbre prend toute la hauteur restante ; en bas, une **rangée d'icônes compacte** (36 px) : Git avec sa pastille, Réglages, Aide (menu : Documentation, Raccourcis clavier).
- **Lignes de l'arbre :** 28 px, icône du type ou emoji de la page, libellé en encre pleine ; sélection sur le remplissage de survol.
- **Onglets :** des pilules de même largeur, les inactives sur un remplissage à 3,5 % de l'encre, l'active en carte surélevée ; la croix au survol et sur l'onglet actif.
- **Barre de page :** le fil d'Ariane (encre secondaire, le dernier élément en encre pleine et en gras), puis les boutons fantômes de la page, toujours visibles (Plan, Mode lecture, Pleine largeur, Mode focus, Markdown brut), puis **⋯** pour le reste. Sur une vue de l'app (Accueil, Tâches, Réglages…), pas de fil d'Ariane : l'onglet la nomme déjà.
- **Recherche :** une fenêtre, deux portées, choisies par un contrôle segmenté « Titres | Contenu » qui garde le texte tapé.

### Menus et fenêtres
Verre des menus, flou, 10 px d'arrondi (12 px pour une fenêtre), ombre de menu, apparition en 140 à 200 ms sur une courbe qui se pose (`cubic-bezier(0.2, 0.9, 0.3, 1)`). Les lignes de menu font 28 px : une icône au trait, un libellé, le raccourci à droite en encre secondaire, puis une coche bleue pour une option active (la colonne de la coche est réservée dans tout le menu dès qu'une ligne peut être cochée, pour garder les raccourcis alignés). Les groupes ont un titre en encre secondaire (11 px, 600) au-dessus d'un filet. Un menu ouvert près du bord droit s'aligne sur le bord droit de son bouton. Une fenêtre ne dépasse jamais l'écran : son contenu défile à l'intérieur.

### Tuiles
Un choix visuel parmi quelques options (types de page à créer sur l'Accueil, polices dans les Réglages) : des tuiles en grille, papier surélevé, filet de 0,5 px, 10 px d'arrondi, le contenu centré (une icône de type dans sa pastille teintée, ou « Ag » écrit dans la police proposée), le nom en 12 px dessous. Au survol, le remplissage de survol ; sélectionnée, un bord bleu de 1 px. Sans ombre.

### Accueil et listes de travail
- **Accueil :** deux colonnes, la principale (environ 2/3) pour reprendre (les trois dernières pages en grandes lignes avec deux lignes d'extrait, puis une liste) et ce qui est dû, par jour ; la secondaire, sans cartes, séparée par des filets (création, favoris, lectures, Git, à ranger). Les statistiques se replient en bas. Pas de grille de cartes égales.
- **Listes de tâches :** une ligne par élément (32 à 36 px), le titre à gauche, les métadonnées en encre secondaire à droite, la date dans une colonne alignée ; ce qui ne tient pas disparaît, la date reste. Les vues d'une base qui filtrent les mêmes éléments sont des pastilles, pas des onglets.

### Callouts
Le bloc signature des notes : un fond teinté à 7 % de la couleur du type, un filet teinté à 24 % tout autour, 8 px d'arrondi, l'icône et le titre dans la couleur du type.

## Do's and Don'ts

### Do:
- **Do** prendre chaque couleur dans un jeton de `base.css` et vérifier le rendu en clair et en sombre.
- **Do** utiliser les icônes de `src/Icon.tsx` (grille de 16, trait de 1,4, couleur du texte) ; dessiner celle qui manque dans le même style.
- **Do** garder les arrondis sur l'échelle 4, 6, 8, 10, 12 px et les tailles de texte entières.
- **Do** caler le titre, les propriétés et la note sur la même colonne de 720 px.
- **Do** donner au texte des notes `--font-note` (et `--font-note-heading` aux titres), jamais `--font-ui`.
- **Do** ranger une nouvelle vue de l'app dans la rangée d'icônes, et une action secondaire de page dans le menu ⋯ (`pageBarMenu`) ; une option que l'on bascule souvent reste un bouton visible.
- **Do** donner à chaque contrôle ses états : survol, pression, focus visible, désactivé.
- **Do** respecter `prefers-reduced-motion` pour toute animation d'entrée.

### Don't:
- **Don't** utiliser un emoji ou un caractère Unicode (✕, 📅, ⏳) comme icône d'interface ; les emoji des notes, eux, restent du contenu.
- **Don't** poser une barre de couleur épaisse à gauche d'une carte, d'un callout ou d'une alerte.
- **Don't** mettre du flou ou du verre sur une surface posée, ni un halo coloré sous un bouton.
- **Don't** introduire une deuxième couleur d'action à côté du bleu système.
- **Don't** laisser un `<select>`, un `<input type="date">` ou une fenêtre qui déborde de l'écran.
- **Don't** répéter dans la barre de page le nom qu'affiche déjà l'onglet, ni afficher un menu ⋯ vide.
- **Don't** écrire une couleur en dur dans un composant sans son équivalent sombre.
