import { getAdminBucket, getAdminDb } from '../_firebase-admin.js';

// Backs the /rx?i=<id> links sent to parents over WhatsApp. Previously the page
// did a client-side getDoc on clinics/kid/history plus getDownloadURL(), so the
// Firestore and Storage rules had to allow anonymous reads of every record.
//
// Access control is unchanged in substance: whoever holds the link gets the
// prescription. What changes is that they no longer get a database handle with
// it. Only the PDF URL is returned - never the record contents.
//
// The URL is a short-lived signed URL where possible. The stored downloadURL is
// a permanent, non-expiring token, so preferring a signed one means new links
// age out even though previously issued ones keep working.

const CLINIC_NAMESPACE = 'clinics/kid';
const HISTORY_COLLECTION = `${CLINIC_NAMESPACE}/history`;
const SIGNED_URL_TTL_MS = 60 * 60 * 1000;

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

function isAbsoluteUrl(value) {
  return /^https?:/i.test(String(value || '').trim());
}

function normalizeStoragePath(value) {
  const raw = String(value || '').trim();

  if (!raw || isAbsoluteUrl(raw)) {
    return '';
  }

  try {
    return decodeURIComponent(raw).replace(/^\/+/, '');
  } catch {
    return raw.replace(/^\/+/, '');
  }
}

async function resolvePdfUrl(record) {
  const storagePath = normalizeStoragePath(
    record?.storagePath || record?.fullPath || record?.filePath || record?.pdfPath || record?.path
  );

  if (storagePath) {
    try {
      const [url] = await getAdminBucket()
        .file(storagePath)
        .getSignedUrl({ action: 'read', expires: Date.now() + SIGNED_URL_TTL_MS });
      return url;
    } catch (error) {
      // Signing needs a private key on the credential; fall back rather than
      // breaking a parent's link if the deployment cannot sign.
      console.warn(`Signed URL failed for ${storagePath}: ${error.message}`);
    }
  }

  const stored = String(
    record?.downloadURL || record?.downloadUrl || record?.pdfURL || record?.pdfUrl || ''
  ).trim();

  return isAbsoluteUrl(stored) ? stored : '';
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'Method not allowed.' });
    return;
  }

  const prescriptionId = String(req.query?.id || '').trim();

  if (!prescriptionId || prescriptionId.length > 200) {
    sendJson(res, 400, { error: 'This prescription link is missing an ID.' });
    return;
  }

  try {
    const snapshot = await getAdminDb().collection(HISTORY_COLLECTION).doc(prescriptionId).get();

    if (!snapshot.exists) {
      sendJson(res, 404, { error: 'No saved prescription was found for this link.' });
      return;
    }

    if (snapshot.data()?.cancelled === true) {
      sendJson(res, 410, { error: 'This prescription was cancelled by the clinic. Please contact the clinic for the current one.' });
      return;
    }

    const pdfUrl = await resolvePdfUrl(snapshot.data());

    if (!pdfUrl) {
      sendJson(res, 404, { error: 'This prescription record does not have a PDF link.' });
      return;
    }

    sendJson(res, 200, { ok: true, pdfUrl });
  } catch (error) {
    console.error(`Prescription lookup failed: ${error.message}`);
    sendJson(res, 500, { error: 'Something went wrong while opening the prescription.' });
  }
}
