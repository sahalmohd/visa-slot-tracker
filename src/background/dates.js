import { MONTH_NAMES, MONTH_INDEX } from "./constants.js";

export function sanitize(value) {
  return String(value ?? "").trim();
}

export function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/**
 * Convert a date label like "May 22, 2026" back to an epoch for comparison.
 * Returns 0 if the label can't be parsed.
 */
export function parseLabelToEpoch(label) {
  if (!label || label === "Not found") return 0;
  const match = String(label).match(/^(\w+)\s+(\d{1,2}),?\s+(\d{4})$/);
  if (!match) return 0;
  const monthIdx = MONTH_INDEX[match[1].toLowerCase().slice(0, 3)];
  if (monthIdx === undefined) return 0;
  return Date.UTC(Number(match[3]), monthIdx, Number(match[2]));
}

export function monthIndexFromToken(token) {
  return MONTH_INDEX[sanitize(token).toLowerCase().slice(0, 3)];
}

export function buildDateCandidate(monthToken, yearToken, dayToken, index, length, hasDay) {
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

  return { label, epoch: date.getTime(), index, length, hasDay };
}

export function getDateCandidates(text) {
  const candidates = [];
  const monthPattern =
    "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";

  const monthDayYear = new RegExp(
    `\\b${monthPattern}\\s+([0-3]?\\d)(?:st|nd|rd|th)?[,]?\\s*(20\\d{2})\\b`, "gi"
  );
  const dayMonthYear = new RegExp(
    `\\b([0-3]?\\d)(?:st|nd|rd|th)?\\s+${monthPattern}\\s*(20\\d{2})\\b`, "gi"
  );
  const monthYear = new RegExp(`\\b${monthPattern}\\s+(20\\d{2})\\b`, "gi");
  const ymd = /\b(20\d{2})[./-]([01]?\d)[./-]([0-3]?\d)\b/gi;
  const mdy = /\b([01]?\d)[./-]([0-3]?\d)[./-](20\d{2})\b/gi;

  let match;

  while ((match = monthDayYear.exec(text)) !== null) {
    const c = buildDateCandidate(match[1], match[3], match[2], match.index, match[0].length, true);
    if (c) candidates.push(c);
  }
  while ((match = dayMonthYear.exec(text)) !== null) {
    const c = buildDateCandidate(match[2], match[3], match[1], match.index, match[0].length, true);
    if (c) candidates.push(c);
  }
  while ((match = monthYear.exec(text)) !== null) {
    const c = buildDateCandidate(match[1], match[2], "1", match.index, match[0].length, false);
    if (c) candidates.push(c);
  }

  while ((match = ymd.exec(text)) !== null) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) continue;
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) continue;
    candidates.push({
      label: `${MONTH_NAMES[month - 1]} ${day}, ${year}`,
      epoch: date.getTime(), index: match.index, length: match[0].length, hasDay: true
    });
  }

  while ((match = mdy.exec(text)) !== null) {
    const month = Number(match[1]);
    const day = Number(match[2]);
    const year = Number(match[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) continue;
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) continue;
    candidates.push({
      label: `${MONTH_NAMES[month - 1]} ${day}, ${year}`,
      epoch: date.getTime(), index: match.index, length: match[0].length, hasDay: true
    });
  }

  return candidates;
}

export function pickLatestCandidate(candidates) {
  if (!candidates.length) return null;
  const withDay = candidates.filter((c) => c.hasDay);
  const pool = withDay.length ? withDay : candidates;
  let latest = pool[0];
  for (const c of pool) {
    if (c.epoch > latest.epoch) latest = c;
  }
  return latest;
}
