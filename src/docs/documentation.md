# Documentation de FlowNote

FlowNote édite votre vault Obsidian comme Notion : par blocs, avec un menu `/`, des bases, des dessins, des tickets, des présentations… Chaque page reste un fichier texte que vous pouvez continuer à ouvrir dans Obsidian et à versionner avec Git.

![[editeur.webp]]

[TOC]

## Les principes

> [!tip] Vos fichiers restent à vous
> - Une note que vous n'avez pas modifiée est réécrite **à l'octet près**. Une note modifiée ne change que dans les blocs touchés : un diff Git ne montre que vos modifications.
> - Rien n'est caché dans une base de données : tout est du Markdown, du YAML ou du JSON lisible.
> - Le dossier `.obsidian` n'est jamais modifié. FlowNote y lit seulement les réglages des liens et des pièces jointes.
> - Une note modifiée ailleurs (Obsidian, Git) n'est jamais écrasée : l'écriture est refusée et la différence est signalée.

## Prendre en main

1. **Ouvrez un vault** : au lancement, « Ouvrir un vault Obsidian… » et choisissez son dossier. Un dossier sans `.obsidian` convient aussi : il devient un vault. « Essayer avec un exemple » ouvre un vault de démonstration, en mémoire, sans rien écrire sur le disque.
2. **Créez une page** avec `⌘N` (ou le bouton en haut de la barre latérale) et choisissez son type : note, base, dessin, mind map, ticket ou présentation.
3. **Écrivez** : le texte se tape directement, `/` ouvre le menu des blocs, `[[` insère un lien vers une autre note.
4. **Retrouvez une page** avec `⌘P`, ou un mot dans tout le vault avec `⌘⇧F`.
5. **Tout s'enregistre seul** : la pastille en bas à droite indique « Enregistré ». Le fichier est lisible tel quel dans Obsidian.

L'**Accueil** rassemble les raccourcis de création, les pages récentes, les tâches à faire (échéances des tickets et des notes), les tickets ouverts, les liens à lire et l'état de Git. Un clic sur un tag de la carte Vault liste les pages qui le portent (dans le texte ou dans la propriété `tags`).

![[accueil.webp]]

## L'interface

### La barre latérale

- **Le vault** en haut : son menu permet de passer en un clic à un vault ouvert récemment, d'en ouvrir un autre ou d'ouvrir les réglages. Le bouton à droite crée une page (`⌘N`).
- **Accueil**, **Rechercher** (`⌘P`), **Rechercher dans les notes** (`⌘⇧F`), **Tickets**, **Lectures**, **Graphe** et **Documentation** (cette page). Quand une page est ouverte, Accueil, Tickets, Lectures et Graphe s'ouvrent dans un nouvel onglet pour ne pas la remplacer.
- **Favoris** : les fichiers mis en favoris dans Obsidian.
- **Pages** : l'arbre du vault. Une note et le dossier du même nom (`Projets.md` + `Projets/`) forment une page avec ses sous-pages. Le dossier des tickets et la note des lectures n'y figurent pas : ils ont leur propre vue.
  - Menu « … » ou clic droit : ouvrir dans un nouvel onglet, ouvrir à droite, sous-page, copier le lien, dupliquer, afficher dans le Finder, renommer, supprimer.
  - Glisser-déposer des pages et des dossiers : les liens qui pointent vers eux sont mis à jour à chaque déplacement.
