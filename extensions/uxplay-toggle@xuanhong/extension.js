const { Gio, GLib, St, Clutter, GObject } = imports.gi;
const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;

const UxPlayDBusInterface = `
<node>
    <interface name="org.uxplay.Tray">
        <method name="Toggle">
            <arg type="b" name="status" direction="out"/>
        </method>
        <method name="Status">
            <arg type="b" name="status" direction="out"/>
        </method>
    </interface>
</node>`;

const UxPlayProxy = Gio.DBusProxy.makeProxyWrapper(UxPlayDBusInterface);

let toggleMenu;

const UxPlayToggle = GObject.registerClass(
class UxPlayToggle extends PanelMenu.Button {
    _init() {
        super._init(0.0, "UxPlayToggle");

        this.icon = new St.Icon({
            icon_name: 'media-playback-start-symbolic',
            style_class: 'system-status-icon',
        });
        this.add_child(this.icon);

        this._proxy = new UxPlayProxy(
            Gio.DBus.session,
            'org.uxplay.Tray',
            '/org/uxplay/Tray'
        );

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
                    this.icon.set_icon_name('media-playback-stop-symbolic');
                    this.icon.set_style("opacity: 0.5; color: gray;");
                    return;
                }

                // Daemon đang chạy
                this.isDaemonRunning = true;
                if (this.daemonItem && this.daemonItem.label) {
                    this.daemonItem.label.set_text('Stop Service');
                }

                let isRunning = result ? result[0] : false;
                if (this.toggleItem && this.toggleItem.label) {
                    this.toggleItem.label.set_text(isRunning ? 'Stop mirror' : 'Start mirror');
                }

                if (isRunning) {
                    this.icon.set_icon_name('media-playback-stop-symbolic');
                    this.icon.set_style("color: #3584e4;"); 
                } else {
                    this.icon.set_icon_name('media-playback-stop-symbolic');
                    this.icon.set_style(""); 
                }
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
