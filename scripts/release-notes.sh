#!/bin/sh
# Body of the GitHub release of a version: its section of CHANGELOG.md, then
# the first-launch note. Used by .github/workflows/release.yml.
#   scripts/release-notes.sh 0.16.0
set -eu
version="$1"
root="$(cd "$(dirname "$0")/.." && pwd)"

section="$(awk -v v="$version" '
  index($0, "## [" v "]") == 1 { found = 1; next }
  found && /^## \[/ { exit }
  found && /^\[[0-9.]+\]: / { exit }
  found { print }
' "$root/CHANGELOG.md" | sed -e '/./,$!d' | sed -e :a -e '/^\n*$/{$d;N;ba' -e '}')"

if [ -z "$section" ]; then
  echo "Pas de section [$version] dans CHANGELOG.md" >&2
  exit 1
fi

printf '%s\n\n---\n\nPour Mac Apple Silicon (M1 et suivants).\n\nPremier lancement : l'"'"'application n'"'"'est pas signée par Apple. Ouvrez *Réglages Système → Confidentialité et sécurité* puis **Ouvrir quand même**, ou lancez `xattr -cr /Applications/FlowNote.app`.\n' "$section"
