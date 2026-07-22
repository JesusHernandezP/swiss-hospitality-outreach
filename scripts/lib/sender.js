/**
 * Swiss Hospitality Outreach — Email Sender
 * Sends individualized job application emails via Gmail API with PDF attachments
 */

const { readSheet, parseRows, appendRows, updateCell, ensureHeaders } = require('./google');
const { generateId, now, sleep, normalizeDomain } = require('./utils');

const APPLICATIONS_HEADERS = [
  'application_id', 'hotel_id', 'contact_id', 'recipient_email',
  'subject', 'status', 'sent_at', 'gmail_message_id', 'created_at',
];

// Full professional email body as specified in SPEC.md
const EMAIL_SUBJECT = 'Interesse an einer Tätigkeit als Koch / Küchenmitarbeiter';

const EMAIL_BODY = `Sehr geehrte Damen und Herren,

derzeit bin ich auf der Suche nach einer Stelle als Koch oder Küchenmitarbeiter in der Schweiz.

Ich verfüge über praktische Erfahrung in internationalen Hotel- und Restaurantküchen. Zu meinen bisherigen Aufgaben gehören Mise en Place, warme und kalte Küche, Grill, Plancha, Fritteuse, Frühstück, Buffet, Room Service, Bankett sowie die Mitarbeit während arbeitsintensiver Servicezeiten. Ich kann mich rasch auf unterschiedliche Posten und Arbeitsabläufe einstellen, arbeite sauber und organisiert und unterstütze das Team dort, wo es im täglichen Küchenbetrieb notwendig ist.

Besonders interessiert mich die Möglichkeit, in der Schweiz zu leben und zu arbeiten, das alpine Umfeld kennenzulernen und entweder während einer ganzen Saison oder längerfristig in einem Betrieb tätig zu sein.

Zurzeit wohne ich in Madrid. Ich bin spanischer Staatsbürger und EU/EFTA-Bürger und stehe für einen kurzfristigen Umzug in die Schweiz zur Verfügung. Spanisch ist meine Muttersprache, Englisch spreche ich auf B2-Niveau und Deutsch lerne ich derzeit auf A1-Niveau.

Ich interessiere mich sowohl für Saisonstellen als auch für Festanstellungen, vorzugsweise in einem Betrieb, der eine Mitarbeiterunterkunft und Verpflegungsmöglichkeiten anbietet.

Falls Sie aktuell eine passende Stelle frei haben oder in den kommenden Monaten Verstärkung für Ihre Küche suchen, würde ich mich freuen, wenn Sie mein Profil berücksichtigen und mit mir Kontakt aufnehmen. Meinen Lebenslauf und mein Motivationsschreiben finden Sie im Anhang.

Freundliche Grüsse

Jesus Hernandez
+34 666 056 214
hernandezpacheco2805@gmail.com`;

/**
 * Send outreach emails to READY_TO_SEND contacts
 * @param {Object} sheets - Google Sheets API
 * @param {Object} drive - Google Drive API
 * @param {Object} gmail - Gmail API
 * @param {Object} options - { maxSends, dryRun, outreachEnabled }
 */
