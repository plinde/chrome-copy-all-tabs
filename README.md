# Copy All Tabs

Copy all tab URLs from the current Chrome window to your clipboard.

## What It Does

- One click copies all URLs as one per line by default, with no popup.
- Optional popup chooser is only shown when enabled in extension options.
- Supported formats:
  - one URL per line
  - CSV
  - JSON array
- Reads tabs from the current window only.
- Does not reload, move, close, or otherwise modify tabs.

## Installation

1. Open `chrome://extensions/`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this directory (`chrome-copy-all-tabs`).

## Usage

### Default mode (direct copy)

1. Click the extension toolbar button.
2. Clipboard receives all tab URLs, one per line (no popup shown).

### Optional format chooser (opt-in)

1. Open extension options from `chrome://extensions/`.
2. Enable **popup format chooser on click**.
3. Click the extension icon and choose:
   - one URL per line
   - CSV
   - JSON array

## Options

- **Enable popup format chooser on click** (`enableFormatSelection`)
  - `false` (default): copy immediately using default format.
  - `true`: show popup buttons to choose format each click.
- **Default format** (`defaultFormat`)
  - used only when chooser is disabled
  - values: `newline`, `csv`, `json`

## Permissions

- `tabs`: needed to read URLs from tabs in the current window.
- `storage`: needed to save options in `chrome.storage.sync`.
- `clipboardWrite`: needed to write formatted URLs to your clipboard.
- `offscreen`: needed for MV3-safe clipboard copy during direct icon clicks.

## Files

- `manifest.json`: extension manifest (MV3).
- `background.js`: service worker for click mode, tab URL collection, and formatting.
- `offscreen.html`, `offscreen.js`: offscreen clipboard writer for direct click copy.
- `popup.html`, `popup.js`: click UI and clipboard write flow.
- `options.html`, `options.js`: settings UI and persistence.
