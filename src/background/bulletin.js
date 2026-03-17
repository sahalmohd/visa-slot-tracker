import { VISA_BULLETIN_URL, VISA_BULLETIN_BASE } from "./constants.js";

/**
 * Fetch the visa bulletin index page and extract current + upcoming status.
 *
 * The page has two boxes:
 *   "Current Visa Bulletin"  → link like "March 2026"
 *   "Upcoming Visa Bulletin" → "Coming Soon" or a link when published
 *
 * Returns { current, upcoming } where each is:
 *   { title, url, isComingSoon }
 */
export async function checkVisaBulletin() {
  const response = await fetch(VISA_BULLETIN_URL, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Visa bulletin fetch failed: HTTP ${response.status}`);
  }

  const html = await response.text();
  return parseBulletinPage(html);
}

export function parseBulletinPage(html) {
  const result = {
    current: { title: "", url: "", isComingSoon: false },
    upcoming: { title: "", url: "", isComingSoon: true }
  };

  const textLower = html.toLowerCase();

  // --- Current Visa Bulletin ---
  const currentIdx = textLower.indexOf("current visa bulletin");
  if (currentIdx !== -1) {
    const searchWindow = html.slice(currentIdx, currentIdx + 1200);
    const linkMatch = searchWindow.match(
      /<a\s[^>]*href=["']([^"']*visa-bulletin-for-[^"']+)["'][^>]*>([\s\S]*?)<\/a>/i
    );
    if (linkMatch) {
      const href = linkMatch[1];
      const linkText = linkMatch[2].replace(/<[^>]+>/g, "").trim();
      result.current.title = normalizeBulletinTitle(linkText || extractTitleFromUrl(href));
      result.current.url = href.startsWith("http") ? href : VISA_BULLETIN_BASE + href;
    } else {
      const textMatch = searchWindow.match(
        /(?:January|February|March|April|May|June|July|August|September|October|November|December)\s*\d{4}/i
      );
      if (textMatch) {
        result.current.title = normalizeBulletinTitle(textMatch[0]);
      }
    }
  }

  // --- Upcoming Visa Bulletin ---
  const upcomingIdx = textLower.indexOf("upcoming visa bulletin");
  if (upcomingIdx !== -1) {
    const searchWindow = html.slice(upcomingIdx, upcomingIdx + 1200);
    const comingSoon = /coming\s+soon/i.test(searchWindow.slice(0, 500));

    const linkMatch = searchWindow.match(
      /<a\s[^>]*href=["']([^"']*visa-bulletin-for-[^"']+)["'][^>]*>([\s\S]*?)<\/a>/i
    );

    if (linkMatch && !comingSoon) {
      const href = linkMatch[1];
      const linkText = linkMatch[2].replace(/<[^>]+>/g, "").trim();
      result.upcoming.title = normalizeBulletinTitle(linkText || extractTitleFromUrl(href));
      result.upcoming.url = href.startsWith("http") ? href : VISA_BULLETIN_BASE + href;
      result.upcoming.isComingSoon = false;
    } else {
      result.upcoming.isComingSoon = true;
      result.upcoming.title = "Coming Soon";
      const textMatch = searchWindow.match(
        /(?:January|February|March|April|May|June|July|August|September|October|November|December)\s*\d{4}/i
      );
      if (textMatch) {
        result.upcoming.title = `${normalizeBulletinTitle(textMatch[0])} (Coming Soon)`;
      }
    }
  }

  return result;
}

function extractTitleFromUrl(href) {
  const match = href.match(/visa-bulletin-for-(\w+)-(\d{4})/i);
  if (!match) return "";
  const month = match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();
  return `${month} ${match[2]}`;
}

/** Normalize "April2026" / "March 2026" -> "April 2026" for display */
function normalizeBulletinTitle(text) {
  if (!text || typeof text !== "string") return text || "";
  const trimmed = text.trim();
  const withSpace = trimmed.replace(/^([a-z]+)(\d{4})$/i, "$1 $2");
  return withSpace || trimmed;
}

/**
 * Run the bulletin check, compare with previous state,
 * and return { bulletinData, changed } where changed is true
 * if the upcoming bulletin went from "Coming Soon" to published.
 */
export async function runBulletinCheck() {
  const bulletinData = await checkVisaBulletin();

  const previous = await chrome.storage.local.get({
    bulletinUpcomingWasComingSoon: true,
    bulletinCurrentTitle: ""
  });

  const changed =
    previous.bulletinUpcomingWasComingSoon &&
    !bulletinData.upcoming.isComingSoon &&
    bulletinData.upcoming.title !== "";

  await chrome.storage.local.set({
    bulletinCurrentTitle: bulletinData.current.title,
    bulletinCurrentUrl: bulletinData.current.url,
    bulletinUpcomingTitle: bulletinData.upcoming.title,
    bulletinUpcomingUrl: bulletinData.upcoming.url,
    bulletinUpcomingIsComingSoon: bulletinData.upcoming.isComingSoon,
    bulletinUpcomingWasComingSoon: bulletinData.upcoming.isComingSoon,
    bulletinLastCheckAt: Date.now()
  });

  return { bulletinData, changed };
}
