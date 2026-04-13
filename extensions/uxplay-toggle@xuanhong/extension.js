const { Gio, GLib, St, Clutter, GObject } = imports.gi;
const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;

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

        // Tạo icon
        this.icon = new St.Icon({
            icon_name: 'media-playback-stop-symbolic',
            style_class: 'system-status-icon',
        });
        this.add_child(this.icon);

        // Khởi tạo DBus proxy
        this._proxy = new UxPlayProxy(
            Gio.DBus.session,
            'org.uxplay.Tray',
            '/org/uxplay/Tray'
        );

        // Lắng nghe sự kiện click
        this.connect('button-press-event', this._toggleUxPlay.bind(this));
        
        // Cập nhật trạng thái màu sắc theo app Go
        this._updateIconStatus();
    }

    _toggleUxPlay() {
        if (!this._proxy) return Clutter.EVENT_PROPAGATE;

        // Gọi method Toggle() của Go qua DBus
        this._proxy.ToggleRemote((result, error) => {
            if (error) {
                log(`[UxPlay Extension] Error: ${error.message}`);
                return;
            }
            this._updateIconStatus();
        });
        
        return Clutter.EVENT_STOP;
    }

    _updateIconStatus() {
        if (this._proxy) {
            this._proxy.StatusRemote((result, error) => {
                let isRunning = result ? result[0] : false;
                if (!error && isRunning) {
                    // Trạng thái BẬT: Icon Stop + màu xanh lơ dịu mắt của GNOME
                    this.icon.set_icon_name('media-playback-stop-symbolic');
                    this.icon.set_style("color: #3584e4;"); 
                } else {
                    // Trạng thái TẮT: Icon Play + bỏ ép màu để trở về màu mặc định
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