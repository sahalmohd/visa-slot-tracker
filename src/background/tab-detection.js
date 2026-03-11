import { TARGET_URL, TARGET_URL_PATTERNS } from "./constants.js";
import { getTargetMonthLabel } from "./config.js";
import {
  detectOpenJulySlot, cleanHtmlToText, extractDatesFromRecentSlots
} from "./detection.js";
import { parseLabelToEpoch } from "./dates.js";

function waitForTabComplete(tabId, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    let done = false;
    let timeoutId = null;

    function cleanup() {
      if (timeoutId) clearTimeout(timeoutId);
      chrome.tabs.onUpdated.removeListener(onUpdated);
    }

    function finish(fn) {
      if (done) return;
      done = true;
      cleanup();
      fn();
    }

    function onUpdated(updatedTabId, changeInfo) {
      if (updatedTabId !== tabId) return;
      if (changeInfo.status === "complete") finish(resolve);
    }

    timeoutId = setTimeout(() => {
      finish(() => reject(new Error("Timed out waiting for target tab to finish loading.")));
    }, timeoutMs);

    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.get(tabId)
      .then((tab) => { if (tab?.status === "complete") finish(resolve); })
      .catch(() => {});
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function detectFromOpenTab({ allowCreate = false } = {}) {
  const tabs = await chrome.tabs.query({ url: TARGET_URL_PATTERNS });
  let tab = tabs.find((item) => Number.isInteger(item.id));
  let created = false;

  if (!tab?.id && allowCreate) {
    tab = await chrome.tabs.create({ url: TARGET_URL, active: false });
    created = true;
  }

  if (!tab?.id) return null;

  if (created) {
    await waitForTabComplete(tab.id);
    await delay(3500);
  }

  try {
    const injections = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      args: [getTargetMonthLabel()],
      func: buildInjectedFunction()
    });

    const payload = injections?.[0]?.result;
    if (!payload) return null;

    const html = `${payload.html}\n<!-- innerText -->\n${payload.text}`;
    const result = detectOpenJulySlot(html);

    const cleanedText = cleanHtmlToText(html);
    const recentSlotsResult = extractDatesFromRecentSlots(cleanedText);

    const allVacSources = [payload.latestVacDate, result.latestVacDate];
    const allNonVacSources = [payload.latestNonVacDate, result.latestNonVacDate];

    for (const src of allVacSources) {
      if (src && src !== "Not found" && parseLabelToEpoch(src) > parseLabelToEpoch(result.latestVacDate)) {
        result.latestVacDate = src;
      }
    }
    for (const src of allNonVacSources) {
      if (src && src !== "Not found" && parseLabelToEpoch(src) > parseLabelToEpoch(result.latestNonVacDate)) {
        result.latestNonVacDate = src;
      }
    }

    const debugInfo = {
      recentSlotsVac: recentSlotsResult?.latestVacDate || "Not found",
      recentSlotsNonVac: recentSlotsResult?.latestNonVacDate || "Not found",
      domVac: payload.latestVacDate || "Not found",
      domNonVac: payload.latestNonVacDate || "Not found",
      allDatesWithActivity: payload.latestDateWithActivity || "Not found",
      recentSlotsEntries: recentSlotsResult?.debugEntries || [],
      debugFilterInfo: payload.debugFilterInfo || {},
      finalVac: result.latestVacDate,
      finalNonVac: result.latestNonVacDate
    };
    console.log("[visa-debug] Detection results:", JSON.stringify(debugInfo, null, 2));
    await chrome.storage.local.set({ lastDebugInfo: JSON.stringify(debugInfo, null, 2) });

    return { result, source: created ? "auto-tab+color" : "open-tab+color" };
  } finally {
    if (created && tab?.id) {
      await chrome.tabs.remove(tab.id).catch(() => {});
    }
  }
}

/**
 * Injected into the target tab. Self-contained — no imports.
 *
 * Strategy:
 * 1. Read the calendar grid for the latest date with ANY slot activity.
 * 2. Use location filter buttons to isolate VAC-only and Non-VAC-only,
 *    then read the latest active date for each.
 * 3. Restore all filters to their original state.
 */
