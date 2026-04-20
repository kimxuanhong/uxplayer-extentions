#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

PACKAGE_NAME="uxplay-tray"
VERSION="${1:-}"
RUNTIME_DEPENDS=(
    "libc6"
    "uxplay"
    "gstreamer1.0-plugins-good"
    "gstreamer1.0-pulseaudio"
)
RUNTIME_RECOMMENDS=(
    "gstreamer1.0-plugins-bad"
    "gnome-shell"
)

if [[ -z "$VERSION" ]]; then
    if git -C "$REPO_DIR" describe --tags --dirty --always >/dev/null 2>&1; then
        VERSION="$(git -C "$REPO_DIR" describe --tags --always | sed 's/^v//; s/-/+/g')"
    else
        VERSION="0.1.0+$(date +%Y%m%d)"
    fi
fi

ARCH="$(dpkg --print-architecture)"
BUILD_ROOT="$REPO_DIR/dist/.deb-build"
STAGE_DIR="$BUILD_ROOT/${PACKAGE_NAME}_${VERSION}_${ARCH}"
OUTPUT_DEB="$REPO_DIR/dist/${PACKAGE_NAME}_${VERSION}_${ARCH}.deb"

rm -rf "$STAGE_DIR"
mkdir -p "$STAGE_DIR/DEBIAN"

install -d \
    "$STAGE_DIR/usr/bin" \
    "$STAGE_DIR/usr/share/dbus-1/services" \
    "$STAGE_DIR/usr/share/applications" \
    "$STAGE_DIR/etc/xdg/autostart" \
    "$STAGE_DIR/usr/share/doc/$PACKAGE_NAME" \
    "$STAGE_DIR/usr/share/gnome-shell/extensions/uxplay-toggle@xuanhong" \
    "$STAGE_DIR/usr/share/icons/hicolor/scalable/apps"

go -C "$REPO_DIR" build -trimpath -ldflags="-s -w" -o "$STAGE_DIR/usr/bin/uxplay-tray" .

install -Dm644 "$REPO_DIR/uxplay-tray.desktop" "$STAGE_DIR/usr/share/applications/uxplay-tray.desktop"
install -Dm644 "$REPO_DIR/uxplay-tray-autostart.desktop" "$STAGE_DIR/etc/xdg/autostart/uxplay-tray.desktop"
install -Dm644 "$REPO_DIR/org.uxplay.Tray.service" "$STAGE_DIR/usr/share/dbus-1/services/org.uxplay.Tray.service"
install -Dm644 "$REPO_DIR/icons/overlapping-windows-symbolic.svg" "$STAGE_DIR/usr/share/icons/hicolor/scalable/apps/uxplay-tray.svg"
cp -a "$REPO_DIR/extensions/uxplay-toggle@xuanhong/." "$STAGE_DIR/usr/share/gnome-shell/extensions/uxplay-toggle@xuanhong/"
install -Dm644 "$REPO_DIR/SETUP.md" "$STAGE_DIR/usr/share/doc/$PACKAGE_NAME/README.md"

INSTALLED_SIZE="$(du -sk "$STAGE_DIR" | cut -f1)"
DEPENDS="$(IFS=', '; echo "${RUNTIME_DEPENDS[*]}")"
RECOMMENDS="$(IFS=', '; echo "${RUNTIME_RECOMMENDS[*]}")"

cat > "$STAGE_DIR/DEBIAN/control" <<EOF
Package: $PACKAGE_NAME
Version: $VERSION
Section: utils
Priority: optional
Architecture: $ARCH
Depends: $DEPENDS
Recommends: $RECOMMENDS
Maintainer: xuanhong
Installed-Size: $INSTALLED_SIZE
Description: UxPlay tray daemon with GNOME Shell toggle integration
 A small Go daemon that exposes UxPlay controls over D-Bus, ships
 a desktop entry, D-Bus activation, login autostart, and an optional GNOME Shell
 extension for quick start/stop access from the top panel.
EOF

mkdir -p "$(dirname "$OUTPUT_DEB")"
dpkg-deb --build --root-owner-group "$STAGE_DIR" "$OUTPUT_DEB" >/dev/null

printf 'Built package: %s\n' "$OUTPUT_DEB"
