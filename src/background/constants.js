export const TARGET_URL =
  "https://checkvisaslots.com/visa-slots-info/in/l-1-individual-regular/";
export const TARGET_URL_PATTERNS = [
  "https://checkvisaslots.com/visa-slots-info/in/l-1-individual-regular/*",
  "https://checkvisaslots.com/visa-slots-info/in/l-1-individual-regular"
];
export const DEFAULT_TARGET_MONTH = "July 2026";
export const ALARM_NAME = "visa-slot-check";
export const DEFAULT_INTERVAL_MINUTES = 5;
export const EMAILJS_ENDPOINT = "https://api.emailjs.com/api/v1.0/email/send";

export const POSITIVE_KEYWORDS =
  /\b(open|available|book now|appointments? available|slots? open)\b/i;
export const NEGATIVE_KEYWORDS =
  /\b(no slots?|not available|unavailable|closed|none|full|n\/a|0 slots?)\b/i;
export const METADATA_DATE_CONTEXT =
  /\b(last (?:checked|updated|modified|refreshed)|as of|updated on|checked on|generated|retrieved)\b/i;

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

export const MONTH_INDEX = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
};
