import { verifyAccessToken, isMsg91Configured } from '../_msg91.js';
import { getAdminDb } from '../_firebase-admin.js';
import { checkOtpRateLimit, getRequestIp, sanitizeRateLimitKey } from '../../_lib/otp-rate-limit.js';
import {
  createPatientSessionToken,
  verifyPatientSessionToken,
  buildPatientSessionCookie,
  buildClearedPatientSessionCookie,
  isPatientSessionConfigured,
  parseCookies,
  getPatientSessionCookieName
} from '../../../emr/kid/lib/patient-session.js';

const PATIENTS_COLLECTION = 'clinics/kid/patients';

function sendJson(res, statusCode, payload, extraHeaders = {}) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  for (const [header, value] of Object.entries(extraHeaders)) {
    res.setHeader(header, value);
  }

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

function normalizePhoneDigits(value) {
  const digits = String(value || '').replace(/\D/g, '').replace(/^0+/, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
}

async function hasPatientForPhone(db, phoneDigits, collectionPath = PATIENTS_COLLECTION) {
  const candidates = [phoneDigits, `91${phoneDigits}`, `+91${phoneDigits}`];

  const [byPhone, byMobile] = await Promise.all([
    db.collection(collectionPath).where('phone', 'in', candidates).get(),
    db.collection(collectionPath).where('mobileNumber', 'in', candidates).get()
  ]);

  for (const snapshot of [...byPhone.docs, ...byMobile.docs]) {
    const data = snapshot.data();
    const registered = normalizePhoneDigits(data?.phone || data?.mobileNumber || '');

    if (registered === phoneDigits) {
      return true;
    }
  }

  return false;
}

// The lungs lookup is loaded on demand and allowed to fail on its own: a
// missing or misconfigured lungs admin setup must not take down kid OTP
// (a static import would crash this whole endpoint at load time).
async function hasLungsPatientForPhone(phoneDigits) {
  try {
    const { getAdminDb: getLungsAdminDb } = await import('../../lungs/_firebase-admin.js');
    return await hasPatientForPhone(getLungsAdminDb(), phoneDigits, 'clinics/lungs/patients');
  } catch (error) {
    console.error(`Lungs patient lookup skipped: ${error.message}`);
    return false;
  }
}

function isExistenceCheckAuthorized(req) {
  const expected = String(process.env.MSG91_EXISTENCE_CHECK_SECRET || '').trim();
  if (!expected) {
    return true;
  }
  return req.headers['x-existence-check-secret'] === expected;
}

// Called directly by MSG91's widget (server-to-server) as its "User
// Existence Validation" hook, before MSG91 sends an OTP at all. One widget
// is shared between the kid and lungs portals, so a number counts as
// registered if either clinic has it - this is a defense-in-depth check
// against someone invoking the MSG91 widget's sendOtp directly, bypassing
// the per-clinic handleCheck() above, which remains the authoritative,
// correctly-scoped gate for each portal's own lookup flow.
async function handleUserExists(req, res) {
  // MSG91's dashboard validates this URL with a browser-side fetch when the
  // widget config is saved (in addition to the real server-to-server call
  // when an OTP is actually requested), so it needs CORS headers or the
  // dashboard reports the API as broken even though it works fine.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'x-existence-check-secret, Content-Type');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  const identifier = String(req.query?.identifier || '');

  if (req.method !== 'GET' || !isExistenceCheckAuthorized(req)) {
    res.statusCode = 200;
    res.end(JSON.stringify({ user_found: false, identifier }));
    return;
  }

  const phoneDigits = normalizePhoneDigits(identifier);

  if (phoneDigits.length !== 10) {
    res.statusCode = 200;
    res.end(JSON.stringify({ user_found: false, identifier }));
    return;
  }

  try {
    const rateLimit = await checkOtpRateLimit(getAdminDb(), 'otpExistenceRateLimitsByPhone', phoneDigits);

    if (rateLimit.limited) {
      res.statusCode = 200;
      res.end(JSON.stringify({ user_found: false, identifier }));
      return;
    }

    const [foundInKid, foundInLungs] = await Promise.all([
      hasPatientForPhone(getAdminDb(), phoneDigits),
      hasLungsPatientForPhone(phoneDigits)
    ]);

    res.statusCode = 200;
    res.end(JSON.stringify({ user_found: foundInKid || foundInLungs, identifier }));
  } catch (error) {
    console.error(`User existence check failed: ${error.message}`);
    res.statusCode = 200;
    res.end(JSON.stringify({ user_found: false, identifier }));
  }
}

async function handleCheck(req, res) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed.' });
    return;
  }

  let payload = {};

  try {
    payload = await readJsonBody(req);
  } catch {
    sendJson(res, 400, { error: 'Invalid request body.' });
    return;
  }

  const phoneDigits = normalizePhoneDigits(payload?.phone);

  if (phoneDigits.length !== 10) {
    sendJson(res, 400, { error: 'Please enter a valid 10-digit phone number.' });
    return;
  }

  const db = getAdminDb();
  const ip = sanitizeRateLimitKey(getRequestIp(req));

  try {
    const [phoneLimit, ipLimit] = await Promise.all([
      checkOtpRateLimit(db, 'clinics/kid/otpRateLimitsByPhone', phoneDigits),
      checkOtpRateLimit(db, 'clinics/kid/otpRateLimitsByIp', ip)
    ]);

    const limited = phoneLimit.limited ? phoneLimit : ipLimit.limited ? ipLimit : null;

    if (limited) {
      const retryAfterSeconds = Math.max(1, Math.ceil(limited.retryAfterMs / 1000));
      sendJson(res, 429, {
        error: 'Too many attempts. Please try again later.',
        retryAfterSeconds
      });
      return;
    }

    const exists = await hasPatientForPhone(db, phoneDigits);
    sendJson(res, 200, { exists });
  } catch (error) {
    console.error(`OTP eligibility check failed: ${error.message}`);
    sendJson(res, 500, { error: 'Unable to verify that number right now. Please try again.' });
  }
}

