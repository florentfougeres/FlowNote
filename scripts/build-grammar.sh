#!/usr/bin/env bash
# Builds the Grammalecte companion (src-tauri/binaries/flownote-grammar-<target>),
# a single executable bundled with the app. Grammalecte is downloaded once, at a
# pinned version checked by its SHA-256. Requires uv (https://docs.astral.sh/uv/).
set -euo pipefail

VERSION="2.3.0"
SHA256="aaa4219704857778038ecc1db18f6a907994c0125b8e762dcecc69130280684f"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="${TAURI_TARGET:-$(rustc -vV | sed -n 's/^host: //p')}"
OUT="${ROOT}/src-tauri/binaries/flownote-grammar-${TARGET}"
VENDOR="${ROOT}/grammar/.vendor"

if [[ -x "${OUT}" && "${1:-}" != "--force" ]]; then
  exit 0
fi

mkdir -p "${VENDOR}" "${ROOT}/src-tauri/binaries"
ZIP="${VENDOR}/Grammalecte-fr-v${VERSION}.zip"
if [[ ! -f "${ZIP}" ]]; then
  echo "Téléchargement de Grammalecte ${VERSION}…"
  curl -fsSL -o "${ZIP}" "https://grammalecte.net/zip/Grammalecte-fr-v${VERSION}.zip"
fi
echo "${SHA256}  ${ZIP}" | shasum -a 256 -c - >/dev/null
rm -rf "${VENDOR}/src" && mkdir -p "${VENDOR}/src" && unzip -q "${ZIP}" -d "${VENDOR}/src"

echo "Construction du correcteur (${TARGET})…"
cd "${VENDOR}"
PYTHONPATH="${VENDOR}/src" uv run --quiet --python 3.13 --with pyinstaller pyinstaller \
  --onefile --noconfirm --clean --log-level WARN \
  --name "flownote-grammar-${TARGET}" \
  --paths "${VENDOR}/src" \
  --collect-data grammalecte \
  --collect-submodules grammalecte \
  --add-data "${VENDOR}/src/LICENSE.txt:." \
  --distpath "${ROOT}/src-tauri/binaries" \
  --workpath "${VENDOR}/build" --specpath "${VENDOR}" \
  "${ROOT}/grammar/flownote_grammar.py"
echo "Correcteur prêt : ${OUT}"
