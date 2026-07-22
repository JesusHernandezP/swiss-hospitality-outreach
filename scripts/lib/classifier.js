/**
 * Swiss Hospitality Outreach — Groq Contact Classification
 * Uses Groq AI to classify contacts and pick the best email per hotel
 */

const axios = require('axios');
const { readSheet, parseRows, updateCell, ensureHeaders } = require('./google');
const { classifyEmailType, emailPriority, sleep } = require('./utils');

/**
 * Run contact classification: for each hotel with unclassified contacts,
 * use Groq to pick the best email and set review_status.
 * @param {Object} sheets - Google Sheets API
 * @param {Object} options - { maxHotels, dryRun }
 */
async function classifyContacts(sheets, options = {}) {
  const { maxHotels = 20, dryRun = false } = options;

  const groqKey = process.env.GROQ_API_KEY;
  const groqModel = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  PHASE 3: Contact Classification (Groq)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  if (!groqKey) {
    console.log('  ⚠ GROQ_API_KEY not set — using rule-based classification only');
    return classifyByRules(sheets, options);
  }

  // Read contacts
  const contactRows = await readSheet(sheets, 'CONTACTS');
  const { data: contacts, headerMap: cMap } = parseRows(contactRows);

  // Find contacts needing classification (no review_status or empty)
  const unclassified = contacts.filter(c => {
    const status = (c.review_status || '').toUpperCase();
    return !status || status === '' || status === 'PENDING';
  });

  console.log(`  Total contacts: ${contacts.length}, Needing classification: ${unclassified.length}`);

  if (unclassified.length === 0) {
    console.log('  ✓ All contacts already classified');
    return { classified: 0 };
  }

  // Group contacts by hotel_id
  const hotelGroups = {};
  for (const contact of unclassified) {
    const hid = contact.hotel_id || 'unknown';
    if (!hotelGroups[hid]) hotelGroups[hid] = [];
    hotelGroups[hid].push(contact);
  }

  const hotelIds = Object.keys(hotelGroups).slice(0, maxHotels);
  let totalClassified = 0;

  // Read hotels for context
  const hotelRows = await readSheet(sheets, 'HOTELS');
  const { data: hotels } = parseRows(hotelRows);
  const hotelMap = {};
  for (const h of hotels) {
    if (h.hotel_id) hotelMap[h.hotel_id] = h;
  }

  for (const hotelId of hotelIds) {
    const hotelContacts = hotelGroups[hotelId];
    const hotel = hotelMap[hotelId] || {};

    console.log(`\n  🏨 ${hotel.hotel_name || hotelId}: ${hotelContacts.length} contact(s)`);

    try {
      const classification = await classifyWithGroq(
        groqKey, groqModel, hotel, hotelContacts
      );

      // Apply classification results
      for (const contact of hotelContacts) {
        const isPreferred = classification.best_email &&
          contact.email.toLowerCase() === classification.best_email.toLowerCase();

        let reviewStatus;
        if (isPreferred) {
          // Use Groq's recommendation
          const emailType = classification.email_type || classifyEmailType(contact.email);
          if (['JOBS', 'HR'].includes(emailType)) {
            reviewStatus = 'READY_TO_SEND';
          } else if (['MANAGEMENT'].includes(emailType)) {
            reviewStatus = 'READY_TO_SEND';
          } else {
            reviewStatus = classification.manual_review ? 'NEEDS_REVIEW' : 'READY_TO_SEND';
          }
        } else {
          reviewStatus = 'NOT_PREFERRED';
        }

        if (!dryRun && cMap.review_status !== undefined) {
          await updateCell(sheets, 'CONTACTS', cMap.review_status, contact._rowIndex, reviewStatus);
        }

        console.log(`    ${contact.email} → ${reviewStatus}${isPreferred ? ' ★' : ''}`);
        totalClassified++;
      }
    } catch (err) {
      console.error(`    ✗ Groq error for ${hotelId}: ${err.message}`);
      // Fallback to rule-based classification
      for (const contact of hotelContacts) {
        const emailType = classifyEmailType(contact.email);
        const reviewStatus = ['JOBS', 'HR', 'MANAGEMENT'].includes(emailType)
          ? 'READY_TO_SEND'
          : 'NEEDS_REVIEW';
        if (!dryRun && cMap.review_status !== undefined) {
          await updateCell(sheets, 'CONTACTS', cMap.review_status, contact._rowIndex, reviewStatus);
        }
        console.log(`    ${contact.email} → ${reviewStatus} (rule-based fallback)`);
        totalClassified++;
      }
    }

    await sleep(1000); // Rate limit Groq calls
  }

  console.log(`\n  Classification Summary: ${totalClassified} contacts classified`);
  return { classified: totalClassified };
}

