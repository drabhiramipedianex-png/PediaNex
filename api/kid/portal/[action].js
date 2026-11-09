import admin from 'firebase-admin';
import {
  getPatientSessionCookieName,
  parseCookies,
  verifyPatientSessionToken
} from '../../../emr/kid/lib/patient-session.js';
import { getAdminDb } from '../_firebase-admin.js';

// Parent portal data access, consolidated into one dynamic-action route
// (records / export / rights-request) to stay under the Vercel Hobby plan's
// serverless function cap — three separate files pushed the project's
// function count over the limit and silently broke every deploy. This
// mirrors the same [action].js pattern already used for api/kid/otp/.

const CLINIC_NAMESPACE = 'clinics/kid';
const PATIENTS_COLLECTION = `${CLINIC_NAMESPACE}/patients`;
const HISTORY_COLLECTION = `${CLINIC_NAMESPACE}/history`;
const RIGHTS_REQUESTS_COLLECTION = `${CLINIC_NAMESPACE}/rightsRequests`;
const VALID_RIGHTS_TYPES = ['correction', 'erasure'];

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

    req.on('data', (chunk) => {
      chunks.push(chunk);
    });

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

function normalizePhoneForCompare(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
}

function serializeFirestoreValue(value) {
  if (value && typeof value.toDate === 'function') {
    return value.toDate().toISOString();
  }
  if (Array.isArray(value)) {
    return value.map(serializeFirestoreValue);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, serializeFirestoreValue(entry)])
    );
  }
  return value;
}

// Only fields the portal actually renders. The full patient document carries
// more than a parent needs to receive.
function publicPatientFields(id, data) {
  return {
    patientId: id,
    childName: data?.childName || '',
    parentName: data?.parentName || '',
    gender: data?.gender || '',
    dob: data?.dob || '',
    phone: normalizePhoneForCompare(data?.phone || data?.mobileNumber || '')
  };
}

async function findPatientsForPhone(db, phoneDigits) {
  const candidates = [phoneDigits, `91${phoneDigits}`, `+91${phoneDigits}`];

  const [byPhone, byMobile] = await Promise.all([
    db.collection(PATIENTS_COLLECTION).where('phone', 'in', candidates).get(),
    db.collection(PATIENTS_COLLECTION).where('mobileNumber', 'in', candidates).get()
  ]);

  const matches = new Map();

  for (const snapshot of [...byPhone.docs, ...byMobile.docs]) {
    const data = snapshot.data();
    const registered = normalizePhoneForCompare(data?.phone || data?.mobileNumber || '');

    if (registered && registered === phoneDigits) {
      matches.set(snapshot.id, { id: snapshot.id, data });
    }
  }

  return [...matches.values()];
}

async function requireVerifiedPhone(req, res) {
  const cookies = parseCookies(req.headers.cookie || '');
  const phone = await verifyPatientSessionToken(cookies[getPatientSessionCookieName()]);

  if (!phone) {
    sendJson(res, 401, { error: 'Not signed in.' });
    return null;
  }

  return normalizePhoneForCompare(phone);
}

// ---- records: patient list + a single patient's visit history -----------

async function handleRecords(req, res) {
  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'Method not allowed.' });
    return;
  }

  const phoneDigits = await requireVerifiedPhone(req, res);
  if (!phoneDigits) {
    return;
  }

  const db = getAdminDb();

  try {
    const matches = await findPatientsForPhone(db, phoneDigits);
    const patients = matches.map(({ id, data }) => publicPatientFields(id, data));
    const requestedPatientId = String(req.query?.patientId || '').trim();

    if (!requestedPatientId) {
      sendJson(res, 200, { ok: true, patients });
      return;
    }

    // Ownership check before any history is read.
    const owned = patients.some((patient) => patient.patientId === requestedPatientId);

    if (!owned) {
      sendJson(res, 403, { error: 'That patient is not linked to this number.' });
      return;
    }

    let snapshot;

    try {
      snapshot = await db
        .collection(HISTORY_COLLECTION)
        .where('patientId', '==', requestedPatientId)
        .orderBy('createdAtIso', 'desc')
        .get();
    } catch {
      // Same fallback the client had: the composite index may be missing.
      snapshot = await db
        .collection(HISTORY_COLLECTION)
        .where('patientId', '==', requestedPatientId)
        .get();
    }

    // A visit staff deleted stays in the records (retention) but is no longer
    // shown. The DPDP export below still includes it, flagged cancelled.
    const history = snapshot.docs.filter((entry) => entry.data()?.cancelled !== true).map((entry) => {
      const data = entry.data();
      return {
        id: entry.id,
        patientId: data?.patientId || '',
        createdAtIso: data?.createdAtIso || '',
        createdAtDisplay: data?.createdAtDisplay || '',
        childName: data?.childName || '',
        downloadURL: data?.downloadURL || '',
        storagePath: data?.storagePath || '',
        previewImageURL: data?.previewImageURL || ''
      };
    });

    sendJson(res, 200, { ok: true, patients, history });
  } catch (error) {
    console.error(`Portal records lookup failed: ${error.message}`);
    sendJson(res, 500, { error: 'Unable to load records right now.' });
  }
}

