/**
 * Swiss Hospitality Outreach — Google API Helpers
 * Authentication, Sheets read/write, Drive download
 */

const { google } = require('googleapis');
const { colLetter } = require('./utils');

// ═══════════════════════════════════════════
//  AUTHENTICATION
// ═══════════════════════════════════════════

function createAuth() {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      'Missing Google OAuth2 credentials. Ensure GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, ' +
      'and GMAIL_REFRESH_TOKEN are set as environment variables or GitHub secrets.'
    );
  }

  const oauth2 = new google.auth.OAuth2(
    clientId,
    clientSecret,
    'https://developers.google.com/oauthplayground'
  );
  oauth2.setCredentials({ refresh_token: refreshToken });
  return oauth2;
}

function getApis(auth) {
  return {
    sheets: google.sheets({ version: 'v4', auth }),
    drive: google.drive({ version: 'v3', auth }),
    gmail: google.gmail({ version: 'v1', auth }),
  };
}

// ═══════════════════════════════════════════
//  SHEETS HELPERS
// ═══════════════════════════════════════════

const SHEET_ID = () => {
  const id = process.env.GOOGLE_SHEET_ID;
  if (!id) throw new Error('GOOGLE_SHEET_ID not set');
  return id;
};

/**
 * Read all data from a sheet tab
 * @returns {string[][]} Raw rows including header
 */
async function readSheet(sheets, tabName, range = '') {
  const fullRange = range ? `${tabName}!${range}` : `${tabName}`;
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID(),
    range: fullRange,
  });
  return res.data.values || [];
}

/**
 * Parse raw rows into structured objects with _rowIndex (1-indexed, accounts for header)
 */
function parseRows(rows) {
  if (!rows || rows.length < 1) return { headers: [], data: [], headerMap: {} };
  const headers = rows[0].map(h => String(h || '').trim().toLowerCase());
  const headerMap = {};
  headers.forEach((h, i) => { headerMap[h] = i; });

  const data = rows.slice(1).map((row, idx) => {
    const obj = { _rowIndex: idx + 2 }; // 1-indexed sheet row (row 1 = header, row 2 = first data)
    headers.forEach((h, i) => {
      obj[h] = (row[i] !== undefined && row[i] !== null) ? String(row[i]) : '';
    });
    return obj;
  });

  return { headers, data, headerMap };
}

/**
 * Append rows to a sheet tab
 */
async function appendRows(sheets, tabName, rows) {
  if (!rows || rows.length === 0) return;
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID(),
    range: `${tabName}!A:A`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });
}

/**
 * Update a single cell
 */
async function updateCell(sheets, tabName, col, row, value) {
  const colStr = typeof col === 'number' ? colLetter(col) : col;
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID(),
    range: `${tabName}!${colStr}${row}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[value]] },
  });
}

/**
 * Update multiple cells in a row
 */
async function updateRow(sheets, tabName, rowIndex, headerMap, updates) {
  const requests = [];
  for (const [colName, value] of Object.entries(updates)) {
    const colIdx = headerMap[colName];
    if (colIdx !== undefined) {
      requests.push(
        updateCell(sheets, tabName, colIdx, rowIndex, value)
      );
    }
  }
  // Run updates sequentially to avoid rate limits
  for (const req of requests) {
    await req;
  }
}

/**
 * Ensure a sheet tab has the required headers. Adds missing headers to the right.
 * @returns {Object} Updated headerMap
 */
async function ensureHeaders(sheets, tabName, requiredHeaders) {
  let rows;
  try {
    rows = await readSheet(sheets, tabName, 'A1:ZZ1');
  } catch (err) {
    // Tab might not exist or be empty
    console.log(`  Tab ${tabName} appears empty or missing. Setting up headers...`);
    rows = [];
  }

  const existingHeaders = (rows[0] || []).map(h => String(h || '').trim().toLowerCase());
  const missingHeaders = requiredHeaders.filter(h => !existingHeaders.includes(h.toLowerCase()));

  if (missingHeaders.length === 0) {
    // Build and return headerMap
    const headerMap = {};
    existingHeaders.forEach((h, i) => { headerMap[h] = i; });
    return headerMap;
  }

  if (existingHeaders.length === 0) {
    // Empty tab — write all headers
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID(),
      range: `${tabName}!A1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [requiredHeaders] },
    });
    console.log(`  Created headers in ${tabName}: ${requiredHeaders.join(', ')}`);
  } else {
    // Append missing headers to the right
    const startCol = colLetter(existingHeaders.length);
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID(),
      range: `${tabName}!${startCol}1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [missingHeaders] },
    });
    console.log(`  Added missing headers to ${tabName}: ${missingHeaders.join(', ')}`);
  }

  // Re-read and return updated headerMap
  const updatedRows = await readSheet(sheets, tabName, 'A1:ZZ1');
  const allHeaders = (updatedRows[0] || []).map(h => String(h || '').trim().toLowerCase());
  const headerMap = {};
  allHeaders.forEach((h, i) => { headerMap[h] = i; });
  return headerMap;
}

/**
 * Clear all data rows (keep headers) in a sheet tab
 */
async function clearDataRows(sheets, tabName) {
  try {
    const rows = await readSheet(sheets, tabName);
    if (rows.length > 1) {
      await sheets.spreadsheets.values.clear({
        spreadsheetId: SHEET_ID(),
        range: `${tabName}!A2:ZZ${rows.length}`,
      });
    }
  } catch (err) {
    // Ignore
  }
}

module.exports = {
  createAuth,
  getApis,
  readSheet,
  parseRows,
  appendRows,
  updateCell,
  updateRow,
  ensureHeaders,
  clearDataRows,
  SHEET_ID,
};
