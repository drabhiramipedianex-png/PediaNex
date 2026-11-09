import { copyFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '..');
const source = resolve(repoRoot, 'emr', 'portal-shared.css');

const targets = [
  // public/ copies are what Vite bundles into each app's build output.
  resolve(repoRoot, 'emr', 'kid', 'public', 'portal-shared.css'),
  // App-root copies let portal.html be opened directly as a local file
  // (file://), where a relative href resolves next to the HTML file
  // itself rather than into public/.
  resolve(repoRoot, 'emr', 'kid', 'portal-shared.css')
];

for (const target of targets) {
  copyFileSync(source, target);
  console.log(`Synced portal-shared.css -> ${target}`);
}
