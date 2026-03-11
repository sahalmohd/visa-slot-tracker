const statusEl = document.getElementById("status");
const lastCheckEl = document.getElementById("lastCheck");
const sourceEl = document.getElementById("source");
const evidenceEl = document.getElementById("evidence");
const vacLatestEl = document.getElementById("vacLatest");
const nonVacLatestEl = document.getElementById("nonVacLatest");
const checkNowBtn = document.getElementById("checkNow");
const targetMonthEl = document.getElementById("targetMonth");
const debugSection = document.getElementById("debugSection");

let targetMonth = "July 2026";

function formatTime(value) {
  if (!value) return "never";
  return new Date(value).toLocaleString();
}

function setStatus({
  lastOpen,
  lastCheckError,
  lastCheckAt,
  lastEvidence,
  lastCheckSource,
  lastVacLatestDate,
  lastNonVacLatestDate
}) {
  if (lastCheckError) {
    statusEl.textContent = `Error: ${lastCheckError}`;
    statusEl.className = "status error";
  } else if (lastOpen) {
    statusEl.textContent = `OPEN detected for ${targetMonth}`;
    statusEl.className = "status open";
  } else {
    statusEl.textContent = `No open ${targetMonth} slot detected`;
    statusEl.className = "status closed";
  }

  lastCheckEl.textContent = `Last check: ${formatTime(lastCheckAt)}`;
  sourceEl.textContent = `Source: ${lastCheckSource || "unknown"}`;
  vacLatestEl.textContent = `Latest Biometrics date: ${lastVacLatestDate || "Not found"}`;
  nonVacLatestEl.textContent = `Latest CA date: ${lastNonVacLatestDate || "Not found"}`;
  evidenceEl.textContent = lastEvidence
    ? `Evidence: ${lastEvidence.slice(0, 130)}`
    : "";
}

async function refresh() {
  const settings = await chrome.storage.sync.get({
    targetMonth: "July 2026",
    debugEnabled: false
  });
  targetMonth = settings.targetMonth;
  if (targetMonthEl) {
    targetMonthEl.textContent = `Target: ${targetMonth}`;
  }

  if (debugSection) {
    debugSection.style.display = settings.debugEnabled ? "block" : "none";
  }

  const data = await chrome.runtime.sendMessage({ type: "getStatus" });
  setStatus(data);

  if (settings.debugEnabled) {
    const debugData = await chrome.storage.local.get({ lastDebugInfo: "" });
    const debugEl = document.getElementById("debugInfo");
    if (debugEl) {
      debugEl.textContent = debugData.lastDebugInfo || "No debug data yet. Click 'Check now'.";
    }
  }
}

document.getElementById("copyDebug").addEventListener("click", () => {
  const text = document.getElementById("debugInfo").textContent;
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById("copyDebug");
    btn.textContent = "Copied!";
    setTimeout(() => { btn.textContent = "Copy to clipboard"; }, 1500);
  });
});

checkNowBtn.addEventListener("click", async () => {
  checkNowBtn.disabled = true;
  try {
    await chrome.runtime.sendMessage({ type: "checkNow" });
    await refresh();
  } finally {
    checkNowBtn.disabled = false;
  }
});

refresh().catch((error) => {
  statusEl.textContent = String(error);
  statusEl.className = "status error";
});
