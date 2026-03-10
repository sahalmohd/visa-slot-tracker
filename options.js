const TARGET_URL =
  "https://checkvisaslots.com/visa-slots-info/in/l-1-individual-regular/";

const intervalInput = document.getElementById("intervalMinutes");
const targetMonthSelect = document.getElementById("targetMonthSelect");
const targetYearInput = document.getElementById("targetYear");
const saveBtn = document.getElementById("save");
const testEmailBtn = document.getElementById("testEmail");
const statusEl = document.getElementById("status");
const targetUrlEl = document.getElementById("targetUrl");
const emailEnabledInput = document.getElementById("emailEnabled");
const emailToInput = document.getElementById("emailTo");
const emailjsServiceIdInput = document.getElementById("emailjsServiceId");
const emailjsTemplateIdInput = document.getElementById("emailjsTemplateId");
const emailjsPublicKeyInput = document.getElementById("emailjsPublicKey");
const debugEnabledInput = document.getElementById("debugEnabled");

targetUrlEl.textContent = TARGET_URL;

async function load() {
  const {
    intervalMinutes = 5,
    targetMonth = "July 2026",
    emailEnabled = false,
    emailTo = "",
    emailjsServiceId = "",
    emailjsTemplateId = "",
    emailjsPublicKey = "",
    debugEnabled = false
  } = await chrome.storage.sync.get({
    intervalMinutes: 5,
    targetMonth: "July 2026",
    emailEnabled: false,
    emailTo: "",
    emailjsServiceId: "",
    emailjsTemplateId: "",
    emailjsPublicKey: "",
    debugEnabled: false
  });
  intervalInput.value = intervalMinutes;

  // Parse target month "July 2026" → month select + year input
  const parts = targetMonth.match(/^(\w+)\s+(\d{4})$/);
  if (parts) {
    targetMonthSelect.value = parts[1];
    targetYearInput.value = parts[2];
  } else {
    targetMonthSelect.value = "July";
    targetYearInput.value = "2026";
  }

  emailEnabledInput.checked = emailEnabled;
  emailToInput.value = emailTo;
  emailjsServiceIdInput.value = emailjsServiceId;
  emailjsTemplateIdInput.value = emailjsTemplateId;
  emailjsPublicKeyInput.value = emailjsPublicKey;
  debugEnabledInput.checked = debugEnabled;
}

saveBtn.addEventListener("click", async () => {
  const next = Number(intervalInput.value);
  if (!Number.isFinite(next) || next < 1 || next > 60) {
    statusEl.textContent = "Enter a value from 1 to 60.";
    return;
  }

  const targetMonth = `${targetMonthSelect.value} ${targetYearInput.value}`;

  const result = await chrome.runtime.sendMessage({
    type: "updateSettings",
    intervalMinutes: next,
    targetMonth,
    emailEnabled: emailEnabledInput.checked,
    emailTo: emailToInput.value.trim(),
    emailjsServiceId: emailjsServiceIdInput.value.trim(),
    emailjsTemplateId: emailjsTemplateIdInput.value.trim(),
    emailjsPublicKey: emailjsPublicKeyInput.value.trim(),
    debugEnabled: debugEnabledInput.checked
  });

  if (result?.ok) {
    statusEl.textContent = `Saved. Checking every ${result.intervalMinutes} minute(s).`;
  } else {
    statusEl.textContent = `Save failed: ${result?.error || "Unknown error"}`;
  }
});

testEmailBtn.addEventListener("click", async () => {
  statusEl.textContent = "Sending test email...";
  const result = await chrome.runtime.sendMessage({
    type: "sendTestEmail"
  });
  if (result?.ok) {
    statusEl.textContent = "Test email sent successfully.";
  } else {
    statusEl.textContent = `Test email failed: ${result?.error || "Unknown error"}`;
  }
});

load().catch((error) => {
  statusEl.textContent = `Load failed: ${String(error)}`;
});
