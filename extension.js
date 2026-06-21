import St from 'gi://St';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import Clutter from 'gi://Clutter';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as QuickSettings from 'resource:///org/gnome/shell/ui/quickSettings.js';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

const UUID = 'nothing-ear-controller@LuanAdemi';

const MODES = [
    {name: 'HIGH', icon: 'audio-volume-high-symbolic'},
    {name: 'MID', icon: 'audio-volume-medium-symbolic'},
    {name: 'LOW', icon: 'audio-volume-low-symbolic'},
    {name: 'ADAPTIVE', icon: 'power-profile-performance-symbolic'},
    {name: 'OFF', icon: 'system-shutdown-symbolic'},
    {name: 'TRANSPARENCY', icon: 'org.gnome.Settings-accessibility-hearing-symbolic'},
];

const MAC_RE = /^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/;

class EarController {
    constructor() {
        this.mode = null;
        this.battery = null;
        this.device = '';
    }

    // Pin a specific device MAC, or '' to let controller.py auto-detect.
    setDevice(mac) {
        this.device = MAC_RE.test(mac) ? mac : '';
    }

    _runPython(args) {
        const homedir = GLib.get_home_dir();
        const devicePart = this.device ? `--device ${this.device} ` : '';
        const command = `python3 ${homedir}/.local/share/gnome-shell/extensions/${UUID}/controller.py ${devicePart}${args}`;
        try {
            const [ok, out] = GLib.spawn_command_line_sync(command);
            if (ok && out)
                return new TextDecoder('utf-8').decode(out).trim();
            return '';
        } catch (e) {
            console.error(`Nothing Ear controller error: ${e}`);
            return '';
        }
    }

    getMac() {
        if (this.device)
            return this.device;
        const mac = this._runPython('--mac');
        return MAC_RE.test(mac) ? mac : null;
    }

    refresh() {
        const mode = this._runPython('--get');
        const battery = this._runPython('--battery');
        this.mode = (mode && mode !== 'UNKNOWN') ? mode : null;
        this.battery = (battery && battery !== 'UNKNOWN') ? battery : null;
    }

    // Async variants run controller.py off the main thread, so opening a menu
    // (or setting a mode) never blocks the compositor and drops the animation.
    _runPythonAsync(args, callback) {
        const homedir = GLib.get_home_dir();
        const base = [`python3`, `${homedir}/.local/share/gnome-shell/extensions/${UUID}/controller.py`];
        const device = this.device ? ['--device', this.device] : [];
        try {
            const proc = Gio.Subprocess.new(
                [...base, ...device, ...args], Gio.SubprocessFlags.STDOUT_PIPE);
            proc.communicate_utf8_async(null, null, (p, res) => {
                let out = '';
                try {
                    const [, stdout] = p.communicate_utf8_finish(res);
                    out = (stdout || '').trim();
                } catch (e) {
                    console.error(`Nothing Ear controller error: ${e}`);
                }
                callback(out);
            });
        } catch (e) {
            console.error(`Nothing Ear controller error: ${e}`);
            callback('');
        }
    }

    refreshAsync(onDone) {
        this._runPythonAsync(['--get'], mode => {
            this.mode = (mode && mode !== 'UNKNOWN') ? mode : null;
            this._runPythonAsync(['--battery'], battery => {
                this.battery = (battery && battery !== 'UNKNOWN') ? battery : null;
                if (onDone)
                    onDone();
            });
        });
    }

    setModeAsync(name, onDone) {
        this._runPythonAsync([`--set`, name.toLowerCase()], () => this.refreshAsync(onDone));
    }
}

function buildEarMenu(menu, controller, onChange) {
    const batteryItem = new PopupMenu.PopupMenuItem('Battery: ...');
    batteryItem.reactive = false;
    batteryItem.insert_child_at_index(
        new St.Icon({icon_name: 'battery-symbolic', style_class: 'popup-menu-icon'}), 0);
    menu.addMenuItem(batteryItem);

    menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

    const modeSection = new PopupMenu.PopupMenuSection();
    MODES.forEach(mode => {
        const item = new PopupMenu.PopupMenuItem(mode.name);
        item.insert_child_at_index(
            new St.Icon({icon_name: mode.icon, style_class: 'popup-menu-icon'}), 0);
        item.connect('activate', () => {
            controller.setModeAsync(mode.name, onChange);
        });
        modeSection.addMenuItem(item);
        if (mode.name === 'ADAPTIVE' || mode.name === 'OFF')
            modeSection.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
    });
    menu.addMenuItem(modeSection);

    menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

    const refresh = new PopupMenu.PopupMenuItem('Refresh Status');
    refresh.connect('activate', () => {
        controller.refreshAsync(onChange);
    });
    menu.addMenuItem(refresh);

    return {
        update() {
            batteryItem.label.text = controller.battery ? `${controller.battery}%` : 'Unknown';
        },
    };
}

