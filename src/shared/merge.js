import { getTargetMonthInfo, getTargetMonthLabel } from "../background/config.js";
import { parseLabelToEpoch } from "../background/dates.js";

/**
 * Mutates `result` in place, keeping whichever of its own latest
 * Biometrics/CA dates or the given candidates has the later epoch.
 * Shared by:
 *   - index.js (fetch-detected dates vs. tab/DOM-detected dates)
 *   - tab-detection.js (DOM-filter-read dates vs. text-parsed dates)
 *   - ci/check.mjs (same comparison, driven by Playwright instead of chrome.tabs)
 */
export function mergeLatestDates(result, candidateVacDate, candidateNonVacDate) {
  if (
    candidateVacDate &&
    candidateVacDate !== "Not found" &&
    parseLabelToEpoch(candidateVacDate) > parseLabelToEpoch(result.latestVacDate)
  ) {
    result.latestVacDate = candidateVacDate;
  }
  if (
    candidateNonVacDate &&
    candidateNonVacDate !== "Not found" &&
    parseLabelToEpoch(candidateNonVacDate) > parseLabelToEpoch(result.latestNonVacDate)
  ) {
    result.latestNonVacDate = candidateNonVacDate;
  }
  return result;
}

/**
 * If a Biometrics/CA date was found inside the currently configured target
 * month, treat the slot as open even if the keyword-based text detection
 * didn't flag it (e.g. a bare calendar entry with no "available" wording).
 * Mutates and returns `result`. Reads the target month from config.js
 * module state — call applySettings()/loadSettings() first.
 */
export function promoteIfDatesInTargetMonth(result) {
  const targetInfo = getTargetMonthInfo();
  const targetLabel = getTargetMonthLabel();
  const targetMonthStart = Date.UTC(targetInfo.year, targetInfo.month, 1);
  const targetMonthEnd = Date.UTC(targetInfo.year, targetInfo.month + 1, 0, 23, 59, 59, 999);
  const vacEpoch = parseLabelToEpoch(result.latestVacDate);
  const nonVacEpoch = parseLabelToEpoch(result.latestNonVacDate);
  const vacInTargetMonth = vacEpoch >= targetMonthStart && vacEpoch <= targetMonthEnd;
  const nonVacInTargetMonth = nonVacEpoch >= targetMonthStart && nonVacEpoch <= targetMonthEnd;

  if ((vacInTargetMonth || nonVacInTargetMonth) && !result.isOpen) {
    result.isOpen = true;
    const parts = [];
    if (vacInTargetMonth) parts.push(`Biometrics: ${result.latestVacDate}`);
    if (nonVacInTargetMonth) parts.push(`CA: ${result.latestNonVacDate}`);
    result.evidence = `${targetLabel} slots detected — ${parts.join(", ")}`;
  }

  return result;
}
