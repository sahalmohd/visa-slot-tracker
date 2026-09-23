#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { chromium } from "playwright";

import {
  applySettings, getTargetUrl, getTargetMonthLabel, getVisaCategoryLabel
} from "../src/background/config.js";
import {
  detectOpenJulySlot
} from "../src/background/detection.js";
import { mergeLatestDates, promoteIfDatesInTargetMonth } from "../src/shared/merge.js";
import { domProbe } from "../src/shared/dom-probe.js";
import { parseBulletinPage } from "../src/background/bulletin.js";
import { publishNtfy } from "../src/shared/ntfy.js";
import { VISA_BULLETIN_URL } from "../src/background/constants.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, "config.json");
const STATE_PATH = path.join(__dirname, "state.json");

const DRY_RUN = process.argv.includes("--dry-run");
const NTFY_TOPIC = process.env.NTFY_TOPIC || "";
const NTFY_TOKEN = process.env.NTFY_TOKEN || "";
const IS_MANUAL_RUN = process.env.GITHUB_EVENT_NAME === "workflow_dispatch";

// The default Playwright UA advertises "HeadlessChrome", which the Vercel
// checkpoint on checkvisaslots.com flags. A realistic desktop Chrome UA
// clears it (verified manually against this exact target).
const REAL_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

const CHECKPOINT_PATTERN =
  /vercel security checkpoint|we're verifying your browser|security checkpoint|attention required.*cloudflare/i;

function loadJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function saveState(state) {
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2) + "\n");
}

async function push({ title, message, priority = 3, tags = [], clickUrl = "" }) {
  const line = `[ntfy] (priority ${priority}) ${title} — ${message}`;
  if (DRY_RUN) {
    console.log(`[dry-run] ${line}`);
    return;
  }
  if (!NTFY_TOPIC) {
    console.log(`[skip: no NTFY_TOPIC set] ${line}`);
    return;
  }
  await publishNtfy({ topic: NTFY_TOPIC, token: NTFY_TOKEN, title, message, priority, tags, clickUrl });
  console.log(line);
}

async function checkSlots(context) {
  const targetUrl = getTargetUrl();
  const page = await context.newPage();
  try {
    const response = await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
    const bodyText = await page.content();

    if (!response || !response.ok()) {
      throw new Error(`HTTP ${response ? response.status() : "no response"} loading ${targetUrl}`);
    }
    if (CHECKPOINT_PATTERN.test(bodyText)) {
      throw new Error(
        "Blocked by bot-detection checkpoint while loading checkvisaslots.com from this runner."
      );
    }

    // Data only appears after the location filter buttons are present and
    // clickable — a bare page load isn't enough (verified manually).
    await page.waitForSelector('button[id^="location-"]', { timeout: 45000 }).catch(() => {});

    const payload = await page.evaluate(domProbe, getTargetMonthLabel());
    const html = `${payload.html}\n<!-- innerText -->\n${payload.text}`;

    const result = detectOpenJulySlot(html, { strictDateExtraction: true });
    mergeLatestDates(result, payload.latestVacDate, payload.latestNonVacDate);
    promoteIfDatesInTargetMonth(result);

    return result;
  } finally {
    await page.close();
  }
}

async function checkBulletin(context) {
  const page = await context.newPage();
  try {
    const response = await page.goto(VISA_BULLETIN_URL, { waitUntil: "domcontentloaded", timeout: 45000 });
    if (!response || !response.ok()) {
      throw new Error(`HTTP ${response ? response.status() : "no response"} loading visa bulletin page`);
    }
    const html = await page.content();
    return parseBulletinPage(html);
  } finally {
    await page.close();
  }
}

