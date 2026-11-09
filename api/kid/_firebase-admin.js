import admin from 'firebase-admin';

const DEFAULT_STORAGE_BUCKET = 'clinci-dr-gunda.firebasestorage.app';
const DEFAULT_PROJECT_ID = 'clinci-dr-gunda';

function parseServiceAccount() {
  let rawValue = String(process.env.KID_FIREBASE_SERVICE_ACCOUNT_KEY || process.env.KID_FIREBASE_SERVICE_ACCOUNT || '').trim();

  if (!rawValue) {
    return null;
  }

  // Environment values arrive in several shapes depending on how they were
  // pasted: raw JSON, base64 of that JSON, or either wrapped in quotes by a
  // shell or a dashboard. The old check was
  //   rawValue.startsWith('{') ? rawValue : base64decode(rawValue)
  // so a value carrying a leading quote or stray whitespace was treated as
  // base64 and decoded into binary garbage. That surfaced as
  // "Unexpected token ... is not valid JSON" and took down every admin route.
  if ((rawValue.startsWith('"') && rawValue.endsWith('"'))
    || (rawValue.startsWith("'") && rawValue.endsWith("'"))) {
    rawValue = rawValue.slice(1, -1).trim();
  }

  const candidates = [];

  if (rawValue.startsWith('{')) {
    candidates.push(rawValue);
  } else {
    // Try base64 first, but keep the raw text as a fallback: a value that is
    // neither is more likely mangled JSON than genuinely base64.
    try {
      candidates.push(Buffer.from(rawValue, 'base64').toString('utf8'));
    } catch {
      // ignored - the raw candidate below still gets a chance
    }

    candidates.push(rawValue);
  }

  let lastError = null;

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);

      if (parsed && typeof parsed === 'object' && parsed.private_key) {
        parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
      }

      return parsed;
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(
    'Invalid Firebase service account credential. Expected the service-account JSON, '
    + 'or base64 of it, in KID_FIREBASE_SERVICE_ACCOUNT_KEY. '
    + `Parsing failed: ${lastError?.message}`
  );
}

export function getAdminApp() {
  if (admin.apps.length) {
    return admin.app();
  }

  const serviceAccount = parseServiceAccount();
  const projectId = String(process.env.KID_FIREBASE_PROJECT_ID || serviceAccount?.project_id || DEFAULT_PROJECT_ID).trim();
  const storageBucket = String(process.env.KID_FIREBASE_STORAGE_BUCKET || DEFAULT_STORAGE_BUCKET).trim();
  const appOptions = { projectId, storageBucket };

  if (serviceAccount) {
    appOptions.credential = admin.credential.cert(serviceAccount);
  } else {
    appOptions.credential = admin.credential.applicationDefault();
  }

  return admin.initializeApp(appOptions);
}

export function getAdminDb() {
  return getAdminApp().firestore();
}

export function getAdminBucket() {
  return getAdminApp().storage().bucket();
}
