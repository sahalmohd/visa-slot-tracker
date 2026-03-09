const TARGET_URL =
  "https://checkvisaslots.com/visa-slots-info/in/l-1-individual-regular/";

const intervalInput = document.getElementById("intervalMinutes");
const saveBtn = document.getElementById("save");
const statusEl = document.getElementById("status");
const targetUrlEl = document.getElementById("targetUrl");

targetUrlEl.textContent = TARGET_URL;

async function load() {
  const { intervalMinutes = 5 } = await chrome.storage.sync.get({
    intervalMinutes: 5
  });
  intervalInput.value = intervalMinutes;
}

saveBtn.addEventListener("click", async () => {
  const next = Number(intervalInput.value);
  if (!Number.isFinite(next) || next < 1 || next > 60) {
    statusEl.textContent = "Enter a value from 1 to 60.";
    return;
  }

  const result = await chrome.runtime.sendMessage({
    type: "updateInterval",
    intervalMinutes: next
  });

  if (result?.ok) {
    statusEl.textContent = `Saved. Checking every ${result.intervalMinutes} minute(s).`;
  } else {
    statusEl.textContent = `Save failed: ${result?.error || "Unknown error"}`;
  }
});

load().catch((error) => {
  statusEl.textContent = `Load failed: ${String(error)}`;
});
