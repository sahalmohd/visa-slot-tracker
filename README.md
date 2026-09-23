# Visa Slot Tracker

A Chrome extension that monitors [checkvisaslots.com](https://checkvisaslots.com) for US visa appointment availability and the [State Department visa bulletin](https://travel.state.gov/content/travel/en/legal/visa-law0/visa-bulletin.html) for new publications. Sends desktop, email, and phone push notifications when changes are detected.

## Features

- **Configurable visa category** — supports 30 visa types (H-1B, L-1, B1/B2, F-1, etc.)
- **Automatic slot monitoring** — checks every 1–60 minutes (configurable) while the browser is running
- **Dual detection** — text-based HTML parsing + DOM-based calendar color parsing
- **Target month tracking** — alerts when slots open for your chosen month
- **Visa bulletin tracking** — notifies when the upcoming bulletin changes from "Coming Soon" to published
- **Push notifications** — via [ntfy](https://ntfy.sh) straight to your phone for slot changes, date changes, and bulletin alerts
- **Email notifications** — via EmailJS for slot changes, date changes, and bulletin alerts
- **Desktop notifications** — Chrome native notifications with badge indicator
- **Manual check** — "Check now" button that also sends notifications when slots are open

## Project Structure

```
visa-slot-tracker/
├── manifest.json                  # Extension configuration (Manifest V3)
├── package.json                   # Node deps for the CI checker (Playwright) — not used by the extension
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
│   │   ├── push.js                # ntfy integration (extension settings + send)
│   │   ├── notifications.js       # Desktop/email/push fan-out, badge
│   │   └── tab-detection.js       # DOM-based detection via open/auto tab
│   ├── shared/                    # Chrome-free code shared with the CI checker
│   │   ├── dom-probe.js           # Injected calendar-reading probe (extension + Playwright)
│   │   ├── merge.js               # Date-merging and target-month-open helpers
│   │   └── ntfy.js                # ntfy.sh publish call (plain fetch)
│   ├── popup/                     # Browser action popup
│   │   ├── popup.html
│   │   └── popup.js
│   └── options/                   # Settings page
│       ├── options.html
│       └── options.js
├── ci/                             # Headless checker (currently disabled — see GitHub Actions Checker section)
│   ├── check.mjs                  # Playwright-driven slot + bulletin check, publishes to ntfy
│   ├── config.json                # Target month / visa category for the CI run
│   └── state.json                 # Last-known state, committed back by the workflow
├── .github/workflows/
│   └── check.yml                  # Runs ci/check.mjs on a 15-minute cron — disabled, blocked from GitHub's IPs
└── README.md
```

## Install

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select this folder

## Use

1. Click the extension icon to see current status, detected dates, and bulletin info.
2. Click **Check now** for an immediate scan (also sends notifications if slots are open).
3. Open **Settings** to configure:
   - **Visa category** — select from 30 supported types
   - **Target month** — the month you're watching for
   - **Check interval** — 1 to 60 minutes
   - **Email alerts** — EmailJS credentials
   - **Push alerts** — ntfy topic/token
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

## Push Notifications via ntfy (Optional)

[ntfy](https://ntfy.sh) is a free push notification service. Subscribing to a topic in the ntfy app gets you a phone push for every alert, with no account required.

### Setup

1. Install the ntfy app ([iOS](https://apps.apple.com/us/app/ntfy/id1625396347) / [Android](https://play.google.com/store/apps/details?id=io.heckel.ntfy)) or use the [web app](https://ntfy.sh/app).
2. Pick a topic name and subscribe to it in the app. **Anyone who knows your topic name can read and publish to it** — use a long, random, hard-to-guess value (e.g. `visa-l1-a8f3c9e2`), not something guessable like `my-visa-alerts`. Treat it like a password.
3. In extension **Settings**, check **Enable ntfy push alerts**, enter the topic, and click **Save**.
4. Click **Send test push** to verify it arrives on your phone.
5. (Optional) If you've configured your own ntfy server to require auth for publishing, set the **access token** field too. This isn't needed for the free ntfy.sh service with a private topic name.

### Push priority and tags

| Event | Priority | Tag |
|---|---|---|
| Slot opened | 5 (urgent) | 🚨 `rotating_light` |
| Manual check + open | 5 (urgent) | 🚨 `rotating_light` |
| Date changed | 4 (high) | 📅 `calendar` |
| Bulletin published | 4 (high) | 📰 `newspaper` |
| Checker run failed (GitHub Actions only — currently disabled, see below) | 2 (low) | ⚠️ `warning` |

### When Notifications Are Sent

| Trigger | Condition | Desktop | Email | Push |
|---|---|:---:|:---:|:---:|
| Slot opened | Target month transitions from closed → open | ✓ | ✓ | ✓ |
| Date changed | Biometrics or CA date changes from previous check | ✓ | ✓ | ✓ |
| Manual check | "Check now" clicked and slots are currently open | | ✓ | ✓ |
| Bulletin published | Upcoming visa bulletin changes from "Coming Soon" → published | ✓ | ✓ | ✓ |

Email and push are each independently toggled in Settings — enable either, both, or neither. Both only fire while the extension's service worker is active (the browser is running) — see the note on the GitHub Actions checker below for why that's currently the only working path.

## GitHub Actions Checker (built, currently disabled)

`.github/workflows/check.yml` + `ci/check.mjs` run the same detection headlessly via Playwright, intended to catch changes with the laptop closed. **It's disabled** — confirmed non-functional on GitHub-hosted runners, not just untested:

- checkvisaslots.com's Vercel bot checkpoint returned `HTTP 429` to the runner on two separate runs (two different ephemeral IPs).
- travel.state.gov's Cloudflare WAF returned `HTTP 403` on both of those same runs.

This isn't a bug in the checker — the same Playwright code, run from this project's own network, successfully passes both checks (verified manually). Both sites appear to block generic cloud/datacenter IP ranges at the edge, which includes GitHub's shared runners regardless of browser fingerprint or user-agent.

**What would actually fix it**, if revisited later:
- A **self-hosted GitHub Actions runner** on a device on a network that isn't blocked (e.g. an always-on machine at home) — the most reliable option, since it reuses a network already confirmed to work.
- A **paid proxy or different hosting provider**, tested for real before committing — unverified, and there's no strong reason to expect it fares better against Cloudflare specifically.

### Running it locally anyway

The checker still works from a normal machine/network (proven — see above), useful for spot-checking or if you want to revisit always-on coverage later:

```
npm install
npx playwright install chromium
node ci/check.mjs --dry-run          # prints what it would send, doesn't publish or write state
NTFY_TOPIC=your-topic node ci/check.mjs   # runs for real, including a live ntfy push
```

`--dry-run` never touches `ci/state.json` or ntfy, so it's safe to run repeatedly while testing.

### If you re-enable it

- Re-enable from the repo's **Actions** tab, or `gh workflow enable check.yml`.
- Needs repo secrets `NTFY_TOPIC` (required) and `NTFY_TOKEN` (optional) under **Settings → Secrets and variables → Actions**.
- The repo needs to stay **public** for unlimited free Actions minutes at a 15-minute cadence (a private repo would exceed the 2,000 free minutes/month) — there are no secrets in the codebase itself, EmailJS/ntfy credentials live in `chrome.storage.sync` for the extension and in repo secrets for CI.
- If both the extension (with push enabled) and the checker are active on the same ntfy topic, every alert arrives twice — point them at different topics, or leave the extension's push toggle off.
- GitHub disables scheduled workflows after 60 days without repo activity.

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
- If the site returns a **Vercel Security Checkpoint** in the extension, open the target URL in a normal tab, complete verification, then click **Check now**.
- For calendar views, VAC dates are shown in green and Non-VAC in red; the tab parser uses these color cues.
- Bulletin checks run on the same interval as slot checks (every alarm cycle, plus on install/startup). If the bulletin check is failing (e.g. this network is blocked by Cloudflare), the popup shows a warning with the last successful check time instead of silently displaying a stale cached title — see `bulletinCheckError` / `bulletinLastCheckAt`.
- The detection core (`src/background/detection.js`, `bulletin.js`, `config.js`, `dates.js`) and the calendar-reading probe (`src/shared/dom-probe.js`) are shared verbatim between the extension and `ci/check.mjs` (see GitHub Actions Checker above), so both agree on what "open" means even though the CI path is currently disabled.