- En bas : **Git** (`⌘⇧G`), **Réglages** (`⌘,`) et **Aide et raccourcis** (`⌘/`).
- `⌘\` masque la barre latérale ; elle réapparaît au survol du bord gauche.

### La barre de page

Au-dessus de chaque page : le fil d'Ariane (cliquable, avec le menu des dossiers), puis les actions de la page :

| Bouton | Action |
| --- | --- |
| Plan | les titres de la note, cliquables, dans une colonne à droite |
| Mode lecture `⌘⇧R` | la page se lit sans pouvoir être modifiée : ni curseur, ni correcteur, ni poignées ; les liens et les cases à cocher restent cliquables (retenu pour chaque onglet et chaque côté du split view) |
| Correction | active ou coupe le correcteur |
| Présentation | transforme la note en présentation (sur une présentation : miniatures, Présenter, export HTML) |
| Historique | les versions Git de la note, à comparer ou restaurer |
| Pleine largeur | la page occupe toute la fenêtre (retenu pour chaque page) |
| Mode focus `⌘⇧M` | masque tout sauf la page |
| « … » | export PDF, copie en HTML |
| Markdown brut `⌘⇧E` | le fichier tel quel, avec ses numéros de ligne |

- **Plan** et **Historique** s'affichent dans une même colonne à droite, le plan au-dessus.
- La **pastille d'état** en bas à droite indique l'enregistrement, le nombre de mots (temps de lecture au survol) et les mots de la sélection.

### Les onglets

Chaque page s'ouvre dans un onglet : `⌘T` nouvel onglet, `⌘W` fermer, `⌘1` … `⌘9` aller à un onglet, `⌘⇧[` / `⌘⇧]` onglet précédent / suivant, `⌘-clic` ouvrir dans un nouvel onglet. Les onglets se réordonnent par glisser-déposer. `⌘[` et `⌘]` reviennent à la page précédente ou suivante de l'onglet.

### Deux pages côte à côte

`⌥-clic` sur une page de la barre latérale (ou « Ouvrir à droite » dans son menu) l'affiche à droite de la page active. Les deux pages forment **un seul onglet**, qui porte leurs deux noms.

![[split-view.webp]]

- Clic droit sur un autre onglet : « Afficher à droite de… » ; sur l'onglet actif : « Diviser avec l'onglet suivant ».
- Clic droit sur l'onglet double : échanger les côtés, séparer en deux onglets, fermer la page de droite. Fermer l'onglet ferme les deux.
- La page de droite a la même barre d'outils que celle de gauche, plus trois boutons : ouvrir dans son propre onglet, échanger les côtés, fermer.
- Le séparateur se déplace à la souris (la largeur est retenue). `⌘⌥\` ouvre ou ferme le panneau de droite.
- Les deux côtés s'enregistrent chacun de leur côté. Une page ouverte des deux côtés ne se modifie qu'à gauche.

### Les réglages

Ouverts dans un onglet (`⌘,`) et rangés par catégorie :

- **Général** : apparence (système, clair, sombre), taille de l'interface (petite, normale, grande, très grande), enregistrement automatique.
- **Éditeur** : correcteur (Grammalecte, celui de macOS, ou aucun).
- **Tickets** : dossier des tickets et colonnes du tableau.
- **Lectures** : note des lectures et lecture automatique du titre des liens.
- **Vault** : changer de vault.

![[reglages.webp]]

## L'éditeur de notes

### Le titre

Une page a un **titre** et un **nom de fichier**, indépendants :

- **Le titre** s'affiche en haut de la page ; cliquez dessus pour le modifier. Pour une note, c'est sa première ligne `# Titre` (ajoutée si besoin) ; pour une présentation, sa propriété `title`. Le modifier ne renomme jamais le fichier.
- **Le nom du fichier** s'affiche en gris sous le titre (`Réunion.md`) : cliquez dessus pour renommer le fichier. On renomme aussi depuis la barre latérale ou le fil d'Ariane.
- Une nouvelle note commence par `# Nom` : titre et nom sont égaux au départ.
- Le bouton **T** de la section « Pages » de la barre latérale choisit d'afficher les titres ou les noms de fichier, dans la barre latérale et les onglets ; l'autre s'affiche au survol.

### Les blocs

Tapez `/` en début de ligne pour insérer ou transformer un bloc : texte, titres, listes, tâches, toggle, citation, callouts, admonition HedgeDoc, sous-page, code, Mermaid, graphique, maths, tableau, séparateur, sommaire, date… Continuez à taper pour filtrer, `↵` pour choisir.

![[menu-slash.webp]]

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

