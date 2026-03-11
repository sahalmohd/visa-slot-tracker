# Visa Slot Tracker Chrome Extension

This Chrome extension checks:

`https://checkvisaslots.com/visa-slots-info/in/l-1-individual-regular/`

and sends a desktop notification when it detects an **open slot** for your target month (default: July 2026).

## Project Structure

```
visa-slot-tracker/
├── manifest.json                  # Extension configuration (Manifest V3)
├── icons/                         # Extension icons
│   ├── icon-16.png
│   ├── icon-32.png
│   ├── icon-48.png
│   └── icon-128.png
├── src/
│   ├── background/                # Service worker (core logic)
│   │   ├── index.js               # Entry point: alarm scheduling, event listeners, runCheck
│   │   ├── constants.js           # URLs, regexes, month maps
│   │   ├── config.js              # Mutable target month state, storage sync
│   │   ├── dates.js               # Date parsing, candidate extraction, utilities
│   │   ├── detection.js           # Slot detection from HTML text
│   │   ├── email.js               # EmailJS integration
│   │   ├── notifications.js       # Desktop notifications + badge
│   │   └── tab-detection.js       # DOM-based detection via open/auto tab
│   ├── popup/                     # Browser action popup
│   │   ├── popup.html
│   │   └── popup.js
│   └── options/                   # Settings page
│       ├── options.html
│       └── options.js
└── README.md
```

## Install

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select this folder

## Use

1. Click the extension icon to open popup.
2. Click **Check now** for an immediate scan.
3. Open **settings** to change interval (default: every 5 minutes).
4. Keep Chrome running for background checks.

## Email notifications (optional)

1. Create an EmailJS account and email service/template.
2. In extension **Settings**, fill:
   - Destination email
   - EmailJS service ID
   - EmailJS template ID
   - EmailJS public key
3. Enable **Email alerts** and click **Save settings**.
4. Use **Send test email** to validate setup.

Template variables sent:
`to_email`, `subject`, `message`, `target_month`, `target_url`, `evidence`, `vac_latest_date`, `non_vac_latest_date`, `checked_at`.

## Detection logic

The checker searches page text for target month contexts and flags open when nearby text indicates:

- open/available keywords, or
- slot/appointment count greater than 0

while excluding common closed markers like `no slots`, `unavailable`, `closed`, `0 slots`, etc.

It also extracts the latest likely available dates for:
- **VAC** (biometrics)
- **Non-VAC** (consular/interview)

## Notes

- This relies on site content format. If the website markup/text changes, pattern rules may need adjustment.
- Notification is sent when state transitions from **not open** to **open**.
- If the site returns **Vercel Security Checkpoint**, open the target URL once in a normal tab, complete verification, then run **Check now** again.
- When fetch parsing cannot find dates, the extension falls back to rendered DOM parsing using either:
  - an already open target tab (`open-tab+color`), or
  - an auto-opened background tab that it closes automatically (`auto-tab+color`).
- For calendar views where VAC is shown in green and Non-VAC in red, open-tab parsing also uses those color cues.
- Fetch-path date parsing is strict by design (requires strong availability cues), so it may return `Not found` instead of guessing.
- VAC/Non-VAC date extraction is constrained to the target-year window up to the target month.
