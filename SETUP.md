# UxPlay Tray - Hướng Dẫn Cài Đặt

## Cài nhanh bằng `.deb`

```bash
./packaging/build-deb.sh
sudo apt install ./dist/uxplay-tray_*_$(dpkg --print-architecture).deb
```

Sau khi cài bằng `apt`:
- `uxplay` và các runtime dependency chính sẽ được cài kèm
- app có desktop entry để mở từ app menu
- app có autostart để tự chạy sau khi đăng nhập
- GNOME extension có thể gọi daemon qua D-Bus mà không cần `systemctl --user enable`

Lưu ý:
- nên dùng `apt install ./file.deb`, không dùng `dpkg -i` nếu muốn APT tự kéo dependency
- nếu vừa cài trong phiên hiện tại, chỉ cần mở `UxPlay Tray` một lần hoặc đăng xuất/đăng nhập lại
- nếu muốn nút trên top bar thì vẫn cần bật extension trong app `Extensions`

## Cài từ source với `install.sh`

```bash
./install.sh
```

Script này sẽ:
- cài dependency cần để build và chạy
- build binary Go
- cài binary vào `/usr/local/bin/uxplay-tray`
- cài D-Bus activation vào `~/.local/share/dbus-1/services`
- cài autostart vào `~/.config/autostart`
- cài desktop entry, icon và GNOME Shell extension cho user hiện tại

## Kiểm tra

```bash
which uxplay
which uxplay-tray
pgrep -af uxplay-tray
gdbus introspect --session --dest org.uxplay.Tray --object-path /org/uxplay/Tray
```

## Gỡ cài đặt

```bash
./uninstall.sh
```

Script này sẽ:
- tắt `uxplay-tray` và `uxplay` đang chạy
- disable extension nếu đang bật
- `purge` package `.deb` nếu đang cài theo APT
- dọn luôn các file local nếu trước đó từng cài bằng `install.sh`

Nếu muốn gỡ luôn dependency không còn dùng:

```bash
sudo apt autoremove
```
