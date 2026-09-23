const CHECKVISASLOTS_BASE = "https://checkvisaslots.com/visa-slots-info/in/";
const DEFAULT_VISA_CATEGORY = "l-1-individual-regular";

const VISA_CATEGORIES = [
  { slug: "b1-b2-regular", label: "B1/B2 (Regular)" },
  { slug: "b1-regular", label: "B1 (Regular)" },
  { slug: "b2-regular", label: "B2 (Regular)" },
  { slug: "b1-b2-dropbox", label: "B1/B2 (Dropbox)" },
  { slug: "b1-dropbox", label: "B1 (Dropbox)" },
  { slug: "b2-dropbox", label: "B2 (Dropbox)" },
  { slug: "c-1-regular", label: "C-1 (Regular)" },
  { slug: "c1-d-regular", label: "C1/D (Regular)" },
  { slug: "cr1-regular", label: "CR1 (Regular)" },
  { slug: "f-1-regular", label: "F-1 (Regular)" },
  { slug: "f-2-regular", label: "F-2 (Regular)" },
  { slug: "f31-regular", label: "F31 (Regular)" },
  { slug: "f41-regular", label: "F41 (Regular)" },
  { slug: "h-1b-regular", label: "H-1B (Regular)" },
  { slug: "h-1b-emergency", label: "H-1B (Emergency)" },
  { slug: "h-4-regular", label: "H-4 (Regular)" },
  { slug: "ir1-regular", label: "IR1 (Regular)" },
  { slug: "ir5-regular", label: "IR5 (Regular)" },
  { slug: "j-1-regular", label: "J-1 (Regular)" },
  { slug: "j-2-regular", label: "J-2 (Regular)" },
  { slug: "k1-regular", label: "K1 (Regular)" },
  { slug: "l-1-blanket-regular", label: "L-1 Blanket (Regular)" },
  { slug: "l-1-individual-regular", label: "L-1 Individual (Regular)" },
  { slug: "l-2-blanket-regular", label: "L-2 Blanket (Regular)" },
  { slug: "l-2-individual-regular", label: "L-2 Individual (Regular)" },
  { slug: "m-1-regular", label: "M-1 (Regular)" },
  { slug: "o-1-regular", label: "O-1 (Regular)" },
  { slug: "p-1-regular", label: "P-1 (Regular)" },
  { slug: "r-1-regular", label: "R-1 (Regular)" },
  { slug: "r-2-regular", label: "R-2 (Regular)" }
];

const visaCategorySelect = document.getElementById("visaCategory");
const intervalInput = document.getElementById("intervalMinutes");
const targetMonthSelect = document.getElementById("targetMonthSelect");
const targetYearInput = document.getElementById("targetYear");
const saveBtn = document.getElementById("save");
const testEmailBtn = document.getElementById("testEmail");
const testPushBtn = document.getElementById("testPush");
const statusEl = document.getElementById("status");
const targetUrlEl = document.getElementById("targetUrl");
const emailEnabledInput = document.getElementById("emailEnabled");
const emailToInput = document.getElementById("emailTo");
const emailjsServiceIdInput = document.getElementById("emailjsServiceId");
const emailjsTemplateIdInput = document.getElementById("emailjsTemplateId");
const emailjsPublicKeyInput = document.getElementById("emailjsPublicKey");
const ntfyEnabledInput = document.getElementById("ntfyEnabled");
const ntfyTopicInput = document.getElementById("ntfyTopic");
const ntfyTokenInput = document.getElementById("ntfyToken");
const notifyDateChangeInput = document.getElementById("notifyDateChange");
const debugEnabledInput = document.getElementById("debugEnabled");

for (const cat of VISA_CATEGORIES) {
  const opt = document.createElement("option");
  opt.value = cat.slug;
  opt.textContent = cat.label;
  visaCategorySelect.appendChild(opt);
}

function updateTargetUrl() {
  const slug = visaCategorySelect.value || DEFAULT_VISA_CATEGORY;
  targetUrlEl.textContent = `${CHECKVISASLOTS_BASE}${slug}/`;
}

visaCategorySelect.addEventListener("change", updateTargetUrl);

async function load() {
  const {
    intervalMinutes = 5,
    targetMonth = "July 2026",
    visaCategory = DEFAULT_VISA_CATEGORY,
    emailEnabled = false,
    emailTo = "",
    emailjsServiceId = "",
    emailjsTemplateId = "",
    emailjsPublicKey = "",
    ntfyEnabled = false,
    ntfyTopic = "",
    ntfyToken = "",
    notifyDateChange = true,
    debugEnabled = false
  } = await chrome.storage.sync.get({
    intervalMinutes: 5,
    targetMonth: "July 2026",
    visaCategory: DEFAULT_VISA_CATEGORY,
    emailEnabled: false,
    emailTo: "",
    emailjsServiceId: "",
    emailjsTemplateId: "",
    emailjsPublicKey: "",
    ntfyEnabled: false,
    ntfyTopic: "",
    ntfyToken: "",
    notifyDateChange: true,
    debugEnabled: false
  });

  visaCategorySelect.value = visaCategory;
  intervalInput.value = intervalMinutes;

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
  ntfyEnabledInput.checked = ntfyEnabled;
  ntfyTopicInput.value = ntfyTopic;
  ntfyTokenInput.value = ntfyToken;
  notifyDateChangeInput.checked = notifyDateChange;
  debugEnabledInput.checked = debugEnabled;

  updateTargetUrl();
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
    visaCategory: visaCategorySelect.value,
    emailEnabled: emailEnabledInput.checked,
    emailTo: emailToInput.value.trim(),
    emailjsServiceId: emailjsServiceIdInput.value.trim(),
    emailjsTemplateId: emailjsTemplateIdInput.value.trim(),
    emailjsPublicKey: emailjsPublicKeyInput.value.trim(),
    ntfyEnabled: ntfyEnabledInput.checked,
    ntfyTopic: ntfyTopicInput.value.trim(),
    ntfyToken: ntfyTokenInput.value.trim(),
    notifyDateChange: notifyDateChangeInput.checked,
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

testPushBtn.addEventListener("click", async () => {
  statusEl.textContent = "Sending test push...";
  const result = await chrome.runtime.sendMessage({
    type: "sendTestPush"
  });
  if (result?.ok) {
    statusEl.textContent = "Test push sent successfully.";
  } else {
    statusEl.textContent = `Test push failed: ${result?.error || "Unknown error"}`;
  }
});

load().catch((error) => {
  statusEl.textContent = `Load failed: ${String(error)}`;
});
