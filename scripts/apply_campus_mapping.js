#!/usr/bin/env node
/*
  apply_campus_mapping.js
  Usage:
    node apply_campus_mapping.js --csv path/to/map.csv [--serviceAccount path/to/sa.json] [--dry-run] [--update]

  The CSV should have header: email,campus
  Campus values expected: TRP or RMP (case-insensitive)

  By default the script runs in dry-run mode and will only print planned changes.
  Pass --update to perform writes. Provide a service account JSON with --serviceAccount or set GOOGLE_APPLICATION_CREDENTIALS env var.
*/

const fs = require('fs');
const path = require('path');

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--')) {
      const k = a.replace(/^--/, '');
      const next = args[i + 1];
      if (!next || next.startsWith('--')) {
        out[k] = true;
      } else {
        out[k] = next;
        i++;
      }
    }
  }
  return out;
}

(async () => {
  const args = parseArgs();
  const csvPath = args.csv;
  const serviceAccount = args.serviceAccount;
  const dryRun = args['dry-run'] !== undefined ? !!args['dry-run'] : (args.update ? false : true);
  const doUpdate = args.update !== undefined;

  if (!csvPath) {
    console.error('Error: --csv path/to/file.csv is required');
    process.exit(1);
  }

  const absCsv = path.resolve(csvPath);
  if (!fs.existsSync(absCsv)) {
    console.error('CSV file not found at', absCsv);
    process.exit(1);
  }

  // Init Firebase Admin
  let admin;
  try {
    admin = require('firebase-admin');
  } catch (err) {
    console.error('Please install firebase-admin in your environment (npm i firebase-admin)');
    process.exit(1);
  }

  try {
    if (serviceAccount) {
      const saPath = path.resolve(serviceAccount);
      if (!fs.existsSync(saPath)) {
        console.error('Service account file not found at', saPath);
        process.exit(1);
      }
      const sa = require(saPath);
      admin.initializeApp({ credential: admin.credential.cert(sa) });
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      admin.initializeApp();
    } else {
      console.error('No service account provided and GOOGLE_APPLICATION_CREDENTIALS not set. Provide one with --serviceAccount or set GOOGLE_APPLICATION_CREDENTIALS.');
      process.exit(1);
    }
  } catch (err) {
    console.error('Error initializing firebase-admin:', err.message || err);
    process.exit(1);
  }

  const db = admin.firestore();

  const raw = fs.readFileSync(absCsv, 'utf8');
  const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(l => l.length);

  // Parse header
  const header = lines.shift();
  const cols = header.split(',').map(s => s.trim().toLowerCase());
  const emailIdx = cols.indexOf('email');
  const campusIdx = cols.indexOf('campus');
  if (emailIdx === -1 || campusIdx === -1) {
    console.error('CSV header must contain email and campus columns');
    process.exit(1);
  }

  const mappings = lines.map(line => {
    // naive CSV parsing: split on comma, trim, remove surrounding quotes
    const parts = line.split(',').map(p => p.trim().replace(/^"|"$/g, ''));
    const email = (parts[emailIdx] || '').toLowerCase();
    const campus = (parts[campusIdx] || '').toUpperCase();
    return { email, campus, raw: line };
  }).filter(m => m.email && m.campus);

  const allowed = new Set(['TRP','RMP']);
  const invalid = mappings.filter(m => !allowed.has(m.campus));
  if (invalid.length > 0) {
    console.error('Found invalid campus values in CSV (allowed: TRP, RMP):');
    invalid.forEach(i => console.error('  ', i.raw));
    process.exit(1);
  }

  console.log(`Loaded ${mappings.length} mappings from ${absCsv}`);
  console.log('Mode:', args.mode || 'csv', 'Dry-run:', dryRun, 'Will update:', doUpdate);

  let totalFound = 0;
  let totalUpdated = 0;
  let totalSkippedNoChange = 0;
  let totalNotFound = 0;
  let errors = 0;
  let totalDirectorsSkipped = 0;
  let totalPlannedTRP = 0;
  let totalPlannedRMP = 0;

  const mode = (args.mode || 'csv').toString();

  // Helper to update a doc
  const planOrUpdate = async (docRef, email, fromVal, toVal) => {
    console.log(`[PLAN] ${email} (${docRef.id}): ${fromVal} -> ${toVal}`);
    if (doUpdate && !dryRun) {
      await docRef.update({ campus: toVal, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      totalUpdated++;
      console.log(`[UPDATED] ${email} (${docRef.id})`);
    }
  };

  if (mode === 'trp-default-rmp') {
    // Phase 1: set campus=TRP for emails listed in CSV
    const trpSet = new Set();
    for (const map of mappings) {
      try {
        const q = db.collection('users').where('email','==',map.email);
        const snap = await q.get();
        if (snap.empty) {
          totalNotFound++;
          console.log(`[NOT FOUND] ${map.email}`);
          continue;
        }
        for (const doc of snap.docs) {
          const data = doc.data();
          const role = (data.role || '').toString();
          if (role === 'Director') {
            totalDirectorsSkipped++;
            console.log(`[SKIP-DIRECTOR] ${map.email} (${doc.id}) role=Director`);
            continue;
          }
          const current = (data.campus || null);
          if (current === 'TRP') {
            totalSkippedNoChange++;
            console.log(`[SKIP] ${map.email} (${doc.id}) already TRP`);
            trpSet.add(map.email);
            continue;
          }
          await planOrUpdate(doc.ref, map.email, current, 'TRP');
          totalPlannedTRP++;
          trpSet.add(map.email);
        }
      } catch (err) {
        errors++;
        console.error('Error processing', map.email, err.message || err);
      }
    }

    // Phase 2: set campus=RMP for all other users who are not Directors and who do NOT have a campus
    try {
      const usersSnap = await db.collection('users').get();
      for (const doc of usersSnap.docs) {
        const d = doc.data();
        const email = (d.email || '').toString().toLowerCase();
        const role = (d.role || '').toString();
        if (role === 'Director') {
          totalDirectorsSkipped++;
          continue;
        }
        if (trpSet.has(email)) continue; // already handled as TRP
        const current = (d.campus || null);
        if (current) {
          totalSkippedNoChange++;
          continue; // per your instruction: do NOT overwrite existing campus
        }
        await planOrUpdate(doc.ref, email, current, 'RMP');
        totalPlannedRMP++;
      }
    } catch (err) {
      errors++;
      console.error('Error scanning users for RMP assignment', err.message || err);
    }

  } else {
    // Default behavior: process CSV mappings only (existing behavior)
    for (const map of mappings) {
      try {
        const q = db.collection('users').where('email','==',map.email);
        const snap = await q.get();
        if (snap.empty) {
          totalNotFound++;
          console.log(`[NOT FOUND] ${map.email}`);
          continue;
        }
        totalFound += snap.size;
        for (const doc of snap.docs) {
          const data = doc.data();
          const current = (data.campus || null);
          if (current === map.campus) {
            totalSkippedNoChange++;
            console.log(`[SKIP] ${map.email} (${doc.id}) already ${current}`);
            continue;
          }
          console.log(`[PLAN] ${map.email} (${doc.id}): ${current} -> ${map.campus}`);
          if (doUpdate && !dryRun) {
            await doc.ref.update({ campus: map.campus, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
            totalUpdated++;
            console.log(`[UPDATED] ${map.email} (${doc.id})`);
          }
        }
      } catch (err) {
        errors++;
        console.error('Error processing', map.email, err.message || err);
      }
    }
  }

  console.log('--- Summary ---');
  console.log('Mode:', mode);
  console.log('Mappings processed:', mappings.length);
  console.log('Users found (from CSV queries):', totalFound);
  console.log('Not found:', totalNotFound);
  console.log('Directors skipped:', totalDirectorsSkipped);
  console.log('Already correct (skipped):', totalSkippedNoChange);
  if (mode === 'trp-default-rmp') {
    console.log('Planned TRP updates:', totalPlannedTRP);
    console.log('Planned RMP updates:', totalPlannedRMP);
  }
  console.log('Updated:', totalUpdated);
  console.log('Errors:', errors);

  if (!doUpdate) {
    console.log('\nNote: to apply changes, re-run with --update (and optionally --serviceAccount).');
  }

  process.exit(0);
})();