function buildInjectedFunction() {
  return async (targetMonthLabel) => {
    const MONTH_NAMES_INJECT = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"
    ];
    const MONTH_INDEX_INJECT = {
      jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
      jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
    };

    function parseTargetMonthLabelInject(label) {
      const match = String(label || "").match(/^\s*([a-zA-Z]+)\s+(\d{4})\s*$/);
      if (!match) return { month: 6, year: 2026 };
      const month = MONTH_INDEX_INJECT[match[1].toLowerCase().slice(0, 3)];
      const year = Number(match[2]);
      if (!Number.isInteger(month) || !Number.isInteger(year)) return { month: 6, year: 2026 };
      return { month, year };
    }

    const targetMonthInfo = parseTargetMonthLabelInject(targetMonthLabel);
    const targetRangeStartEpoch = Date.UTC(targetMonthInfo.year, 0, 1);
    const targetRangeEndEpoch = Date.UTC(
      targetMonthInfo.year, targetMonthInfo.month + 1, 0, 23, 59, 59, 999
    );

    function buildLabel(year, month, day) {
      return `${MONTH_NAMES_INJECT[month]} ${day}, ${year}`;
    }

    function parseDateFromAriaLabel(value) {
      const text = String(value || "");
      if (!text) return null;
      const monthPattern = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
      const match = text.match(new RegExp(`\\b${monthPattern}\\s+([0-3]?\\d)(?:st|nd|rd|th)?[,]?\\s*(20\\d{2})\\b`, "i"));
      if (!match) return null;
      const month = MONTH_INDEX_INJECT[match[1].toLowerCase().slice(0, 3)];
      const day = Number(match[2]);
      const year = Number(match[3]);
      if (!Number.isInteger(month) || day < 1 || day > 31) return null;
      const date = new Date(Date.UTC(year, month, day));
      if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month || date.getUTCDate() !== day) return null;
      return { label: buildLabel(year, month, day), epoch: date.getTime() };
    }

    function getLatestActiveDateFromGrid() {
      const tiles = document.querySelectorAll(".react-calendar__month-view__days__day");
      let latest = null;

      for (const tile of tiles) {
        const cls = (tile.className || "").toString();
        const hasActivity = cls.includes("!bg-yellow") || cls.includes("!bg-red") || cls.includes("!bg-green");
        if (!hasActivity) continue;

        const abbr = tile.querySelector("abbr");
        const ariaLabel = abbr?.getAttribute("aria-label") || "";
        const parsed = parseDateFromAriaLabel(ariaLabel);
        if (!parsed) continue;
        if (parsed.epoch < targetRangeStartEpoch || parsed.epoch > targetRangeEndEpoch) continue;

        if (!latest || parsed.epoch > latest.epoch) {
          latest = parsed;
        }
      }

      return latest?.label || "Not found";
    }

    function getLocationButtons() {
      const buttons = document.querySelectorAll('button[id^="location-"]');
      const vac = [];
      const nonVac = [];
      for (const btn of buttons) {
        const id = btn.id.replace("location-", "");
        if (/\bvac\b/i.test(id)) {
          vac.push(btn);
        } else {
          nonVac.push(btn);
        }
      }
      return { vac, nonVac, all: Array.from(buttons) };
    }

    function getButtonStates(buttons) {
      return buttons.map(btn => ({
        id: btn.id,
        checked: btn.getAttribute("aria-checked") === "true"
      }));
    }

    function setButtonState(btn, shouldBeChecked) {
      const isChecked = btn.getAttribute("aria-checked") === "true";
      if (isChecked !== shouldBeChecked) {
        btn.click();
      }
    }

    function sleep(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    }

    const { vac: vacButtons, nonVac: nonVacButtons, all: allButtons } = getLocationButtons();
    const debugFilterInfo = {
      vacLocations: vacButtons.map(b => b.id),
      nonVacLocations: nonVacButtons.map(b => b.id),
      totalButtons: allButtons.length
    };

    const originalStates = getButtonStates(allButtons);
    const latestDateWithActivity = getLatestActiveDateFromGrid();

    let latestVacDate = "Not found";
    let latestNonVacDate = "Not found";

    if (allButtons.length > 0) {
      try {
        // --- Read VAC-only dates ---
        for (const btn of nonVacButtons) setButtonState(btn, false);
        for (const btn of vacButtons) setButtonState(btn, true);
        await sleep(600);
        latestVacDate = getLatestActiveDateFromGrid();

        // --- Read Non-VAC-only dates ---
        for (const btn of vacButtons) setButtonState(btn, false);
        for (const btn of nonVacButtons) setButtonState(btn, true);
        await sleep(600);
        latestNonVacDate = getLatestActiveDateFromGrid();
      } finally {
        // --- Restore original state ---
        for (const state of originalStates) {
          const btn = document.getElementById(state.id);
          if (btn) setButtonState(btn, state.checked);
        }
      }
    }

    const html = document.documentElement?.outerHTML || "";
    const text = document.body?.innerText || "";
    return {
      html, text,
      latestVacDate,
      latestNonVacDate,
      latestDateWithActivity,
      debugFilterInfo
    };
  };
}
