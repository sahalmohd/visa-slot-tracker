import { getTargetMonthLabel } from "./config.js";
import { sendEmailNotification } from "./email.js";
import { VISA_BULLETIN_URL } from "./constants.js";

export async function setBadge(isOpen) {
  if (isOpen) {
    await chrome.action.setBadgeBackgroundColor({ color: "#b91c1c" });
    await chrome.action.setBadgeText({ text: "OPEN" });
  } else {
    await chrome.action.setBadgeText({ text: "" });
  }
}

export async function notifyOpen(evidence, latestVacDate, latestNonVacDate) {
  const label = getTargetMonthLabel();

  await chrome.notifications.create({
    type: "basic",
    iconUrl: "icons/icon-128.png",
    title: "Visa Slot Alert",
    message: `${label} looks OPEN. Biometrics: ${latestVacDate}. CA: ${latestNonVacDate}.`,
    priority: 2
  });

  await chrome.storage.local.set({
    lastNotificationEvidence: evidence,
    lastNotificationAt: Date.now()
  });

  try {
    await sendEmailNotification({
      subject: `Visa Slot Alert: ${label} looks open`,
      message: `The checker detected that ${label} may have an open L-1 Individual Regular visa slot.`,
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

  await chrome.notifications.create({
    type: "basic",
    iconUrl: "icons/icon-128.png",
    title: "Visa Slot - New Dates",
    message,
    priority: 2
  });

  try {
    await sendEmailNotification({
      subject: `Visa Slot Alert: New dates for ${label}`,
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

export async function notifyBulletinPublished(upcoming) {
  const title = upcoming.title || "New Visa Bulletin";
  const url = upcoming.url || VISA_BULLETIN_URL;

  await chrome.notifications.create({
    type: "basic",
    iconUrl: "icons/icon-128.png",
    title: "New Visa Bulletin Published!",
    message: `The ${title} visa bulletin is now available.`,
    priority: 2
  });

  try {
    await sendEmailNotification({
      subject: `Visa Bulletin Alert: ${title} is now available`,
      message: `The upcoming visa bulletin (${title}) has been published. View it at: ${url}`,
      evidence: `Bulletin: ${title}\nURL: ${url}`,
      force: false
    });
  } catch (error) {
    await chrome.storage.local.set({
      lastEmailError: error instanceof Error ? error.message : String(error)
    });
  }
}
