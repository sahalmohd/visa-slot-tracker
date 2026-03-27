# Visa Slot Tracker — Claude Context

## What this is

A Chrome Extension (Manifest V3) that monitors US visa appointment availability on checkvisaslots.com and the State Department visa bulletin (travel.state.gov). Sends desktop and email notifications when changes are detected.

## Source layout

```
src/background/
  index.js         — entry point: alarm scheduling, message listeners, runCheck()
  constants.js     — URLs, regexes, MONTH_NAMES, VISA_CATEGORIES (30 types)
  config.js        — dynamic target month/category state, URL builder (getTargetUrl, getTargetMonthLabel, etc.)
  dates.js         — date parsing, parseLabelToEpoch(), sanitize()
  detection.js     — detectOpenJulySlot(): fetch-based HTML text parsing
  bulletin.js      — visa bulletin fetch, parse, change tracking (runBulletinCheck)
  email.js         — EmailJS REST integration (sendEmailNotification)
  notifications.js — desktop notifications, badge updates, email triggers
  tab-detection.js — DOM-based detection via injected script into open/auto-created tab

src/popup/popup.js      — popup UI; communicates via chrome.runtime.sendMessage
src/options/options.js  — settings page; sends updateSettings message
manifest.json           — MV3; permissions: alarms, storage, notifications, tabs, scripting
```

## Key runtime flow

1. Alarm fires every 1–60 min → `runCheck()` + `checkBulletin()` run in parallel
2. `runCheck()`: fetch HTML → `detectOpenJulySlot()` (text parse) → fallback `detectFromOpenTab()` (DOM parse)
3. Both results merged: tab result upgrades dates if later than fetch result
4. Results written to `chrome.storage.local`; popup reads via `getStatus` message
5. Notifications fire for: slot open (closed→open), date change, bulletin published, manual check (also sends email)

## Detection strategies

- **Fetch + text**: HTML regex for positive/negative keywords + date candidates near target month
- **DOM / tab**: injects script into open tab, toggles VAC (green) / Non-VAC (red) filter buttons, reads react-calendar active dates
- VAC = Biometrics appointments; Non-VAC = Consular Appointments (CA)
- Vercel security checkpoint blocks fetch; user must open site in a tab and complete verification

## Defaults

- Visa category: `l-1-individual-regular` (L-1 Individual Regular)
- Target month: `July 2026`
- Check interval: `5` minutes

## chrome.storage keys

**local:** `lastCheckAt`, `lastOpen`, `lastCheckError`, `lastCheckTrigger`, `lastEvidence`, `lastVacLatestDate`, `lastNonVacLatestDate`, `lastCheckSource`, `bulletinCurrentTitle`, `bulletinCurrentUrl`, `bulletinUpcomingTitle`, `bulletinUpcomingUrl`, `bulletinUpcomingIsComingSoon`, `bulletinLastCheckAt`, `bulletinCheckError`

**sync:** `intervalMinutes`, `targetMonth`, `visaCategory`, `emailEnabled`, `emailTo`, `emailjsServiceId`, `emailjsTemplateId`, `emailjsPublicKey`, `notifyDateChange`, `debugEnabled`

## Message types (popup/options → background)

| Type | Purpose |
|---|---|
| `checkNow` | Run immediate check; email if open |
| `getStatus` | Read all local storage state |
| `checkBulletin` | Run bulletin check immediately |
| `updateInterval` | Update alarm interval only |
| `updateSettings` | Save all settings + reschedule alarm |
| `sendTestEmail` | Send test email with last known dates |

## Email (EmailJS)

Free tier: 200 emails/month. Template variables: `to_email`, `subject`, `message`, `target_month`, `target_url`, `evidence`, `vac_latest_date`, `non_vac_latest_date`, `checked_at`.
