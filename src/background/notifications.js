import { getTargetMonthLabel, getTargetUrl, getVisaCategoryLabel } from "./config.js";
import { sendEmailNotification } from "./email.js";
import { sendPushNotification } from "./push.js";
import { VISA_BULLETIN_URL } from "./constants.js";

export async function setBadge(isOpen) {
  if (isOpen) {
    await chrome.action.setBadgeBackgroundColor({ color: "#b91c1c" });
    await chrome.action.setBadgeText({ text: "OPEN" });
  } else {
    await chrome.action.setBadgeText({ text: "" });
  }
}

/**
 * Fans a single event out to desktop, email, and ntfy push.
 * Each channel is independent: a failure in one (or being disabled)
 * never blocks the others. Pass desktopTitle: null to skip the
 * desktop notification (used for manual checks, matching prior behavior).
 */
async function dispatch({
  desktopTitle,
  desktopMessage,
  subject,
  message,
  evidence,
  vacLatestDate,
  nonVacLatestDate,
  priority,
  tags,
  clickUrl
}) {
  if (desktopTitle) {
    await chrome.notifications.create({
      type: "basic",
      iconUrl: "icons/icon-128.png",
      title: desktopTitle,
      message: desktopMessage,
      priority: 2
    });
  }

  try {
    await sendEmailNotification({ subject, message, evidence, vacLatestDate, nonVacLatestDate });
  } catch (error) {
    await chrome.storage.local.set({
      lastEmailError: error instanceof Error ? error.message : String(error)
    });
  }

  try {
    await sendPushNotification({ title: subject, message, priority, tags, clickUrl });
  } catch (error) {
    await chrome.storage.local.set({
      lastPushError: error instanceof Error ? error.message : String(error)
    });
  }
}

export async function notifyOpen(evidence, latestVacDate, latestNonVacDate) {
  const label = getTargetMonthLabel();
  const categoryLabel = getVisaCategoryLabel();

  await chrome.storage.local.set({
    lastNotificationEvidence: evidence,
    lastNotificationAt: Date.now()
  });

  await dispatch({
    desktopTitle: "Visa Slot Alert",
    desktopMessage: `${label} looks OPEN. Biometrics: ${latestVacDate}. CA: ${latestNonVacDate}.`,
    subject: `Visa Slot Alert: ${label} looks open`,
    message: `The checker detected that ${label} may have an open ${categoryLabel} visa slot.`,
    evidence,
    vacLatestDate: latestVacDate,
    nonVacLatestDate: latestNonVacDate,
    priority: 5,
    tags: ["rotating_light"],
    clickUrl: getTargetUrl()
  });
}

export async function notifyDateChange({ prevVac, prevNonVac, newVac, newNonVac }) {
  const changes = [];
  if (newVac !== prevVac && newVac !== "Not found") {
    changes.push(`Biometrics: ${prevVac} → ${newVac}`);
  }
  if (newNonVac !== prevNonVac && newNonVac !== "Not found") {
    changes.push(`CA: ${prevNonVac} → ${newNonVac}`);
  }
  if (!changes.length) return;

  const label = getTargetMonthLabel();
  const message = `New dates for ${label}: ${changes.join(". ")}`;

  await dispatch({
    desktopTitle: "Visa Slot - New Dates",
    desktopMessage: message,
    subject: `Visa Slot Alert: New dates for ${label}`,
    message,
    evidence: changes.join("\n"),
    vacLatestDate: newVac,
    nonVacLatestDate: newNonVac,
    priority: 4,
    tags: ["calendar"],
    clickUrl: getTargetUrl()
  });
}

export async function notifyBulletinPublished(upcoming) {
  const title = upcoming.title || "New Visa Bulletin";
  const url = upcoming.url || VISA_BULLETIN_URL;

  await dispatch({
    desktopTitle: "New Visa Bulletin Published!",
    desktopMessage: `The ${title} visa bulletin is now available.`,
    subject: `Visa Bulletin Alert: ${title} is now available`,
    message: `The upcoming visa bulletin (${title}) has been published. View it at: ${url}`,
    evidence: `Bulletin: ${title}\nURL: ${url}`,
    priority: 4,
    tags: ["newspaper"],
    clickUrl: url
  });
}

/**
 * Manual "Check now" click that found an open slot. No desktop
 * notification — the user is already looking at the popup that
 * triggered the check.
 */
export async function notifyManualCheck({ evidence, vacLatestDate, nonVacLatestDate }) {
  const label = getTargetMonthLabel();

  await dispatch({
    desktopTitle: null,
    subject: `Visa Slot Alert: ${label} slots detected`,
    message: `Manual check found ${label} slots. Biometrics: ${vacLatestDate}, CA: ${nonVacLatestDate}.`,
    evidence,
    vacLatestDate,
    nonVacLatestDate,
    priority: 5,
    tags: ["rotating_light"],
    clickUrl: getTargetUrl()
  });
}
