export const CHECKVISASLOTS_BASE = "https://checkvisaslots.com/visa-slots-info/in/";
export const DEFAULT_VISA_CATEGORY = "l-1-individual-regular";
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

export const VISA_BULLETIN_URL =
  "https://travel.state.gov/content/travel/en/legal/visa-law0/visa-bulletin.html";
export const VISA_BULLETIN_BASE =
  "https://travel.state.gov";

export const VISA_CATEGORIES = [
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
