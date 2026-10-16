# Documentation de FlowNote

FlowNote édite votre vault Obsidian comme Notion : par blocs, avec un menu `/`, des bases, des dessins, des tickets… Chaque page reste un fichier texte que vous pouvez continuer à ouvrir dans Obsidian et à versionner avec Git.

[TOC]

## Les principes

> [!tip] Vos fichiers restent à vous
> - Une note que vous n'avez pas modifiée est réécrite **à l'octet près**. Une note modifiée ne change que dans les blocs touchés.
> - Rien n'est caché dans une base de données : tout est du Markdown, du YAML ou du JSON lisible.
> - Le dossier `.obsidian` n'est jamais modifié. FlowNote y lit seulement les réglages des liens et des pièces jointes.
> - Une note modifiée ailleurs (Obsidian, git) n'est jamais écrasée : l'écriture est refusée et la différence est signalée.

## L'interface

### La barre latérale

- **Le vault** en haut : son menu permet de passer en un clic à un vault ouvert récemment, d'en ouvrir un autre ou d'ouvrir les réglages. Le bouton à droite crée une page (`⌘N`).
- **Accueil**, **Rechercher** (`⌘P`), **Rechercher dans les notes** (`⌘⇧F`), **Tickets**, **Lectures**, **Graphe** et **Documentation** (cette page). Quand une page est ouverte, Accueil, Tickets, Lectures et Graphe s'ouvrent dans un nouvel onglet pour ne pas la remplacer.
- **Favoris** : les fichiers mis en favoris dans Obsidian.
- **Pages** : l'arbre du vault. Une note et le dossier du même nom (`Projet.md` + `Projet/`) forment une page avec ses sous-pages. Le dossier des tickets et la note des lectures n'y figurent pas : ils ont leur propre vue.
  - Menu « … » ou clic droit : ouvrir dans un nouvel onglet, ouvrir à droite, sous-page, copier le lien, dupliquer, afficher dans le Finder, renommer, supprimer.
  - Glisser-déposer des pages et des dossiers ; les liens sont mis à jour à chaque déplacement.
- En bas : **Git** (`⌘⇧G`), **Réglages** (`⌘,`) et **Aide et raccourcis** (`⌘/`).
- `⌘\` masque la barre latérale ; elle réapparaît au survol du bord gauche.

### Les onglets et le split view

- Chaque page s'ouvre dans un onglet : `⌘T` nouvel onglet, `⌘W` fermer, `⌘1` … `⌘9` aller à un onglet, `⌘⇧[` / `⌘⇧]` onglet précédent / suivant, `⌘-clic` ouvrir dans un nouvel onglet. Les onglets se réordonnent par glisser-déposer.
- **Deux pages côte à côte** : `⌥-clic` sur une page de la barre latérale (ou « Ouvrir à droite » dans son menu) l'affiche à droite de la page active. Clic droit sur un autre onglet : « Afficher à droite de… » ; sur l'onglet actif : « Diviser avec l'onglet suivant ».
  - Les deux pages forment **un seul onglet**, qui porte leurs deux noms. Clic droit dessus : échanger les côtés, séparer en deux onglets, fermer la page de droite. Fermer l'onglet ferme les deux.
  - La page de droite a la même barre d'outils que celle de gauche (plan, orthographe, présentation, historique, pleine largeur, focus, export PDF et copie HTML, Markdown brut, outils du croquis et de la mind map), plus : ouvrir dans son propre onglet, échanger les côtés, fermer.
  - Le séparateur se déplace à la souris (la largeur est retenue).
  - `⌘⌥\` ouvre ou ferme le panneau de droite.
  - Les deux côtés s'enregistrent chacun de leur côté. Une page ouverte des deux côtés ne se modifie qu'à gauche.

### La barre de page

Au-dessus de chaque page : le fil d'Ariane (cliquable, avec le menu des dossiers), puis les actions de la page : plan de la note, correction, historique Git, pleine largeur, mode focus (`⌘⇧M`), menu « … » (export PDF, copie en HTML) et Markdown brut (`⌘⇧E`).

- **Plan** et **Historique** s'affichent dans une même colonne à droite, le plan au-dessus.
- La **pastille d'état** en bas à droite indique l'enregistrement, le nombre de mots (temps de lecture au survol) et les mots de la sélection.

### Les réglages

Ouverts dans un onglet (`⌘,`) et rangés par catégorie :

- **Général** : apparence (système, clair, sombre), **taille de l'interface** (petite, normale, grande, très grande), enregistrement automatique.
- **Éditeur** : correcteur (Grammalecte, celui de macOS, ou aucun).
- **Tickets** : dossier des tickets et colonnes du tableau.
- **Lectures** : note des lectures et lecture automatique du titre des liens.
- **Vault** : changer de vault.

## L'éditeur de notes

### Les blocs

Tapez `/` pour insérer ou transformer un bloc : texte, titres, listes, tâches, toggle, citation, callouts, admonition HedgeDoc, sous-page, code, Mermaid, graphique, maths, tableau, séparateur, sommaire, date…

Les raccourcis Markdown marchent aussi à la frappe :

| Tapez | Pour obtenir |
| --- | --- |
| `#`, `##`, `###` puis espace | un titre |
| `-` ou `*` puis espace | une liste à puces |
| `1.` puis espace | une liste numérotée |
| `[]` puis espace | une tâche |
| `>` puis espace | une citation |
| `> [!note]` puis espace | un callout Obsidian |
| `:::info` puis espace | une admonition HedgeDoc |
| ```` ``` ```` puis espace | un bloc de code |
| `---` | un séparateur |

- La **poignée** à gauche d'un bloc le déplace par glisser-déposer (avec imbrication) et ouvre son menu : dupliquer, transformer, supprimer. `⌥↑` / `⌥↓` déplacent le bloc, `⌘D` le duplique.
- `↵` en fin de liste vide en sort ; `⇧↵` passe à la ligne dans le même bloc.
- **Niveau d'un titre** : curseur dans un titre, ses `#` s'affichent en gris dans la marge. Au début du titre, `⌫` en retire un (un titre 1 redevient du texte) et `#` en ajoute un.
- `⌫` au début d'une ligne la remonte au bout de la ligne du dessus, même sous une liste, une citation ou un callout. Sous un tableau, le curseur va dans la dernière cellule ; sous un séparateur, celui-ci est sélectionné (un second `⌫` le supprime).

