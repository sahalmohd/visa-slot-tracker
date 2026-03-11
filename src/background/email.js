import { TARGET_URL, EMAILJS_ENDPOINT } from "./constants.js";
import { getTargetMonthLabel } from "./config.js";
import { sanitize, isValidEmail } from "./dates.js";

export async function getEmailSettings() {
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

export async function sendEmailNotification({
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
  if (!settings.emailjsServiceId || !settings.emailjsTemplateId || !settings.emailjsPublicKey) {
    throw new Error("Email setting invalid: EmailJS service/template/public key is missing.");
  }

  const payload = {
    service_id: settings.emailjsServiceId,
    template_id: settings.emailjsTemplateId,
    user_id: settings.emailjsPublicKey,
    template_params: {
      to_email: settings.emailTo,
      subject, message,
      target_month: getTargetMonthLabel(),
      target_url: TARGET_URL,
      evidence,
      vac_latest_date: vacLatestDate,
      non_vac_latest_date: nonVacLatestDate,
      checked_at: new Date().toLocaleString()
    }
  };

  const response = await fetch(EMAILJS_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
