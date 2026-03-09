const statusEl = document.getElementById("status");
const lastCheckEl = document.getElementById("lastCheck");
const evidenceEl = document.getElementById("evidence");
const checkNowBtn = document.getElementById("checkNow");

function formatTime(value) {
  if (!value) return "never";
  return new Date(value).toLocaleString();
}

function setStatus({ lastOpen, lastCheckError, lastCheckAt, lastEvidence }) {
  if (lastCheckError) {
    statusEl.textContent = `Error: ${lastCheckError}`;
    statusEl.className = "status error";
  } else if (lastOpen) {
    statusEl.textContent = "OPEN detected for July 2026";
    statusEl.className = "status open";
  } else {
    statusEl.textContent = "No open July 2026 slot detected";
    statusEl.className = "status closed";
  }

  lastCheckEl.textContent = `Last check: ${formatTime(lastCheckAt)}`;
  evidenceEl.textContent = lastEvidence
    ? `Evidence: ${lastEvidence.slice(0, 130)}`
    : "";
}

async function refresh() {
  const data = await chrome.runtime.sendMessage({ type: "getStatus" });
  setStatus(data);
}

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