**La poignée** apparaît à gauche du bloc survolé : `+` ajoute un bloc dessous, `⋮⋮` le déplace par glisser-déposer (aussi pour l'imbriquer dans une liste) et ouvre son menu (supprimer, dupliquer, monter, descendre, transformer).

![[poignee.webp]]

- `⌥↑` / `⌥↓` déplacent le bloc, `⌘D` le duplique.
- `↵` en fin de liste vide en sort ; `⇧↵` passe à la ligne dans le même bloc.
- `⇥` indente : dans une liste, l'élément passe sous celui du dessus ; dans un paragraphe, la ligne devient un élément de liste, rangé sous la liste du dessus s'il y en a une (Markdown n'a pas de texte indenté : quatre espaces en feraient du code). `⇧⇥` désindente.
- **Niveau d'un titre** : curseur dans un titre, ses `#` s'affichent en gris au début de la ligne. Au début du titre, `⌫` en retire un (un titre 1 redevient du texte) et `#` en ajoute un.
- `⌫` au début d'une ligne la remonte au bout de la ligne du dessus, même sous une liste, une citation ou un callout. Sous un tableau, le curseur va dans la dernière cellule ; sous un séparateur, celui-ci est sélectionné (un second `⌫` le supprime).

### La mise en forme

- `⌘B` gras, `⌘I` italique, `⌘E` code, `⌘⇧S` barré, `⌘⇧H` surligné. Les délimiteurs Markdown (`**gras**`, `*italique*`, `~~barré~~`, `==surligné==`) marchent aussi à la frappe.
- **Code en ligne** : `` ` `` tapé sur une sélection la met entre accents graves ; posé devant puis derrière un mot (ou l'inverse), le mot devient du code. Curseur dans le code, ses `` ` `` s'affichent en gris : `→` à la fin passe le `` ` `` fermant, puis `⌫` retire le code (le texte reste) ; `⌦` avant le `` ` `` ouvrant, ou `⌘E` dans le code, le retire aussi.
- **Emoji** : `:` suivi d'un mot propose un emoji, écrit `:shortcode:` dans le fichier.

### Les liens

- `[[` insère un lien vers une note, avec autocomplétion ; `![[` intègre une note, une image ou une base. Les liens suivent les réglages d'Obsidian.
- `⌘K` sur un texte sélectionné demande l'adresse d'un lien web ; sur un lien existant, il le modifie ou le retire. Coller une URL sur un texte sélectionné en fait aussi un lien. Une adresse tapée (`https://…`, `www.…`) devient un lien dès qu'on la quitte ; le fichier garde l'adresse telle quelle.
- Un **clic** sur un lien l'ouvre : dans le navigateur pour une adresse web, dans l'app pour une note. Un **clic molette** l'ouvre dans un nouvel onglet. Au **survol**, une barre affiche l'adresse avec Modifier, Copier et Retirer.
- Coller ou déposer une image l'enregistre dans le dossier des pièces jointes d'Obsidian et l'intègre à la note.
- La syntaxe Markdown tapée à la main devient un lien ou une image dès la parenthèse fermante : `[texte](https://…)` pour un lien, `![texte](https://…/image.png)` pour une image (du web ou du vault). Du texte simple collé (depuis un fichier texte, un terminal ou le mode source d'Obsidian) est lu comme du Markdown ; ce qui est copié d'une page web garde sa mise en forme.

### Les callouts et les admonitions

- **Callouts Obsidian** : `> [!note] Titre`. Cliquez sur l'icône pour changer le type (note, info, astuce, attention, danger…). Un toggle est un callout repliable (`> [!note]-`).
- **Admonitions HedgeDoc** : un bloc entre `:::type` et `:::` s'affiche comme un callout et garde sa syntaxe dans le fichier.

```markdown
> [!tip] Objectif
> Un site rapide, lisible sur mobile.

:::spoiler Cliquer pour voir
Un contenu replié.
:::
```

Types reconnus par HedgeDoc : `success`, `info`, `warning`, `danger` et `spoiler` (replié, ouvert avec `{state="open"}`). Rendu :

:::success
Une admonition `success`, écrite `:::success` dans le fichier.
:::

### Les propriétés

Les propriétés YAML (le frontmatter) s'affichent sous le titre, comme dans Obsidian : texte, liste, nombre, case à cocher, date, date et heure. Les tags s'affichent en pastilles, même écrits sur une ligne (`tags: projet, site`) ; les modifier les réécrit en liste YAML. Sur une note sans propriétés, « Ajouter des propriétés » en crée une. Les dates se choisissent dans le calendrier de l'app (tapez aussi `jj/mm/aaaa`).

L'icône de la page est un emoji choisi au-dessus du titre. Dans le fichier :

```yaml
---
icon: 🚀
tags: [projet, site]
statut: en cours
---
```

### Les blocs spéciaux

- **Tableaux** : poignées de lignes et de colonnes pour insérer, déplacer, aligner ou supprimer. `Tab` passe à la cellule suivante, `↵` à celle du dessous.
- **Code** : coloration syntaxique, langage choisi en haut du bloc ; `⌘↵` ou trois `↵` en sortent.
- **Mermaid** : un bloc ```` ```mermaid ```` devient un diagramme.
- **Graphiques Plotly** (`/graphique`) : au format du plugin obsidian-plotly, avec un éditeur visuel (type, titres, valeurs, import d'un CSV). L'éditeur visuel propose lignes, barres (verticales, horizontales, empilées), aire, points, camembert, anneau et radar ; tous les autres types de Plotly (heatmap, 3D, sankey…) s'affichent aussi et s'écrivent en texte.
- **Maths** : `$…$` en ligne, `$$…$$` en bloc.
- **Sommaire** : un paragraphe `[TOC]` affiche les titres de la note, cliquables (comme en haut de cette page).

### Copier, rechercher, notes liées

- **Copier** : le texte copié depuis une note se colle en Markdown dans un éditeur de texte, et mis en forme dans un traitement de texte.
- **Rechercher** : `⌘F` dans la note, `⌘⌥F` pour remplacer, `⌘⇧F` dans tout le vault.
- **Filtres de la recherche** (`⌘⇧F`) : « + Filtre » restreint la recherche par tag (les tags imbriqués compris), dossier, propriété (une valeur, ou « est renseignée ») ou date de modification (aujourd'hui, 7 ou 30 derniers jours, cette année, ou une période). La syntaxe d'Obsidian marche aussi : `tag:#projet`, `path:Projets`, `[statut:fait]`, `[statut]` deviennent des pastilles à l'espace ou à `↵`. Sans texte, la recherche liste les notes filtrées, les plus récemment modifiées d'abord. `⌫` dans le champ vide retire la dernière pastille.
- **Notes liées** : sous chaque note, les pages qui pointent vers elle (avec la ligne du lien) et les **mentions non liées** (son titre cité sans lien), avec un bouton « Lier ».

## Les types de page

À la création d'une page (`⌘N`), choisissez son type. Tous restent des fichiers lisibles par Obsidian et ses plugins.

### Bases

Des bases de données comme dans Notion, au format des Bases d'Obsidian (`Voyages.base`). Chaque ligne est une note du dossier du même nom (`Voyages/`), chaque colonne une propriété YAML de ces notes.

![[base-tableau.webp]]

- Vues **Tableau**, **Kanban**, **Galerie** et **Calendrier**, en onglets au-dessus de la base, avec filtres, tris et groupes.
- **Calculs** en bas des colonnes (somme, moyenne, remplies, vides…) et **formules**.
- Sélections colorées, cellules date avec le calendrier de l'app, saisie au clavier, glisser-déposer des colonnes, des lignes et des cartes.
- « Nouveau » crée une note dans le dossier de la base.
- Une base s'intègre dans une note avec `![[Voyages.base]]`.

Le kanban groupe les lignes par une propriété (ici `statut`) ; glisser une carte change sa valeur :

![[base-kanban.webp]]

Le calendrier place les lignes selon une propriété date :

![[base-calendrier.webp]]

Dans le fichier, une base est du YAML qu'Obsidian lit tel quel (FlowNote garde les clés qu'il ne connaît pas) :

```yaml
filters:
  and:
    - file.inFolder("Voyages")
views:
  - type: table
    name: Tableau
  - type: kanban
    name: Kanban
    groupBy:
      property: note.statut
      direction: ASC
```

### Tickets

Comme les issues GitHub : un ticket est une note du dossier des tickets (`Tickets/1 - Exporter en PDF.md`), avec un état, des tags, une échéance, des tâches et un fil de commentaires.

![[ticket.webp]]

La vue **Tickets** les liste (ouverts ou fermés, tri par échéance, date ou numéro, recherche, filtre par tag) :

![[tickets-liste.webp]]

…ou les range en **tableau kanban**, avec glisser-déposer entre les colonnes. Le bouton **Colonnes** personnalise les colonnes (aussi dans les réglages).

![[tickets-tableau.webp]]

Dans le fichier, l'état et l'échéance sont des propriétés, les commentaires des callouts :

```markdown
---
type: ticket
id: 1
status: open
tags: [idée, export]
due: 2026-10-18
---

Pouvoir exporter une note en PDF depuis la barre d'outils.

## Commentaires

> [!comment] 14/10/2026 09:12
> Bonne idée, à prévoir pour la prochaine version.
```

### Dessins

Des dessins à main levée avec Excalidraw, au format du plugin Obsidian « Excalidraw » (`Croquis.excalidraw.md`). Les outils prennent place dans la barre de page ; le clic droit ouvre le menu des formes (copier, styles, plans, verrouiller…).

![[croquis.webp]]

### Mind maps

Des cartes mentales (`Idées.mindmap.md`) : `Tab` ajoute un enfant, `↵` un frère, double-clic renomme, glisser réorganise ; les boutons à gauche règlent la disposition, ceux en bas à droite le zoom. La barre de page recentre la carte et l'exporte en PNG. Le fichier garde aussi la carte en liste Markdown, lisible sans FlowNote.

![[mindmap.webp]]

### Présentations

Une note avec `marp: true` devient une présentation Marp : diapos séparées par `---`, notes de l'orateur en commentaires, miniatures à jour à côté du texte, mode Présenter (`⌘⇧P`) et export HTML ou PDF. « Transformer en présentation » dans la barre de page convertit une note existante.

![[presentation.webp]]

## Les vues

### Graphe

Les liens entre les notes : les couleurs distinguent les types de page, les points clairs les notes qui n'existent pas encore. Zoom et déplacement à la souris, filtres en haut à droite.

![[graphe.webp]]

### Lectures

Une liste de lectures dans une seule note (`Lectures.md`) : une section par thème, une case par lien, des tags. `⌘⇧L` ajoute un lien de n'importe où ; son titre est lu automatiquement. « Au hasard » ouvre un lien encore à lire.

![[lectures.webp]]

```markdown
## Outils
- [ ] [Obsidian Bases](https://help.obsidian.md/bases) #obsidian #doc
- [x] [Marp : présentations en Markdown](https://marp.app) #slides
```

## Git

Si le vault est un dépôt Git, le panneau Git (`⌘⇧G`) montre les fichiers modifiés et leurs différences, indexe, commite, récupère (pull par fusion) et pousse. Comme FlowNote ne réécrit que les blocs modifiés, le diff ne montre que vos changements.

- En haut, sur une ligne : la branche, son état (« à jour », « 2 à envoyer »…) et trois boutons, **↓** Pull, **↑** Push et **↻** Vérifier (fetch), avec le nombre de commits à récupérer ou à envoyer. Leur rôle s'affiche au survol.
- Le message de commit est facultatif : sans message, FlowNote écrit la date, l'heure et les notes modifiées. `⌘↩` commite.
- Les sections **Indexé** et **Modifications** n'apparaissent que si elles ont des fichiers ; cliquer un fichier affiche ses différences.

![[git.webp]]

- L'**historique** d'une note (barre de page) permet de comparer une version à la note actuelle et de la restaurer.
- Les **conflits de fusion** se résolvent dans l'app ; une note en conflit reste en lecture seule jusqu'à sa résolution.
- **Modifications dans la marge** (Réglages → Éditeur, désactivé par défaut) : une barre verte à gauche des blocs ajoutés depuis le dernier commit, bleue pour les blocs modifiés, un petit triangle rouge là où des blocs ont été supprimés. Un clic sur une marque montre la version du dernier commit, différences surlignées mot à mot, avec **Rétablir** (le bloc reprend exactement son texte d'avant, `⌘Z` pour annuler), **Retirer** un bloc ajouté ou **Restaurer** un bloc supprimé. Les marques disparaissent au commit.

## Exporter

Menu « … » de la page :

- **Exporter en PDF** par le panneau d'impression : une note telle qu'affichée, une présentation (une diapo par page), un dessin ou une mind map ajustés à la page.
- **Copier en HTML** : la note mise en forme, pour un mail ou un document (son Markdown est copié en même temps, pour un éditeur de texte).

## Raccourcis clavier

| Raccourci | Action |
| --- | --- |
| `⌘N` | Nouvelle page |
| `⌘P` | Rechercher une page |
| `⌘⇧F` | Rechercher dans le vault |
| `⌘F` / `⌘⌥F` | Rechercher / remplacer dans la note |
| `⌘[` / `⌘]` | Page précédente / suivante |
| `⌘T` / `⌘W` | Nouvel onglet / fermer l'onglet |
| `⌘1` … `⌘9` | Aller à un onglet |
| `⌥-clic` | Ouvrir à droite (split view) |
| `⌘⌥\` | Ouvrir ou fermer le panneau de droite |
| `⌘K` | Lien sur la sélection (sinon : rechercher une page) |
| `⌘B` / `⌘I` / `⌘E` | Gras / italique / code |
| `⌘⇧S` / `⌘⇧H` | Barré / surligné |
| `⌥↑` / `⌥↓` | Déplacer le bloc |
| `⌘D` | Dupliquer le bloc |
| `⌘⇧E` | Markdown brut |
| `⌘⇧R` | Mode lecture |
| `⌘⇧M` | Mode focus |
| `⌘⇧G` | Panneau Git |
| `⌘⇧L` | Ajouter un lien à lire |
| `⌘⇧P` | Présenter |
| `⌘S` | Enregistrer maintenant |
| `⌘,` | Réglages |
| `⌘/` | Aide et raccourcis |
| `⌘\` | Barre latérale |
