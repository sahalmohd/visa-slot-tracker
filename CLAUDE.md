# Visa Slot Tracker — Claude Context

## What this is

A Chrome Extension (Manifest V3) that monitors US visa appointment availability on checkvisaslots.com and the State Department visa bulletin (travel.state.gov). Sends desktop, email, and ntfy push notifications when changes are detected. A GitHub Actions workflow (`.github/workflows/check.yml`) runs the same detection headlessly on a 15-minute cron via Playwright, independent of the browser — see `ci/`.

## Source layout

```
src/background/
  index.js         — entry point: alarm scheduling, message listeners, runCheck()
  constants.js     — URLs, regexes, MONTH_NAMES, VISA_CATEGORIES (30 types)
  config.js        — dynamic target month/category state, URL builder (getTargetUrl, getTargetMonthLabel, etc.)
                      applySettings() is the pure state-setter — chrome-free, also used by ci/check.mjs
  dates.js         — date parsing, parseLabelToEpoch(), sanitize()
  detection.js     — detectOpenJulySlot(): fetch-based HTML text parsing
  bulletin.js      — visa bulletin fetch, parse, change tracking (runBulletinCheck, parseBulletinPage)
  email.js         — EmailJS REST integration (sendEmailNotification)
  push.js          — ntfy integration (getPushSettings, sendPushNotification)
  notifications.js — desktop/email/push fan-out via a single dispatch() helper, badge updates
  tab-detection.js — DOM-based detection via injected script into open/auto-created tab
                      (the injected function itself now lives in src/shared/dom-probe.js)

src/shared/  — chrome-free, shared verbatim between the extension and ci/check.mjs
  dom-probe.js — domProbe: injected calendar-reading probe (chrome.scripting.executeScript AND Playwright page.evaluate)
  merge.js     — mergeLatestDates(), promoteIfDatesInTargetMonth() — date-merge/target-month-open logic
  ntfy.js      — publishNtfy(): POSTs JSON to ntfy.sh (not the header-based API — message text can be non-ASCII)

src/popup/popup.js      — popup UI; communicates via chrome.runtime.sendMessage
src/options/options.js  — settings page; sends updateSettings message
manifest.json           — MV3; permissions: alarms, storage, notifications, tabs, scripting
                           host_permissions includes https://ntfy.sh/*

ci/
  check.mjs    — Playwright-driven slot + bulletin check for GitHub Actions; imports the shared/
                 and background/{config,detection,bulletin}.js modules directly (Node ESM)
  config.json  — target month / visa category for the CI run (no secrets)
  state.json   — CI's equivalent of chrome.storage.local; committed back by the workflow after each run

.github/workflows/check.yml — runs `node ci/check.mjs` every 15 min; needs repo secrets
                               NTFY_TOPIC (required) and NTFY_TOKEN (optional)
```

## Key runtime flow

1. Alarm fires every 1–60 min → `runCheck()` + `checkBulletin()` run in parallel
2. `runCheck()`: fetch HTML → `detectOpenJulySlot()` (text parse) → fallback `detectFromOpenTab()` (DOM parse)
3. Both results merged via `mergeLatestDates()`; `promoteIfDatesInTargetMonth()` flips isOpen if dates land in the target month
4. Results written to `chrome.storage.local`; popup reads via `getStatus` message
5. Notifications fire for: slot open (closed→open), date change, bulletin published, manual check — each fans out through `notifications.js`'s `dispatch()` to desktop + email + ntfy push independently (one channel failing/being disabled never blocks the others)
6. Independently of the browser, `.github/workflows/check.yml` runs `ci/check.mjs` on a cron: same detection logic via Playwright (headless Chromium, real UA — needed because both target sites sit behind bot-detection that blocks plain `fetch`), diffing against `ci/state.json` and publishing to ntfy directly (no email path in CI)

## Detection strategies

- **Fetch + text**: HTML regex for positive/negative keywords + date candidates near target month
- **DOM / tab**: injects script into open tab, toggles VAC (green) / Non-VAC (red) filter buttons, reads react-calendar active dates
- VAC = Biometrics appointments; Non-VAC = Consular Appointments (CA)
- Vercel security checkpoint blocks fetch on checkvisaslots.com; user must open site in a tab and complete verification (in CI, `ci/check.mjs` checks the response body for the same checkpoint text and fails loudly instead)
- travel.state.gov sits behind Cloudflare; some networks/IPs get an outright 403 (not a JS challenge — a real browser hits it too), which is why the bulletin check has no in-extension fallback like the tab-detection one. `bulletinCheckError` + `bulletinLastCheckAt` are surfaced in the popup specifically so a blocked network shows as a visible warning instead of silently freezing the cached title

## Defaults

- Visa category: `l-1-individual-regular` (L-1 Individual Regular)
- Target month: `July 2026`
- Check interval: `5` minutes

## chrome.storage keys

**local:** `lastCheckAt`, `lastOpen`, `lastCheckError`, `lastCheckTrigger`, `lastEvidence`, `lastVacLatestDate`, `lastNonVacLatestDate`, `lastCheckSource`, `lastNotificationAt`, `lastEmailAt`, `lastEmailError`, `lastPushAt`, `lastPushError`, `bulletinCurrentTitle`, `bulletinCurrentUrl`, `bulletinUpcomingTitle`, `bulletinUpcomingUrl`, `bulletinUpcomingIsComingSoon`, `bulletinUpcomingWasComingSoon`, `bulletinLastCheckAt`, `bulletinCheckError`, `lastDebugInfo`

**sync:** `intervalMinutes`, `targetMonth`, `visaCategory`, `emailEnabled`, `emailTo`, `emailjsServiceId`, `emailjsTemplateId`, `emailjsPublicKey`, `ntfyEnabled`, `ntfyTopic`, `ntfyToken`, `notifyDateChange`, `debugEnabled`

## Message types (popup/options → background)

| Type | Purpose |
|---|---|
| `checkNow` | Run immediate check; notifies (desktop/email/push) if open |
| `getStatus` | Read all local storage state |
| `checkBulletin` | Run bulletin check immediately |
| `updateInterval` | Update alarm interval only |
| `updateSettings` | Save all settings + reschedule alarm |
| `sendTestEmail` | Send test email with last known dates |
| `sendTestPush` | Send test ntfy push (bypasses the `ntfyEnabled` toggle via `force: true`) |

## Email (EmailJS)

Free tier: 200 emails/month. Template variables: `to_email`, `subject`, `message`, `target_month`, `target_url`, `evidence`, `vac_latest_date`, `non_vac_latest_date`, `checked_at`.

## Push (ntfy)

Topic-based, no account needed. The topic name is the only access control — anyone who knows it can read and publish, so it should be long/random, not guessable. `src/shared/ntfy.js` publishes via JSON body (`POST https://ntfy.sh/`), not ntfy's header-based API, because header values must be ASCII and alert text can contain non-ASCII characters (e.g. "→" in date-change messages). Same topic can be used by both the extension and the CI workflow, or two different ones — using the same one means every alert arrives twice (documented in README).
