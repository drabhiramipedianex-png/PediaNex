import admin from 'firebase-admin';
import { getAdminDb } from '../_firebase-admin.js';

// QR self check-in. This used to be a client-side addDoc straight into
// clinics/kid/pendingPatients, which required the Firestore rules to allow
// anonymous writes. The write now happens here under admin credentials, so the
// page needs no database access and the rules can require auth.
//
// Everything arriving here is from an unauthenticated stranger with a QR code,
// so the payload is whitelisted and shape-checked rather than stored as sent.

const CLINIC_NAMESPACE = 'clinics/kid';
const PENDING_COLLECTION = `${CLINIC_NAMESPACE}/pendingPatients`;
const MAX_FIELD_LENGTH = 120;
const VALID_RELATIONSHIPS = ['Parent', 'Legal Guardian'];
// Bumped whenever tos/index.html's "Last updated" date changes, so every
// consent record says which version of the notice was in effect.
const POLICY_VERSION = '2026-08-27';

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') {
    return req.body;
  }

  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function clean(value) {
  return String(value ?? '').trim().slice(0, MAX_FIELD_LENGTH);
}

function normalizePhone(value) {
  const digits = clean(value).replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
}

function isValidDob(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00Z`);

  if (Number.isNaN(parsed.getTime())) {
    return false;
  }

  // A birth date in the future, or implausibly far back, is a typo or junk.
  const now = Date.now();
  const oldest = now - (120 * 365.25 * 24 * 60 * 60 * 1000);
  return parsed.getTime() <= now && parsed.getTime() >= oldest;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed.' });
    return;
  }

  let body = {};

  try {
    body = await readJsonBody(req);
  } catch {
    sendJson(res, 400, { error: 'Invalid request body.' });
    return;
  }

  const childName = clean(body.childName);
  const phone = normalizePhone(body.mobileNumber || body.phone);
  const dob = clean(body.dob);
  const gender = clean(body.gender);
  const guardianRelationship = clean(body.guardianRelationship);

  if (!childName) {
    sendJson(res, 400, { error: 'Child name is required.' });
    return;
  }

  if (phone.length !== 10) {
    sendJson(res, 400, { error: 'Enter a valid 10-digit phone number.' });
    return;
  }

  if (!isValidDob(dob)) {
    sendJson(res, 400, { error: 'Enter a valid date of birth.' });
    return;
  }

  if (!['Male', 'Female'].includes(gender)) {
    sendJson(res, 400, { error: 'Select a gender.' });
    return;
  }

  if (!VALID_RELATIONSHIPS.includes(guardianRelationship)) {
    sendJson(res, 400, { error: 'Select your relationship to the child.' });
    return;
  }

  if (body.consentGiven !== true) {
    sendJson(res, 400, { error: 'Consent to collect and process this data is required.' });
    return;
  }

  // Only these fields are persisted. Status/decision are set here, never taken
  // from the request, so a submission cannot arrive pre-approved.
  const record = {
    childName,
    parentName: clean(body.parentName),
    gender,
    dob,
    phone,
    mobileNumber: phone,
    email: clean(body.email),
    bloodGroup: clean(body.bloodGroup),
    status: 'pending',
    decision: 'pending',
    submittedBy: 'qr-intake',
    submittedAt: admin.firestore.FieldValue.serverTimestamp(),
    reviewedAt: null,
    reviewedBy: '',
    approvedPatientId: '',
    notes: '',
    consentGiven: true,
    consentAt: admin.firestore.FieldValue.serverTimestamp(),
    consentRelationship: guardianRelationship,
    policyVersion: POLICY_VERSION
  };

  try {
    const docRef = await getAdminDb().collection(PENDING_COLLECTION).add(record);
    sendJson(res, 200, { ok: true, queueId: docRef.id });
  } catch (error) {
    console.error(`Intake submit failed: ${error.message}`);
    sendJson(res, 500, { error: 'Unable to submit right now. Please tell the clinic staff.' });
  }
}
