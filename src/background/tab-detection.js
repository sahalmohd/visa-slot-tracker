import { MONTH_NAMES, MONTH_INDEX, TARGET_URL, TARGET_URL_PATTERNS } from "./constants.js";
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
    await delay(2500);
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

    const allVacSources = [payload.vacLatestDateByColor, payload.gridVac, result.latestVacDate];
    const allNonVacSources = [payload.nonVacLatestDateByColor, payload.gridNonVac, result.latestNonVacDate];

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
      colorVac: payload.vacLatestDateByColor || "Not found",
      colorNonVac: payload.nonVacLatestDateByColor || "Not found",
      gridVac: payload.gridVac || "Not found",
      gridNonVac: payload.gridNonVac || "Not found",
      debugGridInfo: payload.debugGridInfo || [],
      recentSlotsEntries: recentSlotsResult?.debugEntries || [],
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
 * Returns the function to inject into the target tab.
 * Kept as a separate builder so the injected code is self-contained
 * (chrome.scripting.executeScript requires a serializable function).
 */
function buildInjectedFunction() {
  return (targetMonthLabel) => {
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

    function normalizeColor(value) {
      if (!value) return null;
      const match = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
      if (!match) return null;
      return { r: Number(match[1]), g: Number(match[2]), b: Number(match[3]) };
    }

    function roleFromColor(el) {
      let node = el;
      for (let depth = 0; node && depth < 4; depth += 1) {
        const style = getComputedStyle(node);
        for (const value of [style.color, style.backgroundColor, style.borderColor]) {
          const color = normalizeColor(value);
          if (!color) continue;
          if (color.g >= 90 && color.g - Math.max(color.r, color.b) >= 28) return "vac";
          if (color.r >= 110 && color.r - Math.max(color.g, color.b) >= 30) return "nonVac";
        }
        node = node.parentElement;
      }
      return null;
    }

    function roleFromText(el) {
      let node = el;
      for (let depth = 0; node && depth < 5; depth += 1) {
        const hay = [
          node.className || "", node.id || "",
          node.getAttribute?.("aria-label") || "",
          node.getAttribute?.("title") || "",
          node.textContent || ""
        ].join(" ").toLowerCase();
        if (/\bnon[\s-]*vac\b|\bconsular\b|\binterview\b/.test(hay)) return "nonVac";
        if (/\bvac\b|\bbiometric\b|\bofc\b/.test(hay)) return "vac";
        node = node.parentElement;
      }
      return null;
    }

    function isVisibleElement(el) {
      if (!el || !(el instanceof Element)) return false;
      const rect = el.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return false;
      let node = el;
      for (let depth = 0; node && depth < 6; depth += 1) {
        const style = getComputedStyle(node);
        if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity || "1") < 0.1) return false;
        node = node.parentElement;
      }
      return true;
    }

    function isLikelyCalendarRoot(el) {
      if (!el || !(el instanceof Element)) return false;
      const hay = [el.id || "", el.className || "", el.getAttribute?.("aria-label") || "", el.textContent || ""].join(" ").toLowerCase();
      return /\b(vac|non[\s-]*vac|biometric|ofc|consular|interview|slot|calendar)\b/.test(hay) &&
        /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|20\d{2})\b/.test(hay);
    }

    function buildLabel(year, month, day) {
      return `${MONTH_NAMES_INJECT[month]} ${day}, ${year}`;
    }

    function parseDateFromString(value) {
      const text = String(value || "");
      if (!text) return null;
      let match;
      const monthPattern = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";

      match = text.match(new RegExp(`\\b${monthPattern}\\s+([0-3]?\\d)(?:st|nd|rd|th)?[,]?\\s*(20\\d{2})\\b`, "i"));
      if (match) {
        const month = MONTH_INDEX_INJECT[match[1].toLowerCase().slice(0, 3)];
        const day = Number(match[2]);
        const year = Number(match[3]);
        if (Number.isInteger(month) && day >= 1 && day <= 31) {
          const date = new Date(Date.UTC(year, month, day));
          if (date.getUTCFullYear() === year && date.getUTCMonth() === month && date.getUTCDate() === day) {
            return { label: buildLabel(year, month, day), epoch: date.getTime() };
          }
        }
      }

      match = text.match(new RegExp(`\\b([0-3]?\\d)(?:st|nd|rd|th)?\\s+${monthPattern}\\s*(20\\d{2})\\b`, "i"));
      if (match) {
        const month = MONTH_INDEX_INJECT[match[2].toLowerCase().slice(0, 3)];
        const day = Number(match[1]);
        const year = Number(match[3]);
        if (Number.isInteger(month) && day >= 1 && day <= 31) {
          const date = new Date(Date.UTC(year, month, day));
          if (date.getUTCFullYear() === year && date.getUTCMonth() === month && date.getUTCDate() === day) {
            return { label: buildLabel(year, month, day), epoch: date.getTime() };
          }
        }
      }

      match = text.match(/\b(20\d{2})[./-]([01]?\d)[./-]([0-3]?\d)\b/);
      if (match) {
        const year = Number(match[1]);
        const month = Number(match[2]) - 1;
        const day = Number(match[3]);
        if (month >= 0 && month <= 11 && day >= 1 && day <= 31) {
          const date = new Date(Date.UTC(year, month, day));
          if (date.getUTCFullYear() === year && date.getUTCMonth() === month && date.getUTCDate() === day) {
            return { label: buildLabel(year, month, day), epoch: date.getTime() };
          }
        }
      }

      match = text.match(/\b([01]?\d)[./-]([0-3]?\d)[./-](20\d{2})\b/);
      if (match) {
        const month = Number(match[1]) - 1;
        const day = Number(match[2]);
        const year = Number(match[3]);
        if (month >= 0 && month <= 11 && day >= 1 && day <= 31) {
          const date = new Date(Date.UTC(year, month, day));
          if (date.getUTCFullYear() === year && date.getUTCMonth() === month && date.getUTCDate() === day) {
            return { label: buildLabel(year, month, day), epoch: date.getTime() };
          }
        }
      }

      return null;
    }

    function extractColorDates() {
      const rootSelectors = [
        "main", "section", "article",
        "[class*='calendar']", "[id*='calendar']",
        "[class*='slot']", "[id*='slot']",
        "[class*='vac']", "[class*='interview']", "[class*='consular']"
      ].join(",");
      const candidateRoots = Array.from(document.querySelectorAll(rootSelectors))
        .filter(isLikelyCalendarRoot).slice(0, 20);
      const roots = candidateRoots.length ? candidateRoots : [document.body];

      let bestVac = null;
      let bestNonVac = null;
      const seen = new Set();
      const debugCandidates = [];

      for (const root of roots) {
        const nodes = Array.from(root.querySelectorAll([
          "[data-date]", "[datetime]", "[aria-label*='202']", "[title*='202']",
          "[class*='vac']", "[class*='ofc']", "[class*='interview']",
          "[class*='consular']", "[class*='day']", "[class*='slot']"
        ].join(","))).slice(0, 2000);

        for (const el of nodes) {
          const uniq = `${el.tagName}|${el.className}|${el.id}|${el.getAttribute?.("data-date") || ""}|${el.getAttribute?.("datetime") || ""}|${el.getAttribute?.("aria-label") || ""}`;
          if (seen.has(uniq)) continue;
          seen.add(uniq);
          if (!isVisibleElement(el)) continue;

          const roleByText = roleFromText(el);
          const roleByColor = roleFromColor(el);
          if (roleByText && roleByColor && roleByText !== roleByColor) continue;
          const role = roleByText || roleByColor;
          if (!role) continue;

          const shortText = (el.textContent || "").trim().replace(/\s+/g, " ");
          const sources = [
            { type: "attr", value: el.getAttribute?.("data-date") || "" },
            { type: "attr", value: el.getAttribute?.("datetime") || "" },
            { type: "attr", value: el.getAttribute?.("aria-label") || "" },
            { type: "attr", value: el.getAttribute?.("title") || "" },
            { type: "text", value: shortText.length <= 42 ? shortText : "" }
          ];

          let parsed = null;
          let sourceType = "none";
          let sourceValue = "";
          for (const source of sources) {
            parsed = parseDateFromString(source.value);
            if (parsed) { sourceType = source.type; sourceValue = source.value; break; }
          }
          if (!parsed) continue;
          if (!Number.isFinite(parsed.epoch) || parsed.epoch < targetRangeStartEpoch || parsed.epoch > targetRangeEndEpoch) continue;

          let confidence = 0;
          if (roleByText) confidence += 2;
          if (roleByColor) confidence += 1;
          if (sourceType === "attr") confidence += 1;

          debugCandidates.push({
            tag: el.tagName, className: (el.className || "").toString().slice(0, 100),
            id: el.id || "", text: shortText.slice(0, 60),
            role, roleByText, roleByColor, sourceType,
            sourceValue: sourceValue.slice(0, 60), dateLabel: parsed.label,
            confidence, dataDate: el.getAttribute?.("data-date") || "",
            parentClass: (el.parentElement?.className || "").toString().slice(0, 100)
          });

          if (confidence < 2) continue;
          const trimmedText = (el.textContent || "").trim();
          if (/^\d{1,2}(\s*(ch|na|-))?$/i.test(trimmedText)) continue;
          const parentText = (el.parentElement?.textContent || "").slice(0, 200).toLowerCase();
          if (/\b(last (?:checked|updated|modified|refreshed)|as of|updated on|checked on)\b/.test(parentText)) continue;

          const candidate = { ...parsed, confidence };
          if (role === "vac") {
            if (!bestVac || candidate.confidence > bestVac.confidence ||
              (candidate.confidence === bestVac.confidence && candidate.epoch > bestVac.epoch)) {
              bestVac = candidate;
            }
          } else if (role === "nonVac") {
            if (!bestNonVac || candidate.confidence > bestNonVac.confidence ||
              (candidate.confidence === bestNonVac.confidence && candidate.epoch > bestNonVac.epoch)) {
              bestNonVac = candidate;
            }
          }
        }
      }

      return {
        vacLatestDateByColor: bestVac?.label || "Not found",
        nonVacLatestDateByColor: bestNonVac?.label || "Not found",
        debugColorCandidates: debugCandidates.slice(0, 30)
      };
    }

    function extractCalendarGridDates() {
      let bestVac = null;
      let bestNonVac = null;
      const debugGridInfo = [];
      const tiles = document.querySelectorAll(".react-calendar__month-view__days__day");

      for (const tile of tiles) {
        const cls = (tile.className || "").toString();
        const isYellow = cls.includes("!bg-yellow");
        const isRed = cls.includes("!bg-red");
        if (!isYellow && !isRed) continue;

        const abbr = tile.querySelector("abbr");
        const ariaLabel = abbr?.getAttribute("aria-label") || "";
        const parsed = parseDateFromString(ariaLabel);
        if (!parsed) continue;
        if (parsed.epoch < targetRangeStartEpoch || parsed.epoch > targetRangeEndEpoch) continue;

        const role = isYellow ? "vac" : "nonVac";
        if (role === "vac" && (!bestVac || parsed.epoch > bestVac.epoch)) {
          bestVac = { label: parsed.label, epoch: parsed.epoch };
        }
        if (role === "nonVac" && (!bestNonVac || parsed.epoch > bestNonVac.epoch)) {
          bestNonVac = { label: parsed.label, epoch: parsed.epoch };
        }
        if (parsed.epoch >= Date.UTC(2026, 4, 1)) {
          debugGridInfo.push({ date: parsed.label, role });
        }
      }

      return {
        gridVac: bestVac?.label || "Not found",
        gridNonVac: bestNonVac?.label || "Not found",
        debugGridInfo: debugGridInfo.slice(0, 30)
      };
    }

    const html = document.documentElement?.outerHTML || "";
    const text = document.body?.innerText || "";
    const byColor = extractColorDates();
    const byGrid = extractCalendarGridDates();
    return { html, text, ...byColor, ...byGrid };
  };
}
