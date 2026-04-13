#!/bin/bash

set -e

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
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# 1. Update system packages
print_info "Updating system packages..."
sudo apt-get update
print_status "System packages updated"

# 2. Install dependencies
print_info "Installing dependencies..."
sudo apt-get install -y \
    golang-go \
    gstreamer1.0-plugins-base \
    gstreamer1.0-plugins-good \
    gstreamer1.0-plugins-bad \
    gstreamer1.0-pulseaudio \
    libavahi-client3 \
    libavahi-common3 \
    libplist3 \
    libsodium23 \
    openssl
print_status "Dependencies installed"

# 3. Install UxPlay from apt
print_info "Installing UxPlay..."
sudo apt-get install -y uxplay
print_status "UxPlay installed"

# 4. Build the Go application
print_info "Building UxPlay Tray daemon..."
cd "$SCRIPT_DIR"
if [ -f "go.mod" ]; then
    go build -o uxplay-tray main.go
    print_status "UxPlay Tray daemon built successfully"
else
    print_error "go.mod not found in $SCRIPT_DIR"
    exit 1
fi

# 5. Install the daemon
print_info "Installing UxPlay Tray daemon..."
sudo cp uxplay-tray /usr/local/bin/
sudo chmod +x /usr/local/bin/uxplay-tray
print_status "Daemon installed to /usr/local/bin/uxplay-tray"

# 6. Install systemd service
print_info "Installing systemd service..."
mkdir -p ~/.config/systemd/user/
cp "$SCRIPT_DIR/uxplay-tray.service" ~/.config/systemd/user/uxplay-tray.service

# Update the service file to use the correct path
sed -i "s|ExecStart=.*|ExecStart=/usr/local/bin/uxplay-tray|g" ~/.config/systemd/user/uxplay-tray.service

systemctl --user daemon-reload
systemctl --user enable uxplay-tray.service
print_status "Systemd service installed and enabled"

# 7. Install GNOME Shell extension
print_info "Installing GNOME Shell extension..."
EXT_DIR="$HOME/.local/share/gnome-shell/extensions/uxplay-toggle@xuanhong"
mkdir -p "$EXT_DIR"

# Copy extension files
cp -r "$SCRIPT_DIR/extensions/uxplay-toggle@xuanhong"/* "$EXT_DIR/"
print_status "Extension installed to $EXT_DIR"

# 8. Copy desktop file
print_info "Installing desktop entry..."
mkdir -p ~/.local/share/applications/
cp "$SCRIPT_DIR/uxplay-tray.desktop" ~/.local/share/applications/
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
echo "2. Enable the extension in GNOME Extensions app"
echo ""
echo "3. Start the daemon manually:"
echo "   systemctl --user start uxplay-tray.service"
echo ""
echo "4. Check daemon status:"
echo "   systemctl --user status uxplay-tray.service"
echo ""
echo "5. View daemon logs:"
echo "   journalctl --user -u uxplay-tray.service -f"
echo ""
