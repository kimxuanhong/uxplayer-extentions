#!/usr/bin/env bash

set -euo pipefail

echo "================================"
echo "UxPlay Tray Installer"
echo "================================"

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Helper functions
print_status() {
    echo -e "${GREEN}[✓]${NC} $1"
}

print_error() {
    echo -e "${RED}[✗]${NC} $1"
}

print_info() {
    echo -e "${YELLOW}[i]${NC} $1"
}

# Check if running on Linux
if [[ "$OSTYPE" != "linux-gnu"* ]]; then
    print_error "This script only works on Linux"
    exit 1
fi

# Get the directory where the script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 1. Update system packages
print_info "Updating system packages..."
sudo apt-get update
print_status "System packages updated"

# 2. Install dependencies
print_info "Installing build and runtime dependencies..."
sudo apt-get install -y \
    golang-go \
    uxplay \
    gstreamer1.0-plugins-good \
    gstreamer1.0-pulseaudio \
    gstreamer1.0-plugins-bad
print_status "Dependencies installed"

# 3. Build the Go application
print_info "Building UxPlay Tray daemon..."
cd "$SCRIPT_DIR"
if [ -f "go.mod" ]; then
    go build -o uxplay-tray .
    print_status "UxPlay Tray daemon built successfully"
else
    print_error "go.mod not found in $SCRIPT_DIR"
    exit 1
fi

# 4. Install the daemon
print_info "Installing UxPlay Tray daemon..."
sudo install -Dm755 uxplay-tray /usr/local/bin/uxplay-tray
print_status "Daemon installed to /usr/local/bin/uxplay-tray"

# 5. Install D-Bus activation
print_info "Installing D-Bus activation service..."
mkdir -p "$HOME/.local/share/dbus-1/services"
sed 's|/usr/bin/uxplay-tray|/usr/local/bin/uxplay-tray|g' \
    "$SCRIPT_DIR/org.uxplay.Tray.service" \
    > "$HOME/.local/share/dbus-1/services/org.uxplay.Tray.service"
print_status "D-Bus activation installed"

# 6. Install session autostart
print_info "Installing session autostart entry..."
mkdir -p "$HOME/.config/autostart"
sed 's|/usr/bin/uxplay-tray|/usr/local/bin/uxplay-tray|g' \
    "$SCRIPT_DIR/uxplay-tray-autostart.desktop" \
    > "$HOME/.config/autostart/uxplay-tray.desktop"
print_status "Autostart entry installed"

# 7. Install GNOME Shell extension
print_info "Installing GNOME Shell extension..."
EXT_DIR="$HOME/.local/share/gnome-shell/extensions/uxplay-toggle@xuanhong"
mkdir -p "$EXT_DIR"

# Copy extension files
cp -r "$SCRIPT_DIR/extensions/uxplay-toggle@xuanhong"/* "$EXT_DIR/"
print_status "Extension installed to $EXT_DIR"

# 8. Copy desktop file
print_info "Installing desktop entry..."
mkdir -p "$HOME/.local/share/applications"
sed 's|/usr/bin/uxplay-tray|/usr/local/bin/uxplay-tray|g' \
    "$SCRIPT_DIR/uxplay-tray.desktop" \
    > "$HOME/.local/share/applications/uxplay-tray.desktop"

print_info "Installing application icon..."
mkdir -p "$HOME/.local/share/icons/hicolor/scalable/apps"
cp "$SCRIPT_DIR/icons/overlapping-windows-symbolic.svg" "$HOME/.local/share/icons/hicolor/scalable/apps/uxplay-tray.svg"
print_status "Desktop entry installed"

# 9. Summary
echo ""
echo "================================"
print_status "Installation completed!"
echo "================================"
echo ""
echo "Next steps:"
echo "1. Restart GNOME Shell (Alt+F2, type 'r', press Enter)"
echo "   OR log out and log back in"
echo ""
echo "2. Open 'UxPlay Tray' once from the app menu if you want to use it immediately"
echo ""
echo "3. Enable the extension in GNOME Extensions app if you want the top bar toggle"
echo ""
echo "4. Check process if needed:"
echo "   pgrep -af uxplay-tray"
echo ""
