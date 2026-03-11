import { TARGET_URL, DEFAULT_INTERVAL_MINUTES, DEFAULT_TARGET_MONTH, ALARM_NAME } from "./constants.js";
import { loadTargetMonth, getTargetMonthLabel } from "./config.js";
import { sanitize, parseLabelToEpoch } from "./dates.js";
import { detectOpenJulySlot } from "./detection.js";
import { sendEmailNotification } from "./email.js";
import { setBadge, notifyOpen, notifyDateChange } from "./notifications.js";
import { detectFromOpenTab } from "./tab-detection.js";

async function getSettings() {
  const { intervalMinutes } = await chrome.storage.sync.get({
    intervalMinutes: DEFAULT_INTERVAL_MINUTES
  });
  const parsed = Number(intervalMinutes);
  return {
    intervalMinutes:
      Number.isFinite(parsed) && parsed >= 1
        ? Math.min(parsed, 60)
        : DEFAULT_INTERVAL_MINUTES
  };
}

async function scheduleAlarm() {
  const { intervalMinutes } = await getSettings();
  await chrome.alarms.clear(ALARM_NAME);
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: intervalMinutes });
}

async function runCheck(trigger = "alarm") {
  await loadTargetMonth();
  const startedAt = Date.now();
  let result = null;
  let source = "fetch";
  let primaryError = "";

  try {
    const response = await fetch(TARGET_URL, {
      cache: "no-store",
      credentials: "include"
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const html = await response.text();
    if (/vercel security checkpoint|we're verifying your browser|security checkpoint/i.test(html)) {
      primaryError =
        "Blocked by Vercel security checkpoint. Open the target site in a normal tab and complete verification, then try again.";
    } else {
      result = detectOpenJulySlot(html, { strictDateExtraction: true });
    }
  } catch (error) {
    primaryError = error instanceof Error ? error.message : String(error);
  }

  try {
    const fallback = await detectFromOpenTab({ allowCreate: true });
    if (fallback) {
      if (!result) {
        result = fallback.result;
        source = fallback.source;
        primaryError = "";
      } else {
        source = fallback.source;
        primaryError = "";
        if (fallback.result.isOpen && !result.isOpen) {
          result.isOpen = true;
          result.evidence = fallback.result.evidence || result.evidence;
        }
        const fetchVacEpoch = parseLabelToEpoch(result.latestVacDate);
        const tabVacEpoch = parseLabelToEpoch(fallback.result.latestVacDate);
        if (tabVacEpoch > fetchVacEpoch) {
          result.latestVacDate = fallback.result.latestVacDate;
        }
        const fetchNonVacEpoch = parseLabelToEpoch(result.latestNonVacDate);
        const tabNonVacEpoch = parseLabelToEpoch(fallback.result.latestNonVacDate);
        if (tabNonVacEpoch > fetchNonVacEpoch) {
          result.latestNonVacDate = fallback.result.latestNonVacDate;
        }
      }
    }
  } catch (error) {
    if (!primaryError) {
      primaryError = error instanceof Error ? error.message : String(error);
    }
  }

  if (result) {
    const previous = await chrome.storage.local.get({
      lastOpen: false,
      lastVacLatestDate: "Not found",
      lastNonVacLatestDate: "Not found"
    });

    if (result.isOpen && !previous.lastOpen) {
      await notifyOpen(result.evidence, result.latestVacDate, result.latestNonVacDate);
    }

    const vacChanged = result.latestVacDate !== previous.lastVacLatestDate;
    const nonVacChanged = result.latestNonVacDate !== previous.lastNonVacLatestDate;
    if (vacChanged || nonVacChanged) {
      await notifyDateChange({
        prevVac: previous.lastVacLatestDate,
        prevNonVac: previous.lastNonVacLatestDate,
        newVac: result.latestVacDate,
        newNonVac: result.latestNonVacDate
      });
    }

    await chrome.storage.local.set({
      lastCheckAt: startedAt,
      lastOpen: result.isOpen,
      lastCheckError: "",
      lastCheckTrigger: trigger,
      lastEvidence: result.evidence,
      lastVacLatestDate: result.latestVacDate,
      lastNonVacLatestDate: result.latestNonVacDate,
      lastCheckSource: source
    });
    await setBadge(result.isOpen);
    return { ok: true, source, ...result };
  }

  const message =
    primaryError ||
    "Could not parse slot data. Keep the target page open in a tab and try again.";
  await chrome.storage.local.set({
    lastCheckAt: startedAt,
    lastCheckError: message,
    lastCheckTrigger: trigger,
    lastCheckSource: "none"
  });
  await setBadge(false);
  return { ok: false, error: message };
}

// --- Event listeners ---

chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.sync.get("intervalMinutes");
  if (typeof existing.intervalMinutes !== "number") {
    await chrome.storage.sync.set({ intervalMinutes: DEFAULT_INTERVAL_MINUTES });
  }
  await scheduleAlarm();
  await runCheck("install");
});

