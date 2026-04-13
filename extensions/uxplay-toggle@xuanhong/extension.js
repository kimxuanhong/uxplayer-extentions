const { Gio, GLib, St, Clutter, GObject } = imports.gi;
const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const ModalDialog = imports.ui.modalDialog;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const UxPlayDBusInterface = `
<node>
    <interface name="org.uxplay.Tray">
        <method name="Toggle">
            <arg type="b" name="status" direction="out"/>
        </method>
        <method name="Status">
            <arg type="b" name="status" direction="out"/>
        </method>
        <method name="IsSharing">
            <arg type="b" name="status" direction="out"/>
        </method>
        <method name="GetConfig">
            <arg type="s" name="config" direction="out"/>
        </method>
        <method name="SetConfig">
            <arg type="s" name="config" direction="in"/>
            <arg type="b" name="success" direction="out"/>
        </method>
        <signal name="SharingChanged">
            <arg type="b" name="status"/>
        </signal>
    </interface>
</node>`;

const UxPlayProxy = Gio.DBusProxy.makeProxyWrapper(UxPlayDBusInterface);

let toggleMenu;

const UxPlayToggle = GObject.registerClass(
class UxPlayToggle extends PanelMenu.Button {
    _init() {
        super._init(0.0, "UxPlayToggle");

        const iconPath = Me.dir.get_child('overlapping-windows-symbolic.svg').get_path();
        const iconFile = Gio.File.new_for_path(iconPath);
        this.customIcon = new Gio.FileIcon({ file: iconFile });

        this.icon = new St.Icon({
            gicon: this.customIcon,
            style_class: 'system-status-icon',
        });
        this.add_child(this.icon);

        this._proxy = new UxPlayProxy(
            Gio.DBus.session,
            'org.uxplay.Tray',
            '/org/uxplay/Tray'
        );

        // Lắng nghe signal SharingChanged
        this._proxy.connectSignal('SharingChanged', (proxy, senderName, [isSharing]) => {
            log(`[UxPlay] SharingChanged signal received: ${isSharing}`);
            if (isSharing) {
                this.icon.set_style("color: green;");
                this.icon.opacity = 255;
            } else {
                this.icon.set_style("color: white;");
                this.icon.opacity = 255;
            }
        });

        // Menu Toggle UxPlay
        this.toggleItem = new PopupMenu.PopupMenuItem('Starting Service...');
        this.toggleItem.connect('activate', () => {
            if (!this._proxy) return;
            this._proxy.ToggleRemote((result, error) => {
                if (!error) {
                    this._updateIconStatus();
                } else {
                    log(`[UxPlay] Lỗi Toggle: ${error.message}`);
                }
            });
        });
        this.menu.addMenuItem(this.toggleItem);

        // Menu Separator
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // Menu Settings - Server Name
        this.serverNameItem = new PopupMenu.PopupMenuItem('Server Name: UxPlay');
        this.serverNameItem.connect('activate', () => this._openServerNameDialog());
        this.menu.addMenuItem(this.serverNameItem);

        // Menu Settings - Resolution
        this.resolutionItem = new PopupMenu.PopupMenuItem('Resolution: 1920x1080@60');
        this.resolutionItem.connect('activate', () => this._openResolutionDialog());
        this.menu.addMenuItem(this.resolutionItem);

        // Menu Settings - FPS
        this.fpsItem = new PopupMenu.PopupMenuItem('Max FPS: 30');
        this.fpsItem.connect('activate', () => this._openFpsDialog());
        this.menu.addMenuItem(this.fpsItem);

        // Menu Settings - Audio Sink
        this.audioSinkItem = new PopupMenu.PopupMenuItem('Audio: autoaudiosink');
        this.audioSinkItem.connect('activate', () => this._openAudioSinkDialog());
        this.menu.addMenuItem(this.audioSinkItem);

        // Menu Settings - Video Sink
        this.videoSinkItem = new PopupMenu.PopupMenuItem('Video: autovideosink');
        this.videoSinkItem.connect('activate', () => this._openVideoSinkDialog());
        this.menu.addMenuItem(this.videoSinkItem);

        // Menu Settings - Flip
        this.flipItem = new PopupMenu.PopupMenuItem('Flip: None');
        this.flipItem.connect('activate', () => this._openFlipDialog());
        this.menu.addMenuItem(this.flipItem);

        // Menu Settings - Rotation
        this.rotationItem = new PopupMenu.PopupMenuItem('Rotation: None');
        this.rotationItem.connect('activate', () => this._openRotationDialog());
        this.menu.addMenuItem(this.rotationItem);

        // Menu Separator
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // Menu Quản lý Systemd Daemon
        this.daemonItem = new PopupMenu.PopupMenuItem('Starti Service');
        this.daemonItem.connect('activate', () => {
            if (this.isDaemonRunning) {
                GLib.spawn_command_line_async("systemctl --user stop uxplay-tray.service");
                this.daemonItem.label.set_text("Stoping Service...");
            } else {
                GLib.spawn_command_line_async("systemctl --user start uxplay-tray.service");
                this.daemonItem.label.set_text("Starting Service...");
            }
            setTimeout(() => this._updateIconStatus(), 2000); // Check lại sau 2 giây
        });
        this.menu.addMenuItem(this.daemonItem);

        this.menu.connect('open-state-changed', (menu, isOpen) => {
            if (isOpen) this._updateIconStatus();
        });

        this.isDaemonRunning = false;
        this._updateIconStatus();

        // Check định kỳ trạng thái nếu extension muốn tự cập nhật (ko bắt buộc)
        GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 3, () => {
            this._updateIconStatus();
            return true;
        });
    }

    _openServerNameDialog() {
        this._openInputDialog('Server Name', 'Enter UxPlay server name', 'UxPlay', (name) => {
            if (name) {
                this.serverNameItem.label.set_text(`Server Name: ${name}`);
                this._applyConfig({ serverName: name });
            }
        });
    }

    _openResolutionDialog() {
        this._openInputDialog('Resolution', 'Enter resolution (e.g. 1920x1080@60)', '1920x1080@60', (res) => {
            if (res && /^\d+x\d+(@\d+)?$/.test(res)) {
                this.resolutionItem.label.set_text(`Resolution: ${res}`);
                this._applyConfig({ resolution: res });
            } else {
                log('[UxPlay] Invalid resolution format');
            }
        });
    }

    _openFpsDialog() {
        this._openInputDialog('Maximum FPS', 'Enter maximum framerate (1-120)', '30', (fps) => {
            if (fps && /^\d+$/.test(fps) && parseInt(fps) > 0 && parseInt(fps) <= 120) {
                this.fpsItem.label.set_text(`Max FPS: ${fps}`);
                this._applyConfig({ fps: fps });
            } else {
                log('[UxPlay] Invalid FPS value');
            }
        });
    }

    _openAudioSinkDialog() {
        const options = [
            { label: 'Auto (default)', value: 'autoaudiosink' },
            { label: 'PulseAudio', value: 'pulsesink' },
            { label: 'ALSA', value: 'alsasink' },
            { label: 'Disabled', value: '0' }
        ];
        this._openSelectDialog('Audio Sink', options, (selected) => {
            this.audioSinkItem.label.set_text(`Audio: ${selected}`);
            this._applyConfig({ audioSink: selected });
        });
    }

    _openVideoSinkDialog() {
        const options = [
            { label: 'Auto (default)', value: 'autovideosink' },
            { label: 'X11', value: 'ximagesink' },
            { label: 'XV', value: 'xvimagesink' },
            { label: 'VAAPI', value: 'vaapisink' },
            { label: 'OpenGL', value: 'glimagesink' },
            { label: 'GTK', value: 'gtksink' },
            { label: 'Wayland', value: 'waylandsink' },
            { label: 'Video only', value: '0' }
        ];
        this._openSelectDialog('Video Sink', options, (selected) => {
            this.videoSinkItem.label.set_text(`Video: ${selected}`);
            this._applyConfig({ videoSink: selected });
        });
    }

    _openFlipDialog() {
        const options = [
            { label: 'None', value: '' },
            { label: 'Horizontal flip', value: 'H' },
            { label: 'Vertical flip', value: 'V' },
            { label: 'Both (180° rotation)', value: 'I' }
        ];
        this._openSelectDialog('Flip', options, (selected) => {
            const displayMap = { '': 'None', 'H': 'Horizontal', 'V': 'Vertical', 'I': 'Both (180°)' };
            this.flipItem.label.set_text(`Flip: ${displayMap[selected]}`);
            this._applyConfig({ flip: selected });
        });
    }

    _openRotationDialog() {
        const options = [
            { label: 'None', value: '' },
            { label: 'Rotate 90° Right (clockwise)', value: 'R' },
            { label: 'Rotate 90° Left (counter-clockwise)', value: 'L' }
        ];
        this._openSelectDialog('Rotation', options, (selected) => {
            const displayMap = { '': 'None', 'R': '90° Right', 'L': '90° Left' };
            this.rotationItem.label.set_text(`Rotation: ${displayMap[selected]}`);
            this._applyConfig({ rotation: selected });
        });
    }

    _openInputDialog(title, prompt, defaultValue, callback) {
        const dialog = new ModalDialog.ModalDialog();
        
        const mainBox = new St.BoxLayout({
            vertical: true,
            style_class: 'uxplay-input-dialog',
            width: 400,
            x_align: Clutter.ActorAlign.CENTER,
        });

        const titleLabel = new St.Label({
            text: title,
            style_class: 'uxplay-dialog-title',
        });
        mainBox.add_child(titleLabel);

        const promptLabel = new St.Label({
            text: prompt,
            style_class: 'uxplay-dialog-prompt',
        });
        mainBox.add_child(promptLabel);

        const entry = new St.Entry({
            hint_text: defaultValue,
            text: defaultValue,
            style_class: 'uxplay-dialog-entry',
            can_focus: true,
        });
        entry.set_width(350);
        mainBox.add_child(entry);

        dialog.contentLayout.add_child(mainBox);

        const doApply = () => {
            callback(entry.get_text());
            dialog.close();
        };

        // Connect Enter key
        entry.connect('key-press-event', (widget, event) => {
            const keyVal = event.get_key_symbol();
            if (keyVal === Clutter.KEY_Return || keyVal === Clutter.KEY_KP_Enter) {
                doApply();
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });

        dialog.setButtons([
            {
                label: 'Cancel',
                action: () => dialog.close(),
                key: Clutter.Escape,
            },
            {
                label: 'Apply',
                action: doApply,
                default: true,
            },
        ]);

        dialog.open();
        entry.grab_key_focus();
    }

    _openSelectDialog(title, options, callback) {
        const dialog = new ModalDialog.ModalDialog();
        
        const mainBox = new St.BoxLayout({
            vertical: true,
            style_class: 'uxplay-select-dialog',
            width: 400,
        });

        const titleLabel = new St.Label({
            text: title,
            style_class: 'uxplay-dialog-title',
        });
        mainBox.add_child(titleLabel);

        const scrollBox = new St.ScrollView({
            style_class: 'uxplay-dialog-scroll',
            height: Math.min(300, options.length * 40),
        });

        const itemBox = new St.BoxLayout({
            vertical: true,
            style_class: 'uxplay-dialog-items',
        });

        let selectedValue = options[0]?.value || '';

        options.forEach((opt) => {
            const button = new St.Button({
                label: opt.label,
                style_class: 'uxplay-dialog-option button',
                can_focus: true,
                x_align: Clutter.ActorAlign.FILL,
            });

            button.connect('clicked', () => {
                selectedValue = opt.value;
                callback(selectedValue);
                dialog.close();
            });

            itemBox.add_child(button);
        });

        scrollBox.add_actor(itemBox);
        mainBox.add_child(scrollBox);

        dialog.contentLayout.add_child(mainBox);

        dialog.setButtons([
            {
                label: 'Cancel',
                action: () => dialog.close(),
                key: Clutter.Escape,
            },
        ]);

        dialog.open();
    }

    _applyConfig(config) {
        if (!this._proxy) return;
        
        const configStr = JSON.stringify({
            serverName: config.serverName || '',
            resolution: config.resolution || '',
            fps: config.fps || '',
            audioSink: config.audioSink || 'autoaudiosink',
            videoSink: config.videoSink || 'autovideosink',
            flip: config.flip || '',
            rotation: config.rotation || ''
        });

        this._proxy.SetConfigRemote(configStr, (result, error) => {
            if (error) {
                log(`[UxPlay] Error applying config: ${error.message}`);
            } else {
                log(`[UxPlay] Config applied successfully`);
            }
        });
    }

    _updateIconStatus() {
        if (this._proxy) {
            this._proxy.StatusRemote((result, error) => {
                if (error) {
                    // Daemon có thể đang tắt
                    this.isDaemonRunning = false;
                    if (this.toggleItem && this.toggleItem.label) {
                        this.toggleItem.label.set_text('Service stoped');
                    }
                    if (this.daemonItem && this.daemonItem.label) {
                        this.daemonItem.label.set_text('Start service');
                    }
                    this.icon.set_gicon(this.customIcon);
                    this.icon.set_style("color: white;");
                    this.icon.opacity = 127;
                    return;
                }

                // Daemon đang chạy
                this.isDaemonRunning = true;
                this.icon.opacity = 255;
                if (this.daemonItem && this.daemonItem.label) {
                    this.daemonItem.label.set_text('Stop Service');
                }

                let isRunning = result ? result[0] : false;
                if (this.toggleItem && this.toggleItem.label) {
                    this.toggleItem.label.set_text(isRunning ? 'Stop mirror' : 'Start mirror');
                }

                if (isRunning) {
                    this.icon.set_gicon(this.customIcon);
                    this.icon.set_style("color: #3498db;"); 
                } else {
                    this.icon.set_gicon(this.customIcon);
                    this.icon.set_style("color: white;"); 
                }

                // Cập nhật trạng thái sharing
                this._proxy.IsSharingRemote((sharingResult, err) => {
                    if (!err && sharingResult) {
                        const [isSharing] = sharingResult;
                        if (isSharing) {
                            this.icon.set_style("color: green; font-weight: bold;"); // Đổi màu khi có người chia sẻ
                        }
                    }
                });
            });
        }
    }
});

function init() {
    log("UxPlay Toggle extension initialized.");
}

function enable() {
    toggleMenu = new UxPlayToggle();
    Main.panel.addToStatusArea("UxPlayToggle", toggleMenu, 1, "right");
}

function disable() {
    if (toggleMenu) {
        toggleMenu.destroy();
        toggleMenu = null;
    }
}
