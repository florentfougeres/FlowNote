# Publier une version

Pousser un tag `vX.Y.Z` déclenche `.github/workflows/release.yml`. Le workflow lance les tests (`ci.yml`), construit le `.dmg` pour Apple Silicon, puis crée une release GitHub en **brouillon**. Il ne reste plus qu'à la publier.

Toutes les commandes se lancent depuis la racine du dépôt.

## 1. Partir d'un `main` propre

```sh
git switch main
git pull
git status            # rien en attente
```

## 2. Vérifier

```sh
npm run lint
npm run typecheck
npm test
~/.cargo/bin/cargo test --manifest-path src-tauri/Cargo.toml
```

## 3. Changer la version

Choisir le numéro (Semantic Versioning) : correctif `0.15.1 → 0.15.2`, fonctionnalité `0.15.1 → 0.16.0`.

```sh
V=0.15.2

# package.json et package-lock.json
npm version "$V" --no-git-tag-version

# tauri.conf.json et Cargo.toml (une seule ligne de version dans chacun)
sed -i '' "s/^  \"version\": \".*\"/  \"version\": \"$V\"/" src-tauri/tauri.conf.json
sed -i '' "s/^version = \".*\"/version = \"$V\"/" src-tauri/Cargo.toml

# Cargo.lock
~/.cargo/bin/cargo update -p flownote --manifest-path src-tauri/Cargo.toml

# Contrôle : les cinq fichiers ont la nouvelle version
git diff --stat
```

## 4. Écrire le CHANGELOG

En tête de `CHANGELOG.md`, sous l'introduction :

```markdown
## [0.15.2] - 2026-10-19

### Ajouté
- …

### Corrigé
- …
```

Rubriques possibles (Keep a Changelog) : Ajouté, Modifié, Corrigé, Supprimé, Sécurité. Mettre à jour le `README.md` si une fonctionnalité visible change.

Ce qui a changé depuis la dernière version :

```sh
git log --oneline "$(git describe --tags --abbrev=0)"..HEAD
```

## 5. Commit, tag, push

```sh
git add -A
git commit -m "Version $V"
git push origin main
git tag "v$V"
git push origin "v$V"
```

## 6. Publier la release

1. Suivre le build : `gh run watch` (ou l'onglet *Actions* sur GitHub).
2. Ouvrir le brouillon : `gh release view "v$V" --web`.
3. Vérifier les notes, puis cliquer sur **Publish release**.

## En cas de problème

- **Le build échoue** : corriger sur `main`, supprimer le brouillon s'il existe, puis déplacer le tag sur le nouveau commit :
  ```sh
  gh release delete "v$V" --yes
  git tag -d "v$V" && git push origin ":refs/tags/v$V"
  git tag "v$V" && git push origin "v$V"
  ```
- **Relancer un build sans rien changer** : `gh run list --workflow release.yml`, puis `gh run rerun <id> --failed`.
- **Construire le `.dmg` en local**, sans GitHub : voir le README.
