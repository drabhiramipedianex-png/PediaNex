const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

// Firestore-backed so the limit holds across serverless invocations, which
// don't share memory. Keyed separately by phone and by IP so neither a
// single number nor a single caller can run more than MAX_ATTEMPTS checks
// (and therefore OTP sends) per window.
export async function checkOtpRateLimit(db, collectionPath, key) {
  const docRef = db.collection(collectionPath).doc(key);
  const now = Date.now();

  return db.runTransaction(async (tx) => {
    const snapshot = await tx.get(docRef);
    const data = snapshot.exists ? snapshot.data() : null;

    if (!data || now - data.windowStart > WINDOW_MS) {
      tx.set(docRef, { windowStart: now, count: 1 });
      return { limited: false };
    }

    if (data.count >= MAX_ATTEMPTS) {
      return { limited: true, retryAfterMs: WINDOW_MS - (now - data.windowStart) };
    }

    tx.update(docRef, { count: data.count + 1 });
    return { limited: false };
  });
}

export function getRequestIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || req.socket?.remoteAddress || 'unknown';
}

export function sanitizeRateLimitKey(value) {
  const safe = String(value || 'unknown').replace(/[^a-zA-Z0-9_.-]/g, '_');
  return safe.slice(0, 128) || 'unknown';
}
