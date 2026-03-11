import { DEFAULT_TARGET_MONTH, MONTH_INDEX } from "./constants.js";

export function parseTargetMonthLabel(label) {
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

let TARGET_MONTH_LABEL = DEFAULT_TARGET_MONTH;
let TARGET_MONTH_INFO = parseTargetMonthLabel(TARGET_MONTH_LABEL);
let TARGET_RANGE_START_EPOCH = Date.UTC(TARGET_MONTH_INFO.year, 0, 1);
let TARGET_RANGE_END_EPOCH = Date.UTC(
  TARGET_MONTH_INFO.year,
  TARGET_MONTH_INFO.month + 1,
  0, 23, 59, 59, 999
);

export function getTargetMonthLabel() {
  return TARGET_MONTH_LABEL;
}

export function getTargetMonthInfo() {
  return TARGET_MONTH_INFO;
}

export function getTargetRangeStartEpoch() {
  return TARGET_RANGE_START_EPOCH;
}

export function getTargetRangeEndEpoch() {
  return TARGET_RANGE_END_EPOCH;
}

export async function loadTargetMonth() {
  const { targetMonth } = await chrome.storage.sync.get({
    targetMonth: DEFAULT_TARGET_MONTH
  });
  TARGET_MONTH_LABEL = targetMonth || DEFAULT_TARGET_MONTH;
  TARGET_MONTH_INFO = parseTargetMonthLabel(TARGET_MONTH_LABEL);
  TARGET_RANGE_START_EPOCH = Date.UTC(TARGET_MONTH_INFO.year, 0, 1);
  TARGET_RANGE_END_EPOCH = Date.UTC(
    TARGET_MONTH_INFO.year,
    TARGET_MONTH_INFO.month + 1,
    0, 23, 59, 59, 999
  );
}

export function isEpochInTargetRange(epoch) {
  return (
    Number.isFinite(epoch) &&
    epoch >= TARGET_RANGE_START_EPOCH &&
    epoch <= TARGET_RANGE_END_EPOCH
  );
}