### La mise en forme

- `⌘B` gras, `⌘I` italique, `⌘E` code, `⌘⇧S` barré, `⌘⇧H` surligné.
- **Liens** : `⌘K` sur un texte sélectionné demande l'adresse du lien (sur un lien existant, elle le modifie ou le retire). Coller une URL sur un texte sélectionné en fait aussi un lien. Un clic sur un lien l'ouvre (dans le navigateur, ou la note du vault) ; au survol, une barre affiche l'adresse avec Modifier, Copier et Retirer.
- **Code en ligne** : `` ` `` tapé sur une sélection la met entre accents graves ; tapé avant un texte déjà suivi d'un `` ` ``, ou après un texte précédé d'un `` ` ``, ce texte devient du code. Curseur dans le code, ses `` ` `` s'affichent en gris : `→` à la fin passe le `` ` `` fermant, puis `⌫` retire le code (le texte reste) ; `⌦` avant le `` ` `` ouvrant, ou `⌘E` dans le code, le retire aussi.
- **Copier** : le texte copié depuis une note est collé en Markdown dans un éditeur de texte (en texte mis en forme dans un traitement de texte).
- `[[` insère un lien vers une note, avec autocomplétion ; `![[` intègre une note, une image ou une base.
- `:` suivi d'un mot propose un emoji (écrit `:shortcode:` dans le fichier).

### Les callouts et les admonitions

- **Callouts Obsidian** : `> [!note] Titre`. Cliquez sur l'icône pour changer le type (note, info, astuce, attention, danger…). Un toggle est un callout repliable (`> [!note]-`).
- **Admonitions HedgeDoc** : un bloc entre `:::type` et `:::` s'affiche comme un callout et garde sa syntaxe dans le fichier.

```markdown
:::info
Un encadré d'information.
:::

:::spoiler Cliquer pour voir
Un contenu replié.
:::
```

Types reconnus par HedgeDoc : `success`, `info`, `warning`, `danger` et `spoiler` (replié, ouvert avec `{state="open"}`). Rendu :

:::success
Une admonition `success`, écrite `:::success` dans le fichier.
:::

### Les propriétés

Les propriétés YAML (le frontmatter) s'affichent sous le titre, comme dans Obsidian : texte, liste, nombre, case à cocher, date, date et heure. Sur une note sans propriétés, « Ajouter des propriétés » en crée une. Les dates se choisissent dans le calendrier de l'app (tapez aussi `jj/mm/aaaa`).

L'icône de la page est un emoji choisi au-dessus du titre (propriété `icon`).

### Les blocs spéciaux

