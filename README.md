<p align="center">
  <img src="assets/icon.png" width="128" alt="Icône de FlowNote">
</p>

<h1 align="center">FlowNote</h1>

<p align="center">
  L'édition par blocs de Notion, directement sur votre vault Obsidian.<br>
  Vos fichiers Markdown restent la seule source de vérité.
</p>

---

FlowNote est une application de bureau macOS qui ouvre un dossier de notes Obsidian et permet de les éditer comme dans Notion : blocs, menu `/`, glisser-déposer, tableaux, callouts… Il n'y a ni base de données ni format caché : chaque note reste un fichier `.md` que vous pouvez continuer à ouvrir dans Obsidian, sans plugin.

Un gestionnaire Git intégré permet de versionner le vault : statut, diff, commit, pull/push, historique d'une note et résolution des conflits.

## Fonctionnalités

**Éditeur de blocs**
- Titres, listes, tâches, citations, callouts Obsidian (`> [!note]`), toggles (callouts repliables), séparateurs
- Menu `/` pour insérer ou transformer un bloc, raccourcis Markdown à la frappe (`#`, `-`, `[]`, `>`, ```` ``` ````)
- Poignée de bloc : glisser-déposer avec imbrication, dupliquer, transformer, supprimer
- Mise en forme en ligne : gras, italique, barré, surligné, code, liens
- Tableaux éditables avec poignées de lignes et de colonnes (insérer, déplacer, aligner, supprimer)
- Blocs de code avec coloration syntaxique, diagrammes **Mermaid**, maths, emoji (`:calendrier`)
- Propriétés YAML (frontmatter) éditables, tags, `[[wikilinks]]` et `![[embeds]]` avec autocomplétion
- Sous-pages et arborescence dans la barre latérale

**Navigation**
- Recherche de page (`⌘P`), recherche et remplacement dans la note (`⌘F` / `⌘⌥F`), recherche dans tout le vault (`⌘⇧F`)
- Fil d'Ariane cliquable, plan de la note, historique précédent/suivant
- Mode Markdown brut (`⌘⇧E`) avec numéros de ligne

**Git**
- Statut, diff, indexation et commit
- Pull (par fusion) et push
- Historique d'une note et restauration d'une version
- Résolution simple des conflits de fusion

## Compatibilité avec Obsidian

C'est le cœur du projet : **une note que FlowNote n'a pas modifiée est réécrite à l'octet près**, et une note modifiée ne change que dans les blocs touchés. Le reste du fichier (espacements, style des listes, marqueurs, fins de ligne, BOM…) est conservé tel quel.

- Frontmatter YAML, `[[wikilinks]]`, `![[embeds]]`, `#tags`, pièces jointes : tout reste lisible et éditable dans Obsidian.
- Les blocs sans équivalent Markdown standard utilisent une syntaxe qu'Obsidian affiche nativement (callouts pour les toggles, blocs ```` ```mermaid ````…).
- Le dossier `.obsidian` n'est jamais modifié. FlowNote lit seulement ses réglages de liens et de pièces jointes.
- Une note modifiée ailleurs (Obsidian, git) n'est jamais écrasée : l'écriture est refusée et la différence est signalée.

## Installation

1. Téléchargez le fichier `FlowNote_x.y.z_aarch64.dmg` depuis la page [Releases](https://github.com/florentfougeres/FlowNote/releases).
2. Ouvrez le `.dmg` et glissez FlowNote dans le dossier **Applications**.
3. **Premier lancement** : l'application n'est pas encore signée par un certificat Apple Developer, donc macOS la bloque. Ouvrez *Réglages Système → Confidentialité et sécurité*, puis cliquez sur **Ouvrir quand même** en face de FlowNote. Si macOS indique que l'application « est endommagée », exécutez une fois :

   ```sh
   xattr -cr /Applications/FlowNote.app
   ```

Configuration requise : Mac Apple Silicon (M1 et suivants), macOS 11 (Big Sur) ou plus récent. Git doit être installé pour utiliser les fonctions Git (`xcode-select --install` ou Homebrew).

## Développement

Prérequis : [Node.js](https://nodejs.org) 20+, [Rust](https://rustup.rs) et les outils en ligne de commande Xcode.

```sh
npm install
npm run tauri dev      # application de bureau avec rechargement à chaud
npm run dev            # version navigateur (Chrome) sur http://localhost:1420
```

| Commande | Rôle |
| --- | --- |
| `npm test` | Tests unitaires (Vitest) |
| `npm run typecheck` | Vérification TypeScript |
| `npm run fidelity -- <vault>` | Vérifie, en lecture seule, que chaque note d'un vault est réécrite à l'identique |
| `npm run tauri build` | Construit `FlowNote.app` et le `.dmg` dans `src-tauri/target/release/bundle/` |

### Architecture

- **`src-tauri/`** : backend Rust (Tauri 2). Il gère l'accès aux fichiers du vault, le Git système et la recherche plein texte.
- **`src/markdown/`** : moteur de fidélité Markdown. Il parse avec remark/mdast, conserve la source de chaque bloc et ne re-sérialise que les blocs modifiés, en vérifiant l'équivalence.
- **`src/editor/`** : éditeur basé sur Tiptap/ProseMirror. Il contient le schéma, les vues de blocs, le menu `/`, le glisser-déposer, les poignées de tableau et la recherche.
- **`src/vault/`** : accès au vault, résolution des liens façon Obsidian, opérations sur les pages et client Git.

### Publier une version

1. Mettez à jour la version dans `package.json`, `src-tauri/tauri.conf.json` et `src-tauri/Cargo.toml`.
2. Commitez, puis poussez un tag : `git tag v0.2.0 && git push origin v0.2.0`.
3. Le workflow GitHub Actions construit le `.dmg` (Apple Silicon) et prépare une release en brouillon. Relisez-la, puis publiez-la sur GitHub.

## Licence

[MIT](LICENSE) © 2026 Florent Fougères
