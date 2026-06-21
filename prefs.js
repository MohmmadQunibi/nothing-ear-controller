import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const PLACEMENT_ORDER = ['quick-settings', 'top-bar', 'both'];

function listPairedDevices() {
    try {
        const [ok, out] = GLib.spawn_command_line_sync('bluetoothctl devices');
        if (!ok || !out)
            return [];
        const text = new TextDecoder('utf-8').decode(out);
        const devices = [];
        for (const line of text.split('\n')) {
            // "Device AA:BB:CC:DD:EE:FF Some Name"
            const m = line.match(/^Device\s+([0-9A-Fa-f:]{17})\s+(.*)$/);
            if (m)
                devices.push({mac: m[1], name: m[2]});
        }
        return devices;
    } catch (e) {
        return [];
    }
}

export default class NothingEarPrefs extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        const page = new Adw.PreferencesPage();
        const group = new Adw.PreferencesGroup({title: 'Nothing Ear Controller'});
        page.add(group);

        const labels = ['Auto-detect'];
        const macs = [''];
        for (const d of listPairedDevices()) {
            labels.push(`${d.name} (${d.mac})`);
            macs.push(d.mac);
        }
        const current = settings.get_string('device-mac');
        let selectedIdx = macs.indexOf(current);
        // Preserve a configured-but-unpaired MAC so we never silently drop it.
        if (selectedIdx < 0 && current) {
            labels.push(`${current} (not paired)`);
            macs.push(current);
            selectedIdx = labels.length - 1;
        }

        const deviceRow = new Adw.ComboRow({
            title: 'Device',
            subtitle: 'Which earphones to control',
            model: new Gtk.StringList({strings: labels}),
        });
        deviceRow.selected = selectedIdx < 0 ? 0 : selectedIdx;
        // Connect AFTER setting the initial selection so the programmatic
        // assignment above doesn't overwrite the stored value.
        deviceRow.connect('notify::selected', () => {
            settings.set_string('device-mac', macs[deviceRow.selected] || '');
        });
        group.add(deviceRow);

        const placementRow = new Adw.ComboRow({
            title: 'Placement',
            subtitle: 'Where the controller appears',
            model: new Gtk.StringList({strings: ['Quick Settings', 'Top bar', 'Both']}),
        });
        placementRow.selected = PLACEMENT_ORDER.indexOf(settings.get_string('placement'));
        placementRow.connect('notify::selected', () => {
            settings.set_string('placement', PLACEMENT_ORDER[placementRow.selected]);
        });
        group.add(placementRow);

        const modeRow = new Adw.SwitchRow({
            title: 'Show ANC mode',
            subtitle: 'Display the current mode on the top-bar button',
        });
        group.add(modeRow);
        settings.bind('show-mode', modeRow, 'active', Gio.SettingsBindFlags.DEFAULT);

        const batteryRow = new Adw.SwitchRow({
            title: 'Show battery %',
            subtitle: 'Display the battery percentage on the top-bar button',
        });
        group.add(batteryRow);
        settings.bind('show-battery', batteryRow, 'active', Gio.SettingsBindFlags.DEFAULT);

        window.add(page);
    }
}