/**
 * Rule-based classification fallback (no AI needed)
 */
async function classifyByRules(sheets, options = {}) {
  const { dryRun = false } = options;

  const contactRows = await readSheet(sheets, 'CONTACTS');
  const { data: contacts, headerMap: cMap } = parseRows(contactRows);

  const unclassified = contacts.filter(c => {
    const status = (c.review_status || '').toUpperCase();
    return !status || status === '' || status === 'PENDING';
  });

  if (unclassified.length === 0) return { classified: 0 };

  // Group by hotel_id and pick best per hotel
  const hotelGroups = {};
  for (const c of unclassified) {
    const hid = c.hotel_id || 'unknown';
    if (!hotelGroups[hid]) hotelGroups[hid] = [];
    hotelGroups[hid].push(c);
  }

  let totalClassified = 0;

  for (const [hotelId, hotelContacts] of Object.entries(hotelGroups)) {
    // Sort by email priority and pick best
    const sorted = hotelContacts.sort((a, b) =>
      emailPriority(classifyEmailType(a.email)) - emailPriority(classifyEmailType(b.email))
    );

    const bestEmail = sorted[0].email;

    for (const contact of sorted) {
      const isBest = contact.email === bestEmail;
      const emailType = classifyEmailType(contact.email);
      let reviewStatus;

      if (isBest) {
        reviewStatus = ['JOBS', 'HR', 'MANAGEMENT'].includes(emailType)
          ? 'READY_TO_SEND'
          : 'NEEDS_REVIEW';
      } else {
        reviewStatus = 'NOT_PREFERRED';
      }

      if (!dryRun && cMap.review_status !== undefined) {
        await updateCell(sheets, 'CONTACTS', cMap.review_status, contact._rowIndex, reviewStatus);
      }
      totalClassified++;
    }
  }

  console.log(`  Rule-based classification: ${totalClassified} contacts classified`);
  return { classified: totalClassified };
}

/**
 * Call Groq API to classify contacts for a hotel
 */
async function classifyWithGroq(apiKey, model, hotel, contacts) {
  const emailsInput = contacts.map(c => ({
    email: c.email,
    source_url: c.source_url || '',
    type_hint: c.email_type || classifyEmailType(c.email),
  }));

  const prompt = `You are a contact classifier for job applications in the Swiss hospitality industry.

Given a hotel and its public email addresses, select the BEST email to send a spontaneous job application for a Cook/Kitchen position.

RULES:
1. ONLY select from the provided emails — never invent or modify an email.
2. Priority order: jobs@/karriere@ > hr@/personal@ > management/direction > info@/general > reception/reservation
3. A GENERAL email (info@, kontakt@) should be flagged with manual_review=true.
4. HR or JOBS emails with high confidence can be sent directly (manual_review=false).

HOTEL:
Name: ${hotel.hotel_name || 'Unknown'}
Town: ${hotel.town || 'Unknown'}
Website: ${hotel.website || 'Unknown'}

EMAILS FOUND:
${JSON.stringify(emailsInput, null, 2)}

Respond ONLY with valid JSON (no markdown, no explanations):
{
  "best_email": "the-best-email@domain.ch",
  "email_type": "JOBS|HR|MANAGEMENT|GENERAL|RECEPTION|RESERVATION|UNKNOWN",
  "contact_name": null,
  "manual_review": true,
  "reason": "Brief explanation",
  "confidence": 0.85
}`;

  const response = await axios.post(
    'https://api.groq.com/openai/v1/chat/completions',
    {
      model: model,
      messages: [
        { role: 'system', content: 'You are a JSON-only contact classifier. Always respond with valid JSON.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.1,
      max_tokens: 500,
      response_format: { type: 'json_object' },
    },
    {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    }
  );

  const content = response.data.choices[0].message.content;
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    // Try to extract JSON from the response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[0]);
    } else {
      throw new Error('Groq returned invalid JSON');
    }
  }

  // Validate: best_email must exist in the input
  if (parsed.best_email) {
    const exists = contacts.some(c =>
      c.email.toLowerCase() === parsed.best_email.toLowerCase()
    );
    if (!exists) {
      console.log(`    ⚠ Groq suggested email not in input: ${parsed.best_email} — falling back to rule-based`);
      // Fallback: pick best by priority
      const sorted = contacts.sort((a, b) =>
        emailPriority(classifyEmailType(a.email)) - emailPriority(classifyEmailType(b.email))
      );
      parsed.best_email = sorted[0].email;
      parsed.email_type = classifyEmailType(sorted[0].email);
      parsed.manual_review = !['JOBS', 'HR'].includes(parsed.email_type);
    }
  }

  return parsed;
}

module.exports = { classifyContacts };