async function handleVerify(req, res) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed.' });
    return;
  }

  if (!isMsg91Configured() || !isPatientSessionConfigured()) {
    sendJson(res, 503, { error: 'OTP verification is not configured. Please contact support.' });
    return;
  }

  let payload = {};

  try {
    payload = await readJsonBody(req);
  } catch {
    sendJson(res, 400, { error: 'Invalid request body.' });
    return;
  }

  const phoneDigits = normalizePhoneDigits(payload?.phone);
  const accessToken = String(payload?.accessToken || '').trim();

  if (phoneDigits.length !== 10) {
    sendJson(res, 400, { error: 'Please enter a valid 10-digit phone number.' });
    return;
  }

  if (!accessToken) {
    sendJson(res, 400, { error: 'Missing verification token.' });
    return;
  }

  try {
    await verifyAccessToken(accessToken);
  } catch (error) {
    sendJson(res, 401, { error: error?.message || 'That code is incorrect. Please try again.' });
    return;
  }

  const token = await createPatientSessionToken(phoneDigits);
  sendJson(res, 200, { ok: true }, {
    'Set-Cookie': buildPatientSessionCookie(token)
  });
}

async function handleSession(req, res) {
  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'Method not allowed.' });
    return;
  }

  const cookies = parseCookies(req.headers.cookie || '');
  const token = cookies[getPatientSessionCookieName()];
  const phone = await verifyPatientSessionToken(token);

  if (!phone) {
    sendJson(res, 401, { error: 'Not signed in.' });
    return;
  }

  sendJson(res, 200, { phone });
}

async function handleLogout(req, res) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed.' });
    return;
  }

  sendJson(res, 200, { ok: true }, {
    'Set-Cookie': buildClearedPatientSessionCookie()
  });
}

export default async function handler(req, res) {
  const action = req.query?.action;

  if (action === 'user-exists') {
    await handleUserExists(req, res);
    return;
  }

  if (action === 'check') {
    await handleCheck(req, res);
    return;
  }

  if (action === 'verify') {
    await handleVerify(req, res);
    return;
  }

  if (action === 'session') {
    await handleSession(req, res);
    return;
  }

  if (action === 'logout') {
    await handleLogout(req, res);
    return;
  }

  sendJson(res, 404, { error: 'Not found.' });
}
