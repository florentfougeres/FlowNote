#!/usr/bin/env bash
# Puts the uv binary bundled with the app (notebooks: Python environments and
# kernels) in src-tauri/binaries/uv-<target>. Pinned release, checked by SHA-256.
set -euo pipefail

VERSION="0.13.0"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="${TAURI_TARGET:-$(rustc -vV | sed -n 's/^host: //p')}"
OUT="${ROOT}/src-tauri/binaries/uv-${TARGET}"

case "${TARGET}" in
  aarch64-apple-darwin) SHA256="a9c1b29002cf3c83f07fa9cd8a887a3be0107d90e23189721221e7257db8e3d6" ;;
  *) echo "Pas de binaire uv prévu pour ${TARGET}" >&2; exit 1 ;;
esac

if [[ -x "${OUT}" && "${1:-}" != "--force" ]]; then
  exit 0
fi

ARCHIVE="uv-${TARGET}.tar.gz"
WORK="$(mktemp -d)"
trap 'rm -rf "${WORK}"' EXIT
echo "Téléchargement de uv ${VERSION}…"
curl -fsSL -o "${WORK}/${ARCHIVE}" "https://github.com/astral-sh/uv/releases/download/${VERSION}/${ARCHIVE}"
echo "${SHA256}  ${WORK}/${ARCHIVE}" | shasum -a 256 -c - >/dev/null
tar -xzf "${WORK}/${ARCHIVE}" -C "${WORK}"
mkdir -p "${ROOT}/src-tauri/binaries"
cp "${WORK}/uv-${TARGET}/uv" "${OUT}"
chmod +x "${OUT}"
echo "uv prêt : ${OUT}"
