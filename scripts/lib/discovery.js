/**
 * Swiss Hospitality Outreach — Hotel Discovery via Apify
 * Uses Apify Google Maps Scraper to find hotels in Swiss German-speaking regions
 */

const axios = require('axios');
const { readSheet, parseRows, appendRows, updateCell, ensureHeaders } = require('./google');
const { normalizeDomain, normalizeUrl, generateId, now, sleep } = require('./utils');

// Apify actor for Google Maps
const APIFY_ACTOR = 'compass/crawler-google-places';

// Headers required in each sheet tab
const HOTELS_HEADERS = [
  'hotel_id', 'hotel_name', 'town', 'canton', 'country',
  'website', 'normalized_domain', 'source_url',
  'status', 'created_at', 'updated_at',
];

const QUERIES_HEADERS = ['query', 'enabled', 'last_run'];

/**
 * Run hotel discovery: read search queries, call Apify, write new hotels to HOTELS sheet.
 * @param {Object} sheets - Google Sheets API instance
 * @param {Object} options - { maxQueries, maxResultsPerQuery, dryRun }
 * @returns {Object} { hotelsFound, hotelsAdded, queriesProcessed }
 */
async function discoverHotels(sheets, options = {}) {
  const {
    maxQueries = 3,
    maxResultsPerQuery = 20,
    dryRun = false,
    discoveryIntervalDays = 7,
  } = options;

  const apifyToken = process.env.APIFY_TOKEN;
  if (!apifyToken) {
    console.log('  ⚠ APIFY_TOKEN not set — skipping discovery');
    return { hotelsFound: 0, hotelsAdded: 0, queriesProcessed: 0 };
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  PHASE 1: Hotel Discovery (Apify)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // Ensure headers exist
  await ensureHeaders(sheets, 'HOTELS', HOTELS_HEADERS);
  await ensureHeaders(sheets, 'SEARCH_QUERIES', QUERIES_HEADERS);

  // 1. Read search queries
  const queryRows = await readSheet(sheets, 'SEARCH_QUERIES');
  const { data: queries, headerMap: qMap } = parseRows(queryRows);

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - discoveryIntervalDays);

  const pendingQueries = queries.filter(q => {
    if (String(q.enabled || 'true').toUpperCase() !== 'TRUE') return false;
    if (!q.query || !q.query.trim()) return false;
    if (q.last_run) {
      const lastRun = new Date(q.last_run);
      if (!isNaN(lastRun.getTime()) && lastRun > cutoffDate) return false;
    }
    return true;
  });

  console.log(`  Total queries: ${queries.length}, Pending: ${pendingQueries.length}`);

  if (pendingQueries.length === 0) {
    console.log('  ✓ All queries are up-to-date (within discovery interval)');
    return { hotelsFound: 0, hotelsAdded: 0, queriesProcessed: 0 };
  }

  // 2. Read existing hotels for deduplication
  const hotelRows = await readSheet(sheets, 'HOTELS');
  const { data: existingHotels } = parseRows(hotelRows);
  const existingDomains = new Set(
    existingHotels.map(h => (h.normalized_domain || '').toLowerCase()).filter(Boolean)
  );
  console.log(`  Existing hotels in sheet: ${existingHotels.length}`);

  // 3. Process queries (limited batch)
  const batch = pendingQueries.slice(0, maxQueries);
  let totalFound = 0;
  let totalAdded = 0;

  for (const query of batch) {
    console.log(`\n  🔍 Searching: "${query.query}"`);

    try {
      const results = await runApifySearch(apifyToken, query.query, maxResultsPerQuery);
      console.log(`    Apify returned ${results.length} results`);
      totalFound += results.length;

      // Process and deduplicate
      const newHotels = [];
      for (const place of results) {
        if (!place.website && !place.url) continue;

        const website = normalizeUrl(place.website || '');
        const domain = normalizeDomain(website);

        if (!domain) continue;
        if (existingDomains.has(domain)) {
          continue; // skip duplicate
        }

        existingDomains.add(domain); // prevent duplicates within this batch too

        const hotel = {
          hotel_id: generateId('htl'),
          hotel_name: place.title || place.name || '',
          town: extractTown(place.address || ''),
          canton: extractCanton(place.address || ''),
          country: 'CH',
          website: website,
          normalized_domain: domain,
          source_url: place.url || place.googleMapsUrl || '',
          status: 'DISCOVERED',
          created_at: now(),
          updated_at: now(),
        };

        newHotels.push(hotel);
      }

      console.log(`    New unique hotels: ${newHotels.length}`);

      if (newHotels.length > 0 && !dryRun) {
        const rows = newHotels.map(h => HOTELS_HEADERS.map(col => h[col] || ''));
        await appendRows(sheets, 'HOTELS', rows);
        console.log(`    ✓ Written ${newHotels.length} hotels to HOTELS sheet`);
      }
      totalAdded += newHotels.length;

      // Update last_run for this query
      if (!dryRun && qMap.last_run !== undefined) {
        await updateCell(sheets, 'SEARCH_QUERIES', qMap.last_run, query._rowIndex, now());
      }
    } catch (err) {
      console.error(`    ✗ Error processing "${query.query}": ${err.message}`);
    }

    // Delay between queries to be respectful
    await sleep(2000);
  }

  console.log(`\n  Discovery Summary: ${totalFound} found, ${totalAdded} new hotels added, ${batch.length} queries processed`);
  return { hotelsFound: totalFound, hotelsAdded: totalAdded, queriesProcessed: batch.length };
}

