import { publishNtfy } from "../shared/ntfy.js";
import { sanitize } from "./dates.js";

export async function getPushSettings() {
  const data = await chrome.storage.sync.get({
    ntfyEnabled: false,
    ntfyTopic: "",
    ntfyToken: ""
  });

  return {
    ntfyEnabled: Boolean(data.ntfyEnabled),
    ntfyTopic: sanitize(data.ntfyTopic),
    ntfyToken: sanitize(data.ntfyToken)
  };
}

export async function sendPushNotification({
  title,
  message,
  priority = 3,
  tags = [],
  clickUrl = "",
  force = false
}) {
  const settings = await getPushSettings();
  if (!settings.ntfyEnabled && !force) {
    return { ok: true, skipped: true, reason: "Push disabled" };
  }

  if (!settings.ntfyTopic) {
    throw new Error("Push setting invalid: ntfy topic is missing.");
  }

  await publishNtfy({
    topic: settings.ntfyTopic,
    token: settings.ntfyToken,
    title, message, priority, tags, clickUrl
  });

  await chrome.storage.local.set({
    lastPushError: "",
    lastPushAt: Date.now()
  });
  return { ok: true, skipped: false };
}
