require('dotenv').config();
const { createAuth, getApis, readSheet, parseRows } = require('./lib/google');

async function diagnose() {
  console.log('--- DIAGNOSTIC START ---');
  try {
    const auth = createAuth();
    const { sheets } = getApis(auth);

    console.log('1. Reading CONTACTS tab...');
    const contactRows = await readSheet(sheets, 'CONTACTS');
    const { data: contacts, headers: cHeaders } = parseRows(contactRows);
    console.log('CONTACTS Headers:', cHeaders);
    console.log('Total contacts in sheet:', contacts.length);

    const statuses = {};
    contacts.forEach(c => {
      const st = (c.review_status || c.status || 'EMPTY').toUpperCase();
      statuses[st] = (statuses[st] || 0) + 1;
    });
    console.log('Contact status breakdown:', statuses);

    console.log('\n2. Reading APPLICATIONS tab...');
    const appRows = await readSheet(sheets, 'APPLICATIONS');
    const { data: apps, headers: aHeaders } = parseRows(appRows);
    console.log('APPLICATIONS Headers:', aHeaders);
    console.log('Total logged applications:', apps.length);

    console.log('\n3. Sample ready/pending contact:');
    const sample = contacts.find(c => c.email);
    if (sample) {
      console.log('Sample contact:', {
        email: sample.email,
        review_status: sample.review_status,
        status: sample.status,
        hotel_id: sample.hotel_id
      });
    } else {
      console.log('No contacts found with email!');
    }
  } catch (err) {
    console.error('DIAGNOSTIC ERROR:', err);
  }
}

diagnose();