const NothingEarToggle = GObject.registerClass(
class NothingEarToggle extends QuickSettings.QuickMenuToggle {
    _init(controller) {
        super._init({
            title: 'Nothing Ear',
            iconName: 'audio-headphones-symbolic',
            toggleMode: false,
        });
        this._controller = controller;
        this._connected = true;

        this.menu.setHeader('audio-headphones-symbolic', 'Nothing Ear', '');
        this._menuUI = buildEarMenu(this.menu, controller, () => this._sync());

        this._openStateId = this.menu.connect('open-state-changed', (menu, isOpen) => {
            if (isOpen && this._connected)
                this._controller.refreshAsync(() => this._sync());
        });

        this._sync();
    }

    destroy() {
        if (this._openStateId) {
            this.menu.disconnect(this._openStateId);
            this._openStateId = 0;
        }
        super.destroy();
    }

    setConnected(connected) {
        this._connected = connected;
        this.reactive = connected;
        this.opacity = connected ? 255 : 130;
        this.menu.setHeader('audio-headphones-symbolic', 'Nothing Ear',
            connected ? '' : 'Disconnected');
        this._sync();
    }

    _sync() {
        this._menuUI.update();
        if (!this._connected) {
            this.subtitle = 'Disconnected';
            return;
        }
        const c = this._controller;
        if (c.mode && c.battery)
            this.subtitle = `${c.mode} • ${c.battery}%`;
        else if (c.mode)
            this.subtitle = c.mode;
        else
            this.subtitle = 'Connected';
    }
});

const NothingEarQuickSettings = GObject.registerClass(
class NothingEarQuickSettings extends QuickSettings.SystemIndicator {
    _init(controller) {
        super._init();
        this._indicator = this._addIndicator();
        this._indicator.icon_name = 'audio-headphones-symbolic';

        this._toggle = new NothingEarToggle(controller);
        this.quickSettingsItems.push(this._toggle);

        Main.panel.statusArea.quickSettings.addExternalIndicator(this);
    }

    setConnected(connected) {
        this._indicator.visible = connected;
        this._toggle.setConnected(connected);
    }

    destroy() {
        this.quickSettingsItems.forEach(item => item.destroy());
        this._indicator.destroy();
        super.destroy();
    }
});

const NothingEarPanelButton = GObject.registerClass(
class NothingEarPanelButton extends PanelMenu.Button {
    _init(controller, settings) {
        super._init(0.5, 'Nothing Ear');
        this._controller = controller;
        this._settings = settings;

        const box = new St.BoxLayout({style_class: 'panel-status-menu-box'});
        this._icon = new St.Icon({
            icon_name: 'audio-headphones-symbolic',
            style_class: 'system-status-icon',
        });
        this._modeLabel = new St.Label({
            text: '',
            y_align: Clutter.ActorAlign.CENTER,
            style: 'margin-left: 4px;',
        });
        this._batteryLabel = new St.Label({
            text: '',
            y_align: Clutter.ActorAlign.CENTER,
            style: 'margin-left: 4px;',
        });
        box.add_child(this._icon);
        box.add_child(this._modeLabel);
        box.add_child(this._batteryLabel);
        this.add_child(box);

        this._menuUI = buildEarMenu(this.menu, controller, () => this._sync());

        this._openStateId = this.menu.connect('open-state-changed', (menu, isOpen) => {
            if (isOpen)
                this._controller.refreshAsync(() => this._sync());
        });

        this._settingsChangedId = this._settings.connect('changed', (s, key) => {
            if (key === 'show-mode' || key === 'show-battery')
                this._sync();
        });

        this._sync();
    }

    _sync() {
        this._menuUI.update();
        const c = this._controller;
        const showMode = this._settings.get_boolean('show-mode');
        const showBattery = this._settings.get_boolean('show-battery');

        this._modeLabel.text = c.mode || '';
        this._modeLabel.visible = showMode && !!c.mode;
        this._batteryLabel.text = c.battery ? `${c.battery}%` : '';
        this._batteryLabel.visible = showBattery && !!c.battery;
    }

    destroy() {
        if (this._openStateId) {
            this.menu.disconnect(this._openStateId);
            this._openStateId = 0;
        }
        if (this._settingsChangedId) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = 0;
        }
        super.destroy();
    }
});

