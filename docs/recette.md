# Recette avant une release

Toutes les fonctionnalités de FlowNote, à vérifier **dans les deux apps** avant de publier : FlowNote (Tauri) et FlowNote Swift. Rangées comme la documentation de l'app (`src/docs/documentation.md`). Copier la liste dans le ticket ou la note de la release, et cocher au fur et à mesure.

- **⚑** : dessiné en natif dans FlowNote Swift, à côté de sa version web (voir « Deux applications » dans `CLAUDE.md`). C'est là que les deux apps peuvent différer : à tester de près dans Swift.
- **Vault de test** : une copie de `fixtures/vault` dans un dépôt Git (`git init`, puis un commit). Après chaque essai d'écriture, `git diff` doit ne montrer que le changement voulu.
- **Avant tout** : `npm run lint`, `npm run typecheck`, `npm test` (contrats compris), `cargo test --workspace --manifest-path src-tauri/Cargo.toml`, `native/build.sh`. La CI les relance.

## Démarrage et vault

| Fonctionnalité | Tauri | Swift |
| --- | --- | --- |
| Premier lancement sans vault : écran d'accueil, vaults récents, « Ouvrir un vault », « Essayer avec un exemple » | ☐ | ☐ |
| Ouvrir un vault (panneau du système), un vault récent, en oublier un | ☐ | ☐ |
| Un vault dans iCloud Drive s'ouvre ; les notes restées dans le nuage arrivent | ☐ | ☐ |
| Relancer l'app : le dernier vault se rouvre | ☐ | ☐ |
| Changer de vault depuis le menu du vault et depuis les Réglages ⚑ | ☐ | ☐ |
| Une note ouverte puis fermée sans modification : `git diff` vide (fidélité à l'octet) | ☐ | ☐ |
| Un fichier modifié ailleurs (Obsidian, git) : l'arbre suit ; écrire par-dessus est refusé (conflit) | ☐ | ☐ |

## Barre latérale ⚑

| Fonctionnalité | Tauri | Swift |
| --- | --- | --- |
| Menu du vault : vaults récents, ouvrir un autre vault, changer de vault, Réglages | ☐ | ☐ |
| Bouton nouvelle page (`⌘N`) : choix du type et du dossier | ☐ | ☐ |
| Accueil, Rechercher (`⌘P`), Rechercher dans les notes (`⌘⇧F`), Tickets, Lectures, Graphe, Documentation, dans cet ordre | ☐ | ☐ |
| `⌘-clic` et clic molette sur une vue : nouvel onglet | ☐ | ☐ |
| Favoris d'Obsidian | ☐ | ☐ |
| Arbre : une note et son dossier font une page avec sous-pages ; tickets et lectures absents | ☐ | ☐ |
| Clic : ouvre ; `⌘-clic` ou clic molette : nouvel onglet ; `⌥-clic` : à droite (split view) | ☐ | ☐ |
| Clic droit et « … » sur une page : nouvel onglet, à droite, sous-page, copier le lien, dupliquer, Finder, renommer, supprimer | ☐ | ☐ |
| Clic droit et « … » sur un dossier : nouvelle page, nouveau sous-dossier, Finder, renommer, supprimer | ☐ | ☐ |
| « + » au survol : sous-page, ou page dans le dossier | ☐ | ☐ |
| Clic droit dans le vide de l'arbre, « + » de « Pages » : nouvelle page, nouveau dossier à la racine | ☐ | ☐ |
| Bouton titres / noms de fichier (« Pages ») : barre latérale et onglets suivent | ☐ | ☐ |
| Glisser-déposer une page ou un dossier dans un dossier, ou sur « Pages » (racine) : liens mis à jour | ☐ | ☐ |
| Les tickets et leur dossier ne se déplacent pas ; rien ne se dépose dans le dossier des tickets | ☐ | ☐ |
| Titre et emoji de la page ouverte suivent la saisie | ☐ | ☐ |
| Git (avec le nombre de fichiers modifiés), Réglages, Aide et raccourcis, en bas | ☐ | ☐ |
| `⌘\` masque la barre ; elle réapparaît au survol du bord gauche | ☐ | ☐ |
| Redimensionner la barre (largeur retenue) | ☐ | ☐ |

## Onglets ⚑

| Fonctionnalité | Tauri | Swift |
| --- | --- | --- |
| `⌘T` nouvel onglet, « + », `⌘W` fermer (jamais la fenêtre), ✕ | ☐ | ☐ |
| `⌘1` … `⌘9`, `⌘⇧[` / `⌘⇧]` | ☐ | ☐ |
| Glisser pour réordonner | ☐ | ☐ |
| Clic molette sur un onglet : le ferme | ☐ | ☐ |
| Titre, icône (emoji ou type de page), point des modifications non enregistrées | ☐ | ☐ |
| `⌘[` / `⌘]` et les flèches : page précédente / suivante de l'onglet | ☐ | ☐ |

## Deux pages côte à côte ⚑

| Fonctionnalité | Tauri | Swift |
| --- | --- | --- |
| `⌥-clic` dans la barre latérale ou « Ouvrir à droite » : un seul onglet, deux noms | ☐ | ☐ |
| Clic droit sur un autre onglet : « Afficher à droite de… » ; sur l'actif : « Diviser avec l'onglet suivant » | ☐ | ☐ |
| Clic droit sur l'onglet double : échanger, séparer, fermer la page de droite | ☐ | ☐ |
| `⌘⌥\` ouvre ou ferme le panneau de droite (Swift : aussi menu Présentation) | ☐ | ☐ |
| Barre de la page de droite : ses outils, plus ouvrir à part, échanger, fermer | ☐ | ☐ |
| Séparateur déplaçable (largeur retenue) ; chaque côté s'enregistre ; une page ouverte des deux côtés ne s'édite qu'à gauche | ☐ | ☐ |

## Barre de page

| Fonctionnalité | Tauri | Swift |
| --- | --- | --- |
| Fil d'Ariane cliquable, menu des dossiers | ☐ | ☐ |
| Plan, Historique (même colonne) | ☐ | ☐ |
| Mode lecture `⌘⇧R` (par onglet et par côté) | ☐ | ☐ |
| Correction (Grammalecte : fautes soulignées, suggestions au clic) | ☐ | ☐ |
| Transformer en présentation | ☐ | ☐ |
| Pleine largeur (retenue par page) | ☐ | ☐ |
| Mode focus `⌘⇧M` : tout disparaît sauf la page ; Échap le quitte ⚑ | ☐ | ☐ |
| « … » : export PDF, copier en HTML | ☐ | ☐ |
| Markdown brut `⌘⇧E` | ☐ | ☐ |
| Pastille : enregistrement, mots, temps de lecture, mots de la sélection | ☐ | ☐ |

## Éditeur

| Fonctionnalité | Tauri | Swift |
| --- | --- | --- |
| Titre de la page (première ligne `# …`), modifié sans renommer le fichier ; nom du fichier cliquable pour renommer | ☐ | ☐ |
| Menu `/` : tous les blocs, filtre à la frappe | ☐ | ☐ |
| Raccourcis Markdown : `#`, `-`, `1.`, `[]`, `>`, `> [!note]`, `:::info`, ```` ``` ````, `---` | ☐ | ☐ |
| Poignée : `+`, glisser (aussi dans une liste), menu du bloc | ☐ | ☐ |
| `⌥↑` / `⌥↓`, `⌘D`, `↵` en fin de liste vide, `⇧↵` | ☐ | ☐ |
| `⇥` / `⇧⇥` : liste, ou paragraphe devenu élément de liste | ☐ | ☐ |
| `#` des titres au début de la ligne : `⌫` et `#` changent le niveau | ☐ | ☐ |
| `⌫` en début de ligne sous une liste, une citation, un callout, un tableau, un séparateur | ☐ | ☐ |
| `⌘B`, `⌘I`, `⌘E`, `⌘⇧S`, `⌘⇧H` ; délimiteurs Markdown à la frappe | ☐ | ☐ |
| Code en ligne : `` ` `` autour d'une sélection ou d'un mot, sortie par `→`, retrait par `⌫` / `⌦` / `⌘E` | ☐ | ☐ |
| Emoji `:mot` (écrit `:shortcode:`) | ☐ | ☐ |
| `[[` (autocomplétion), `![[` (note, image, base) | ☐ | ☐ |
| `⌘K` (lien web), coller une URL sur une sélection, URL tapée devenue lien | ☐ | ☐ |
| Clic sur un lien (navigateur ou page), clic molette (nouvel onglet), barre au survol | ☐ | ☐ |
| Coller ou déposer une image : pièce jointe enregistrée et intégrée | ☐ | ☐ |
| Callouts (type au clic sur l'icône, repliables), admonitions HedgeDoc | ☐ | ☐ |
| Propriétés : tous les types, « Ajouter des propriétés », calendrier, icône emoji | ☐ | ☐ |
| Tableaux (poignées, `Tab`, `↵`), code (langage, sortie), Mermaid, Plotly (éditeur, CSV), maths, `[TOC]` | ☐ | ☐ |
| Copier : Markdown dans un éditeur de texte, mis en forme dans un traitement de texte | ☐ | ☐ |
| `⌘F`, `⌘⌥F` dans la note ; `⌘⇧F` dans le vault | ☐ | ☐ |
| Notes liées et mentions non liées (« Lier ») | ☐ | ☐ |
| `⌘S` enregistre ; enregistrement automatique (et sans, s'il est coupé) | ☐ | ☐ |

## Types de page

| Fonctionnalité | Tauri | Swift |
| --- | --- | --- |
| Création de chaque type (`⌘N`) : note, base, dessin, mind map, ticket, présentation ; deux pages du même nom gardent leur type (`Sans titre 1.excalidraw.md`) | ☐ | ☐ |
| Base : vues tableau, kanban, galerie, calendrier ; filtres, tris, groupes ; calculs, formules | ☐ | ☐ |
| Base : sélections colorées, dates, saisie, glisser colonnes / lignes / cartes, « Nouveau », `![[X.base]]` dans une note ; le YAML garde ses clés inconnues | ☐ | ☐ |
| Ticket : état, tags, échéance, tâches, commentaires | ☐ | ☐ |
| Vue Tickets : liste (filtres, tris, recherche) et tableau (glisser, colonnes personnalisées) | ☐ | ☐ |
| Dessin Excalidraw : outils dans la barre de page, menu au clic droit, enregistrement | ☐ | ☐ |
| Mind map : `Tab`, `↵`, double-clic, glisser, disposition, zoom, recentrer, export PNG | ☐ | ☐ |
| Présentation : miniatures, Présenter `⌘⇧P` (plein écran), export HTML et PDF | ☐ | ☐ |

## Vues et outils

| Fonctionnalité | Tauri | Swift |
| --- | --- | --- |
| Accueil : créations, récents, à faire, tickets, à lire, Git, graphe, activité | ☐ | ☐ |
| Graphe : couleurs, notes manquantes, zoom, filtres | ☐ | ☐ |
| Lectures : thèmes, tags, `⌘⇧L` (titre lu automatiquement), « Au hasard » | ☐ | ☐ |
| Documentation (avec ses images, claires ou sombres) | ☐ | ☐ |
| Aide et raccourcis `⌘/` | ☐ | ☐ |

## Git

| Fonctionnalité | Tauri | Swift |
| --- | --- | --- |
| Panneau Git `⌘⇧G` en colonne à droite : branche, état, fichiers, différences | ☐ | ☐ |
| Indexer, désindexer, annuler (nouveau fichier : corbeille) | ☐ | ☐ |
| Commit (message facultatif, `⌘↩`) | ☐ | ☐ |
| Fetch, pull (fusion), push (premier push : branche créée) | ☐ | ☐ |
| Historique d'une note : comparer, restaurer | ☐ | ☐ |
| Conflit de fusion : résolution dans l'app, note en lecture seule d'ici là | ☐ | ☐ |

## Exports

| Fonctionnalité | Tauri | Swift |
| --- | --- | --- |
| PDF d'une note, d'une présentation, d'un dessin, d'une mind map (panneau d'impression ▸ PDF) | ☐ | ☐ |
| HTML d'une présentation, PNG d'une mind map (panneau d'enregistrement, puis ouverture) | ☐ | ☐ |
| Copier en HTML | ☐ | ☐ |

## Réglages

| Fonctionnalité | Tauri | Swift |
| --- | --- | --- |
| Apparence (système, clair, sombre) : la fenêtre suit aussi ⚑ | ☐ | ☐ |
| Taille de l'interface ⚑ | ☐ | ☐ |
| Enregistrement automatique | ☐ | ☐ |
| Correcteur : Grammalecte, macOS, aucun | ☐ | ☐ |
| Tickets : dossier, colonnes | ☐ | ☐ |
| Lectures : note, lecture des titres | ☐ | ☐ |
| Vault : changer de vault ⚑ | ☐ | ☐ |

## Fenêtre et menus ⚑

| Fonctionnalité | Tauri | Swift |
| --- | --- | --- |
| Menus de l'app : Fichier (nouvelle page, onglet, fenêtre, ouvrir un vault), Édition (rechercher, ajouter un lien), Présentation (historique, split view, Git, focus), Fenêtre (onglets) | ☐ | ☐ |
| Copier, coller, annuler, rétablir (menu Édition) | ☐ | ☐ |
| Plein écran, réduire, agrandir ; plusieurs fenêtres (Swift : `⌘⇧N`) | ☐ | ☐ |
| Quitter : les modifications sont enregistrées, Grammalecte s'arrête | ☐ | ☐ |
