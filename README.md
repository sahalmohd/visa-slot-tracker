# Visa Slot Tracker

A Chrome extension that monitors [checkvisaslots.com](https://checkvisaslots.com) for US visa appointment availability and the [State Department visa bulletin](https://travel.state.gov/content/travel/en/legal/visa-law0/visa-bulletin.html) for new publications. Sends desktop, email, and phone push notifications when changes are detected. A GitHub Actions workflow runs the same checks headlessly every 15 minutes, so alerts keep arriving even when the laptop is closed.

## Features

- **Configurable visa category** — supports 30 visa types (H-1B, L-1, B1/B2, F-1, etc.)
- **Automatic slot monitoring** — checks every 1–60 minutes (configurable) while the browser is running
- **Always-on checking** — a GitHub Actions cron job runs the same detection headlessly every 15 minutes, independent of the browser
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
├── ci/                             # Headless checker run by GitHub Actions
│   ├── check.mjs                  # Playwright-driven slot + bulletin check, publishes to ntfy
│   ├── config.json                # Target month / visa category for the CI run
│   └── state.json                 # Last-known state, committed back by the workflow
├── .github/workflows/
│   └── check.yml                  # Runs ci/check.mjs on a 15-minute cron
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
| Checker run failed (GitHub Actions only) | 2 (low) | ⚠️ `warning` |

### When Notifications Are Sent

| Trigger | Condition | Desktop | Email | Push |
|---|---|:---:|:---:|:---:|
| Slot opened | Target month transitions from closed → open | ✓ | ✓ | ✓ |
| Date changed | Biometrics or CA date changes from previous check | ✓ | ✓ | ✓ |
| Manual check | "Check now" clicked and slots are currently open | | ✓ | ✓ |
| Bulletin published | Upcoming visa bulletin changes from "Coming Soon" → published | ✓ | ✓ | ✓ |
| Checker run failed | GitHub Actions run hit an error (e.g. blocked by a bot checkpoint) | | | ✓ |

Email and push are each independently toggled in Settings — enable either, both, or neither. Desktop notifications only fire while the extension's service worker is active (the browser is running); email and push fire from both the extension and the GitHub Actions checker described below.

## Always-On Checking with GitHub Actions (Optional)

The extension only checks while Chrome is running. A GitHub Actions workflow (`.github/workflows/check.yml`) runs the same detection headlessly on a schedule, so alerts keep coming even with the laptop closed — using Playwright (headless Chromium) since both target sites sit behind bot-detection that blocks plain HTTP requests.

### Setup

1. **Make the repository public.** Scheduled workflows get unlimited free Actions minutes on public repos; a private repo would exceed the free 2,000 minutes/month at a 15-minute cadence. There are no secrets in the codebase — EmailJS and ntfy credentials live in `chrome.storage.sync` for the extension, and in repo secrets for CI.
2. In the repo's **Settings → Secrets and variables → Actions**, add:
   - `NTFY_TOPIC` — same topic you use in the extension, or a separate one if you'd rather tell the two sources apart.
   - `NTFY_TOKEN` — optional, only if your ntfy server requires it.
3. The workflow runs automatically every 15 minutes (`*/15 * * * *`). Trigger a run manually from the **Actions** tab (`workflow_dispatch`) to test it.
4. To change the target month or visa category for the CI run, edit `ci/config.json` and commit.

### Testing the checker locally

```
npm install
npx playwright install chromium
node ci/check.mjs --dry-run          # prints what it would send, doesn't publish or write state
NTFY_TOPIC=your-topic node ci/check.mjs   # runs for real, including a live ntfy push
```

`--dry-run` never touches `ci/state.json` or ntfy, so it's safe to run repeatedly while testing.

### Notes

- 15-minute cron is best-effort — GitHub can delay scheduled runs by 5–20+ minutes under load, especially at common intervals like `:00`/`:15`/`:30`/`:45`.
- GitHub disables scheduled workflows after 60 days of repo inactivity. The workflow commits `ci/state.json` on every change, which resets that clock; if the repo goes fully quiet (no state changes, no other commits) for two months, re-enable it from the Actions tab.
- `ci/state.json` is the CI equivalent of the extension's local storage — it's what the workflow diffs against to decide whether something changed. It's committed back to the repo after each run.
- If both the extension (with push enabled) and the GitHub Actions checker are active and pointed at the same ntfy topic, you'll get every alert twice. Either leave the extension's push toggle off once CI is verified working, or point them at different topics.
- If checkvisaslots.com's bot checkpoint blocks the runner, the workflow sends a low-priority "run failed" push instead of staying silent, and exits non-zero (visible as a red X in the Actions tab).

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
- If the site returns a **Vercel Security Checkpoint** in the extension, open the target URL in a normal tab, complete verification, then click **Check now**. The GitHub Actions checker handles this differently — see its Notes above.
- For calendar views, VAC dates are shown in green and Non-VAC in red; the tab parser uses these color cues.
- Bulletin checks run on the same interval as slot checks (every alarm cycle, plus on install/startup).
- The detection core (`src/background/detection.js`, `bulletin.js`, `config.js`, `dates.js`) and the calendar-reading probe (`src/shared/dom-probe.js`) are shared verbatim between the extension and the GitHub Actions checker, so both should always agree on what "open" means.
