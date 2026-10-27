# Changelog

Les changements notables de FlowNote, version par version. Le format suit [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) et la numérotation suit [Semantic Versioning](https://semver.org/lang/fr/).

## [0.26.0] - 2026-10-27

### Ajouté
- Documentation : le plan sur le côté, et au-dessus un champ de recherche (occurrences surlignées, `↵` pour la suivante, `⌘F` pour y aller).

### Modifié
- Les propriétés masquées ne laissent plus de ligne « x propriétés masquées » : seul un œil, au survol, les réaffiche.
- L'onglet des tâches s'appelle « Tâches » (et « Tableau », « Agenda », « Calendrier des tâches » pour les autres vues), plus `tasks-default`.
- Code : propriétés des notes lues en un seul endroit, navigation des onglets sortie de l'app principale, code mort retiré.

### Corrigé
- Rechercher dans les notes : un résultat ouvre la note sur le mot trouvé, plus en haut de la note.
- Un nouvel onglet s'ouvre juste après l'onglet actif, plus en tête de la barre.
- Une note au front matter vide (`---` puis `---`) est lue partout comme dans l'éditeur.

## [0.25.0] - 2026-10-27

### Ajouté
- Coller des cellules copiées d'un tableur (Excel, Numbers, Google Sheets) ou un CSV donne un tableau Markdown, la première ligne en en-tête ; `⌘⇧V` colle le texte tel quel.
- Trier l'arbre des pages : par nom, date de modification ou date de création, dans un sens ou dans l'autre (bouton de la section « Pages », retenu) ; les dossiers restent en tête.
- Les pièces jointes suivent leur note : déplacée dans un autre dossier, une note emporte les images et fichiers qu'elle seule utilise, rangés à côté d'elle ; supprimée, elle propose de les mettre à la corbeille avec elle. Rien ne bouge avec un dossier de pièces jointes commun à tout le vault.
- Pièces jointes inutilisées, listées sur l'accueil (carte « Santé »).
- Fusionner une note dans une autre (menu de la page, palette) : son texte va à la fin de l'autre sous un titre à son nom, ses propriétés s'ajoutent, les liens vers elle mènent à ce titre, puis elle part à la corbeille.
- Propriétés : en ajoutant une propriété, une liste propose celles du vault (les plus courantes d'abord, avec leur type), comme Obsidian ; un œil replie les propriétés de toutes les notes en une ligne.
- Vault de démo : une note à fusionner, un ancien logo inutilisé, de nouveaux essais dans « Bienvenue ».

### Corrigé
- Un double-clic dans un titre sélectionne le mot, même juste après sa dernière lettre (le `#` qui apparaît au premier clic décalait le texte).

## [0.24.0] - 2026-10-27

### Ajouté
- Aperçu au survol : une demi-seconde sur un lien vers une note montre la note (ou le titre, le bloc visé ; un dessin, une mind map, une image) dans une petite fenêtre qui défile, son titre l'ouvre.
- Une adresse web collée seule devient `[Titre de la page](adresse)` dès que le titre arrive (app de bureau) ; `⌘⇧V` la colle sans titre.
- Extraire vers une nouvelle note : la sélection (barre de mise en forme), un bloc ou la section d'un titre (menu de la poignée) part dans une note créée à côté, un lien `[[…]]` prend sa place.
- Images redimensionnées en tirant leur coin : la largeur s'écrit comme Obsidian la lit (`![[image.png|320]]`, `![texte|320](image.png)`) ; un double-clic les montre en grand.
- Vidéos YouTube et Vimeo écrites comme des images (`![](https://youtu.be/…)`), comme dans Obsidian : miniature, puis le lecteur au clic, sans cookies.
- Vault de démo : un logo redimensionné et une vidéo dans « Moodboard », de nouveaux essais dans « Bienvenue ».

## [0.23.0] - 2026-10-27

### Ajouté
- Tâches au format du plugin TaskNotes : chaque tâche est une note (tag `task`, statut, priorité, dates prévue et d'échéance, projets, contextes, estimation), lisible par le plugin ; ses réglages sont lus dans `.obsidian`, jamais écrits. Fiche de tâche avec commentaires.
- Vues de TaskNotes dans les bases : liste groupée, tableau kanban, agenda, calendrier du mois ou de la semaine, mini calendrier ; un sélecteur passe de l'une à l'autre.
- Récurrence des tâches, calculée comme TaskNotes : champ Répéter (règles courantes ou sur mesure, compter depuis la dernière fois faite), terminer une seule occurrence, dates suivantes calculées.
- Projets d'une tâche choisis parmi les notes du vault, écrits `[[Note]]`.
- Plan : glisser un titre déplace toute sa section dans la note.
- Colonnes de blocs (`/colonnes`) en callouts `[!multi-column]` et `[!blank]`, ajout et retrait de colonne au survol, colonnes gardées côte à côte dans la copie et l'export HTML.
- Bases : les filtres écrits à la main dans le fichier sont évalués.

### Modifié
- Les tickets et la liste `Todo.md` sont remplacés par les tâches TaskNotes ; le dossier des tâches apparaît dans la barre latérale, comme dans Obsidian.
- Bases : seuls les nœuds YAML modifiés sont réécrits.

### Corrigé
- Suppression sur macOS : la corbeille passe par NSFileManager au lieu du Finder, qui échouait après deux minutes sur iCloud Drive (aussi pour l'annulation des fichiers non suivis dans Git).
- Citations imbriquées : `>>` est gardé tel quel, et deux citations à la suite restent séparées.

### Supprimé
- Les cartes de révision (Révisions) : la vue, ses notes de démo et l'affichage des commentaires `<!--SR:…-->`, qui redeviennent du texte comme les autres commentaires.

## [0.22.0] - 2026-10-26

### Ajouté
- Liens vers les titres et les blocs : après le nom d'une note, `[[Note#` propose ses titres et `[[Note#^` ses paragraphes et éléments de liste (un bloc choisi reçoit un identifiant ` ^abc123`, comme dans Obsidian) ; `[[#` vise la note elle-même. Ces liens s'affichent « Note › Titre ».
- Alias : `[[` trouve aussi une note par ses `aliases` et écrit le lien sous ce nom.
- « Copier le lien vers ce bloc » (ou « vers ce titre ») dans le menu de la poignée `⋮⋮` ; les identifiants de bloc s'affichent en gris.
- Renommer un titre met à jour les liens `[[Note#Titre]]` des autres notes.
- Titres repliables : une flèche au survol replie la section jusqu'au titre suivant de même niveau (affichage seulement).
- Section « Tags » dans la barre latérale : les tags en arbre avec leurs compteurs ; un clic ouvre la recherche filtrée.
- Les onglets d'un vault sont retrouvés au lancement suivant.
- Révisions : les cartes de révision du plugin Spaced Repetition (`Q::R`, `Q:::R`, `?` sur plusieurs lignes, notes tagguées `#flashcards`), revues par paquet avec son algorithme ; la prochaine date est écrite dans la note comme le plugin l'écrit, affichée en pastille.
- Kanban : les tableaux du plugin Kanban d'Obsidian (`kanban-plugin: board`) s'ouvrent en colonnes ; cartes glissées, cochées, modifiées ; « Nouveau kanban ». Un tableau non modifié reste identique à l'octet près.
- Bases : menu d'une ligne (clic droit ou poignée `⋮⋮`) pour l'ouvrir, la renommer ou la supprimer ; le nom de la base se renomme en place ; la colonne Nom se renomme (`displayName`) ; les valeurs déjà utilisées dans une colonne sont proposées en tapant et dans les filtres ; les liens écrits dans les cellules sont cliquables.
- Vault de démo : un tableau Kanban (« Production »), deux paquets de cartes (« Mémo typo », « Japonais »), une colonne `site` dans la base Clients.

### Modifié
- Bases : une ligne, une carte ou une entrée du calendrier s'ouvre dans un nouvel onglet ; le fil d'Ariane d'une ligne ramène à sa base.
- Bases : les menus des filtres et des tris sont ceux de l'app (plus de listes déroulantes brutes) et s'ouvrent vers la droite ; un filtre sans valeur ne masque plus rien.
- Bases : les adresses web longues sont tronquées sur une ligne, dans le tableau comme sur les cartes.
- Les couleurs écrites dans le HTML d'une note (`#3f5e4b`) ne comptent plus comme des tags.

### Corrigé
- Bases : le type choisi pour une nouvelle propriété est bien visible, et `↵` l'ajoute même après un clic sur un type.
- Bases : une cellule se clique sur toute la hauteur de sa ligne ; le curseur n'y est plus coupé (WebKit).
- Un dossier créé au nom d'une note existante n'est plus invisible dans l'arbre.

## [0.21.1] - 2026-10-26

### Modifié
- Vault de démo refait : le carnet de Camille, designer freelance (clients, projets, réunions, journal, voyages), ordonné et réaliste, qui montre chaque fonctionnalité en situation. Sa note « Bienvenue » dit où voir chacune. Les dates restent d'actualité (échéances, calendrier, journal).
- Captures de la documentation refaites sur ce vault.

## [0.21.0] - 2026-10-26

### Ajouté
- Organigrammes flowchart.js : un bloc ```` ```flow ```` (ou ```` ```flowchart ````) est dessiné aux couleurs de l'app ; `/organigramme` en insère un. Un éditeur visuel en formulaire liste les étapes (forme, texte) et les flèches (départ, sortie oui/non, arrivée, côté), sans écrire la syntaxe.
- Maths dans les notes, dessinées par KaTeX : `$…$` en ligne (un clic ouvre la source avec l'aperçu en direct), `$$…$$` en bloc (double-clic, aperçu sous le champ). `$x^2$` tapé devient une formule, `$$` puis espace crée un bloc, « Formule en ligne » dans le menu `/`. L'export HTML écrit les formules en MathML.
- Modèles : si un dossier de modèles est réglé dans Obsidian, « Nouvelle page » (type Note) propose un modèle et `/modèle` en insère un dans la note ; `{{title}}`, `{{date}}`, `{{time}}` et `{{date:format}}` sont remplis aux formats d'Obsidian.
- Note de bas de page depuis la barre de mise en forme : une petite fenêtre demande son texte.
- Vault de démo : une note « Tour de l'éditeur » qui montre chaque bloc et chaque mise en forme, une liste de tâches, une galerie et une formule dans la base, deux modèles.

### Modifié
- Emoji : un `:code:` s'affiche en emoji dès son `:` fermant ; `←`, `→` ou un clic dans le code le montrent pour le modifier, `⌫` efface l'emoji en entier.
- Coller un seul bloc (une ligne d'une page web, un titre, un élément de liste) n'apporte que son texte : la ligne garde son type.
- Une sous-page créée par `/sous-page` commence par son titre `# Nom`, comme une nouvelle page.
- Pleine largeur : le `+` s'affiche au-dessus de `⋮⋮`, et sous l'icône du niveau ou la flèche d'un toggle, pour tenir dans la marge.
- Plus rien ne s'affiche par-dessus un diagramme Mermaid ou des résultats de requête au survol ; un organigramme ne montre que ses boutons.
- Documentation et README repris de bout en bout, captures refaites (`npm run captures`).

### Corrigé
- Le `/` du bouton + ne reste plus quand on referme le menu d'un clic ailleurs dans la note ; la ligne créée par le + part aussi.
- La note de bas de page de la barre de mise en forme n'efface plus le texte sélectionné.
- La flèche d'un toggle n'est plus recouverte par la poignée du bloc.
- Valider un bloc brut (formule, HTML) par `⌘↵` ne provoque plus d'erreur.
- Documentation : les sections Dashboard et Tâches étaient prises dans le bloc de code d'exemple des présentations.

### Supprimé
- Les « mentions non liées » sous les notes.

## [0.20.0] - 2026-10-25

### Ajouté
- Barre de mise en forme sur le texte sélectionné : gras, italique, souligné, barré, fluo et sa couleur, code, lien, note de bas de page, gomme.
- Fluo en couleur (`==🟢texte==` : vert, rouge, bleu, jaune, violet) ; curseur dans un fluo, un crayon change sa couleur en un clic.
- Souligné (`⌘U`), écrit `<u>…</u>`, lisible dans Obsidian.
- HTML dans les notes affiché mis en page (blocs, texte entouré de balises, images), nettoyé de ses scripts ; le HTML tapé s'affiche dès qu'on quitte la ligne.
- Niveau du titre dans la marge : un clic choisit un autre niveau ; raccourcis `⌘⌥4` à `⌘⌥6`.
- Autocomplétion des langages après ```` ``` ```` et dans le champ langage des blocs de code.
- Taille d'un nouveau tableau choisie dans une grille (lignes × colonnes).
- Réglages : police de l'app (Système, Clarika, Open Sans, Inter) ; menu des blocs en liste ou en grille d'icônes.
- Icône de page dans la page de droite du split view.
- Exporter une note en HTML : une page web autonome, indentée, images comprises.

### Modifié
- Tableaux au rendu plus doux (angles arrondis, traits légers, en-tête gris clair).
- Citations au texte légèrement éclairci.
- Filigrane d'une ligne vide : « Tapez / pour insérer… ».
- Images collées ou déposées : dans le dossier de pièces jointes d'Obsidian, sinon dans `attachments/` à côté de la note (plus à la racine du vault).
- Copier une note copie ses images, plus seulement leur nom.

### Corrigé
- Le `/` du bouton + restait dans la note quand on fermait le menu sans choisir (ou en quittant la note).
- Export PDF : plus de vide en tête de la première page ni de fin de note coupée ; plus de soulignements du correcteur.

### Supprimé
- « Copier en HTML », remplacé par « Exporter en HTML ».

## [0.19.1] - 2026-10-23

### Ajouté
- Paquet Linux `.deb` pour Ubuntu 26.04 (x86_64), environ 30 Mo : `sudo apt install ./FlowNote_*_amd64.deb` installe aussi WebKitGTK s'il manque.

## [0.19.0] - 2026-10-23

### Ajouté
- Dashboards : nouveaux widgets tableau, diagramme Mermaid, mind map, croquis Excalidraw et base (existants ou nouveaux).
- Une mind map ou un croquis intégré dans une note (`![[Idées.mindmap.md]]`) s'affiche, en lecture.
- Vault de démo : un dashboard « Suivi ».

### Modifié
- Dashboards : un seul bouton « Ajouter un widget », fixé en haut à droite ; placement libre sur toute la largeur de la page, redimensionnement par le bord droit, le bord bas ou le coin ; seuls les widgets sur le chemin descendent.

### Corrigé
- Dashboards : la grille rétrécissait à la largeur de son contenu ; les déplacements et redimensionnements ne cumulent plus d'écarts.

### Supprimé
- Widgets « Tâches à faire » et « Notes récentes ».

## [0.18.0] - 2026-10-22

### Ajouté
- Dashboards (`Nom.dashboard.md`) : des widgets à déplacer et redimensionner sur une grille de 12 colonnes (texte, graphique Plotly, tâches à faire, notes récentes), modifiés sur place. Chaque widget est une section `## Titre` de la note, les positions sont dans ses propriétés.
- Liste de tâches (« Tâches » dans la barre latérale, « Nouvelle tâche » sur l'accueil) : titre, échéance, catégorie et tags, écrite dans `Todo.md` au format du plugin Tasks et cachée de l'explorateur.
- L'accueil propose 9 types en grille de 3×3.

## [0.17.0] - 2026-10-22

### Ajouté
- Canevas Obsidian (`.canvas`) : cartes de note, de texte, d'image et de lien (titre et image d'aperçu de la page, miniature et lecteur des vidéos YouTube), groupes, flèches avec libellés, couleurs, annuler et rétablir. Le fichier est écrit exactement comme Obsidian l'écrit.
- Notes intégrées : `![[Note]]`, `![[Note#Section]]` et `![[Note#^bloc]]` affichent le contenu de l'autre note, toujours à jour.
- Notes de bas de page : appel `[^1]` en exposant (son texte au survol, un clic y mène), note numérotée en bas ; `/note de bas de page` en ajoute une.
- Requêtes Dataview (blocs ```` ```dataview ````) : `LIST`, `TABLE` et `TASK`, avec `FROM`, `WHERE`, `SORT`, `GROUP BY`, `LIMIT`, les propriétés, les champs `clé:: valeur` et les dates calculées.
- Requêtes Tasks (blocs ```` ```tasks ````) : filtres par état, échéance, chemin, tag, priorité, tris et groupes ; cocher une tâche dans les résultats la coche dans sa note.
- Palette de commandes (`⌘⇧P`, ou `>` dans `⌘P`) : toutes les actions de l'app par leur nom.
- Recherche dans les notes (`⌘⇧F`) : filtres par tag, dossier, propriété et date de modification, aussi en syntaxe Obsidian (`tag:#projet`, `path:Dossier`, `[statut:fait]`).
- Option « Modifications dans la marge » (Réglages → Éditeur) : les blocs changés depuis le dernier commit, avec le diff mot à mot et le retour à la version du commit.
- Vault de démo : une note « Fonctionnalités Obsidian » qui montre ces nouveautés, et un canevas.
- Documentation : des exemples pour chaque fonctionnalité.

### Modifié
- « Présenter » passe à `⌘⌥P` (`⌘⇧P` ouvre la palette de commandes).
- Une note ouverte depuis un canevas s'ouvre dans un nouvel onglet.
- Dépendance ajoutée : React Flow (`@xyflow/react`) pour les canevas, chargée à l'ouverture du premier canevas.

## [0.16.1] - 2026-10-22

### Modifié
- Dépendances mises à jour : React 19, Vite 8 (avec @vitejs/plugin-react 6), vite-node 6, motion 14, Tauri et ses dépendances Rust, ureq 3 (titre des pages web ajoutées aux lectures).

## [0.16.0] - 2026-10-19

### Ajouté
- Graphiques : l'éditeur visuel propose aussi radar, barres horizontales, barres empilées et anneau.
- Accueil : un clic sur un tag de la carte Vault liste les pages qui le portent (dans le texte ou dans la propriété `tags`).
- Du texte simple collé dans une note est lu comme du Markdown (liens, images, listes, titres) ; ce qui est copié d'une page web garde sa mise en forme.
- L'aide des raccourcis (⌘/) liste aussi `⌘\` (barre latérale).

### Modifié
- Propriétés : les valeurs de texte prennent toute la largeur et passent à la ligne au lieu d'être coupées.
- Propriétés : des tags écrits sur une ligne (`tags: projet, perso`) s'affichent en pastilles.
- Sous le capot : raccourcis clavier écrits une seule fois (`shortcuts.ts`), opérations sur les pages sorties d'`App.tsx` (`usePageOps`), vues de l'éditeur découpées en un fichier chacune ; restes de FlowNote Swift et code mort retirés.

### Corrigé
- `[texte](url)` et `![texte](url)` tapés dans l'éditeur deviennent un lien et une image, au lieu d'être enregistrés avec des crochets échappés (`\[texte\]`).
- Le menu des dossiers de la fenêtre « Nouvelle page » est opaque (il était presque transparent).

## [0.15.3] - 2026-10-19

### Ajouté
- Recette avant chaque release : la liste des fonctionnalités à vérifier dans l'app (`docs/recette.md`).

### Modifié
- Sous le capot : le backend Rust devient une bibliothèque à part (`flownote-core`) servie par un aiguillage unique ; les menus des pages, dossiers et onglets sont écrits une seule fois pour la barre latérale et la barre d'onglets.
- Dépendances mises à jour (Tauri 2.12.4, dialogue 2.8.3, outils de test).

### Corrigé
- Le filigrane d'un titre vide (« Titre 2 »…) ne se superpose plus aux `#` : il s'affiche juste après, en gras comme le titre.
- Les emoji d'une seule lettre proposés par le menu (`:x:` ❌, `:o:` ⭕…) s'affichent enfin.

## [0.15.2] - 2026-10-19

### Ajouté
- Une adresse web tapée (`https://…`, `www.…`) devient un lien cliquable dès qu'on la quitte ; le fichier garde l'adresse telle quelle.
- `⇥` dans un paragraphe en fait un élément de liste, rangé sous la liste du dessus s'il y en a une ; `⇧⇥` le ressort.
- Clic molette sur un lien ou un `[[lien]]` : la page s'ouvre dans un nouvel onglet.
- Guide pour publier une version soi-même (`docs/publier-une-version.md`).

### Modifié
- Les `#` d'un titre s'affichent au début de la ligne, et non plus dans la marge.

### Corrigé
- Une note contenant une adresse entre crochets (`[https://…]`) ne s'ouvrait plus (« mdast node without position »).
- Pleine largeur : avec le plan affiché, la page devenait plus étroite qu'en largeur normale ; la marge de 96 px est retirée.
- Un deuxième croquis ou une deuxième mind map du même nom perdait son type (`Sans titre.excalidraw 1.md` au lieu de `Sans titre 1.excalidraw.md`).

## [0.15.1] - 2026-10-16

### Ajouté
- La barre latérale se redimensionne en glissant son bord droit (largeur retenue).

### Corrigé
- Le choix titres / noms de fichier s'applique à toute la barre latérale, favoris compris.

## [0.15.0] - 2026-10-16

### Ajouté
- **Titre et nom de fichier indépendants** : le titre d'une page (première ligne `# Titre` d'une note, propriété `title` d'une présentation) se modifie en haut de la page sans renommer le fichier ; le nom du fichier, en gris sous le titre, se renomme d'un clic. Une nouvelle note commence par `# Nom`.
- Bouton de la section « Pages » : afficher les titres ou les noms de fichier dans la barre latérale et les onglets.
- **Mode lecture** (`⌘⇧R`, par onglet) : ni curseur, ni correcteur, ni poignées ; liens et cases à cocher restent cliquables. La documentation s'affiche ainsi.

### Modifié
- Panneau Git plus compact : branche, état et Pull / Push / Vérifier sur une ligne, champ de commit d'une ligne, sections vides masquées.
- Pleine largeur : marges plus larges, les `###` des titres y tiennent.

### Corrigé
- Les puces des listes ne disparaissent plus pendant la frappe (WebKit).
- La fenêtre se déplace de nouveau depuis tout l'espace vide de la barre d'onglets et de la barre de page.

## [0.14.1] - 2026-10-16

### Sécurité
- **Politique de sécurité du contenu (CSP)** activée : la fenêtre n'exécute que les scripts de l'app ; une note piégée ne peut plus charger de script ni envoyer de données vers un site extérieur.

### Modifié
- Taper dans une note ne redessine plus la barre latérale ni le panneau de droite (jusqu'à 20 fois moins de travail par frappe sur ces parties).

## [0.14.0] - 2026-10-16

### Ajouté
- **Documentation illustrée** : prise en main pas à pas, exemples de ce qui est écrit dans les fichiers, 18 captures d'écran en clair et en sombre (celles du thème de l'app). Quelques captures aussi dans le README.
- Vault de démonstration plus complet : une base de voyages (tableau, kanban, calendrier), cinq tickets, une mind map, une présentation et une liste de lectures.
- **Split view** : deux pages côte à côte dans un seul onglet. `⌥-clic` sur une page (ou « Ouvrir à droite ») l'affiche à droite ; clic droit sur un onglet : « Afficher à droite de… », échanger les côtés, séparer en deux onglets. La page de droite a la même barre d'outils que la gauche (plus : onglet propre, échange, fermeture), le séparateur se déplace, `⌘⌥\` ouvre ou ferme le panneau.
- **Niveau des titres** sans la vue brute : les `#` s'affichent dans la marge, `⌫` au début du titre en retire un, `#` en ajoute un.
- **Code en ligne** : ses `` ` `` s'affichent autour du curseur ; `→` puis `⌫` (ou `⌘E`) retire le code.
- **Liens** : bien visibles, ouverts d'un clic ; au survol, une barre pour modifier, copier ou retirer le lien.
- Copier depuis une note met son Markdown dans le presse-papiers (texte brut).
- Les `#` des titres et les `` ` `` du code ne s'affichent que pendant l'écriture (éditeur actif).
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
- Bases : les colonnes prennent une largeur selon leur type (nombre, date, texte…) ; quelques colonnes tiennent dans la page.
- Bases dans le panneau de droite : la barre (recherche, filtres, Nouveau) passe à la ligne au lieu de déborder.
- Croquis : la pastille « Enregistré » ne passe plus sous le bouton d'aide d'Excalidraw.
- `` ` `` posé devant puis derrière un mot (ou l'inverse) le met en code quelle que soit la façon dont il arrive (touche, touche morte suivie d'un autre caractère, saisie que WebKit ne signale pas) ; un `` ` `` collé reste du texte.
- Réglages : plus de barre de défilement quand tout tient dans la fenêtre.
- Plan et historique affichés ensemble : une seule barre verticale.
- Croquis : le menu du clic droit reprend la police de l'app.
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
- **Bases**, des bases de données : un nouveau type de page (`Nom.base`, au format des Bases d'Obsidian), dont les lignes sont les notes d'un dossier.
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
- **Graphe des notes** : aperçu sur l'accueil et vue en plein onglet, avec zoom, déplacement, survol des voisines et filtres (notes sans lien, notes inexistantes).

## [0.6.0] - 2026-10-14

### Ajouté
- **Ergonomie** :
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
- **Tickets** :
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
- Première version : éditeur de blocs sur un vault Obsidian, avec un moteur de fidélité Markdown qui réécrit à l'identique ce qui n'a pas été modifié.
- Menu `/`, raccourcis Markdown, poignée de bloc et glisser-déposer.
- Liens `[[wikilinks]]`, sous-pages, pièces jointes, tags.
- Tableaux éditables, propriétés YAML, blocs de code colorés, Mermaid.
- Recherche, plan de la note, mode Markdown brut.
- Gestionnaire Git : statut, diff, commit, pull/push, historique d'une note, résolution des conflits.

[0.16.0]: https://github.com/florentfougeres/FlowNote/compare/0.15.3...0.16.0
[0.15.3]: https://github.com/florentfougeres/FlowNote/compare/0.15.2...0.15.3
[0.15.2]: https://github.com/florentfougeres/FlowNote/compare/0.15.1...0.15.2
[0.15.1]: https://github.com/florentfougeres/FlowNote/compare/0.15.0...0.15.1
[0.15.0]: https://github.com/florentfougeres/FlowNote/compare/0.14.1...0.15.0
[0.14.1]: https://github.com/florentfougeres/FlowNote/compare/0.14.0...0.14.1
[0.14.0]: https://github.com/florentfougeres/FlowNote/compare/0.13.0...0.14.0
[0.13.0]: https://github.com/florentfougeres/FlowNote/compare/0.12.0...0.13.0
[0.12.0]: https://github.com/florentfougeres/FlowNote/compare/0.11.0...0.12.0
[0.11.0]: https://github.com/florentfougeres/FlowNote/compare/0.10.0...0.11.0
[0.10.0]: https://github.com/florentfougeres/FlowNote/compare/0.9.0...0.10.0
[0.9.0]: https://github.com/florentfougeres/FlowNote/compare/0.8.0...0.9.0
[0.8.0]: https://github.com/florentfougeres/FlowNote/compare/0.7.2...0.8.0
[0.7.2]: https://github.com/florentfougeres/FlowNote/compare/0.7.1...0.7.2
[0.7.1]: https://github.com/florentfougeres/FlowNote/compare/0.7.0...0.7.1
[0.7.0]: https://github.com/florentfougeres/FlowNote/compare/0.6.0...0.7.0
[0.6.0]: https://github.com/florentfougeres/FlowNote/compare/0.5.2...0.6.0
[0.5.2]: https://github.com/florentfougeres/FlowNote/compare/0.5.1...0.5.2
[0.5.1]: https://github.com/florentfougeres/FlowNote/compare/0.5.0...0.5.1
[0.5.0]: https://github.com/florentfougeres/FlowNote/compare/0.4.0...0.5.0
[0.4.0]: https://github.com/florentfougeres/FlowNote/compare/0.3.1...0.4.0
[0.3.1]: https://github.com/florentfougeres/FlowNote/compare/0.3.0...0.3.1
[0.3.0]: https://github.com/florentfougeres/FlowNote/compare/0.2.0...0.3.0
[0.2.0]: https://github.com/florentfougeres/FlowNote/compare/0.1.0...0.2.0
[0.1.0]: https://github.com/florentfougeres/FlowNote/releases/tag/0.1.0
