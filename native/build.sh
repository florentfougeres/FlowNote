#!/bin/sh
# Builds the native shell: native/build/FlowNote Swift.app (Apple Silicon, signed ad hoc),
# installed beside the Tauri app ("FlowNote").
#   native/build.sh          build the web app, then the shell
#   native/build.sh --open   …and launch it
set -e
cd "$(dirname "$0")/.."
export DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"

npx vite build
swift build -c release --package-path native --product FlowNote

app="native/build/FlowNote Swift.app"
rm -rf "$app"
mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources"
cp "native/.build/release/FlowNote" "$app/Contents/MacOS/FlowNote"
cp -R dist "$app/Contents/Resources/web"
cp src-tauri/icons/icon.icns "$app/Contents/Resources/FlowNote.icns"
# The Grammalecte companion (scripts/build-grammar.sh), started by Grammar.swift.
grammar=$(ls src-tauri/binaries/flownote-grammar-* 2>/dev/null | head -1)
[ -n "$grammar" ] && cp "$grammar" "$app/Contents/MacOS/flownote-grammar"
version=$(node -p "require('./package.json').version")
cat > "$app/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>FlowNote Swift</string>
  <key>CFBundleDisplayName</key><string>FlowNote Swift</string>
  <key>CFBundleIdentifier</key><string>com.flownote.swift</string>
  <key>CFBundleExecutable</key><string>FlowNote</string>
  <key>CFBundleIconFile</key><string>FlowNote</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>$version</string>
  <key>CFBundleVersion</key><string>$version</string>
  <key>LSMinimumSystemVersion</key><string>26.0</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>CFBundleDevelopmentRegion</key><string>fr</string>
</dict>
</plist>
PLIST
codesign --force --deep --sign - "$app"
echo "→ $app"
[ "$1" = "--open" ] && open "$app"
exit 0
