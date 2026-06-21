#!/usr/bin/env bash
# Build and install the Nothing Ear Controller GNOME extension from this checkout.
set -euo pipefail

UUID="nothing-ear-controller@LuanAdemi"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

for tool in glib-compile-schemas zip gnome-extensions; do
    if ! command -v "$tool" >/dev/null 2>&1; then
        echo "Missing required tool: $tool" >&2
        exit 1
    fi
done

echo "Compiling GSettings schema..."
glib-compile-schemas schemas/

echo "Packaging $UUID.zip..."
rm -f "$UUID.zip"
zip -q "$UUID.zip" \
    extension.js prefs.js controller.py metadata.json \
    schemas/org.gnome.shell.extensions.nothing-ear-controller.gschema.xml \
    schemas/gschemas.compiled

echo "Installing extension..."
gnome-extensions install --force "$UUID.zip"
rm -f "$UUID.zip"

echo
echo "Installed. On Wayland, log out and back in to load it. Then enable with:"
echo "  gnome-extensions enable $UUID"
echo "Configure it (device, placement) with:"
echo "  gnome-extensions prefs $UUID"
