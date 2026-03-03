#!/bin/bash
# RefDrop macOS Installer
# Registers NativeMessaging host for Chrome.

set -e

EXTENSION_ID="${1:-PLACEHOLDER_EXTENSION_ID}"
INSTALL_DIR="$HOME/Library/Application Support/RefDrop"
EXE_PATH="$INSTALL_DIR/refdrop_helper"
MANIFEST_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
MANIFEST_PATH="$MANIFEST_DIR/com.refdrop.helper.json"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "RefDrop Installer"
echo "Installing to: $INSTALL_DIR"

# 1. Create directories
mkdir -p "$INSTALL_DIR"
mkdir -p "$MANIFEST_DIR"

# 2. Copy binary
SOURCE_EXE="$SCRIPT_DIR/refdrop_helper"
if [ ! -f "$SOURCE_EXE" ]; then
    echo "Error: refdrop_helper binary not found next to install.sh" >&2
    exit 1
fi
cp "$SOURCE_EXE" "$EXE_PATH"
chmod +x "$EXE_PATH"
echo "  Copied helper to $EXE_PATH"

# 3. Write NativeMessaging manifest
cat > "$MANIFEST_PATH" <<EOF
{
  "name": "com.refdrop.helper",
  "description": "RefDrop Helper - bridges Chrome to PureRef",
  "path": "$EXE_PATH",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://$EXTENSION_ID/"
  ]
}
EOF
echo "  Wrote manifest to $MANIFEST_PATH"

echo ""
echo "Installation complete."
echo "Restart Chrome if it was already open."
