import {
  buildClearedSessionCookie,
  buildSessionCookie,
  createSessionToken,
  getAccessPassword,
  isAuthConfigured
} from '../../../emr/kid/lib/auth.js';
import { getAdminApp, getAdminDb } from '../_firebase-admin.js';
import { checkOtpRateLimit, getRequestIp, sanitizeRateLimitKey } from '../../_lib/otp-rate-limit.js';

// Staff login + logout, consolidated into one dynamic-action route (mirrors
// api/kid/otp/[action].js and api/kid/portal/[action].js) to stay under the
// Vercel Hobby plan's serverless function cap.

const CLINIC_UID = 'clinic-kid-doctor';

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

async function handleLogin(req, res) {
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

  const submittedPassword = String(payload?.password || '').trim();
  const configuredPassword = getAccessPassword();

  if (!isAuthConfigured()) {
    sendJson(res, 503, { error: 'Clinic access is not configured. Please contact support.' });
    return;
  }

  const ipKey = sanitizeRateLimitKey(getRequestIp(req));
  const { limited, retryAfterMs } = await checkOtpRateLimit(getAdminDb(), 'kidLoginAttempts', ipKey);

  if (limited) {
    sendJson(res, 429, {
      error: `Too many attempts. Try again in ${Math.ceil(retryAfterMs / 60000)} minute(s).`
    });
    return;
  }

  if (!submittedPassword || submittedPassword !== configuredPassword) {
    sendJson(res, 401, { error: 'Incorrect password. Please try again.' });
    return;
  }

  const token = await createSessionToken();
  let firebaseToken = '';

  try {
    firebaseToken = await getAdminApp().auth().createCustomToken(CLINIC_UID);
  } catch (error) {
    console.error(`Unable to mint Firebase custom token: ${error.message}`);
  }

  sendJson(res, 200, { ok: true, firebaseToken }, {
    'Set-Cookie': buildSessionCookie(token)
  });
}

async function handleLogout(req, res) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed.' });
    return;
  }

  sendJson(res, 200, { ok: true }, {
    'Set-Cookie': buildClearedSessionCookie()
  });
}

export default async function handler(req, res) {
  const action = req.query?.action;

  if (action === 'login') {
    await handleLogin(req, res);
    return;
  }

  if (action === 'logout') {
    await handleLogout(req, res);
    return;
  }

  sendJson(res, 404, { error: 'Not found.' });
}
