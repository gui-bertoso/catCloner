# duckCloner

Save pages and browsing sequences as offline ZIPs. A small Manifest V3 extension for Chrome and Chromium-based browsers, written in plain JavaScript.

Previously named **catCloner**. The GitHub repository is now **[duck-cloner](https://github.com/gui-bertoso/duck-cloner)**.

![Snapshot interface](screenshot.png)

## Two ways to capture

**Snapshot** saves the active page, its assets and linked pages within the page limit and link depth you choose. A depth of `0` saves only the current page.

**Visual flow** records a sequence as you browse one tab. Stable pages are captured automatically; you can also capture a page manually, remove individual steps, or clear the recording. Finish the session to download its ZIP.

## Install

1. Download the extension ZIP and extract it into a folder you will keep.
2. Open `chrome://extensions` (or `edge://extensions`).
3. Enable **Developer mode**, select **Load unpacked**, and choose the folder containing `manifest.json`.
4. Open an HTTP or HTTPS page and select duckCloner from the extensions menu.

To update an unpacked installation, replace the files in its existing folder and select **Reload** on the extensions page. Existing recording storage keys are preserved.

## What to expect

The extension downloads page assets, rewrites local paths and neutralizes scripts for offline browsing. An offline copy will not reproduce every feature of a live website. Browser settings pages cannot be captured.

Form values and known personal-information patterns are redacted heuristically. This is not a guarantee that every sensitive detail is removed: use sample data for recordings and review the archive before sharing it. CAPTCHA and login checks must be completed normally in the source page.

## Development

No build step is required. Load this directory as an unpacked extension and reload it after editing. The popup is in `popup.html`, `style.css` and `popup.js`; capture engines are under `engines/` and `core/`.

MIT licensed. See [LICENSE](LICENSE). JSZip and other third-party code retain their original notices.
