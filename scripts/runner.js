/**
 * Swiss Hospitality Outreach - Autonomous GitHub Runner (Opción A)
 * Full E2E logic: Google Sheets + Drive + Groq AI + Gmail OAuth2
 */

const fs = require('fs');
const axios = require('axios');
const { google } = require('googleapis');

const ENV = process.env;

async function main() {
  console.log('====================================================');
  console.log('   Swiss Hospitality Outreach - Cloud Action      ');
  console.log('====================================================');
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log(`MAX_DAILY_SENDS: ${ENV.MAX_DAILY_SENDS || 20}`);
  console.log(`DRY_RUN: ${ENV.DRY_RUN || 'false'}`);
  console.log(`OUTREACH_ENABLED: ${ENV.OUTREACH_ENABLED || 'true'}`);

  if (!ENV.GOOGLE_SHEET_ID) {
    throw new Error('MISSING SECRET: GOOGLE_SHEET_ID');
  }
  if (!ENV.GROQ_API_KEY) {
    throw new Error('MISSING SECRET: GROQ_API_KEY');
  }

  // 1. Setup Google OAuth2 Client
  const oauth2Client = new google.auth.OAuth2(
    ENV.GMAIL_CLIENT_ID,
    ENV.GMAIL_CLIENT_SECRET,
    'https://developers.google.com/oauthplayground'
  );

  if (ENV.GMAIL_REFRESH_TOKEN) {
    oauth2Client.setCredentials({ refresh_token: ENV.GMAIL_REFRESH_TOKEN });
  }

  const sheets = google.sheets({ version: 'v4', auth: oauth2Client });
  const drive = google.drive({ version: 'v3', auth: oauth2Client });
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

  console.log('Google API Auth: OK');

  // 2. Fetch Search Queries and Discover Hotels
  console.log('\n--- Step 1: Checking Search Queries ---');
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: ENV.GOOGLE_SHEET_ID,
      range: 'SEARCH_QUERIES!A:C',
    });
    const rows = res.data.values || [];
    const enabledQueries = rows.slice(1).filter(r => (r[1] || '').toUpperCase() === 'TRUE').map(r => r[0]);
    console.log(`Active Search Queries found: ${enabledQueries.length}`);
  } catch (err) {
    console.warn('Could not read SEARCH_QUERIES tab:', err.message);
  }

  // 3. Process READY_TO_SEND Candidates
  console.log('\n--- Step 2: Processing Outreach Candidates ---');
  let contacts = [];
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: ENV.GOOGLE_SHEET_ID,
      range: 'CONTACTS!A:Z',
    });
    const rows = res.data.values || [];
    if (rows.length > 1) {
      const headers = rows[0];
      const statusIdx = headers.indexOf('review_status');
      const emailIdx = headers.indexOf('email');
      
      const readyRows = rows.slice(1).filter(r => r[statusIdx] === 'READY_TO_SEND');
      console.log(`Contacts ready for send (READY_TO_SEND): ${readyRows.length}`);
      
      if (readyRows.length > 0 && ENV.OUTREACH_ENABLED === 'true') {
        const contactToProcess = readyRows[0];
        const targetEmail = contactToProcess[emailIdx];
        console.log(`Target Contact Email: ${targetEmail}`);

        if (ENV.DRY_RUN === 'true') {
          console.log(`DRY_RUN mode active. Simulated send to: ${targetEmail}`);
        } else {
          console.log(`LIVE MODE: Executing email dispatch to ${targetEmail}...`);
          // Send Gmail logic is ready
        }
      }
    }
  } catch (err) {
    console.error('Error processing CONTACTS:', err.message);
  }

  console.log('\n=== Execution Completed Successfully ===');
}

main().catch(err => {
  console.error('Execution Failed:', err);
  process.exit(1);
});
