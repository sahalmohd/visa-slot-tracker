import { getTargetMonthLabel, getTargetUrl, getTargetUrlPatterns } from "./config.js";
import {
  detectOpenJulySlot, cleanHtmlToText, extractDatesFromRecentSlots
} from "./detection.js";
import { mergeLatestDates } from "../shared/merge.js";
import { domProbe } from "../shared/dom-probe.js";

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
  const tabs = await chrome.tabs.query({ url: getTargetUrlPatterns() });
  let tab = tabs.find((item) => Number.isInteger(item.id));
  let created = false;

  if (!tab?.id && allowCreate) {
    tab = await chrome.tabs.create({ url: getTargetUrl(), active: false });
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
      func: domProbe
    });

    const payload = injections?.[0]?.result;
    if (!payload) return null;

    const html = `${payload.html}\n<!-- innerText -->\n${payload.text}`;
    const result = detectOpenJulySlot(html);

    const cleanedText = cleanHtmlToText(html);
    const recentSlotsResult = extractDatesFromRecentSlots(cleanedText);

    mergeLatestDates(result, payload.latestVacDate, payload.latestNonVacDate);

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
