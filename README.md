# Visa Slot Tracker Chrome Extension

A Chrome extension that monitors [checkvisaslots.com](https://checkvisaslots.com) for US visa appointment availability and the [State Department visa bulletin](https://travel.state.gov/content/travel/en/legal/visa-law0/visa-bulletin.html) for new publications. Sends desktop and email notifications when changes are detected.

## Features

- **Configurable visa category** — supports 30 visa types (H-1B, L-1, B1/B2, F-1, etc.)
- **Automatic slot monitoring** — checks every 1–60 minutes (configurable)
- **Dual detection** — text-based HTML parsing + DOM-based calendar color parsing
- **Target month tracking** — alerts when slots open for your chosen month
- **Visa bulletin tracking** — notifies when the upcoming bulletin changes from "Coming Soon" to published
- **Email notifications** — via EmailJS for slot changes, date changes, and bulletin alerts
- **Desktop notifications** — Chrome native notifications with badge indicator
- **Manual check** — "Check now" button that also sends an email when slots are open

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
│   │   ├── constants.js           # URLs, regexes, month maps, visa categories
│   │   ├── config.js              # Dynamic target month/category state, URL building
│   │   ├── dates.js               # Date parsing, candidate extraction, utilities
│   │   ├── detection.js           # Slot detection from HTML text
│   │   ├── bulletin.js            # Visa bulletin fetch, parse, and change tracking
│   │   ├── email.js               # EmailJS integration
│   │   ├── notifications.js       # Desktop notifications, badge, and email triggers
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

1. Click the extension icon to see current status, detected dates, and bulletin info.
2. Click **Check now** for an immediate scan (also sends an email if slots are open).
3. Open **Settings** to configure:
   - **Visa category** — select from 30 supported types
   - **Target month** — the month you're watching for
   - **Check interval** — 1 to 60 minutes
   - **Email alerts** — EmailJS credentials
   - **Debug mode** — show raw detection data in the popup

## Email Notifications (Optional)

### Setup

1. Create an account at [emailjs.com](https://www.emailjs.com/) (free: 200 emails/month).
2. Add an **Email Service** (Gmail, Outlook, etc.) and copy the **Service ID**.
3. Create an **Email Template** using the variables below, and copy the **Template ID**.
4. Copy your **Public Key** from the Account page.
5. In extension **Settings**, check **Enable email alerts**, fill in all four fields, and click **Save**.
6. Click **Send test email** to verify.

### Template Variables

| Variable | Description |
|---|---|
| `{{to_email}}` | Recipient email address |
| `{{subject}}` | Alert subject line |
| `{{message}}` | Alert message body |
| `{{target_month}}` | e.g. "July 2026" |
| `{{target_url}}` | Link to checkvisaslots.com page |
| `{{evidence}}` | What was detected |
| `{{vac_latest_date}}` | Latest Biometrics (VAC) date |
| `{{non_vac_latest_date}}` | Latest Consular (CA) date |
| `{{checked_at}}` | Timestamp of the check |

### When Emails Are Sent

| Trigger | Condition |
|---|---|
| Slot opened | Target month transitions from closed → open |
| Date changed | Biometrics or CA date changes from previous check |
| Manual check | "Check now" clicked and slots are currently open |
| Bulletin published | Upcoming visa bulletin changes from "Coming Soon" → published |

## Detection Logic

The extension uses two detection strategies that run in parallel:

1. **Fetch + text parsing** — fetches the page HTML and searches for target month keywords with availability cues.
2. **Tab + DOM parsing** — injects a script into an open (or auto-created) tab, toggles location filter buttons to separate VAC/Non-VAC views, and reads the latest active dates from the `react-calendar` grid.

If either strategy finds dates in the target month, the slot is marked as open.

### What it tracks

- **Biometrics (VAC)** — latest available biometrics appointment date
- **Consular Appointment (CA)** — latest available interview date
- **Visa Bulletin** — current and upcoming bulletin status from travel.state.gov

## Notes

- Relies on site content format; if markup changes, detection patterns may need updating.
- If the site returns a **Vercel Security Checkpoint**, open the target URL in a normal tab, complete verification, then click **Check now**.
- For calendar views, VAC dates are shown in green and Non-VAC in red; the tab parser uses these color cues.
- Bulletin checks run on the same interval as slot checks (every alarm cycle, plus on install/startup).