// ---- export: DPDP §11 machine-readable copy of everything held -----------

async function handleExport(req, res) {
  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'Method not allowed.' });
    return;
  }

  const phoneDigits = await requireVerifiedPhone(req, res);
  if (!phoneDigits) {
    return;
  }

  const db = getAdminDb();

  try {
    const matches = await findPatientsForPhone(db, phoneDigits);
    const patients = matches.map(({ id, data }) => ({ id, ...serializeFirestoreValue(data) }));
    const patientIds = patients.map((patient) => patient.patientId || patient.id);

    let historyDocs = [];

    if (patientIds.length) {
      const historySnapshots = await Promise.all(
        patientIds.map((patientId) => (
          db.collection(HISTORY_COLLECTION).where('patientId', '==', patientId).get()
        ))
      );

      historyDocs = historySnapshots
        .flatMap((snapshot) => snapshot.docs)
        .map((doc) => ({ id: doc.id, ...serializeFirestoreValue(doc.data()) }));
    }

    sendJson(res, 200, {
      ok: true,
      exportedAt: new Date().toISOString(),
      patients,
      history: historyDocs
    });
  } catch (error) {
    console.error(`Portal export failed: ${error.message}`);
    sendJson(res, 500, { error: 'Unable to export your data right now.' });
  }
}

// ---- rights-request: DPDP §12/§13 correction/erasure request logging -----

async function patientBelongsToPhone(db, patientId, phoneDigits) {
  if (!patientId) {
    return true; // A request that isn't scoped to one patient (e.g. "delete my account") is still valid.
  }

  const snapshot = await db.collection(PATIENTS_COLLECTION).doc(patientId).get();

  if (!snapshot.exists) {
    return false;
  }

  const data = snapshot.data();
  const registered = normalizePhoneForCompare(data?.phone || data?.mobileNumber || '');
  return registered === phoneDigits;
}

async function handleRightsRequest(req, res) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed.' });
    return;
  }

  const phoneDigits = await requireVerifiedPhone(req, res);
  if (!phoneDigits) {
    return;
  }

  let payload = {};

  try {
    payload = await readJsonBody(req);
  } catch {
    sendJson(res, 400, { error: 'Invalid request body.' });
    return;
  }

  const type = String(payload?.type || '').trim();
  const patientId = String(payload?.patientId || '').trim();
  const details = String(payload?.details || '').trim().slice(0, 2000);

  if (!VALID_RIGHTS_TYPES.includes(type)) {
    sendJson(res, 400, { error: 'Request type must be "correction" or "erasure".' });
    return;
  }

  const db = getAdminDb();

  try {
    if (!(await patientBelongsToPhone(db, patientId, phoneDigits))) {
      sendJson(res, 403, { error: 'That patient is not linked to this number.' });
      return;
    }

    const requestRef = db.collection(RIGHTS_REQUESTS_COLLECTION).doc();
    await requestRef.set({
      type,
      patientId: patientId || null,
      requestedByPhone: phoneDigits,
      details,
      status: 'pending',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    sendJson(res, 201, {
      ok: true,
      requestId: requestRef.id,
      message: 'Your request has been logged. Clinic staff will contact you to confirm and process it.'
    });
  } catch (error) {
    console.error(`Rights request failed: ${error.message}`);
    sendJson(res, 500, { error: 'Unable to submit your request right now. Please call the clinic instead.' });
  }
}

export default async function handler(req, res) {
  const action = req.query?.action;

  if (action === 'records') {
    await handleRecords(req, res);
    return;
  }

  if (action === 'export') {
    await handleExport(req, res);
    return;
  }

  if (action === 'rights-request') {
    await handleRightsRequest(req, res);
    return;
  }

  sendJson(res, 404, { error: 'Not found.' });
}
