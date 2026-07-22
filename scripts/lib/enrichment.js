/**
 * Swiss Hospitality Outreach — Website Enrichment
 * Visits hotel websites, finds contact/career pages, extracts emails
 */

const axios = require('axios');
const cheerio = require('cheerio');
const { readSheet, parseRows, appendRows, updateCell, ensureHeaders } = require('./google');
const { extractEmails, classifyEmailType, emailPriority, normalizeDomain, generateId, now, sleep, isValidEmail, reviewStatusForType } = require('./utils');

const CONTACTS_HEADERS = [
  'contact_id', 'hotel_id', 'email', 'email_type',
  'contact_name', 'contact_role', 'source_url', 'review_status', 'created_at',
];

/** URL path segments that indicate contact/career pages */
const INTERESTING_PATHS = [
  'kontakt', 'contact', 'contacts',
  'jobs', 'job', 'karriere', 'career', 'careers',
  'stellen', 'bewerbung', 'employment', 'vacancies',
  'team', 'ueber-uns', 'about-us', 'about',
  'impressum', 'legal',
  'personal', 'hr',
];

/**
 * Run website enrichment: visit hotel websites, extract emails, save to CONTACTS.
 * @param {Object} sheets - Google Sheets API
 * @param {Object} options - { maxHotels, dryRun }
 */
async function enrichWebsites(sheets, options = {}) {
  const { maxHotels = 10, dryRun = false } = options;

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  PHASE 2: Website Enrichment');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // Ensure headers
  const contactsMap = await ensureHeaders(sheets, 'CONTACTS', CONTACTS_HEADERS);

  // Read hotels needing enrichment
  const hotelRows = await readSheet(sheets, 'HOTELS');
  const { data: hotels, headerMap: hMap } = parseRows(hotelRows);

  const pending = hotels.filter(h => {
    const status = (h.status || '').toUpperCase();
    return status === 'DISCOVERED' || status === 'SCRAPE_PENDING' || status === '';
  });

  console.log(`  Hotels total: ${hotels.length}, Pending enrichment: ${pending.length}`);

  if (pending.length === 0) {
    console.log('  ✓ No hotels pending enrichment');
    return { hotelsProcessed: 0, emailsFound: 0 };
  }

  // Read existing contacts to avoid duplicates
  const contactRows = await readSheet(sheets, 'CONTACTS');
  const { data: existingContacts } = parseRows(contactRows);
  const existingEmails = new Set(
    existingContacts.map(c => (c.email || '').toLowerCase()).filter(Boolean)
  );

  const batch = pending.slice(0, maxHotels);
  let totalEmailsFound = 0;

  for (const hotel of batch) {
    const website = hotel.website;
    if (!website) {
      console.log(`  ⚠ ${hotel.hotel_name || hotel.hotel_id}: No website — skipping`);
      if (!dryRun && hMap.status !== undefined) {
        await updateCell(sheets, 'HOTELS', hMap.status, hotel._rowIndex, 'NO_WEBSITE');
      }
      continue;
    }

    console.log(`\n  🌐 Scraping: ${hotel.hotel_name || hotel.hotel_id} (${website})`);

    try {
      const emails = await scrapeHotelWebsite(website);
      console.log(`    Found ${emails.length} valid email(s)`);

      const newContacts = [];
      for (const emailInfo of emails) {
        if (existingEmails.has(emailInfo.email.toLowerCase())) {
          continue; // Already exists
        }
        existingEmails.add(emailInfo.email.toLowerCase());

        const emailType = classifyEmailType(emailInfo.email);
        const contact = {
          contact_id: generateId('cnt'),
          hotel_id: hotel.hotel_id || '',
          email: emailInfo.email.toLowerCase(),
          email_type: emailType,
          contact_name: '',
          contact_role: '',
          source_url: emailInfo.sourceUrl || website,
          review_status: reviewStatusForType(emailType),
          created_at: now(),
        };
        newContacts.push(contact);
      }

      if (newContacts.length > 0 && !dryRun) {
        const rows = newContacts.map(c => CONTACTS_HEADERS.map(col => c[col] || ''));
        await appendRows(sheets, 'CONTACTS', rows);
        console.log(`    ✓ Added ${newContacts.length} new contact(s) to CONTACTS`);
      }
      totalEmailsFound += newContacts.length;

      // Update hotel status
      if (!dryRun && hMap.status !== undefined) {
        const newStatus = emails.length > 0 ? 'SCRAPED' : 'NO_EMAILS_FOUND';
        await updateCell(sheets, 'HOTELS', hMap.status, hotel._rowIndex, newStatus);
        if (hMap.updated_at !== undefined) {
          await updateCell(sheets, 'HOTELS', hMap.updated_at, hotel._rowIndex, now());
        }
      }
    } catch (err) {
      console.error(`    ✗ Error scraping ${website}: ${err.message}`);
      if (!dryRun && hMap.status !== undefined) {
        await updateCell(sheets, 'HOTELS', hMap.status, hotel._rowIndex, 'SCRAPE_ERROR');
      }
    }

    // Respectful delay between websites
    await sleep(3000);
  }

  console.log(`\n  Enrichment Summary: ${batch.length} hotels processed, ${totalEmailsFound} new emails found`);
  return { hotelsProcessed: batch.length, emailsFound: totalEmailsFound };
}