/**
 * Run Apify Google Maps Scraper and wait for results
 */
async function runApifySearch(token, searchQuery, maxResults) {
  const searchStr = searchQuery.includes('Switzerland') ? searchQuery : `${searchQuery} Switzerland`;

  console.log(`    Starting Apify actor: ${APIFY_ACTOR}`);
  console.log(`    Search: "${searchStr}", Max results: ${maxResults}`);

  // Start the actor run
  const startRes = await axios.post(
    `https://api.apify.com/v2/acts/${APIFY_ACTOR}/runs?token=${token}`,
    {
      searchStringsArray: [searchStr],
      maxCrawledPlacesPerSearch: maxResults,
      language: 'de',
      deeperCityScrape: false,
      includeWebResults: false,
      maxImages: 0,
      maxReviews: 0,
      onlyDataFromSearchPage: false,
    },
    {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000,
    }
  );

  const runId = startRes.data.data.id;
  const datasetId = startRes.data.data.defaultDatasetId;
  console.log(`    Apify run started: ${runId}`);

  // Poll for completion (max 10 minutes)
  const maxWait = 10 * 60 * 1000;
  const pollInterval = 10000;
  const startTime = Date.now();

  while (Date.now() - startTime < maxWait) {
    await sleep(pollInterval);
    const statusRes = await axios.get(
      `https://api.apify.com/v2/actor-runs/${runId}?token=${token}`,
      { timeout: 10000 }
    );
    const status = statusRes.data.data.status;
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    console.log(`    Status: ${status} (${elapsed}s elapsed)`);

    if (status === 'SUCCEEDED') break;
    if (status === 'FAILED' || status === 'ABORTED' || status === 'TIMED-OUT') {
      throw new Error(`Apify run ${status}`);
    }
  }

  // Fetch results
  const resultsRes = await axios.get(
    `https://api.apify.com/v2/datasets/${datasetId}/items?token=${token}&format=json`,
    { timeout: 30000 }
  );

  return resultsRes.data || [];
}

/**
 * Extract town from a Swiss address string
 */
function extractTown(address) {
  if (!address) return '';
  // Swiss addresses: "Street, PLZ Town, Country"
  const parts = address.split(',').map(s => s.trim());
  for (const part of parts) {
    // Match "1234 TownName" pattern
    const match = part.match(/\d{4}\s+(.+)/);
    if (match) return match[1].trim();
  }
  // Fallback: return second-to-last part (usually town)
  if (parts.length >= 2) return parts[parts.length - 2].replace(/\d{4}/, '').trim();
  return '';
}

/**
 * Extract canton from an address (heuristic)
 */
function extractCanton(address) {
  if (!address) return '';
  const addr = address.toUpperCase();
  const cantons = {
    'GRAUBÜNDEN': 'GR', 'GRAUBUENDEN': 'GR', 'GRISONS': 'GR',
    'BERN': 'BE', 'BERNE': 'BE',
    'VALAIS': 'VS', 'WALLIS': 'VS',
    'URI': 'UR',
    'LUZERN': 'LU', 'LUCERNE': 'LU',
    'OBWALDEN': 'OW', 'NIDWALDEN': 'NW',
    'SCHWYZ': 'SZ',
    'APPENZELL': 'AI',
    'ST. GALLEN': 'SG', 'ST GALLEN': 'SG', 'SANKT GALLEN': 'SG',
    'GLARUS': 'GL',
    'ZUG': 'ZG',
    'ZÜRICH': 'ZH', 'ZURICH': 'ZH',
    'BASEL': 'BS',
    'THURGAU': 'TG',
    'SCHAFFHAUSEN': 'SH',
    'AARGAU': 'AG',
    'SOLOTHURN': 'SO',
    'WINTERTHUR': 'ZH',
  };
  for (const [name, code] of Object.entries(cantons)) {
    if (addr.includes(name)) return code;
  }
  return '';
}

module.exports = { discoverHotels };
