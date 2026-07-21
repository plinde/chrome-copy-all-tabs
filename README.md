# Copy All Tabs

Copy all tab titles and URLs from the current Chrome window to your clipboard.

## What It Does

- One click copies all tabs (title + URL) by default, with no popup.
- Tab titles can be disabled in options to copy URLs only.
- Optional popup chooser is only shown when enabled in extension options.
- Supported formats (with titles enabled / disabled):
  - text: `Title` line then `URL` line per tab, blank line between tabs / one URL per line
  - CSV: one `"Title","URL"` row per tab / single row of quoted URLs
  - JSON: array of `{"title", "url"}` objects / array of URL strings
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
2. Clipboard receives all tabs as title + URL pairs (no popup shown).

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
- **Include tab titles** (`includeTitles`)
  - `true` (default): copy each tab's title along with its URL.
  - `false`: copy URLs only (pre-1.2.0 behavior).
- **Default format** (`defaultFormat`)
  - used only when chooser is disabled
  - values: `newline`, `csv`, `json`

## Permissions

- `tabs`: needed to read titles and URLs from tabs in the current window.
- `storage`: needed to save options in `chrome.storage.sync`.
- `clipboardWrite`: needed to write formatted URLs to your clipboard.
- `offscreen`: needed for MV3-safe clipboard copy during direct icon clicks.

## Files

- `manifest.json`: extension manifest (MV3).
- `background.js`: service worker for click mode, tab URL collection, and formatting.
- `offscreen.html`, `offscreen.js`: offscreen clipboard writer for direct click copy.
- `popup.html`, `popup.js`: click UI and clipboard write flow.
- `options.html`, `options.js`: settings UI and persistence.
