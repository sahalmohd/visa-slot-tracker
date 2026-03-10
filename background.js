const TARGET_URL =
  "https://checkvisaslots.com/visa-slots-info/in/l-1-individual-regular/";
const TARGET_URL_PATTERNS = [
  "https://checkvisaslots.com/visa-slots-info/in/l-1-individual-regular/*",
  "https://checkvisaslots.com/visa-slots-info/in/l-1-individual-regular"
];
const DEFAULT_TARGET_MONTH = "July 2026";
const ALARM_NAME = "visa-slot-check";
const DEFAULT_INTERVAL_MINUTES = 5;
const EMAILJS_ENDPOINT = "https://api.emailjs.com/api/v1.0/email/send";
const POSITIVE_KEYWORDS =
  /\b(open|available|book now|appointments? available|slots? open)\b/i;
const NEGATIVE_KEYWORDS =
  /\b(no slots?|not available|unavailable|closed|none|full|n\/a|0 slots?)\b/i;
const METADATA_DATE_CONTEXT =
  /\b(last (?:checked|updated|modified|refreshed)|as of|updated on|checked on|generated|retrieved)\b/i;

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December"
];

const MONTH_INDEX = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11
};

function parseTargetMonthLabel(label) {
  const match = String(label || "").match(/^\s*([a-zA-Z]+)\s+(\d{4})\s*$/);
  if (!match) {
    return { month: 6, year: 2026 };
  }
  const month = MONTH_INDEX[match[1].toLowerCase().slice(0, 3)];
  const year = Number(match[2]);
  if (!Number.isInteger(month) || !Number.isInteger(year)) {
    return { month: 6, year: 2026 };
  }
  return { month, year };
}

// Mutable target config — reloaded from storage before each check
let TARGET_MONTH_LABEL = DEFAULT_TARGET_MONTH;
let TARGET_MONTH_INFO = parseTargetMonthLabel(TARGET_MONTH_LABEL);
let TARGET_RANGE_START_EPOCH = Date.UTC(TARGET_MONTH_INFO.year, 0, 1);
let TARGET_RANGE_END_EPOCH = Date.UTC(
  TARGET_MONTH_INFO.year,
  TARGET_MONTH_INFO.month + 1,
  0,
  23,
  59,
  59,
  999
);

async function loadTargetMonth() {
  const { targetMonth } = await chrome.storage.sync.get({
    targetMonth: DEFAULT_TARGET_MONTH
  });
  TARGET_MONTH_LABEL = targetMonth || DEFAULT_TARGET_MONTH;
  TARGET_MONTH_INFO = parseTargetMonthLabel(TARGET_MONTH_LABEL);
  TARGET_RANGE_START_EPOCH = Date.UTC(TARGET_MONTH_INFO.year, 0, 1);
  TARGET_RANGE_END_EPOCH = Date.UTC(
    TARGET_MONTH_INFO.year,
    TARGET_MONTH_INFO.month + 1,
    0,
    23,
    59,
    59,
    999
  );
}

function isEpochInTargetRange(epoch) {
  return (
    Number.isFinite(epoch) &&
    epoch >= TARGET_RANGE_START_EPOCH &&
    epoch <= TARGET_RANGE_END_EPOCH
  );
}

/**
 * Convert a date label like "May 22, 2026" back to an epoch for comparison.
 * Returns 0 if the label can't be parsed.
 */
function parseLabelToEpoch(label) {
  if (!label || label === "Not found") return 0;
  const match = String(label).match(
    /^(\w+)\s+(\d{1,2}),?\s+(\d{4})$/
  );
  if (!match) return 0;
  const monthIdx = MONTH_INDEX[match[1].toLowerCase().slice(0, 3)];
  if (monthIdx === undefined) return 0;
  return Date.UTC(Number(match[3]), monthIdx, Number(match[2]));
}

