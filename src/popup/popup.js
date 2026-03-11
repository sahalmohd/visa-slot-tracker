const statusEl = document.getElementById("status");
const lastCheckEl = document.getElementById("lastCheck");
const sourceEl = document.getElementById("source");
const evidenceEl = document.getElementById("evidence");
const vacLatestEl = document.getElementById("vacLatest");
const nonVacLatestEl = document.getElementById("nonVacLatest");
const checkNowBtn = document.getElementById("checkNow");
const targetMonthEl = document.getElementById("targetMonth");
const debugSection = document.getElementById("debugSection");
const bulletinCurrentEl = document.getElementById("bulletinCurrent");
const bulletinUpcomingEl = document.getElementById("bulletinUpcoming");

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
  lastNonVacLatestDate,
  bulletinCurrentTitle,
  bulletinCurrentUrl,
  bulletinUpcomingTitle,
  bulletinUpcomingUrl,
  bulletinUpcomingIsComingSoon
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

  // Bulletin: Current
  if (bulletinCurrentTitle) {
    bulletinCurrentEl.innerHTML = "";
    bulletinCurrentEl.appendChild(document.createTextNode("Current: "));
    if (bulletinCurrentUrl) {
      const link = document.createElement("a");
      link.href = bulletinCurrentUrl;
      link.target = "_blank";
      link.rel = "noreferrer";
      link.className = "bulletin-link";
      link.textContent = bulletinCurrentTitle;
      bulletinCurrentEl.appendChild(link);
    } else {
      bulletinCurrentEl.appendChild(document.createTextNode(bulletinCurrentTitle));
    }
  } else {
    bulletinCurrentEl.textContent = "Current: —";
  }

  // Bulletin: Upcoming
  if (bulletinUpcomingIsComingSoon) {
    const label = bulletinUpcomingTitle || "Coming Soon";
    bulletinUpcomingEl.innerHTML = "";
    bulletinUpcomingEl.appendChild(document.createTextNode("Upcoming: "));
    const span = document.createElement("span");
    span.className = "coming-soon";
    span.textContent = label;
    bulletinUpcomingEl.appendChild(span);
  } else if (bulletinUpcomingTitle) {
    bulletinUpcomingEl.innerHTML = "";
    bulletinUpcomingEl.appendChild(document.createTextNode("Upcoming: "));
    const span = document.createElement("span");
    span.className = "published";
    if (bulletinUpcomingUrl) {
      const link = document.createElement("a");
      link.href = bulletinUpcomingUrl;
      link.target = "_blank";
      link.rel = "noreferrer";
      link.className = "bulletin-link";
      link.textContent = bulletinUpcomingTitle;
      span.appendChild(link);
    } else {
      span.textContent = bulletinUpcomingTitle;
    }
    bulletinUpcomingEl.appendChild(span);
    const badge = document.createTextNode(" ✓ Published");
    const badgeSpan = document.createElement("span");
    badgeSpan.className = "published";
    badgeSpan.textContent = " ✓ Published";
    bulletinUpcomingEl.appendChild(badgeSpan);
  } else {
    bulletinUpcomingEl.textContent = "Upcoming: —";
  }
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
    await Promise.all([
      chrome.runtime.sendMessage({ type: "checkNow" }),
      chrome.runtime.sendMessage({ type: "checkBulletin" })
    ]);
    await refresh();
  } finally {
    checkNowBtn.disabled = false;
  }
});

refresh().catch((error) => {
  statusEl.textContent = String(error);
  statusEl.className = "status error";
});
