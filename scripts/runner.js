/**
 * Swiss Hospitality Outreach — Main Runner (v2.0)
 * Complete pipeline: Discovery → Enrichment → Classification → Outreach
 *
 * This script orchestrates the entire outreach workflow:
 * 1. Discovers hotels via Apify Google Maps
 * 2. Scrapes hotel websites for email contacts
 * 3. Classifies contacts using Groq AI
 * 4. Sends individualized application emails via Gmail
 *
 * Environment variables (from GitHub Secrets):
 *   GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN
 *   GOOGLE_SHEET_ID, GOOGLE_DRIVE_CV_FILE_ID, GOOGLE_DRIVE_MOTIVATION_FILE_ID
 *   GROQ_API_KEY, GROQ_MODEL, APIFY_TOKEN
 *   SENDER_EMAIL, MAX_DAILY_SENDS, DRY_RUN, OUTREACH_ENABLED
 */

// Load .env for local development (no-op in GitHub Actions)
try { require('dotenv').config(); } catch { /* optional */ }

const { createAuth, getApis } = require('./lib/google');
const { discoverHotels } = require('./lib/discovery');
const { enrichWebsites } = require('./lib/enrichment');
const { classifyContacts } = require('./lib/classifier');
const { sendOutreachEmails } = require('./lib/sender');

async function main() {
  const startTime = Date.now();

  console.log('╔══════════════════════════════════════════════╗');
  console.log('║  Swiss Hospitality Outreach v2.0             ║');
  console.log('║  Automated Job Application Pipeline          ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log(`DRY_RUN: ${process.env.DRY_RUN || 'false'}`);
  console.log(`OUTREACH_ENABLED: ${process.env.OUTREACH_ENABLED || 'true'}`);
  console.log(`MAX_DAILY_SENDS: ${process.env.MAX_DAILY_SENDS || '20'}`);

  // Parse CLI arguments for running specific phases
  const args = process.argv.slice(2);
  const phaseArg = args.find(a => a.startsWith('--phase='));
  const targetPhase = phaseArg ? phaseArg.split('=')[1] : 'all';
  const dryRun = process.env.DRY_RUN === 'true';

  console.log(`Phase: ${targetPhase}`);
  console.log('');

  // ═══════════════════════════════════════════
  //  VALIDATE REQUIRED SECRETS
  // ═══════════════════════════════════════════

  const required = ['GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET', 'GMAIL_REFRESH_TOKEN', 'GOOGLE_SHEET_ID'];
  const missing = required.filter(k => !process.env[k]);
  if (missing.length > 0) {
    console.error(`❌ Missing required secrets: ${missing.join(', ')}`);
    console.error('Add them in GitHub Settings → Secrets and variables → Actions');
    process.exit(1);
  }

  // ═══════════════════════════════════════════
  //  AUTHENTICATE WITH GOOGLE
  // ═══════════════════════════════════════════

  console.log('🔐 Authenticating with Google APIs...');
  let auth, sheets, drive, gmail;
  try {
    auth = createAuth();
    const apis = getApis(auth);
    sheets = apis.sheets;
    drive = apis.drive;
    gmail = apis.gmail;

    // Test authentication by reading a sheet
    await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: 'SEARCH_QUERIES!A1:A1',
    });
    console.log('✓ Google API authentication successful\n');
  } catch (err) {
    console.error(`❌ Google API authentication failed: ${err.message}`);
    console.error('Check that your OAuth2 refresh token is valid and has the required scopes:');
    console.error('  - https://www.googleapis.com/auth/spreadsheets');
    console.error('  - https://www.googleapis.com/auth/drive.readonly');
    console.error('  - https://www.googleapis.com/auth/gmail.send');
    process.exit(1);
  }

  // ═══════════════════════════════════════════
  //  PIPELINE EXECUTION
  // ═══════════════════════════════════════════

  const results = {
    discovery: null,
    enrichment: null,
    classification: null,
    sender: null,
  };

  // Phase 1: Hotel Discovery
  if (targetPhase === 'all' || targetPhase === 'discovery') {
    try {
      results.discovery = await discoverHotels(sheets, {
        maxQueries: 2,           // Process 2 search queries per run
        maxResultsPerQuery: 20,  // Up to 20 hotels per query
        dryRun,
        discoveryIntervalDays: 7,
      });
    } catch (err) {
      console.error(`\n❌ Discovery phase failed: ${err.message}`);
      results.discovery = { error: err.message };
    }
  }

  // Phase 2: Website Enrichment (extract emails from hotel websites)
  if (targetPhase === 'all' || targetPhase === 'enrichment') {
    try {
      results.enrichment = await enrichWebsites(sheets, {
        maxHotels: 8,  // Process up to 8 hotels per run
        dryRun,
      });
    } catch (err) {
      console.error(`\n❌ Enrichment phase failed: ${err.message}`);
      results.enrichment = { error: err.message };
    }
  }

  // Phase 3: Contact Classification
  if (targetPhase === 'all' || targetPhase === 'classification') {
    try {
      results.classification = await classifyContacts(sheets, {
        maxHotels: 20,
        dryRun,
      });
    } catch (err) {
      console.error(`\n❌ Classification phase failed: ${err.message}`);
      results.classification = { error: err.message };
    }
  }

  // Phase 4: Email Sending
  if (targetPhase === 'all' || targetPhase === 'send') {
    try {
      results.sender = await sendOutreachEmails(sheets, drive, gmail, {
        dryRun,
      });
    } catch (err) {
      console.error(`\n❌ Sender phase failed: ${err.message}`);
      results.sender = { error: err.message };
    }
  }

  // ═══════════════════════════════════════════
  //  EXECUTION SUMMARY
  // ═══════════════════════════════════════════

  const elapsed = Math.round((Date.now() - startTime) / 1000);

  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║  EXECUTION SUMMARY                           ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log(`Duration: ${elapsed}s`);

  if (results.discovery) {
    const d = results.discovery;
    if (d.error) {
      console.log(`Discovery:      ❌ ${d.error}`);
    } else {
      console.log(`Discovery:      ${d.hotelsAdded} new hotels (${d.hotelsFound} found, ${d.queriesProcessed} queries)`);
    }
  }

  if (results.enrichment) {
    const e = results.enrichment;
    if (e.error) {
      console.log(`Enrichment:     ❌ ${e.error}`);
    } else {
      console.log(`Enrichment:     ${e.emailsFound} emails from ${e.hotelsProcessed} hotels`);
    }
  }

  if (results.classification) {
    const c = results.classification;
    if (c.error) {
      console.log(`Classification: ❌ ${c.error}`);
    } else {
      console.log(`Classification: ${c.classified} contacts classified`);
    }
  }

  if (results.sender) {
    const s = results.sender;
    if (s.error) {
      console.log(`Sender:         ❌ ${s.error}`);
    } else {
      console.log(`Sender:         ${s.sent} emails sent, ${s.errors} errors`);
    }
  }

  console.log('\n═══ Pipeline Complete ═══');
}

main().catch(err => {
  console.error('\n💥 FATAL ERROR:', err.message);
  console.error(err.stack);
  process.exit(1);
});
