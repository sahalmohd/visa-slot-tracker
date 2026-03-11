import {
  MONTH_NAMES, POSITIVE_KEYWORDS, NEGATIVE_KEYWORDS, METADATA_DATE_CONTEXT
} from "./constants.js";
import {
  getTargetMonthLabel, getTargetMonthInfo, isEpochInTargetRange
} from "./config.js";
import {
  getDateCandidates, pickLatestCandidate
} from "./dates.js";

export function cleanHtmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&bull;|&#8226;/gi, "\u2022")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function getTargetMonthSnippets(text) {
  const info = getTargetMonthInfo();
  const monthName = MONTH_NAMES[info.month].toLowerCase();
  const shortMonth = monthName.slice(0, 3);
  const year = info.year;
  const pattern = new RegExp(
    `(?:${shortMonth}(?:${monthName.slice(3)})?[\\s,/.-]*${year}|${year}[\\s,/.-]*${shortMonth}(?:${monthName.slice(3)})?)`,
    "gi"
  );
  const snippets = [];
  let match;
  while ((match = pattern.exec(text)) !== null) {
    const start = Math.max(0, match.index - 140);
    const end = Math.min(text.length, match.index + match[0].length + 140);
    snippets.push(text.slice(start, end));
  }
  return snippets;
}

export function hasPositiveCount(snippet) {
  const patterns = [
    /(?:slots?|appointments?)\s*(?:available)?\s*[:=-]?\s*(\d{1,3})/gi,
    /(\d{1,3})\s*(?:slots?|appointments?)/gi
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(snippet)) !== null) {
      const value = Number(match[1]);
      if (Number.isFinite(value) && value > 0) return true;
    }
  }
  return false;
}

function getSectionWindows(text, sectionRegex, { before = 150, after = 1400, excludeRegex = null } = {}) {
  const windows = [];
  let match;
  sectionRegex.lastIndex = 0;
  while ((match = sectionRegex.exec(text)) !== null) {
    const start = Math.max(0, match.index - before);
    const end = Math.min(text.length, match.index + match[0].length + after);
    const window = text.slice(start, end);
    if (excludeRegex && excludeRegex.test(window)) continue;
    windows.push(window);
  }
  return windows;
}

function getLikelyAvailableDateCandidates(textWindow, { strict = false } = {}) {
  const candidates = getDateCandidates(textWindow).filter((c) => isEpochInTargetRange(c.epoch));
  if (!candidates.length) return [];

  const preferred = [];
  for (const candidate of candidates) {
    const start = Math.max(0, candidate.index - 80);
    const end = Math.min(textWindow.length, candidate.index + candidate.length + 80);
    const context = textWindow.slice(start, end);
    const hasPositive = hasPositiveCount(context) || POSITIVE_KEYWORDS.test(context);
    const hasNegative = NEGATIVE_KEYWORDS.test(context);
    const isMetadata = METADATA_DATE_CONTEXT.test(context);
    if (hasPositive && !hasNegative && !isMetadata) {
      preferred.push(candidate);
    }
  }

  if (strict) {
    if (preferred.length) return preferred;
    const neutral = [];
    for (const candidate of candidates) {
      const start = Math.max(0, candidate.index - 80);
      const end = Math.min(textWindow.length, candidate.index + candidate.length + 80);
      const context = textWindow.slice(start, end);
      if (!NEGATIVE_KEYWORDS.test(context) && !METADATA_DATE_CONTEXT.test(context)) {
        neutral.push(candidate);
      }
    }
    return neutral;
  }

  if (preferred.length) return preferred;

  return candidates.filter((candidate) => {
    const start = Math.max(0, candidate.index - 80);
    const end = Math.min(textWindow.length, candidate.index + candidate.length + 80);
    const context = textWindow.slice(start, end);
    return !METADATA_DATE_CONTEXT.test(context);
  });
}

export function extractLatestDateBySection(text, sectionRegex, excludeRegex = null, { strict = false } = {}) {
  const windows = getSectionWindows(text, sectionRegex, { excludeRegex });
  const candidates = windows.flatMap((w) => getLikelyAvailableDateCandidates(w, { strict }));
  return pickLatestCandidate(candidates)?.label || "Not found";
}

export function extractLatestDateByContext(text, includeRegex, excludeRegex = null, { strict = false, minScore = null } = {}) {
  const candidates = getDateCandidates(text).filter((c) => isEpochInTargetRange(c.epoch));
  if (!candidates.length) return "Not found";

  const scoreThreshold = Number.isFinite(minScore) ? minScore : strict ? 2 : 0;

  const scored = [];
  for (const candidate of candidates) {
    const start = Math.max(0, candidate.index - 140);
    const end = Math.min(text.length, candidate.index + candidate.length + 140);
    const context = text.slice(start, end);
    if (!includeRegex.test(context)) continue;
    if (excludeRegex && excludeRegex.test(context)) continue;

    const hasPositive = hasPositiveCount(context) || POSITIVE_KEYWORDS.test(context);
    const hasNegative = NEGATIVE_KEYWORDS.test(context);
    const isMetadata = METADATA_DATE_CONTEXT.test(context);
    if (isMetadata) continue;
    const score = hasPositive && !hasNegative ? 2 : !hasNegative ? 1 : 0;
    if (score < scoreThreshold) continue;
    scored.push({ candidate, score });
  }

  if (!scored.length) return "Not found";

  const bestScore = Math.max(...scored.map((s) => s.score));
  const bestCandidates = scored.filter((s) => s.score === bestScore).map((s) => s.candidate);
  return pickLatestCandidate(bestCandidates)?.label || "Not found";
}