function sanitize(value) {
  return String(value ?? "").trim();
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function getEmailSettings() {
  const data = await chrome.storage.sync.get({
    emailEnabled: false,
    emailTo: "",
    emailjsServiceId: "",
    emailjsTemplateId: "",
    emailjsPublicKey: ""
  });

  return {
    emailEnabled: Boolean(data.emailEnabled),
    emailTo: sanitize(data.emailTo),
    emailjsServiceId: sanitize(data.emailjsServiceId),
    emailjsTemplateId: sanitize(data.emailjsTemplateId),
    emailjsPublicKey: sanitize(data.emailjsPublicKey)
  };
}

function cleanHtmlToText(html) {
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

function getTargetMonthSnippets(text) {
  const monthName = MONTH_NAMES[TARGET_MONTH_INFO.month].toLowerCase();
  const shortMonth = monthName.slice(0, 3);
  const year = TARGET_MONTH_INFO.year;
  // Match "July 2026", "Jul 2026", "2026 July", etc.
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

function hasPositiveCount(snippet) {
  const patterns = [
    /(?:slots?|appointments?)\s*(?:available)?\s*[:=-]?\s*(\d{1,3})/gi,
    /(\d{1,3})\s*(?:slots?|appointments?)/gi
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

function monthIndexFromToken(token) {
  return MONTH_INDEX[sanitize(token).toLowerCase().slice(0, 3)];
}

function buildDateCandidate(monthToken, yearToken, dayToken, index, length, hasDay) {
  const month = monthIndexFromToken(monthToken);
  const year = Number(yearToken);
  if (!Number.isInteger(month) || !Number.isInteger(year)) {
    return null;
  }

  const day = hasDay ? Number(dayToken) : 1;
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    return null;
  }

  const date = new Date(Date.UTC(year, month, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  const label = hasDay
    ? `${MONTH_NAMES[month]} ${day}, ${year}`
    : `${MONTH_NAMES[month]} ${year}`;

  return {
    label,
    epoch: date.getTime(),
    index,
    length,
    hasDay
  };
}

function getDateCandidates(text) {
  const candidates = [];
  const monthPattern =
    "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";

  const monthDayYear = new RegExp(
    `\\b${monthPattern}\\s+([0-3]?\\d)(?:st|nd|rd|th)?[,]?\\s*(20\\d{2})\\b`,
    "gi"
  );
  const dayMonthYear = new RegExp(
    `\\b([0-3]?\\d)(?:st|nd|rd|th)?\\s+${monthPattern}\\s*(20\\d{2})\\b`,
    "gi"
  );
  const monthYear = new RegExp(`\\b${monthPattern}\\s+(20\\d{2})\\b`, "gi");
  const ymd = /\b(20\d{2})[./-]([01]?\d)[./-]([0-3]?\d)\b/gi;
  // US date format: M/D/YYYY (used by checkvisaslots.com)
  const mdy = /\b([01]?\d)[./-]([0-3]?\d)[./-](20\d{2})\b/gi;

  let match;
  while ((match = monthDayYear.exec(text)) !== null) {
    const candidate = buildDateCandidate(
      match[1],
      match[3],
      match[2],
      match.index,
      match[0].length,
      true
    );
    if (candidate) {
      candidates.push(candidate);
    }
  }

  while ((match = dayMonthYear.exec(text)) !== null) {
    const candidate = buildDateCandidate(
      match[2],
      match[3],
      match[1],
      match.index,
      match[0].length,
      true
    );
    if (candidate) {
      candidates.push(candidate);
    }
  }

  while ((match = monthYear.exec(text)) !== null) {
    const candidate = buildDateCandidate(
      match[1],
      match[2],
      "1",
      match.index,
      match[0].length,
      false
    );
    if (candidate) {
      candidates.push(candidate);
    }
  }

  while ((match = ymd.exec(text)) !== null) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) {
      continue;
    }
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    ) {
      continue;
    }
    candidates.push({
      label: `${MONTH_NAMES[month - 1]} ${day}, ${year}`,
      epoch: date.getTime(),
      index: match.index,
      length: match[0].length,
      hasDay: true
    });
  }

  while ((match = mdy.exec(text)) !== null) {
    const month = Number(match[1]);
    const day = Number(match[2]);
    const year = Number(match[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) {
      continue;
    }
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    ) {
      continue;
    }
    candidates.push({
      label: `${MONTH_NAMES[month - 1]} ${day}, ${year}`,
      epoch: date.getTime(),
      index: match.index,
      length: match[0].length,
      hasDay: true
    });
  }

  return candidates;
}

function pickLatestCandidate(candidates) {
  if (!candidates.length) {
    return null;
  }

  const withDay = candidates.filter((candidate) => candidate.hasDay);
  const pool = withDay.length ? withDay : candidates;

  let latest = pool[0];
  for (const candidate of pool) {
    if (candidate.epoch > latest.epoch) {
      latest = candidate;
    }
  }
  return latest;
}

function getSectionWindows(
  text,
  sectionRegex,
  { before = 150, after = 1400, excludeRegex = null } = {}
) {
  const windows = [];
  let match;
  sectionRegex.lastIndex = 0;
  while ((match = sectionRegex.exec(text)) !== null) {
    const start = Math.max(0, match.index - before);
    const end = Math.min(text.length, match.index + match[0].length + after);
    const window = text.slice(start, end);
    if (excludeRegex && excludeRegex.test(window)) {
      continue;
    }
    windows.push(window);
  }
  return windows;
}

function getLikelyAvailableDateCandidates(textWindow, { strict = false } = {}) {
  const candidates = getDateCandidates(textWindow).filter((candidate) =>
    isEpochInTargetRange(candidate.epoch)
  );
  if (!candidates.length) {
    return [];
  }

  const preferred = [];
  for (const candidate of candidates) {
    const start = Math.max(0, candidate.index - 80);
    const end = Math.min(
      textWindow.length,
      candidate.index + candidate.length + 80
    );
    const context = textWindow.slice(start, end);
    const hasPositive =
      hasPositiveCount(context) || POSITIVE_KEYWORDS.test(context);
    const hasNegative = NEGATIVE_KEYWORDS.test(context);
    const isMetadata = METADATA_DATE_CONTEXT.test(context);
    if (hasPositive && !hasNegative && !isMetadata) {
      preferred.push(candidate);
    }
  }
  if (strict) {
    if (preferred.length) {
      return preferred;
    }

    // In strict mode, still allow section-bound neutral dates
    // as long as they are not in clearly negative context.
    const neutral = [];
    for (const candidate of candidates) {
      const start = Math.max(0, candidate.index - 80);
      const end = Math.min(
        textWindow.length,
        candidate.index + candidate.length + 80
      );
      const context = textWindow.slice(start, end);
      if (!NEGATIVE_KEYWORDS.test(context) && !METADATA_DATE_CONTEXT.test(context)) {
        neutral.push(candidate);
      }
    }
    return neutral;
  }
  if (preferred.length) return preferred;
  // Even in non-strict mode, filter out metadata timestamps.
  const nonMetadata = candidates.filter((candidate) => {
    const start = Math.max(0, candidate.index - 80);
    const end = Math.min(textWindow.length, candidate.index + candidate.length + 80);
    const context = textWindow.slice(start, end);
    return !METADATA_DATE_CONTEXT.test(context);
  });
  return nonMetadata;
}

function extractLatestDateBySection(
  text,
  sectionRegex,
  excludeRegex = null,
  { strict = false } = {}
) {
  const windows = getSectionWindows(text, sectionRegex, { excludeRegex });
  const candidates = windows.flatMap((window) =>
    getLikelyAvailableDateCandidates(window, { strict })
  );
  return pickLatestCandidate(candidates)?.label || "Not found";
}

function extractLatestDateByContext(
  text,
  includeRegex,
  excludeRegex = null,
  { strict = false, minScore = null } = {}
) {
  const candidates = getDateCandidates(text).filter((candidate) =>
    isEpochInTargetRange(candidate.epoch)
  );
  if (!candidates.length) {
    return "Not found";
  }

  const scoreThreshold = Number.isFinite(minScore)
    ? minScore
    : strict
      ? 2
      : 0;

  const scored = [];
  for (const candidate of candidates) {
    const start = Math.max(0, candidate.index - 140);
    const end = Math.min(text.length, candidate.index + candidate.length + 140);
    const context = text.slice(start, end);
    if (!includeRegex.test(context)) {
      continue;
    }
    if (excludeRegex && excludeRegex.test(context)) {
      continue;
    }

    const hasPositive =
      hasPositiveCount(context) || POSITIVE_KEYWORDS.test(context);
    const hasNegative = NEGATIVE_KEYWORDS.test(context);
    const isMetadata = METADATA_DATE_CONTEXT.test(context);
    if (isMetadata) {
      continue;
    }
    const score = hasPositive && !hasNegative ? 2 : !hasNegative ? 1 : 0;
    if (score < scoreThreshold) {
      continue;
    }
    scored.push({ candidate, score });
  }

  if (!scored.length) {
    return "Not found";
  }

  const bestScore = Math.max(...scored.map((item) => item.score));
  const bestCandidates = scored
    .filter((item) => item.score === bestScore)
    .map((item) => item.candidate);
  return pickLatestCandidate(bestCandidates)?.label || "Not found";
}

/**
 * Parse the "Recent Slots" section which has structured data:
 *   M/D/YYYY
 *   CITY [VAC] • TIME ago
 *   CITY [VAC] • TIME ago
 *   M/D/YYYY
 *   ...
 * Returns { latestVacDate, latestNonVacDate } or null if section not found.
 */
function extractDatesFromRecentSlots(text) {
  const marker = text.indexOf("recent slots");
  if (marker === -1) return null;

  const section = text.slice(marker);
  // Match M/D/YYYY date headings
  const datePattern = /\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/g;
  const dateEntries = [];
  let match;

  while ((match = datePattern.exec(section)) !== null) {
    const month = Number(match[1]);
    const day = Number(match[2]);
    const year = Number(match[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) continue;

    const date = new Date(Date.UTC(year, month - 1, day));
    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    ) {
      continue;
    }

    const epoch = date.getTime();
    if (!isEpochInTargetRange(epoch)) continue;

    dateEntries.push({
      label: `${MONTH_NAMES[month - 1]} ${day}, ${year}`,
      epoch,
      matchStart: match.index,
      matchEnd: match.index + match[0].length
    });
  }

  if (!dateEntries.length) return null;

  let latestVac = null;
  let latestNonVac = null;
  const debugEntries = [];

  for (let i = 0; i < dateEntries.length; i++) {
    const start = dateEntries[i].matchEnd;
    const end =
      i + 1 < dateEntries.length
        ? dateEntries[i + 1].matchStart
        : Math.min(section.length, start + 600);
    const locationBlock = section.slice(start, end);

    // Match location entries: "CITY [VAC] • TIME"
    // Accept flexible time formats (Xh ago, Xd ago, < 3h, just now, etc.)
    const entryPattern = /([\w][\w\s]*?)\s*\u2022/gi;
    let hasVac = false;
    let hasNonVac = false;
    let entryMatch;
    const locations = [];

    while ((entryMatch = entryPattern.exec(locationBlock)) !== null) {
      // Strip leading time string from previous entry
      // e.g. "17h ago mumbai vac" → "mumbai vac"
      const locationName = entryMatch[1]
        .trim()
        .toLowerCase()
        .replace(/^\d+\w*\s*(ago\s*)?/i, "")
        .trim();
      if (locationName.length <= 1) continue;
      locations.push(locationName);
      if (/\bvac\b/.test(locationName)) {
        hasVac = true;
      } else {
        hasNonVac = true;
      }
    }

    // Only keep debug for recent dates (May/June/July 2026)
    if (dateEntries[i].epoch >= Date.UTC(2026, 4, 1)) {
      debugEntries.push({
        date: dateEntries[i].label,
        hasVac,
        hasNonVac,
        locations,
        blockSnippet: locationBlock.slice(0, 120)
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

function detectOpenJulySlot(html, { strictDateExtraction = false } = {}) {
  const text = cleanHtmlToText(html);

  // Primary: parse the structured "Recent Slots" section
  const recentSlots = extractDatesFromRecentSlots(text);
  let latestVacDate = recentSlots?.latestVacDate || "Not found";
  let latestNonVacDate = recentSlots?.latestNonVacDate || "Not found";

  // Fallback: regex-based section/context extraction
  if (latestVacDate === "Not found") {
    latestVacDate = extractLatestDateBySection(
      text,
      /\b(?:vac|biometric|biometrics|ofc)\b/gi,
      /\bnon[\s-]*vac\b/i,
      { strict: strictDateExtraction }
    );
  }
  if (latestNonVacDate === "Not found") {
    latestNonVacDate = extractLatestDateBySection(
      text,
      /\b(?:non[\s-]*vac|consular|interview)\b/gi,
      null,
      { strict: strictDateExtraction }
    );
  }
  if (latestVacDate === "Not found") {
    latestVacDate = extractLatestDateByContext(
      text,
      /\b(?:vac|biometric|biometrics|ofc)\b/i,
      /\bnon[\s-]*vac\b/i,
      strictDateExtraction ? { minScore: 1 } : {}
    );
  }
  if (latestNonVacDate === "Not found") {
    latestNonVacDate = extractLatestDateByContext(
      text,
      /\b(?:non[\s-]*vac|consular|interview)\b/i,
      null,
      strictDateExtraction ? { minScore: 1 } : {}
    );
  }
  const snippets = getTargetMonthSnippets(text);
  if (snippets.length === 0) {
    return {
      isOpen: false,
      evidence: `No ${TARGET_MONTH_LABEL} entry found.`,
      latestVacDate,
      latestNonVacDate
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
        latestVacDate,
        latestNonVacDate
      };
    }
  }

  return {
    isOpen: false,
    evidence: snippets[0].slice(0, 220),
    latestVacDate,
    latestNonVacDate
  };
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

async function notifyOpen(evidence, latestVacDate, latestNonVacDate) {
  await chrome.notifications.create({
    type: "basic",
    iconUrl: "icon-128.png",
    title: "Visa Slot Alert",
    message: `${TARGET_MONTH_LABEL} looks OPEN. Biometrics: ${latestVacDate}. CA: ${latestNonVacDate}.`,
    priority: 2
  });

  await chrome.storage.local.set({
    lastNotificationEvidence: evidence,
    lastNotificationAt: Date.now()
  });

  try {
    await sendEmailNotification({
      subject: `Visa Slot Alert: ${TARGET_MONTH_LABEL} looks open`,
      message:
        `The checker detected that ${TARGET_MONTH_LABEL} may have an open L-1 Individual Regular visa slot.`,
      evidence,
      vacLatestDate: latestVacDate,
      nonVacLatestDate: latestNonVacDate
    });
  } catch (error) {
    await chrome.storage.local.set({
      lastEmailError: error instanceof Error ? error.message : String(error)
    });
  }
}

async function notifyDateChange({ prevVac, prevNonVac, newVac, newNonVac }) {
  const changes = [];
  if (newVac !== prevVac && newVac !== "Not found") {
    changes.push(`Biometrics: ${prevVac} → ${newVac}`);
  }
  if (newNonVac !== prevNonVac && newNonVac !== "Not found") {
    changes.push(`CA: ${prevNonVac} → ${newNonVac}`);
  }
  if (!changes.length) return;

  const message = `New dates for ${TARGET_MONTH_LABEL}: ${changes.join(". ")}`;

  await chrome.notifications.create({
    type: "basic",
    iconUrl: "icon-128.png",
    title: "Visa Slot - New Dates",
    message,
    priority: 2
  });

  try {
    await sendEmailNotification({
      subject: `Visa Slot Alert: New dates for ${TARGET_MONTH_LABEL}`,
      message,
      evidence: changes.join("\n"),
      vacLatestDate: newVac,
      nonVacLatestDate: newNonVac
    });
  } catch (error) {
    await chrome.storage.local.set({
      lastEmailError: error instanceof Error ? error.message : String(error)
    });
  }
}

async function sendEmailNotification({
  subject,
  message,
  evidence,
  vacLatestDate = "Not found",
  nonVacLatestDate = "Not found",
  force = false
}) {
  const settings = await getEmailSettings();
  if (!settings.emailEnabled && !force) {
    return { ok: true, skipped: true, reason: "Email disabled" };
  }

  if (!isValidEmail(settings.emailTo)) {
    throw new Error("Email setting invalid: destination email is missing/invalid.");
  }
  if (
    !settings.emailjsServiceId ||
    !settings.emailjsTemplateId ||
    !settings.emailjsPublicKey
  ) {
    throw new Error(
      "Email setting invalid: EmailJS service/template/public key is missing."
    );
  }

  const payload = {
    service_id: settings.emailjsServiceId,
    template_id: settings.emailjsTemplateId,
    user_id: settings.emailjsPublicKey,
    template_params: {
      to_email: settings.emailTo,
      subject,
      message,
      target_month: TARGET_MONTH_LABEL,
      target_url: TARGET_URL,
      evidence,
      vac_latest_date: vacLatestDate,
      non_vac_latest_date: nonVacLatestDate,
      checked_at: new Date().toLocaleString()
    }
  };

  const response = await fetch(EMAILJS_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`EmailJS error: HTTP ${response.status} ${body.slice(0, 180)}`);
  }

  await chrome.storage.local.set({
    lastEmailError: "",
    lastEmailAt: Date.now(),
    lastEmailEvidence: evidence
  });
  return { ok: true, skipped: false };
}

function waitForTabComplete(tabId, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    let done = false;
    let timeoutId = null;

    function cleanup() {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
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
      if (changeInfo.status === "complete") {
        finish(resolve);
      }
    }

    timeoutId = setTimeout(() => {
      finish(() =>
        reject(new Error("Timed out waiting for target tab to finish loading."))
      );
    }, timeoutMs);

    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs
      .get(tabId)
      .then((tab) => {
        if (tab?.status === "complete") {
          finish(resolve);
        }
      })
      .catch(() => {});
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function detectFromOpenTab({ allowCreate = false } = {}) {
  const tabs = await chrome.tabs.query({ url: TARGET_URL_PATTERNS });
  let tab = tabs.find((item) => Number.isInteger(item.id));
  let created = false;

  if (!tab?.id && allowCreate) {
    tab = await chrome.tabs.create({ url: TARGET_URL, active: false });
    created = true;
  }

  if (!tab?.id) {
    return null;
  }

  if (created) {
    await waitForTabComplete(tab.id);
    // Give client-side scripts a moment to render data-heavy calendar blocks.
    await delay(2500);
  }

  try {
    const injections = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      args: [TARGET_MONTH_LABEL],
      func: (targetMonthLabel) => {
      const MONTH_NAMES_INJECT = [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December"
      ];
      const MONTH_INDEX_INJECT = {
        jan: 0,
        feb: 1,
        mar: 2,
        apr: 3,
        may: 4,
        jun: 5,
        jul: 6,
        aug: 7,
        sep: 8,
        oct: 9,
        nov: 10,
        dec: 11
      };
      function parseTargetMonthLabelInject(label) {
        const match = String(label || "").match(/^\s*([a-zA-Z]+)\s+(\d{4})\s*$/);
        if (!match) {
          return { month: 6, year: 2026 };
        }
        const month = MONTH_INDEX_INJECT[match[1].toLowerCase().slice(0, 3)];
        const year = Number(match[2]);
        if (!Number.isInteger(month) || !Number.isInteger(year)) {
          return { month: 6, year: 2026 };
        }
        return { month, year };
      }
      const targetMonthInfo = parseTargetMonthLabelInject(targetMonthLabel);
      const targetRangeStartEpoch = Date.UTC(targetMonthInfo.year, 0, 1);
      const targetRangeEndEpoch = Date.UTC(
        targetMonthInfo.year,
        targetMonthInfo.month + 1,
        0,
        23,
        59,
        59,
        999
      );

      function normalizeColor(value) {
        if (!value) return null;
        const match = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
        if (!match) return null;
        return {
          r: Number(match[1]),
          g: Number(match[2]),
          b: Number(match[3])
        };
      }

      function roleFromColor(el) {
        let node = el;
        for (let depth = 0; node && depth < 4; depth += 1) {
          const style = getComputedStyle(node);
          const candidates = [
            style.color,
            style.backgroundColor,
            style.borderColor
          ];
          for (const value of candidates) {
            const color = normalizeColor(value);
            if (!color) continue;
            if (
              color.g >= 90 &&
              color.g - Math.max(color.r, color.b) >= 28
            ) {
              return "vac";
            }
            if (
              color.r >= 110 &&
              color.r - Math.max(color.g, color.b) >= 30
            ) {
              return "nonVac";
            }
          }
          node = node.parentElement;
        }
        return null;
      }

      function roleFromText(el) {
        let node = el;
        for (let depth = 0; node && depth < 5; depth += 1) {
          const hay = [
            node.className || "",
            node.id || "",
            node.getAttribute?.("aria-label") || "",
            node.getAttribute?.("title") || "",
            node.textContent || ""
          ]
            .join(" ")
            .toLowerCase();
          if (/\bnon[\s-]*vac\b|\bconsular\b|\binterview\b/.test(hay)) {
            return "nonVac";
          }
          if (/\bvac\b|\bbiometric\b|\bofc\b/.test(hay)) {
            return "vac";
          }
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
          if (
            style.display === "none" ||
            style.visibility === "hidden" ||
            Number(style.opacity || "1") < 0.1
          ) {
            return false;
          }
          node = node.parentElement;
        }
        return true;
      }

      function isLikelyCalendarRoot(el) {
        if (!el || !(el instanceof Element)) return false;
        const hay = [
          el.id || "",
          el.className || "",
          el.getAttribute?.("aria-label") || "",
          el.textContent || ""
        ]
          .join(" ")
          .toLowerCase();
        const hasSlotHint = /\b(vac|non[\s-]*vac|biometric|ofc|consular|interview|slot|calendar)\b/.test(
          hay
        );
        const hasDateHint =
          /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|20\d{2})\b/.test(
            hay
          );
        return hasSlotHint && hasDateHint;
      }

      function buildLabel(year, month, day) {
        return `${MONTH_NAMES_INJECT[month]} ${day}, ${year}`;
      }

      function parseDateFromString(value) {
        const text = String(value || "");
        if (!text) return null;

        let match;
        const monthPattern =
          "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
        const monthDayYear = new RegExp(
          `\\b${monthPattern}\\s+([0-3]?\\d)(?:st|nd|rd|th)?[,]?\\s*(20\\d{2})\\b`,
          "i"
        );
        const dayMonthYear = new RegExp(
          `\\b([0-3]?\\d)(?:st|nd|rd|th)?\\s+${monthPattern}\\s*(20\\d{2})\\b`,
          "i"
        );
        const ymd = /\b(20\d{2})[./-]([01]?\d)[./-]([0-3]?\d)\b/;
        // US date format: M/D/YYYY (used by checkvisaslots.com)
        const mdy = /\b([01]?\d)[./-]([0-3]?\d)[./-](20\d{2})\b/;

        match = text.match(monthDayYear);
        if (match) {
          const month = MONTH_INDEX_INJECT[match[1].toLowerCase().slice(0, 3)];
          const day = Number(match[2]);
          const year = Number(match[3]);
          if (Number.isInteger(month) && day >= 1 && day <= 31) {
            const date = new Date(Date.UTC(year, month, day));
            if (
              date.getUTCFullYear() === year &&
              date.getUTCMonth() === month &&
              date.getUTCDate() === day
            ) {
              return { label: buildLabel(year, month, day), epoch: date.getTime() };
            }
          }
        }

        match = text.match(dayMonthYear);
        if (match) {
          const month = MONTH_INDEX_INJECT[match[2].toLowerCase().slice(0, 3)];
          const day = Number(match[1]);
          const year = Number(match[3]);
          if (Number.isInteger(month) && day >= 1 && day <= 31) {
            const date = new Date(Date.UTC(year, month, day));
            if (
              date.getUTCFullYear() === year &&
              date.getUTCMonth() === month &&
              date.getUTCDate() === day
            ) {
              return { label: buildLabel(year, month, day), epoch: date.getTime() };
            }
          }
        }

        match = text.match(ymd);
        if (match) {
          const year = Number(match[1]);
          const month = Number(match[2]) - 1;
          const day = Number(match[3]);
          if (month >= 0 && month <= 11 && day >= 1 && day <= 31) {
            const date = new Date(Date.UTC(year, month, day));
            if (
              date.getUTCFullYear() === year &&
              date.getUTCMonth() === month &&
              date.getUTCDate() === day
            ) {
              return { label: buildLabel(year, month, day), epoch: date.getTime() };
            }
          }
        }

        match = text.match(mdy);
        if (match) {
          const month = Number(match[1]) - 1;
          const day = Number(match[2]);
          const year = Number(match[3]);
          if (month >= 0 && month <= 11 && day >= 1 && day <= 31) {
            const date = new Date(Date.UTC(year, month, day));
            if (
              date.getUTCFullYear() === year &&
              date.getUTCMonth() === month &&
              date.getUTCDate() === day
            ) {
              return { label: buildLabel(year, month, day), epoch: date.getTime() };
            }
          }
        }

        return null;
      }

      function extractColorDates() {
        const rootSelectors = [
          "main",
          "section",
          "article",
          "[class*='calendar']",
          "[id*='calendar']",
          "[class*='slot']",
          "[id*='slot']",
          "[class*='vac']",
          "[class*='interview']",
          "[class*='consular']"
        ].join(",");
        const candidateRoots = Array.from(document.querySelectorAll(rootSelectors))
          .filter(isLikelyCalendarRoot)
          .slice(0, 20);
        const roots = candidateRoots.length ? candidateRoots : [document.body];

        let bestVac = null;
        let bestNonVac = null;
        const seen = new Set();
        const debugCandidates = [];

        for (const root of roots) {
          const nodes = Array.from(
            root.querySelectorAll(
              [
                "[data-date]",
                "[datetime]",
                "[aria-label*='202']",
                "[title*='202']",
                "[class*='vac']",
                "[class*='ofc']",
                "[class*='interview']",
                "[class*='consular']",
                "[class*='day']",
                "[class*='slot']"
              ].join(",")
            )
          ).slice(0, 2000);

          for (const el of nodes) {
            const uniq = `${el.tagName}|${el.className}|${el.id}|${el.getAttribute?.(
              "data-date"
            ) || ""}|${el.getAttribute?.("datetime") || ""}|${
              el.getAttribute?.("aria-label") || ""
            }`;
            if (seen.has(uniq)) continue;
            seen.add(uniq);

            if (!isVisibleElement(el)) continue;

            const roleByText = roleFromText(el);
            const roleByColor = roleFromColor(el);
            if (roleByText && roleByColor && roleByText !== roleByColor) {
              continue;
            }
            const role = roleByText || roleByColor;
            if (!role) continue;

            const shortText = (el.textContent || "").trim().replace(/\s+/g, " ");
            const sources = [
              {
                type: "attr",
                value: el.getAttribute?.("data-date") || ""
              },
              {
                type: "attr",
                value: el.getAttribute?.("datetime") || ""
              },
              {
                type: "attr",
                value: el.getAttribute?.("aria-label") || ""
              },
              {
                type: "attr",
                value: el.getAttribute?.("title") || ""
              },
              {
                type: "text",
                value: shortText.length <= 42 ? shortText : ""
              }
            ];

            let parsed = null;
            let sourceType = "none";
            let sourceValue = "";
            for (const source of sources) {
              parsed = parseDateFromString(source.value);
              if (parsed) {
                sourceType = source.type;
                sourceValue = source.value;
                break;
              }
            }
            if (!parsed) continue;
            if (
              !Number.isFinite(parsed.epoch) ||
              parsed.epoch < targetRangeStartEpoch ||
              parsed.epoch > targetRangeEndEpoch
            ) {
              continue;
            }

            let confidence = 0;
            if (roleByText) confidence += 2;
            if (roleByColor) confidence += 1;
            if (sourceType === "attr") confidence += 1;

            // Collect debug info for every candidate that passes basic checks
            debugCandidates.push({
              tag: el.tagName,
              className: (el.className || "").toString().slice(0, 100),
              id: el.id || "",
              text: shortText.slice(0, 60),
              role,
              roleByText,
              roleByColor,
              sourceType,
              sourceValue: sourceValue.slice(0, 60),
              dateLabel: parsed.label,
              confidence,
              dataDate: el.getAttribute?.("data-date") || "",
              parentClass: (el.parentElement?.className || "").toString().slice(0, 100)
            });

            // Require text-based role match (not just color) to avoid
            // misclassifying colored buttons/links as availability.
            if (confidence < 2) continue;

            // Skip elements whose text is just a bare number or short code
            // (e.g. calendar day cells with "5" or "ch").
            const trimmedText = (el.textContent || "").trim();
            if (/^\d{1,2}(\s*(ch|na|-))?$/i.test(trimmedText)) continue;

            // Skip metadata timestamps (last updated, checked on, etc.)
            const parentText = (el.parentElement?.textContent || "").slice(0, 200).toLowerCase();
            if (/\b(last (?:checked|updated|modified|refreshed)|as of|updated on|checked on)\b/.test(parentText)) continue;

            const candidate = { ...parsed, confidence };
            if (role === "vac") {
              if (
                !bestVac ||
                candidate.confidence > bestVac.confidence ||
                (candidate.confidence === bestVac.confidence &&
                  candidate.epoch > bestVac.epoch)
              ) {
                bestVac = candidate;
              }
            } else if (role === "nonVac") {
              if (
                !bestNonVac ||
                candidate.confidence > bestNonVac.confidence ||
                (candidate.confidence === bestNonVac.confidence &&
                  candidate.epoch > bestNonVac.epoch)
              ) {
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

      /**
       * Parse React Calendar grids using Tailwind CSS class indicators:
       *   !bg-yellow-50 = VAC availability
       *   !bg-red-50    = non-VAC availability
       * Date is read from the abbr[aria-label] inside each tile.
       */
      function extractCalendarGridDates() {
        let bestVac = null;
        let bestNonVac = null;
        const debugGridInfo = [];

        // Find all React Calendar day tiles
        const tiles = document.querySelectorAll(
          ".react-calendar__month-view__days__day"
        );

        for (const tile of tiles) {
          const cls = (tile.className || "").toString();
          const isYellow = cls.includes("!bg-yellow");
          const isRed = cls.includes("!bg-red");
          if (!isYellow && !isRed) continue;

          // Get date from abbr aria-label (e.g. "May 22, 2026")
          const abbr = tile.querySelector("abbr");
          const ariaLabel = abbr?.getAttribute("aria-label") || "";
          const parsed = parseDateFromString(ariaLabel);
          if (!parsed) continue;
          if (
            parsed.epoch < targetRangeStartEpoch ||
            parsed.epoch > targetRangeEndEpoch
          ) {
            continue;
          }

          const role = isYellow ? "vac" : "nonVac";

          if (
            role === "vac" &&
            (!bestVac || parsed.epoch > bestVac.epoch)
          ) {
            bestVac = { label: parsed.label, epoch: parsed.epoch };
          }
          if (
            role === "nonVac" &&
            (!bestNonVac || parsed.epoch > bestNonVac.epoch)
          ) {
            bestNonVac = { label: parsed.label, epoch: parsed.epoch };
          }

          // Debug for May+ dates
          if (parsed.epoch >= Date.UTC(2026, 4, 1)) {
            debugGridInfo.push({
              date: parsed.label,
              role
            });
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
      }
    });

    const payload = injections?.[0]?.result;
    if (!payload) {
      return null;
    }

    const html = `${payload.html}\n<!-- innerText -->\n${payload.text}`;
    const result = detectOpenJulySlot(html);

    // Debug: log what each method found
    const cleanedText = cleanHtmlToText(html);
    const recentSlotsResult = extractDatesFromRecentSlots(cleanedText);
    // Merge color-based dates (from calendar grid) with text-based dates
    // Pick the later date for each category
    const colorVac = payload.vacLatestDateByColor;
    const colorNonVac = payload.nonVacLatestDateByColor;

    // Merge all date sources — pick the latest for each category
    const allVacSources = [colorVac, payload.gridVac, result.latestVacDate];
    const allNonVacSources = [colorNonVac, payload.gridNonVac, result.latestNonVacDate];

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
      colorVac: colorVac || "Not found",
      colorNonVac: colorNonVac || "Not found",
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
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const html = await response.text();
    if (
      /vercel security checkpoint|we're verifying your browser|security checkpoint/i.test(
        html
      )
    ) {
      primaryError =
        "Blocked by Vercel security checkpoint. Open the target site in a normal tab and complete verification, then try again.";
    } else {
      result = detectOpenJulySlot(html, { strictDateExtraction: true });
    }
  } catch (error) {
    primaryError = error instanceof Error ? error.message : String(error);
  }

  // Always try tab-based detection to get color-based calendar dates,
  // which may be more current than the "Recent Slots" section.
  try {
    const fallback = await detectFromOpenTab({ allowCreate: true });
    if (fallback) {
      if (!result) {
        // Fetch failed entirely — use tab result
        result = fallback.result;
        source = fallback.source;
        primaryError = "";
      } else {
        // Merge: pick the later date for each category
        source = fallback.source;
        primaryError = "";
        if (fallback.result.isOpen && !result.isOpen) {
          result.isOpen = true;
          result.evidence = fallback.result.evidence || result.evidence;
        }
        // For VAC date: pick the later one
        const fetchVacEpoch = parseLabelToEpoch(result.latestVacDate);
        const tabVacEpoch = parseLabelToEpoch(fallback.result.latestVacDate);
        if (tabVacEpoch > fetchVacEpoch) {
          result.latestVacDate = fallback.result.latestVacDate;
        }
        // For non-VAC date: pick the later one
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
      await notifyOpen(
        result.evidence,
        result.latestVacDate,
        result.latestNonVacDate
      );
    }

    // Notify when dates change (new slots detected)
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
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : String(error)
        })
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
      intervalMinutes,
      targetMonth,
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
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : String(error)
        })
      );
    return true;
  }

  if (message?.type === "sendTestEmail") {
    const evidence = "Manual test from options page.";
    chrome.storage.local
      .get({
        lastVacLatestDate: "Not found",
        lastNonVacLatestDate: "Not found"
      })
      .then((data) =>
        sendEmailNotification({
          subject: "Visa Slot Alert: test email",
          message:
            "This is a test email from your Chrome extension email notification setup.",
          evidence,
          vacLatestDate: data.lastVacLatestDate,
          nonVacLatestDate: data.lastNonVacLatestDate,
          force: true
        })
      )
      .then(() => sendResponse({ ok: true }))
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
