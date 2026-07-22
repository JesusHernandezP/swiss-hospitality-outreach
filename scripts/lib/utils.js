/**
 * Swiss Hospitality Outreach — Shared Utilities
 * Email validation, domain normalization, ID generation
 */

const crypto = require('crypto');

// ═══════════════════════════════════════════
//  EMAIL VALIDATION
// ═══════════════════════════════════════════

const EMAIL_REGEX = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

/** Patterns that indicate a scraped "email" is actually garbage (JS libs, npm packages, etc.) */
const GARBAGE_PATTERNS = [
  /@\d+\.\d+/,           // version numbers like @3.7.1
  /jquery/i,
  /bootstrap/i,
  /slick[-_]?carousel/i,
  /pdfjs/i,
  /webpack/i,
  /babel/i,
  /eslint/i,
  /react/i,
  /angular/i,
  /vue@/i,
  /npm/i,
  /node@/i,
  /lodash/i,
  /moment/i,
  /axios/i,
  /popper/i,
  /fontawesome/i,
  /swiper/i,
  /gsap/i,
  /leaflet/i,
  /mapbox/i,
  /sentry/i,
  /hotjar/i,
  /google-analytics/i,
  /cloudflare/i,
  /round_\d/i,
  /^use@/i,
  /^\d/,                 // starts with digit
  /\.js$/i,
  /\.css$/i,
  /\.min\./i,
  /\.map$/i,
  /woff/i,
  /ttf/i,
  /eot/i,
  /noreply/i,
  /no-reply/i,
  /donotreply/i,
  /mailer-daemon/i,
  /postmaster/i,
  /example\.com$/i,
  /example\.ch$/i,
  /test\.com$/i,
  /localhost/i,
  /sentry\.io$/i,
  /wixpress\.com$/i,
  /squarespace/i,
  /mailchimp/i,
  /campaign-archive/i,
];

const INVALID_TLDS = [
  'js', 'css', 'html', 'xml', 'json', 'svg', 'png', 'jpg', 'jpeg',
  'gif', 'ico', 'woff', 'woff2', 'ttf', 'eot', 'map', 'min',
];

/**
 * Validates if a string is a real business email (not a JS library, npm package, etc.)
 */
function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  email = email.trim().toLowerCase();

  if (email.length < 5 || email.length > 254) return false;
  if (!/^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$/.test(email)) return false;

  // Filter garbage
  for (const pattern of GARBAGE_PATTERNS) {
    if (pattern.test(email)) return false;
  }

  // Check TLD
  const tld = email.split('.').pop();
  if (INVALID_TLDS.includes(tld)) return false;

  // Check if local part looks like a version number
  const local = email.split('@')[0];
  if (/^\d+(\.\d+)+/.test(local)) return false;
  if (local.length < 2) return false;

  return true;
}

/**
 * Extract all valid emails from a text string
 */
function extractEmails(text) {
  if (!text) return [];
  const matches = text.match(EMAIL_REGEX) || [];
  const unique = [...new Set(matches.map(e => e.toLowerCase().trim()))];
  return unique.filter(isValidEmail);
}

// ═══════════════════════════════════════════
//  EMAIL CLASSIFICATION
// ═══════════════════════════════════════════

/**
 * Classify an email address by its likely department/role
 */
function classifyEmailType(email) {
  if (!email) return 'UNKNOWN';
  const local = email.toLowerCase().split('@')[0];

  if (/^(jobs?|karriere|career|bewerbung|stellen|stelle|application|employment)/.test(local)) return 'JOBS';
  if (/^(hr|humanresources?|personal|recruiting|recruitment|people)/.test(local)) return 'HR';
  if (/^(direktion|direction|management|chef|geschaeft|leitung|gm|ceo|owner|inhaber|director)/.test(local)) return 'MANAGEMENT';
  if (/^(info|kontakt|contact|office|mail|hello|hallo|willkommen|anfrage)/.test(local)) return 'GENERAL';
  if (/^(reception|empfang|front|concierge)/.test(local)) return 'RECEPTION';
  if (/^(reserv|booking|buchung|buchen)/.test(local)) return 'RESERVATION';
  if (/^(gastro|restaurant|kueche|kitchen|food|bankett)/.test(local)) return 'F_AND_B';
  return 'UNKNOWN';
}

/**
 * Priority ranking: lower = better (1 = best contact for job applications)
 */
function emailPriority(type) {
  const priorities = {
    JOBS: 1,
    HR: 2,
    MANAGEMENT: 3,
    GENERAL: 4,
    F_AND_B: 5,
    RECEPTION: 6,
    RESERVATION: 7,
    UNKNOWN: 8,
  };
  return priorities[type] || 99;
}

/**
 * Determine the review_status based on email type
 */
function reviewStatusForType(type) {
  if (['JOBS', 'HR'].includes(type)) return 'READY_TO_SEND';
  if (['MANAGEMENT'].includes(type)) return 'READY_TO_SEND';
  return 'NEEDS_REVIEW';
}

// ═══════════════════════════════════════════
//  DOMAIN NORMALIZATION
// ═══════════════════════════════════════════

function normalizeDomain(url) {
  if (!url) return '';
  try {
    let domain = url.toLowerCase().trim();
    domain = domain.replace(/^https?:\/\//, '');
    domain = domain.replace(/^www\./, '');
    domain = domain.split('/')[0];
    domain = domain.split('?')[0];
    domain = domain.split('#')[0];
    domain = domain.replace(/:(\d+)$/, ''); // remove port
    return domain;
  } catch {
    return '';
  }
}

function normalizeUrl(url) {
  if (!url) return '';
  url = url.trim();
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url;
  }
  return url;
}

// ═══════════════════════════════════════════
//  ID GENERATION & TIMESTAMP
// ═══════════════════════════════════════════

function generateId(prefix = '') {
  const id = crypto.randomUUID().replace(/-/g, '').substring(0, 12);
  return prefix ? `${prefix}-${id}` : id;
}

function now() {
  return new Date().toISOString();
}

function colLetter(idx) {
  let letter = '';
  let temp;
  let col = idx;
  while (col >= 0) {
    temp = col % 26;
    letter = String.fromCharCode(temp + 65) + letter;
    col = (col - temp) / 26 - 1;
  }
  return letter;
}

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  EMAIL_REGEX,
  isValidEmail,
  extractEmails,
  classifyEmailType,
  emailPriority,
  reviewStatusForType,
  normalizeDomain,
  normalizeUrl,
  generateId,
  now,
  colLetter,
  sleep,
};
