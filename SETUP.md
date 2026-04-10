# UxPlay Tray - Hướng Dẫn Cài Đặt

## Yêu Cầu
- Go 1.16+
- uxplay đã cài đặt (`sudo apt install uxplay`)
- Linux với systemd (Ubuntu, Fedora, Debian, etc.)

## Bước 1: Build Ứng Dụng

```bash
cd ~/uxplay-tray
go build -o uxplay-tray
chmod +x uxplay-tray
```

## Bước 2: Cài Đặt Systemd Service (Auto Start)

```bash
# Copy service file vào thư mục systemd user
mkdir -p ~/.config/systemd/user
cp uxplay-tray.service ~/.config/systemd/user/

# Reload systemd daemon
systemctl --user daemon-reload

# Enable service để tự động start khi login
systemctl --user enable uxplay-tray.service

# Start service ngay
systemctl --user start uxplay-tray.service
```

## Bước 3: Cài Đặt Desktop Entry (Hiển thị trong App Menu)

```bash
# Tạo thư mục applications nếu chưa có
mkdir -p ~/.local/share/applications

# Copy desktop file
cp uxplay-tray.desktop ~/.local/share/applications/

# Update desktop database
update-desktop-database ~/.local/share/applications/
```

## Bước 4: Kiểm Tra

```bash
# Kiểm tra service status
systemctl --user status uxplay-tray.service

# Xem logs
journalctl --user -u uxplay-tray.service -f

# Liệt kê UxPlay process
pgrep -o uxplay
```

## Cách Sử Dụng

1. **Chạy tay:**
   ```bash
   ~/uxplay-tray/uxplay-tray
   ```

2. **Auto start:** Đã enable qua systemd, sẽ tự start khi login

3. **Từ App Menu:** Tìm "UxPlay Tray" trong ứng dụng

## Quản Lý Service

```bash
# Stop service
systemctl --user stop uxplay-tray.service

# Restart service
systemctl --user restart uxplay-tray.service

# Disable auto start
systemctl --user disable uxplay-tray.service

# View logs
journalctl --user -u uxplay-tray.service -n 50
```

## Troubleshooting

**Q: App không start?**
- Kiểm tra: `journalctl --user -u uxplay-tray.service -f`
- Đảm bảo uxplay đã cài: `which uxplay`

**Q: UxPlay không bật được?**
- Chạy manual: `uxplay -n "Ubuntu AirPlay"`
- Kiểm tra error message

**Q: Muốn xóa?**
```bash
systemctl --user disable uxplay-tray.service
rm ~/.config/systemd/user/uxplay-tray.service
rm ~/.local/share/applications/uxplay-tray.desktop
rm ~/uxplay-tray/uxplay-tray
```