- **Tableaux** : poignées de lignes et de colonnes pour insérer, déplacer, aligner ou supprimer. `Tab` passe à la cellule suivante, `↵` à celle du dessous.
- **Code** : coloration syntaxique ; `⌘↵` ou trois `↵` en sortent.
- **Mermaid** : un bloc ```` ```mermaid ```` devient un diagramme.
- **Graphiques Plotly** (`/graphique`) : au format du plugin obsidian-plotly, avec un éditeur visuel (type, titres, valeurs, import d'un CSV).
- **Maths** : `$…$` en ligne, `$$…$$` en bloc.
- **Sommaire** : un paragraphe `[TOC]` affiche les titres de la note, cliquables.

### Rechercher dans une note

`⌘F` recherche dans la note, `⌘⌥F` remplace. `⌘⇧F` cherche dans tout le vault.

### Les notes liées

Sous chaque note : les pages qui pointent vers elle (avec la ligne du lien) et les **mentions non liées** (son titre cité sans lien), avec un bouton « Lier ».

## Les types de page

À la création d'une page (`⌘N`), choisissez son type.

### Bases

Des bases de données comme dans Notion, au format des Bases d'Obsidian (`Nom.base`). Chaque ligne est une note du dossier `Nom/`, chaque colonne une propriété YAML. Dans la barre latérale, les lignes d'une base ont leur propre icône.

- Vues **Tableau**, **Kanban**, **Galerie** et **Calendrier**, avec filtres, tris et groupes.
- **Calculs** en bas des colonnes (somme, moyenne, remplies, vides…), **formules**.
- Sélections colorées, cellules date avec le calendrier de l'app, saisie au clavier, glisser-déposer des colonnes, lignes et cartes.
- Une base s'intègre dans une note avec `![[Nom.base]]`.

### Dessins

Des dessins à main levée avec Excalidraw, au format du plugin Obsidian « Excalidraw » (`Nom.excalidraw.md`). Les outils prennent place dans la barre de page ; le clic droit ouvre le menu des formes (copier, styles, plans, verrouiller…).

### Mind maps

Des cartes mentales (`Nom.mindmap.md`) : `Tab` ajoute un enfant, `↵` un frère, double-clic renomme, glisser réorganise ; boutons + et − pour zoomer, export PNG.

### Tickets

Comme les issues GitHub : un ticket est une note du dossier des tickets (« 12 - Titre.md »), avec un état, des tags, une échéance et un fil de commentaires.

- Vue **Tickets** : liste (ouverts, fermés, tri, recherche, tags) ou **tableau kanban** avec glisser-déposer.
- Le bouton **Colonnes** du tableau personnalise ses colonnes (aussi dans les réglages).

### Présentations

Une note avec `marp: true` devient une présentation Marp : diapos séparées par `---`, notes de l'orateur en commentaires, miniatures à jour, mode Présenter (`⌘⇧P`).

## Les vues

- **Accueil** : créer une page, récents, à faire, tickets, à lire, graphe, Git, activité du vault.
- **Lectures** : une note (`Lectures.md`) avec une section par thème et une case par lien. `⌘⇧L` ajoute un lien, son titre est lu automatiquement.
- **Graphe** : les liens entre les notes, avec zoom et filtres.

## Git

Si le vault est un dépôt Git, le panneau Git (`⌘⇧G`) montre les fichiers modifiés et leurs différences, indexe, commite, récupère (pull par fusion) et pousse. L'historique d'une note (barre de page) permet de comparer et de restaurer une version. Les conflits de fusion se résolvent dans l'app.

## Exporter

Menu « … » de la page :

- **Exporter en PDF** par le panneau d'impression : une note telle qu'affichée, une présentation (une diapo par page), un dessin ou une mind map ajustés à la page.
- **Copier en HTML** : la note mise en forme, pour un mail ou un document.

## Raccourcis clavier

| Raccourci | Action |
| --- | --- |
| `⌘P` | Rechercher une page |
| `⌘N` | Nouvelle page |
| `⌘[` / `⌘]` | Page précédente / suivante |
| `⌘T` / `⌘W` | Nouvel onglet / fermer l'onglet |
| `⌥-clic` | Ouvrir à droite (split view) |
| `⌘⌥\` | Ouvrir ou fermer le panneau de droite |
| `⌘K` | Lien sur la sélection (sinon : rechercher une page) |
| `⌘F` / `⌘⌥F` | Rechercher / remplacer dans la note |
| `⌘⇧F` | Rechercher dans le vault |
| `⌘⇧E` | Markdown brut |
| `⌘⇧M` | Mode focus |
| `⌘⇧G` | Panneau Git |
| `⌘⇧L` | Ajouter un lien à lire |
| `⌘⇧P` | Présenter |
| `⌘S` | Enregistrer maintenant |
| `⌘,` | Réglages |
| `⌘/` | Aide et raccourcis |
| `⌘\` | Barre latérale |
