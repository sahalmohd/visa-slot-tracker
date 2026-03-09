# Visa Slot Tracker Chrome Extension

This Chrome extension checks:

`https://checkvisaslots.com/visa-slots-info/in/l-1-individual-regular/`

and sends a desktop notification when it detects an **open slot in July 2026**.

## Files

- `manifest.json` - Extension configuration (Manifest V3)
- `background.js` - Periodic fetch + July 2026 detection + notifications
- `popup.html` / `popup.js` - Quick status + manual check button
- `options.html` / `options.js` - Configure polling interval
- `icon-128.png` - Notification icon

## Install

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select this folder:
   `/Users/sahalmohamed/Projects/visa-slot-tracker`

## Use

1. Click the extension icon to open popup.
2. Click **Check now** for an immediate scan.
3. Open **settings** to change interval (default: every 5 minutes).
4. Keep Chrome running for background checks.

## Detection logic

The checker searches page text for `July 2026` / `Jul 2026` contexts and flags open when nearby text indicates:

- open/available keywords, or
- slot/appointment count greater than 0

while excluding common closed markers like `no slots`, `unavailable`, `closed`, `0 slots`, etc.

## Notes

- This relies on site content format. If the website markup/text changes, pattern rules in `background.js` may need adjustment.
- Notification is sent when state transitions from **not open** to **open**.
- If the site returns **Vercel Security Checkpoint**, open the target URL once in a normal tab, complete verification, then run **Check now** again.