async function main() {
  const config = loadJson(CONFIG_PATH);
  const targetMonth = process.env.TARGET_MONTH || config.targetMonth;
  const visaCategory = process.env.VISA_CATEGORY || config.visaCategory;
  applySettings({ targetMonth, visaCategory });

  const state = loadJson(STATE_PATH);
  const label = getTargetMonthLabel();
  const categoryLabel = getVisaCategoryLabel();
  const targetUrl = getTargetUrl();

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: REAL_UA,
    viewport: { width: 1280, height: 900 },
    locale: "en-US",
    timezoneId: "Asia/Kolkata"
  });

  let hadFailure = false;

  // --- Slots ---
  try {
    const result = await checkSlots(context);

    if (result.isOpen && !state.lastOpen) {
      await push({
        title: `Visa Slot Alert: ${label} looks open`,
        message: `The checker detected that ${label} may have an open ${categoryLabel} visa slot. ${result.evidence}`,
        priority: 5,
        tags: ["rotating_light"],
        clickUrl: targetUrl
      });
    } else if (result.isOpen && IS_MANUAL_RUN) {
      await push({
        title: `Visa Slot Alert: ${label} slots detected`,
        message: `Manual run found ${label} slots. Biometrics: ${result.latestVacDate}, CA: ${result.latestNonVacDate}.`,
        priority: 5,
        tags: ["rotating_light"],
        clickUrl: targetUrl
      });
    }

    const vacChanged = result.latestVacDate !== state.lastVacLatestDate;
    const nonVacChanged = result.latestNonVacDate !== state.lastNonVacLatestDate;
    if (vacChanged || nonVacChanged) {
      const changes = [];
      if (vacChanged && result.latestVacDate !== "Not found") {
        changes.push(`Biometrics: ${state.lastVacLatestDate} → ${result.latestVacDate}`);
      }
      if (nonVacChanged && result.latestNonVacDate !== "Not found") {
        changes.push(`CA: ${state.lastNonVacLatestDate} → ${result.latestNonVacDate}`);
      }
      if (changes.length) {
        await push({
          title: `Visa Slot Alert: New dates for ${label}`,
          message: `New dates for ${label}: ${changes.join(". ")}`,
          priority: 4,
          tags: ["calendar"],
          clickUrl: targetUrl
        });
      }
    }

    state.lastOpen = result.isOpen;
    state.lastVacLatestDate = result.latestVacDate;
    state.lastNonVacLatestDate = result.latestNonVacDate;

    console.log(
      `[visa-check] Slots: isOpen=${result.isOpen} vac=${result.latestVacDate} nonVac=${result.latestNonVacDate}`
    );
  } catch (error) {
    hadFailure = true;
    const reason = error instanceof Error ? error.message : String(error);
    console.error("[visa-check] Slot check failed:", reason);
    await push({
      title: "Visa Slot Checker: run failed",
      message: `Slot check failed: ${reason}`,
      priority: 2,
      tags: ["warning"]
    });
  }

  // --- Bulletin ---
  try {
    const bulletinData = await checkBulletin(context);
    const changed =
      state.bulletinUpcomingWasComingSoon &&
      !bulletinData.upcoming.isComingSoon &&
      bulletinData.upcoming.title !== "";

    if (changed) {
      const title = bulletinData.upcoming.title || "New Visa Bulletin";
      const url = bulletinData.upcoming.url || VISA_BULLETIN_URL;
      await push({
        title: `Visa Bulletin Alert: ${title} is now available`,
        message: `The upcoming visa bulletin (${title}) has been published. View it at: ${url}`,
        priority: 4,
        tags: ["newspaper"],
        clickUrl: url
      });
    }

    state.bulletinCurrentTitle = bulletinData.current.title;
    state.bulletinUpcomingTitle = bulletinData.upcoming.title;
    state.bulletinUpcomingWasComingSoon = bulletinData.upcoming.isComingSoon;

    console.log(
      `[visa-check] Bulletin: current=${bulletinData.current.title || "—"} upcoming=${bulletinData.upcoming.title || "—"} comingSoon=${bulletinData.upcoming.isComingSoon}`
    );
  } catch (error) {
    hadFailure = true;
    const reason = error instanceof Error ? error.message : String(error);
    console.error("[visa-check] Bulletin check failed:", reason);
    await push({
      title: "Visa Bulletin Checker: run failed",
      message: `Bulletin check failed: ${reason}`,
      priority: 2,
      tags: ["warning"]
    });
  }

  await browser.close();

  state.lastRunAt = Date.now();
  if (!DRY_RUN) {
    saveState(state);
  } else {
    console.log("[dry-run] Would write state:", JSON.stringify(state, null, 2));
  }

  if (hadFailure) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("[visa-check] Fatal error:", error);
  process.exitCode = 1;
});