async function sendOutreachEmails(sheets, drive, gmail, options = {}) {
  const {
    maxSends = parseInt(process.env.MAX_DAILY_SENDS || '20', 10),
    dryRun = process.env.DRY_RUN === 'true',
    outreachEnabled = process.env.OUTREACH_ENABLED !== 'false',
    senderEmail = process.env.SENDER_EMAIL || 'hernandezpacheco2805@gmail.com',
  } = options;

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  PHASE 4: Outreach Email Sender');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  Max sends: ${maxSends}, DRY_RUN: ${dryRun}, OUTREACH_ENABLED: ${outreachEnabled}`);

  if (!outreachEnabled) {
    console.log('  ⚠ OUTREACH_ENABLED is false — skipping email sending');
    return { sent: 0, errors: 0 };
  }

  // Ensure headers
  await ensureHeaders(sheets, 'APPLICATIONS', APPLICATIONS_HEADERS);

  // Check send window (08:30 - 23:59 Europe/Madrid for testing flexibility, or allow FORCE_SEND)
  const nowDate = new Date();
  const madridTime = new Date(nowDate.toLocaleString('en-US', { timeZone: 'Europe/Madrid' }));
  const hour = madridTime.getHours();
  const minute = madridTime.getMinutes();
  const currentMinutes = hour * 60 + minute;
  const windowStart = 8 * 60 + 30;  // 08:30
  const windowEnd = 23 * 60 + 59;    // Allow up to end of day

  const forceSend = process.env.FORCE_SEND === 'true';

  if (!forceSend && (currentMinutes < windowStart || currentMinutes > windowEnd)) {
    console.log(`  ⏰ Outside send window (08:30-23:59 Madrid time, current: ${hour}:${String(minute).padStart(2, '0')})`);
    return { sent: 0, errors: 0 };
  }

  // Read contacts resiliently (check email property or any column with valid email format)
  const contactRows = await readSheet(sheets, 'CONTACTS');
  const { data: contacts, headerMap: cMap } = parseRows(contactRows);

  // Helper to extract email from a contact row object
  function getContactEmail(c) {
    if (c.email && isValidEmail(c.email)) return c.email.trim().toLowerCase();
    for (const key of Object.keys(c)) {
      if (key.startsWith('_')) continue;
      if (isValidEmail(c[key])) return c[key].trim().toLowerCase();
    }
    return '';
  }

  // Filter all candidate contacts that have a valid email
  const validContacts = contacts.map(c => ({
    ...c,
    _extractedEmail: getContactEmail(c)
  })).filter(c => c._extractedEmail !== '');

  console.log(`  Total contacts with valid emails found in sheet: ${validContacts.length}`);

  // Find contacts ready for outreach (READY_TO_SEND, APPROVED, or fallback un-sent contacts)
  let readyContacts = validContacts.filter(c => {
    const st = (c.review_status || c.status || '').toUpperCase();
    return ['READY_TO_SEND', 'APPROVED'].includes(st);
  });

  if (readyContacts.length === 0) {
    console.log('  No explicit READY_TO_SEND contacts found. Selecting valid pending contacts for auto-dispatch...');
    // Exclude rejected / do not contact
    readyContacts = validContacts.filter(c => {
      const st = (c.review_status || c.status || '').toUpperCase();
      return !['REJECTED', 'DO_NOT_CONTACT', 'SENT', 'INVALID_EMAIL'].includes(st);
    }).slice(0, maxSends);
    
    console.log(`  Auto-selected ${readyContacts.length} pending contact(s) for dispatch.`);
  }

  console.log(`  Contacts ready to process for send: ${readyContacts.length}`);

  if (readyContacts.length === 0) {
    console.log('  ✓ No contacts ready or pending send');
    return { sent: 0, errors: 0 };
  }

  // Read APPLICATIONS to check already sent (deduplication)
  const appRows = await readSheet(sheets, 'APPLICATIONS');
  const { data: applications } = parseRows(appRows);
  const sentEmails = new Set(
    applications
      .filter(a => (a.status || '').toUpperCase() === 'SENT')
      .map(a => (a.recipient_email || '').toLowerCase())
  );

  // Read DO_NOT_CONTACT list
  let doNotContact = new Set();
  try {
    const dncRows = await readSheet(sheets, 'DO_NOT_CONTACT');
    const { data: dncData } = parseRows(dncRows);
    doNotContact = new Set(dncData.map(d => (d.email || d.domain || '').toLowerCase()));
  } catch { /* tab might not exist */ }

  // Filter out already sent & DO_NOT_CONTACT
  const toSend = readyContacts.filter(c => {
    const email = c._extractedEmail;
    const domain = normalizeDomain(email);
    if (sentEmails.has(email)) {
      console.log(`  ⏭ Already sent to ${email} — skipping`);
      return false;
    }
    if (doNotContact.has(email) || doNotContact.has(domain)) {
      console.log(`  🚫 ${email} is in DO_NOT_CONTACT — skipping`);
      return false;
    }
    return true;
  });

  // Count today's sends
  const today = new Date().toISOString().split('T')[0];
  const todaySends = applications.filter(a =>
    (a.status || '').toUpperCase() === 'SENT' &&
    (a.sent_at || '').startsWith(today)
  ).length;

  const remaining = Math.max(0, maxSends - todaySends);
  console.log(`  Today's sends so far: ${todaySends}, Remaining quota: ${remaining}`);

  if (remaining === 0) {
    console.log('  ⚠ Daily send limit reached');
    return { sent: 0, errors: 0 };
  }

  const batch = toSend.slice(0, remaining);
  console.log(`  Will process ${batch.length} email(s) this run`);

  if (batch.length === 0) {
    return { sent: 0, errors: 0 };
  }

  // Download attachments from Google Drive
  let cvBase64 = '';
  let motBase64 = '';

  if (!dryRun) {
    console.log('\n  📎 Downloading attachments from Google Drive...');
    try {
      const cvFileId = process.env.GOOGLE_DRIVE_CV_FILE_ID;
      const motFileId = process.env.GOOGLE_DRIVE_MOTIVATION_FILE_ID;

      if (!cvFileId || !motFileId) {
        throw new Error('GOOGLE_DRIVE_CV_FILE_ID or GOOGLE_DRIVE_MOTIVATION_FILE_ID not set');
      }

      const cvRes = await drive.files.get(
        { fileId: cvFileId, alt: 'media' },
        { responseType: 'arraybuffer' }
      );
      cvBase64 = Buffer.from(cvRes.data).toString('base64');
      console.log(`    ✓ CV downloaded (${Math.round(cvRes.data.byteLength / 1024)}KB)`);

      const motRes = await drive.files.get(
        { fileId: motFileId, alt: 'media' },
        { responseType: 'arraybuffer' }
      );
      motBase64 = Buffer.from(motRes.data).toString('base64');
      console.log(`    ✓ Motivation letter downloaded (${Math.round(motRes.data.byteLength / 1024)}KB)`);
    } catch (err) {
      console.error(`  ✗ Failed to download attachments: ${err.message}`);
      console.error('  Aborting email sending — cannot send without attachments');
      return { sent: 0, errors: 1 };
    }
  }

  // Send emails
  let sentCount = 0;
  let errorCount = 0;

  for (const contact of batch) {
    const targetEmail = contact._extractedEmail || contact.email;
    console.log(`\n  ✉ ${dryRun ? '[DRY RUN] ' : ''}Sending to: ${targetEmail}`);

    try {
      if (dryRun) {
        console.log(`    Subject: ${EMAIL_SUBJECT}`);
        console.log(`    Body preview: ${EMAIL_BODY.substring(0, 100)}...`);
        console.log(`    Attachments: CV + Motivation Letter`);
        console.log(`    ✓ DRY RUN — email NOT sent`);

        // Update status to DRY_RUN_OK
        if (cMap.review_status !== undefined) {
          await updateCell(sheets, 'CONTACTS', cMap.review_status, contact._rowIndex, 'DRY_RUN_OK');
        }
        sentCount++;
      } else {
        // Build MIME email
        const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).substring(2)}`;

        const rawParts = [
          `From: "Jesus Hernandez" <${senderEmail}>`,
          `To: ${targetEmail}`,
          `Bcc: ${senderEmail}`,
          `Subject: =?UTF-8?B?${Buffer.from(EMAIL_SUBJECT).toString('base64')}?=`,
          'MIME-Version: 1.0',
          `Content-Type: multipart/mixed; boundary="${boundary}"`,
          '',
          `--${boundary}`,
          'Content-Type: text/plain; charset="UTF-8"',
          'Content-Transfer-Encoding: quoted-printable',
          '',
          quotedPrintableEncode(EMAIL_BODY),
          '',
          `--${boundary}`,
          'Content-Type: application/pdf; name="CV_Jesus_Hernandez.pdf"',
          'Content-Disposition: attachment; filename="CV_Jesus_Hernandez.pdf"',
          'Content-Transfer-Encoding: base64',
          '',
          splitBase64(cvBase64),
          '',
          `--${boundary}`,
          'Content-Type: application/pdf; name="Motivationsschreiben_Jesus_Hernandez.pdf"',
          'Content-Disposition: attachment; filename="Motivationsschreiben_Jesus_Hernandez.pdf"',
          'Content-Transfer-Encoding: base64',
          '',
          splitBase64(motBase64),
          '',
          `--${boundary}--`,
        ];

        const rawEmail = rawParts.join('\r\n');
        const encodedMessage = Buffer.from(rawEmail)
          .toString('base64')
          .replace(/\+/g, '-')
          .replace(/\//g, '_')
          .replace(/=+$/, '');

        const sendRes = await gmail.users.messages.send({
          userId: 'me',
          requestBody: { raw: encodedMessage },
        });

        const messageId = sendRes.data.id;
        console.log(`    ✓ SENT! Gmail Message ID: ${messageId}`);

        // Update CONTACTS status to SENT
        if (cMap.review_status !== undefined) {
          await updateCell(sheets, 'CONTACTS', cMap.review_status, contact._rowIndex, 'SENT');
        }

        // Log to APPLICATIONS sheet
        const appRow = [
          generateId('app'),           // application_id
          contact.hotel_id || '',      // hotel_id
          contact.contact_id || '',    // contact_id
          targetEmail,                 // recipient_email
          EMAIL_SUBJECT,               // subject
          'SENT',                      // status
          now(),                       // sent_at
          messageId,                   // gmail_message_id
          now(),                       // created_at
        ];
        await appendRows(sheets, 'APPLICATIONS', [appRow]);

        sentCount++;
      }
    } catch (err) {
      console.error(`    ✗ Failed to send to ${targetEmail}: ${err.message}`);
      errorCount++;

      // Mark as ERROR in CONTACTS
      if (cMap.review_status !== undefined) {
        await updateCell(sheets, 'CONTACTS', cMap.review_status, contact._rowIndex, 'SEND_ERROR');
      }
    }

    // Random delay between sends (7-15 minutes worth for real sends, 1s for dry run)
    if (!dryRun && batch.indexOf(contact) < batch.length - 1) {
      const minDelay = parseInt(process.env.MIN_DELAY_SECONDS || '420', 10) * 1000;
      const maxDelay = parseInt(process.env.MAX_DELAY_SECONDS || '900', 10) * 1000;
      const delay = Math.floor(Math.random() * (maxDelay - minDelay)) + minDelay;
      console.log(`    ⏳ Waiting ${Math.round(delay / 1000)}s before next send...`);
      await sleep(delay);
    } else {
      await sleep(1000);
    }
  }

  console.log(`\n  Sender Summary: ${sentCount} sent, ${errorCount} errors`);
  return { sent: sentCount, errors: errorCount };
}

/**
 * Encode text as quoted-printable for email body
 */
function quotedPrintableEncode(str) {
  return str.replace(/[^\x20-\x7E\r\n\t]/g, (char) => {
    const buf = Buffer.from(char, 'utf8');
    return Array.from(buf).map(b => '=' + b.toString(16).toUpperCase().padStart(2, '0')).join('');
  });
}

/**
 * Split base64 string into 76-char lines (MIME standard)
 */
function splitBase64(base64) {
  return base64.replace(/(.{76})/g, '$1\r\n');
}

module.exports = { sendOutreachEmails };
