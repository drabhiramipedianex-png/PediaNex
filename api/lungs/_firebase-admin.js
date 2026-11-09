import admin from 'firebase-admin';

const DEFAULT_STORAGE_BUCKET = 'clinci-dr-gunda.firebasestorage.app';
const DEFAULT_PROJECT_ID = 'clinci-dr-gunda';

function parseServiceAccount() {
  const rawValue = String(process.env.LUNGS_FIREBASE_SERVICE_ACCOUNT_KEY || process.env.LUNGS_FIREBASE_SERVICE_ACCOUNT || '').trim();

  if (!rawValue) {
    return null;
  }

  try {
    const decoded = rawValue.startsWith('{')
      ? rawValue
      : Buffer.from(rawValue, 'base64').toString('utf8');
    const parsed = JSON.parse(decoded);

    if (parsed.private_key) {
      parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
    }

    return parsed;
  } catch (error) {
    throw new Error(`Invalid Firebase service account JSON: ${error.message}`);
  }
}

export function getAdminApp() {
  const existingApp = admin.apps.find((app) => app?.name === 'lungs');

  if (existingApp) {
    return existingApp;
  }

  const serviceAccount = parseServiceAccount();
  const projectId = String(process.env.LUNGS_FIREBASE_PROJECT_ID || serviceAccount?.project_id || DEFAULT_PROJECT_ID).trim();
  const storageBucket = String(process.env.LUNGS_FIREBASE_STORAGE_BUCKET || DEFAULT_STORAGE_BUCKET).trim();
  const appOptions = { projectId, storageBucket };

  if (serviceAccount) {
    appOptions.credential = admin.credential.cert(serviceAccount);
  } else {
    appOptions.credential = admin.credential.applicationDefault();
  }

  return admin.initializeApp(appOptions, 'lungs');
}

export function getAdminDb() {
  return getAdminApp().firestore();
}

export function getAdminBucket() {
  return getAdminApp().storage().bucket();
}
