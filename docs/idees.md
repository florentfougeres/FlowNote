# Idées de fonctionnalités

Des pistes repérées en octobre 2026 en comparant FlowNote à Obsidian (cœur et plugins populaires) et à d'autres outils de notes. Rien n'est commencé. Chaque idée doit rester du texte lisible dans Obsidian.

En cours : réorganiser les sections depuis le Plan, les colonnes de blocs.

## Obsidian, de base

- **PDF, audio et vidéo intégrés** : `![[devis.pdf#page=2]]`, `![[mémo.m4a]]`, `![[demo.mp4]]`. Aujourd'hui seules les images s'affichent dans une note (`IMAGE_EXTENSIONS` dans `vault/links.ts`), et un PDF du vault ne s'ouvre pas dans un onglet.
- **Graphe local et liens sortants** : le graphe autour de la note ouverte (1 ou 2 niveaux) ; à côté des notes liées, les liens qui partent de la note, y compris vers des notes qui n'existent pas encore.
- **Récupération de fichiers** : des copies locales automatiques (comme le module « Récupération de fichiers » d'Obsidian), hors du vault, pour un vault sans Git ou des modifications pas encore commitées.

## Plugins populaires

- **Dates en langage naturel** (Natural Language Dates) : `@demain`, `@vendredi prochain`, `@dans 2 semaines` deviennent une date ; utile pour `📅` et les tâches.
- **Typographie française** (dans l'esprit de Linter) : espace insécable avant `; : ! ?`, guillemets « », apostrophe ’, points de suspension, à la frappe. Va avec Grammalecte.
- **Suivi du temps et pomodoro de TaskNotes** : le format prévoit `timeEntries` ; un bouton ▶︎ sur une tâche, le temps passé face à `timeEstimate`.
- **Capture rapide** (QuickAdd) : un raccourci global du système ouvre une petite fenêtre flottante pour noter une idée ou une tâche, FlowNote en arrière-plan.
- **Notes chiffrées** au format du plugin Meld Encrypt, ouvertes par mot de passe.

## D'autres outils

- **Clipper web** (Evernote, Bear), remis à plus tard (trop de travail pour l'instant). Choix déjà faits : dans ce dépôt (`clipper/`) ; l'extension n'envoie que l'adresse et la sélection par `flownote://clip?…`, l'app télécharge la page (`web.rs`), en extrait l'article et le convertit en Markdown ; une petite fenêtre propose une note dans « Clippings » (source, auteur, date en propriétés) ou un lien dans les Lectures. Limite : les pages derrière une connexion. Navigateurs à choisir.
- **Outliner** (Workflowy, Logseq) : replier les éléments de liste (seuls les titres se replient), zoomer dans une puce (son sous-arbre occupe la page), `⌘⇧↑` / `⌘⇧↓` pour déplacer une branche.
- **Écriture** (iA Writer, Ulysses) : défilement machine à écrire, phrase courante mise en avant dans le mode focus, objectif de mots par note dans la pastille d'état.
- **OCR** (Evernote) : le texte des images et des PDF scannés trouvable par `⌘⇧F`, par l'API Vision de macOS côté Rust ; un index à part, rien d'écrit dans le vault.
- **Rappels de tâches** : une notification du système à l'échéance ou à l'heure prévue d'une tâche.

## À reconsidérer

- **Note du jour et notes périodiques** (Daily Notes, Periodic Notes, Calendar), écartée jusqu'ici : l'usage le plus courant d'Obsidian et de Logseq ; le calendrier des tâches et les modèles sont déjà là.
