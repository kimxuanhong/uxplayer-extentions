#!/usr/bin/env bash

set -euo pipefail

echo "================================"
echo "UxPlay Tray Uninstaller"
echo "================================"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_status() {
    echo -e "${GREEN}[✓]${NC} $1"
}

print_error() {
    echo -e "${RED}[✗]${NC} $1"
}

print_info() {
    echo -e "${YELLOW}[i]${NC} $1"
}

if [[ "$OSTYPE" != "linux-gnu"* ]]; then
    print_error "This script only works on Linux"
    exit 1
fi

remove_if_exists() {
    local path="$1"
    if [[ -e "$path" ]]; then
        rm -rf "$path"
        print_status "Removed $path"
    fi
}

print_info "Stopping running processes..."
pkill -f '/usr/local/bin/uxplay-tray' || true
pkill -f '/usr/bin/uxplay-tray' || true
pkill -x uxplay || true
print_status "Processes stopped"

print_info "Disabling GNOME Shell extension..."
gnome-extensions disable uxplay-toggle@xuanhong >/dev/null 2>&1 || true
print_status "Extension disabled if it was enabled"

if dpkg -s uxplay-tray >/dev/null 2>&1; then
    print_info "Removing installed Debian package..."
    sudo apt-get purge -y uxplay-tray
    print_status "Debian package removed"
else
    print_info "Debian package not installed, skipping package removal"
fi

print_info "Removing local installation files..."
remove_if_exists "$HOME/.local/share/dbus-1/services/org.uxplay.Tray.service"
remove_if_exists "$HOME/.config/autostart/uxplay-tray.desktop"
remove_if_exists "$HOME/.local/share/applications/uxplay-tray.desktop"
remove_if_exists "$HOME/.local/share/icons/hicolor/scalable/apps/uxplay-tray.svg"
remove_if_exists "$HOME/.local/share/gnome-shell/extensions/uxplay-toggle@xuanhong"

if [[ -e /usr/local/bin/uxplay-tray ]]; then
    sudo rm -f /usr/local/bin/uxplay-tray
    print_status "Removed /usr/local/bin/uxplay-tray"
fi

echo ""
print_status "Uninstall completed"
echo ""
echo "Optional cleanup:"
echo "  sudo apt autoremove"
echo ""
echo "If GNOME still shows the top-bar icon, log out and log back in."