/**
 * Scrape a hotel website for email addresses.
 * Visits homepage, finds contact/career pages, extracts emails from each.
 * @returns {Array<{email: string, sourceUrl: string}>}
 */
async function scrapeHotelWebsite(baseUrl) {
  const allEmails = new Map(); // email -> sourceUrl

  const axiosConfig = {
    timeout: 15000,
    maxRedirects: 5,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'de-CH,de;q=0.9,en;q=0.8',
    },
  };

  // 1. Fetch homepage
  let homepageHtml = '';
  try {
    const res = await axios.get(baseUrl, axiosConfig);
    homepageHtml = res.data;
    const homeEmails = extractEmails(homepageHtml);
    for (const e of homeEmails) {
      if (!allEmails.has(e)) allEmails.set(e, baseUrl);
    }
  } catch (err) {
    console.log(`    Could not fetch homepage: ${err.message}`);
    return [];
  }

  // 2. Find interesting internal pages
  const $ = cheerio.load(homepageHtml);
  const baseDomain = normalizeDomain(baseUrl);
  const pagesToVisit = new Set();

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href) return;

    const resolvedUrl = resolveUrl(baseUrl, href);
    if (!resolvedUrl) return;

    const urlDomain = normalizeDomain(resolvedUrl);
    if (urlDomain !== baseDomain) return; // Skip external links

    const pathLower = resolvedUrl.toLowerCase();
    for (const keyword of INTERESTING_PATHS) {
      if (pathLower.includes(keyword)) {
        pagesToVisit.add(resolvedUrl);
        break;
      }
    }
  });

  // Also try common paths directly
  const commonPaths = ['/kontakt', '/contact', '/impressum', '/jobs', '/karriere', '/team'];
  for (const path of commonPaths) {
    const url = new URL(path, baseUrl).toString();
    pagesToVisit.add(url);
  }

  // 3. Visit up to 8 interesting pages
  const pages = [...pagesToVisit].slice(0, 8);
  for (const pageUrl of pages) {
    try {
      await sleep(1000); // Respectful delay
      const res = await axios.get(pageUrl, axiosConfig);
      const pageEmails = extractEmails(res.data);
      for (const e of pageEmails) {
        if (!allEmails.has(e)) allEmails.set(e, pageUrl);
      }
    } catch {
      // Skip pages that fail (404, etc.)
    }
  }

  // 4. Also check mailto: links specifically
  $('a[href^="mailto:"]').each((_, el) => {
    const mailto = $(el).attr('href');
    if (!mailto) return;
    const email = mailto.replace('mailto:', '').split('?')[0].trim().toLowerCase();
    if (isValidEmail(email) && !allEmails.has(email)) {
      allEmails.set(email, baseUrl);
    }
  });

  // Return sorted by priority
  const results = [...allEmails.entries()]
    .map(([email, sourceUrl]) => ({ email, sourceUrl }))
    .sort((a, b) => emailPriority(classifyEmailType(a.email)) - emailPriority(classifyEmailType(b.email)));

  return results;
}

/**
 * Resolve a relative URL against a base URL
 */
function resolveUrl(base, href) {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

module.exports = { enrichWebsites };
