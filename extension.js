import St from 'gi://St';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as QuickSettings from 'resource:///org/gnome/shell/ui/quickSettings.js';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

const QuickSettingsMenu = Main.panel.statusArea.quickSettings;

const NothingEarToggle = GObject.registerClass({
    GTypeName: 'NothingEarToggle',
}, class NothingEarToggle extends QuickSettings.QuickMenuToggle {
    _init() {
        super._init({
            title: 'Nothing Ear',
            iconName: 'audio-headphones-symbolic',
            toggleMode: false,
        });

        this._modes = [
            { name: 'HIGH', icon: 'audio-volume-high-symbolic' },
            { name: 'MID', icon: 'audio-volume-medium-symbolic' },
            { name: 'LOW', icon: 'audio-volume-low-symbolic' },
            { name: 'ADAPTIVE', icon: 'power-profile-performance-symbolic' },
            { name: 'OFF', icon: 'system-shutdown-symbolic' },
            { name: 'TRANSPARENCY', icon: 'org.gnome.Settings-accessibility-hearing-symbolic' },
        ];

        // Set header with icon and subtitle
        this.menu.setHeader('audio-headphones-symbolic', 'Nothing Ear', '');

        this._buildMenu();
        this._refreshStatus();

        // Refresh when menu opens
        this.menu.connect('open-state-changed', (menu, isOpen) => {
            if (isOpen)
                this._refreshStatus();
        });
    }

    _buildMenu() {
        // Battery status item (non-reactive) with icon
        this._batteryItem = new PopupMenu.PopupMenuItem('Battery: ...');
        this._batteryItem.reactive = false;

        let batteryIcon = new St.Icon({
            icon_name: 'battery-symbolic',
            style_class: 'popup-menu-icon',
        });
        this._batteryItem.insert_child_at_index(batteryIcon, 0);

        this.menu.addMenuItem(this._batteryItem);

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // ANC mode section
        let modeSection = new PopupMenu.PopupMenuSection();
        
        this._modes.forEach(mode => {
            let item = new PopupMenu.PopupMenuItem(mode.name);

            // Add icon to the left
            let icon = new St.Icon({
                icon_name: mode.icon,
                style_class: 'popup-menu-icon',
            });
            item.insert_child_at_index(icon, 0);

            item.connect('activate', () => this._setMode(mode));
            modeSection.addMenuItem(item);

            // Add separators after ADAPTIVE and OFF
            if (mode.name === 'ADAPTIVE' || mode.name === 'OFF') {
                modeSection.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
            }
        });

        this.menu.addMenuItem(modeSection);

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // Refresh button
        let refresh = new PopupMenu.PopupMenuItem('Refresh Status');
        refresh.connect('activate', () => this._refreshStatus());
        this.menu.addMenuItem(refresh);
    }

    _runPython(args) {
        let homedir = GLib.get_home_dir();
        let command = `python3 ${homedir}/.local/share/gnome-shell/extensions/nothing-ear-controller@LuanAdemi/controller.py ${args}`;
        try {
            let [ok, out, err, exit] = GLib.spawn_command_line_sync(command);
            if (ok && out) {
                let decoder = new TextDecoder('utf-8');
                return decoder.decode(out).trim();
            }
            return '';
        } catch (e) {
            console.error(`Nothing Ear controller error: ${e}`);
            return '';
        }
    }

    _refreshStatus() {
        let mode = this._runPython('--get');
        let battery = this._runPython('--battery');

        // Update subtitle (shown in Quick Settings when closed)
        if (mode && battery) {
            this.subtitle = `${mode} • ${battery}%`;
        } else if (mode) {
            this.subtitle = mode;
        } else {
            this.subtitle = 'Disconnected';
        }

        // Update battery item in menu
        if (battery && battery !== 'UNKNOWN') {
            this._batteryItem.label.text = `${battery}%`;
        } else {
            this._batteryItem.label.text = 'Unknown';
        }
    }

    _setMode(mode) {
        let modeName = typeof mode === 'string' ? mode : mode.name;
        this._runPython(`--set ${modeName.toLowerCase()}`);
        this._refreshStatus();
    }
});

const NothingEarIndicator = GObject.registerClass(
class NothingEarIndicator extends QuickSettings.SystemIndicator {
    _init() {
        super._init();

        // Create indicator icon (shown in panel)
        this._indicator = this._addIndicator();
        this._indicator.icon_name = 'audio-headphones-symbolic';
        
        // Create toggle menu
        this._toggle = new NothingEarToggle();
        this.quickSettingsItems.push(this._toggle);

        // Add to Quick Settings
        QuickSettingsMenu.addExternalIndicator(this);
    }

    destroy() {
        this.quickSettingsItems.forEach(item => item.destroy());
        this._indicator.destroy();
        super.destroy();
    }
});

export default class NothingEarControllerExtension extends Extension {
    enable() {
        this._indicator = new NothingEarIndicator();
    }

    disable() {
        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }
    }
}