// Imports doctor-approved rows from medication-catalog-review.csv into
// clinics/kid/prescription/Medication -> medicineCatalog.
//
//   node tools/medication-catalog/import-catalog.cjs <service-account.json>            dry run (default, writes nothing)
//   node tools/medication-catalog/import-catalog.cjs <service-account.json> --apply    write approved rows
//
// Only rows with "Y" in the approve column, a type and a composition are written.
// Existing catalog entries are never overwritten. A backup of the document is
// saved before any write.
const path = require('path');
const fs = require('fs');
const modules = process.env.FIREBASE_ADMIN_MODULES || path.join(__dirname, '..', '..', 'node_modules');
const { initializeApp, cert } = require(path.join(modules, 'firebase-admin/lib/app'));
const { getFirestore, FieldPath, FieldValue } = require(path.join(modules, 'firebase-admin/lib/firestore'));

const VALID_TYPES = new Set(['Syrup', 'Drops', 'Tablet', 'Capsule', 'Suspension', 'Inhaler', 'Nebulization', 'Injection', 'Cream/Ointment', 'Other']);

function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  text = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((v) => v.trim()));
}

(async () => {
  const [keyPath, flag] = process.argv.slice(2);
  if (!keyPath) throw new Error('Usage: node tools/medication-catalog/import-catalog.cjs <service-account.json> [--apply]');
  const apply = flag === '--apply';

  const [, ...rows] = parseCsv(fs.readFileSync(path.join(__dirname, 'medication-catalog-review.csv'), 'utf8'));
  const approved = [];
  const skipped = [];
  rows.forEach(([approve, key, type, strength, composition]) => {
    const k = (key || '').trim();
    if ((approve || '').trim().toUpperCase() !== 'Y') return;
    if (!k || !VALID_TYPES.has((type || '').trim()) || !(composition || '').trim()) {
      skipped.push(`${k || '(blank)'}: needs a valid type and composition`);
      return;
    }
    approved.push({ key: k, type: type.trim(), strength: (strength || '').trim(), composition: composition.trim() });
  });

  initializeApp({ credential: cert(JSON.parse(fs.readFileSync(keyPath, 'utf8'))) });
  const db = getFirestore();
  const ref = db.doc('clinics/kid/prescription/Medication');
  const snap = await ref.get();
  const data = snap.data() || {};
  const items = new Set((data.items || []).map((v) => String(v)));
  const existing = new Set(Object.keys(data.medicineCatalog || {}).map((k) => k.toLowerCase()));

  const toWrite = [];
  approved.forEach((row) => {
    if (!items.has(row.key)) skipped.push(`${row.key}: no longer in items list`);
    else if (existing.has(row.key.toLowerCase())) skipped.push(`${row.key}: already has catalog details (not overwritten)`);
    else toWrite.push(row);
  });

  console.log(`Approved rows: ${approved.length}, to write: ${toWrite.length}, skipped: ${skipped.length}`);
  skipped.forEach((s) => console.log(`  skip - ${s}`));
  if (!apply) {
    toWrite.slice(0, 10).forEach((r) => console.log(`  would add - ${r.key}: ${r.type} | ${r.strength} | ${r.composition}`));
    console.log('Dry run only. Re-run with --apply to write.');
    return;
  }
  if (!toWrite.length) return;

  const backup = path.join(__dirname, `medication-backup-${Date.now()}.json`);
  fs.writeFileSync(backup, JSON.stringify(data, null, 2));
  console.log(`Backup saved: ${backup}`);

  // Field paths keep keys with dots or slashes (e.g. "Budecort 0.5mg 2ml") intact.
  const nowIso = new Date().toISOString();
  const args = [];
  toWrite.forEach((r) => {
    args.push(new FieldPath('medicineCatalog', r.key), {
      name: r.key, displayName: r.key, type: r.type, strength: r.strength,
      composition: r.composition, updatedAtIso: nowIso, source: 'catalog-import'
    });
  });
  await ref.update(new FieldPath('updatedAt'), FieldValue.serverTimestamp(), ...args);
  console.log(`Wrote ${toWrite.length} catalog entries.`);
})().catch((e) => { console.error(e.message); process.exit(1); });