/**
 * Parse the "Recent Slots" section which has structured data:
 *   M/D/YYYY
 *   CITY [VAC] bullet TIME ago
 * Returns { latestVacDate, latestNonVacDate, debugEntries } or null if section not found.
 */
export function extractDatesFromRecentSlots(text) {
  let marker = text.indexOf("recent slots");
  if (marker === -1) marker = text.indexOf("recent activity");
  if (marker === -1) return null;

  const section = text.slice(marker);
  const datePattern = /\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/g;
  const dateEntries = [];
  let match;

  while ((match = datePattern.exec(section)) !== null) {
    const month = Number(match[1]);
    const day = Number(match[2]);
    const year = Number(match[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) continue;
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) continue;
    const epoch = date.getTime();
    if (!isEpochInTargetRange(epoch)) continue;
    dateEntries.push({
      label: `${MONTH_NAMES[month - 1]} ${day}, ${year}`,
      epoch, matchStart: match.index, matchEnd: match.index + match[0].length
    });
  }

  if (!dateEntries.length) return null;

  let latestVac = null;
  let latestNonVac = null;
  const debugEntries = [];

  for (let i = 0; i < dateEntries.length; i++) {
    const start = dateEntries[i].matchEnd;
    const end = i + 1 < dateEntries.length
      ? dateEntries[i + 1].matchStart
      : Math.min(section.length, start + 600);
    const locationBlock = section.slice(start, end);

    const entryPattern = /([\w][\w\s]*?)\s*\u2022/gi;
    let hasVac = false;
    let hasNonVac = false;
    let entryMatch;
    const locations = [];

    while ((entryMatch = entryPattern.exec(locationBlock)) !== null) {
      const locationName = entryMatch[1]
        .trim().toLowerCase()
        .replace(/^\d+\w*\s*(ago\s*)?/i, "").trim();
      if (locationName.length <= 1) continue;
      locations.push(locationName);
      if (/\bvac\b/.test(locationName)) {
        hasVac = true;
      } else {
        hasNonVac = true;
      }
    }

    if (dateEntries[i].epoch >= Date.UTC(2026, 4, 1)) {
      debugEntries.push({
        date: dateEntries[i].label, hasVac, hasNonVac,
        locations, blockSnippet: locationBlock.slice(0, 120)
      });
    }

    if (hasVac && (!latestVac || dateEntries[i].epoch > latestVac.epoch)) {
      latestVac = dateEntries[i];
    }
    if (hasNonVac && (!latestNonVac || dateEntries[i].epoch > latestNonVac.epoch)) {
      latestNonVac = dateEntries[i];
    }
  }

  return {
    latestVacDate: latestVac?.label || "Not found",
    latestNonVacDate: latestNonVac?.label || "Not found",
    debugEntries: debugEntries.slice(-15)
  };
}

export function detectOpenJulySlot(html, { strictDateExtraction = false } = {}) {
  const text = cleanHtmlToText(html);
  const label = getTargetMonthLabel();

  const recentSlots = extractDatesFromRecentSlots(text);
  let latestVacDate = recentSlots?.latestVacDate || "Not found";
  let latestNonVacDate = recentSlots?.latestNonVacDate || "Not found";

  if (latestVacDate === "Not found") {
    latestVacDate = extractLatestDateBySection(
      text, /\b(?:vac|biometric|biometrics|ofc)\b/gi, /\bnon[\s-]*vac\b/i,
      { strict: strictDateExtraction }
    );
  }
  if (latestNonVacDate === "Not found") {
    latestNonVacDate = extractLatestDateBySection(
      text, /\b(?:non[\s-]*vac|consular|interview)\b/gi, null,
      { strict: strictDateExtraction }
    );
  }
  if (latestVacDate === "Not found") {
    latestVacDate = extractLatestDateByContext(
      text, /\b(?:vac|biometric|biometrics|ofc)\b/i, /\bnon[\s-]*vac\b/i,
      strictDateExtraction ? { minScore: 1 } : {}
    );
  }
  if (latestNonVacDate === "Not found") {
    latestNonVacDate = extractLatestDateByContext(
      text, /\b(?:non[\s-]*vac|consular|interview)\b/i, null,
      strictDateExtraction ? { minScore: 1 } : {}
    );
  }

  const snippets = getTargetMonthSnippets(text);
  if (snippets.length === 0) {
    return {
      isOpen: false,
      evidence: `No ${label} entry found.`,
      latestVacDate, latestNonVacDate
    };
  }

  for (const snippet of snippets) {
    const hasCount = hasPositiveCount(snippet);
    const hasPositiveWord = POSITIVE_KEYWORDS.test(snippet);
    const hasNegativeWord = NEGATIVE_KEYWORDS.test(snippet);
    if ((hasCount || hasPositiveWord) && !hasNegativeWord) {
      return {
        isOpen: true,
        evidence: snippet.slice(0, 220),
        latestVacDate, latestNonVacDate
      };
    }
  }

  return {
    isOpen: false,
    evidence: snippets[0].slice(0, 220),
    latestVacDate, latestNonVacDate
  };
}