chrome.runtime.onStartup.addListener(async () => {
  await scheduleAlarm();
  await runCheck("startup");
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM_NAME) {
    await runCheck("alarm");
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "checkNow") {
    runCheck("manual").then(sendResponse);
    return true;
  }

  if (message?.type === "getStatus") {
    chrome.storage.local
      .get({
        lastCheckAt: 0,
        lastCheckError: "",
        lastOpen: false,
        lastCheckTrigger: "",
        lastEvidence: "",
        lastVacLatestDate: "Not found",
        lastNonVacLatestDate: "Not found",
        lastCheckSource: "",
        lastNotificationAt: 0
      })
      .then(sendResponse);
    return true;
  }

  if (message?.type === "updateInterval") {
    const next = Number(message.intervalMinutes);
    const intervalMinutes =
      Number.isFinite(next) && next >= 1
        ? Math.min(next, 60)
        : DEFAULT_INTERVAL_MINUTES;
    chrome.storage.sync
      .set({ intervalMinutes })
      .then(scheduleAlarm)
      .then(() => sendResponse({ ok: true, intervalMinutes }))
      .catch((error) =>
        sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) })
      );
    return true;
  }

  if (message?.type === "updateSettings") {
    const intervalInput = Number(message.intervalMinutes);
    const intervalMinutes =
      Number.isFinite(intervalInput) && intervalInput >= 1
        ? Math.min(intervalInput, 60)
        : DEFAULT_INTERVAL_MINUTES;
    const targetMonth = sanitize(message.targetMonth) || DEFAULT_TARGET_MONTH;

    const payload = {
      intervalMinutes, targetMonth,
      emailEnabled: Boolean(message.emailEnabled),
      emailTo: sanitize(message.emailTo),
      emailjsServiceId: sanitize(message.emailjsServiceId),
      emailjsTemplateId: sanitize(message.emailjsTemplateId),
      emailjsPublicKey: sanitize(message.emailjsPublicKey),
      debugEnabled: Boolean(message.debugEnabled)
    };

    chrome.storage.sync
      .set(payload)
      .then(() => loadTargetMonth())
      .then(scheduleAlarm)
      .then(() => sendResponse({ ok: true, intervalMinutes }))
      .catch((error) =>
        sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) })
      );
    return true;
  }

  if (message?.type === "sendTestEmail") {
    chrome.storage.local
      .get({ lastVacLatestDate: "Not found", lastNonVacLatestDate: "Not found" })
      .then((data) =>
        sendEmailNotification({
          subject: "Visa Slot Alert: test email",
          message: "This is a test email from your Chrome extension email notification setup.",
          evidence: "Manual test from options page.",
          vacLatestDate: data.lastVacLatestDate,
          nonVacLatestDate: data.lastNonVacLatestDate,
          force: true
        })
      )
      .then(() => sendResponse({ ok: true }))
      .catch((error) =>
        sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) })
      );
    return true;
  }

  return false;
});
