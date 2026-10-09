#!/bin/bash
# One-time setup on macOS (Apple Silicon): a debuggable COPY of FM26 plus the Frida venv.
# The Steam installation is never modified. Read bridge/README.md before running.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
SRC="${FM26_STEAM_APP:-$HOME/Library/Application Support/Steam/steamapps/common/Football Manager 26/fm.app}"
DEST="${FM26_GAME_COPY:-$HOME/fm26-debug/fm.app}"
VENV="${FM26_VENV:-$HOME/fm26-debug/venv}"

[ -d "$SRC" ] || { echo "FM26 not found at: $SRC (set FM26_STEAM_APP)"; exit 1; }
echo "This copies FM26 to:   $DEST"
echo "and re-signs the COPY (ad hoc) with: get-task-allow, disable-library-validation,"
echo "allow-unsigned-executable-memory (needed for Frida to attach). Steam's copy is untouched."
read -r -p "Continue? [y/N] " ok; [ "$ok" = "y" ] || exit 1

mkdir -p "$(dirname "$DEST")"
rm -rf "$DEST"
cp -cR "$SRC" "$DEST"   # APFS clone: fast, no extra disk space
# Sign nested code first, then the app with the entitlements.
find "$DEST/Contents" \( -name "*.dylib" -o -name "*.so" -o -name "*.bundle" -o -name "*.framework" \) -print0 \
  | xargs -0 -I{} codesign --force --sign - "{}"
codesign --force --sign - --entitlements "$HERE/debug.entitlements.plist" "$DEST"
codesign --verify --deep --strict "$DEST" && echo "Signed: $DEST"

python3 -m venv "$VENV"
"$VENV/bin/pip" install --no-cache-dir --no-deps --only-binary=:all: --require-hashes -r "$HERE/requirements-macos-arm64.txt"
echo
echo "Done. Launch the copy (not Steam's):  open \"$DEST\""
echo "Then start the bridge:                \"$VENV/bin/python\" bridge/server.py"
