const TARGET_URL =
  "https://checkvisaslots.com/visa-slots-info/in/l-1-individual-regular/";
const TARGET_MONTH_LABEL = "July 2026";
const ALARM_NAME = "visa-slot-check";
const DEFAULT_INTERVAL_MINUTES = 5;

function cleanHtmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function getJuly2026Snippets(text) {
  const snippets = [];
  const pattern = /(?:jul(?:y)?[\s,/.-]*2026|2026[\s,/.-]*jul(?:y)?)/gi;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    const start = Math.max(0, match.index - 140);
    const end = Math.min(text.length, match.index + match[0].length + 140);
    snippets.push(text.slice(start, end));
  }
  return snippets;
}

function hasPositiveCount(snippet) {
  const patterns = [
    /(?:slots?|appointments?)\s*(?:available)?\s*[:=-]?\s*(\d{1,3})/gi,
    /(\d{1,3})\s*(?:slots?|appointments?)/gi,
    /(?:jul(?:y)?[\s,/.-]*2026|2026[\s,/.-]*jul(?:y)?)[^0-9]{0,18}(\d{1,3})/gi,
    /(\d{1,3})[^0-9]{0,18}(?:jul(?:y)?[\s,/.-]*2026|2026[\s,/.-]*jul(?:y)?)/gi
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(snippet)) !== null) {
      const value = Number(match[1]);
      if (Number.isFinite(value) && value > 0) {
        return true;
      }
    }
  }
  return false;
}

function detectOpenJulySlot(html) {
  const text = cleanHtmlToText(html);
  const snippets = getJuly2026Snippets(text);
  if (snippets.length === 0) {
    return { isOpen: false, evidence: "No July 2026 entry found." };
  }

  const positiveKeywords =
    /\b(open|available|book now|appointments? available|slots? open)\b/i;
  const negativeKeywords =
    /\b(no slots?|not available|unavailable|closed|none|full|n\/a|0 slots?)\b/i;

  for (const snippet of snippets) {
    const hasCount = hasPositiveCount(snippet);
    const hasPositiveWord = positiveKeywords.test(snippet);
    const hasNegativeWord = negativeKeywords.test(snippet);

    if ((hasCount || hasPositiveWord) && !hasNegativeWord) {
      return { isOpen: true, evidence: snippet.slice(0, 220) };
    }
  }

  return { isOpen: false, evidence: snippets[0].slice(0, 220) };
}

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
  chrome.alarms.create(ALARM_NAME, {
    periodInMinutes: intervalMinutes
  });
}

async function setBadge(isOpen) {
  if (isOpen) {
    await chrome.action.setBadgeBackgroundColor({ color: "#b91c1c" });
    await chrome.action.setBadgeText({ text: "OPEN" });
  } else {
    await chrome.action.setBadgeText({ text: "" });
  }
}

async function notifyOpen(evidence) {
  await chrome.notifications.create({
    type: "basic",
    iconUrl: "icon-128.png",
    title: "Visa Slot Alert",
    message: `July 2026 slot looks OPEN. ${TARGET_MONTH_LABEL} may be available.`,
    priority: 2
  });

  await chrome.storage.local.set({
    lastNotificationEvidence: evidence,
    lastNotificationAt: Date.now()
  });
}

async function runCheck(trigger = "alarm") {
  const startedAt = Date.now();
  try {
    const response = await fetch(TARGET_URL, {
      cache: "no-store",
      credentials: "include"
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const html = await response.text();
    if (
      /vercel security checkpoint|we're verifying your browser|security checkpoint/i.test(
        html
      )
    ) {
      throw new Error(
        "Blocked by Vercel security checkpoint. Open the target site in a normal tab and complete verification, then try again."
      );
    }

    const result = detectOpenJulySlot(html);
    const previous = await chrome.storage.local.get({
      lastOpen: false
    });

    if (result.isOpen && !previous.lastOpen) {
      await notifyOpen(result.evidence);
    }

    await chrome.storage.local.set({
      lastCheckAt: startedAt,
      lastOpen: result.isOpen,
      lastCheckError: "",
      lastCheckTrigger: trigger,
      lastEvidence: result.evidence
    });
    await setBadge(result.isOpen);
    return { ok: true, ...result };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await chrome.storage.local.set({
      lastCheckAt: startedAt,
      lastCheckError: message,
      lastCheckTrigger: trigger
    });
    await setBadge(false);
    return { ok: false, error: message };
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.sync.get("intervalMinutes");
  if (typeof existing.intervalMinutes !== "number") {
    await chrome.storage.sync.set({
      intervalMinutes: DEFAULT_INTERVAL_MINUTES
    });
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
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : String(error)
        })
      );
    return true;
  }

  return false;
});
