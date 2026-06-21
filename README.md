# Nothing Ear Controller  

<img src="https://github.com/LuanAdemi/nothing-ear-controller/blob/main/quicksettings.png?raw=true" 
     alt="Nothing Ear Controller Screenshot" 
     align="right" 
     width="200" 
     style="margin-left: 10px;"/>

A **GNOME extension** for controlling the **ANC (Active Noise Cancellation) mode** of **Nothing Ear** earphones.  

This extension builds upon the excellent work of [Bharadwaj Raju](https://bharadwaj-raju.github.io/posts/nothing-ear-2-on-linux/), who reverse-engineered the RFCOMM commands for the Nothing Ear 2.  

### Features
- Switch between all available ANC modes, including **Transparency Mode**  
- **Battery indicator** for your earphones  
- **Configurable placement** – show the controller in Quick Settings, as a standalone top-bar button, or both  
- **Connection-aware** – the widget greys out in Quick Settings and hides the top-bar button / indicator icon when no earphones are connected  

## Installation

### From source (this repo)
Run the install script — it compiles the settings schema, packages the zip, and installs it:

```bash
./install.sh
```

Then log out and back in (required on Wayland) and enable it:

```bash
gnome-extensions enable nothing-ear-controller@LuanAdemi
```

### From a release zip
1. Download the latest `.zip` from the [releases tab](https://github.com/LuanAdemi/nothing-ear-controller/releases).
2. Install and relog:

   ```bash
   gnome-extensions install nothing-ear-controller@LuanAdemi.zip
   ```

> The extension auto-detects the first paired device whose Bluetooth name
> contains "ear". If you have several such devices, pick the right one in the
> preferences (see [Settings](#settings)).

## Usage
1. Pair your Nothing Ear earphones with your Linux system via Bluetooth.  
2. Open the GNOME extensions menu and enable **Nothing Ear Controller**.  
3. Control ANC modes and check battery status directly from your panel.

## Settings
Open the preferences page from the GNOME Extensions app, or run:

```bash
gnome-extensions prefs nothing-ear-controller@LuanAdemi
```

- **Device** – choose which paired Bluetooth device to control. Defaults to
  *Auto-detect* (first paired device with "ear" in its name). Pick a specific
  device here if auto-detect chooses the wrong one.
- **Placement** – choose where the controller appears:
  - *Quick Settings* (default) – a toggle inside the Quick Settings panel
  - *Top bar* – a standalone button on the right of the top bar
  - *Both* – both at once
- **Show ANC mode** – display the current mode (e.g. `HIGH`) next to the top-bar button icon
- **Show battery %** – display the battery percentage next to the top-bar button icon

Changes apply immediately — no relog needed.

When the earphones disconnect, the Quick Settings toggle greys out and shows
*Disconnected*, while the top-bar button and the panel indicator icon hide
until the earphones reconnect.

## Tested On
- Fedora 42
- Nothing Ear (third generation, not to be confused with the Nothing Ear 3)

## Credits
- [Bharadwaj Raju](https://bharadwaj-raju.github.io/posts/nothing-ear-2-on-linux/) – Reverse-engineering RFCOMM commands  