class BlueZWatch {
    constructor(mac, onChange) {
        this._onChange = onChange;
        this._proxy = null;
        this._sigId = 0;
        this.connected = false;

        // Fallback: if we can't watch, default to "connected" so the
        // widget never silently disappears.
        if (!mac) {
            this.connected = true;
            return;
        }

        const pathFrag = 'dev_' + mac.toUpperCase().replace(/:/g, '_');
        try {
            const devicePath = this._findDevicePath(pathFrag);
            if (!devicePath) {
                this.connected = true;
                return;
            }
            this._proxy = Gio.DBusProxy.new_for_bus_sync(
                Gio.BusType.SYSTEM, Gio.DBusProxyFlags.NONE, null,
                'org.bluez', devicePath, 'org.bluez.Device1', null);

            const v = this._proxy.get_cached_property('Connected');
            this.connected = v ? v.unpack() : false;

            this._sigId = this._proxy.connect('g-properties-changed', () => {
                const cv = this._proxy.get_cached_property('Connected');
                const now = cv ? cv.unpack() : false;
                if (now !== this.connected) {
                    this.connected = now;
                    this._onChange(now);
                }
            });
        } catch (e) {
            console.error(`Nothing Ear BlueZ watch failed: ${e}`);
            this.connected = true;
        }
    }

    _findDevicePath(pathFrag) {
        const om = Gio.DBusProxy.new_for_bus_sync(
            Gio.BusType.SYSTEM, Gio.DBusProxyFlags.NONE, null,
            'org.bluez', '/', 'org.freedesktop.DBus.ObjectManager', null);
        const res = om.call_sync('GetManagedObjects', null,
            Gio.DBusCallFlags.NONE, -1, null);
        const [objects] = res.deep_unpack();
        for (const path in objects) {
            if (path.includes(pathFrag) && objects[path]['org.bluez.Device1'])
                return path;
        }
        return null;
    }

    destroy() {
        if (this._proxy && this._sigId)
            this._proxy.disconnect(this._sigId);
        this._proxy = null;
        this._sigId = 0;
    }
}

export default class NothingEarControllerExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._controller = new EarController();
        this._controller.setDevice(this._settings.get_string('device-mac'));

        this._startWatch();

        this._qs = null;
        this._panel = null;
        this._render();
        this._applyConnection(this._watch.connected);

        this._placementChangedId = this._settings.connect('changed::placement', () => {
            this._destroyViews();
            this._render();
            this._applyConnection(this._watch.connected);
        });

        this._deviceChangedId = this._settings.connect('changed::device-mac', () => {
            this._controller.setDevice(this._settings.get_string('device-mac'));
            this._startWatch();
            this._applyConnection(this._watch.connected);
        });
    }

    // Refresh only when connected, so a disconnected device never blocks the shell.
    _startWatch() {
        if (this._watch)
            this._watch.destroy();
        const mac = this._controller.getMac();
        this._watch = new BlueZWatch(mac, connected => this._onConnectionChange(connected));
        if (this._watch.connected)
            this._controller.refresh();
    }

    _render() {
        const placement = this._settings.get_string('placement');
        if (placement === 'quick-settings' || placement === 'both')
            this._qs = new NothingEarQuickSettings(this._controller);
        if (placement === 'top-bar' || placement === 'both') {
            this._panel = new NothingEarPanelButton(this._controller, this._settings);
            Main.panel.addToStatusArea('nothing-ear-controller', this._panel, 0, 'right');
        }
    }

    _onConnectionChange(connected) {
        if (connected)
            this._controller.refresh();
        this._applyConnection(connected);
    }

    _applyConnection(connected) {
        if (this._qs)
            this._qs.setConnected(connected);
        if (this._panel)
            this._panel.container.visible = connected;
    }

    _destroyViews() {
        if (this._qs) {
            this._qs.destroy();
            this._qs = null;
        }
        if (this._panel) {
            this._panel.destroy();
            this._panel = null;
        }
    }

    disable() {
        if (this._placementChangedId) {
            this._settings.disconnect(this._placementChangedId);
            this._placementChangedId = 0;
        }
        if (this._deviceChangedId) {
            this._settings.disconnect(this._deviceChangedId);
            this._deviceChangedId = 0;
        }
        this._destroyViews();
        if (this._watch) {
            this._watch.destroy();
            this._watch = null;
        }
        this._controller = null;
        this._settings = null;
    }
}
