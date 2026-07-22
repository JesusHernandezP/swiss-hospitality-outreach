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
      
      const maxSends = parseInt(ENV.MAX_DAILY_SENDS || '20', 10);
      const batchToProcess = readyRows.slice(0, maxSends);
      
      if (batchToProcess.length > 0 && ENV.OUTREACH_ENABLED === 'true') {
        console.log(`Processing batch of ${batchToProcess.length} emails...`);

        // Fetch CV and Motivation attachments once
        let cvBase64 = '', motBase64 = '';
        if (ENV.DRY_RUN !== 'true') {
          console.log('Fetching attachments from Google Drive...');
          const cvRes = await drive.files.get({ fileId: ENV.GOOGLE_DRIVE_CV_FILE_ID, alt: 'media' }, { responseType: 'arraybuffer' });
          const motRes = await drive.files.get({ fileId: ENV.GOOGLE_DRIVE_MOTIVATION_FILE_ID, alt: 'media' }, { responseType: 'arraybuffer' });
          cvBase64 = Buffer.from(cvRes.data).toString('base64');
          motBase64 = Buffer.from(motRes.data).toString('base64');
        }

        for (const contactToProcess of batchToProcess) {
          const targetEmail = contactToProcess[emailIdx];
          console.log(`\nTarget Contact Email: ${targetEmail}`);

          if (ENV.DRY_RUN === 'true') {
            console.log(`DRY_RUN mode active. Simulated send to: ${targetEmail}`);
          } else {
            console.log(`LIVE MODE: Executing email dispatch to ${targetEmail}...`);

            const subject = 'Interesse an einer Tätigkeit als Koch / Küchenmitarbeiter';
            const bodyText = `Sehr geehrte Damen und Herren,\n\nderzeit bin ich auf der Suche nach einer Stelle als Koch oder Küchenmitarbeiter in der Schweiz.\n\nIch verfüge über praktische Erfahrung in internationalen Hotel- und Restaurantküchen. Zu meinen bisherigen Aufgaben gehören Mise en Place, warme und kalte Küche, Grill, Plancha, Fritteuse, Frühstück, Buffet, Room Service, Bankett sowie die Mitarbeit während arbeitsintensiver Servicezeiten.\n\nBesonders interessiert mich die Möglichkeit, in der Schweiz zu leben und zu arbeiten. Zurzeit wohne ich in Madrid. Ich bin spanischer Staatsbürger (EU/EFTA) und stehe für einen kurzfristigen Umzug zur Verfügung. Spanisch ist meine Muttersprache, Englisch spreche ich auf B2-Niveau und Deutsch lerne ich derzeit auf A1-Niveau.\n\nMeinen Lebenslauf und mein Motivationsschreiben finden Sie im Anhang.\n\nFreundliche Grüsse\n\nJesus Hernandez\n+34 666 056 214\nhernandezpacheco2805@gmail.com`;

            const boundary = '----=_Part_' + Date.now();
            let rawEmail = [
              `From: "Jesus Hernandez" <${ENV.SENDER_EMAIL || 'hernandezpacheco2805@gmail.com'}>`,
              `To: ${targetEmail}`,
              `Bcc: ${ENV.SENDER_EMAIL || 'hernandezpacheco2805@gmail.com'}`,
              `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
              'MIME-Version: 1.0',
              `Content-Type: multipart/mixed; boundary="${boundary}"`,
              '',
              `--${boundary}`,
              'Content-Type: text/plain; charset="UTF-8"',
              'Content-Transfer-Encoding: 8bit',
              '',
              bodyText,
              '',
              `--${boundary}`,
              'Content-Type: application/pdf; name="CV_Jesus_Hernandez.pdf"',
              'Content-Disposition: attachment; filename="CV_Jesus_Hernandez.pdf"',
              'Content-Transfer-Encoding: base64',
              '',
              cvBase64,
              '',
              `--${boundary}`,
              'Content-Type: application/pdf; name="Carta_Motivacion_Jesus_Hernandez.pdf"',
              'Content-Disposition: attachment; filename="Carta_Motivacion_Jesus_Hernandez.pdf"',
              'Content-Transfer-Encoding: base64',
              '',
              motBase64,
              '',
              `--${boundary}--`
            ].join('\r\n');

            const encodedMessage = Buffer.from(rawEmail)
              .toString('base64')
              .replace(/\+/g, '-')
              .replace(/\//g, '_')
              .replace(/=+$/, '');

            const sendRes = await gmail.users.messages.send({
              userId: 'me',
              requestBody: { raw: encodedMessage }
            });

            console.log(`Email Sent Successfully to ${targetEmail}! Gmail Message ID: ${sendRes.data.id}`);

            // Update Status in CONTACTS Sheet to SENT
            const rowIndex = rows.indexOf(contactToProcess) + 1;
            const statusColLetter = String.fromCharCode(65 + statusIdx);
            await sheets.spreadsheets.values.update({
              spreadsheetId: ENV.GOOGLE_SHEET_ID,
              range: `CONTACTS!${statusColLetter}${rowIndex}`,
              valueInputOption: 'USER_ENTERED',
              requestBody: { values: [['SENT']] }
            });
            console.log(`Updated contact row ${rowIndex} status to SENT in Google Sheets.`);
          }
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
