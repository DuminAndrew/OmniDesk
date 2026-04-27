/**
 * Pulls prebuilt better-sqlite3 binary for the Electron version we ship.
 * Avoids needing Visual Studio Build Tools on the dev machine.
 */
const path = require('path');
const { spawnSync } = require('child_process');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const pkg = require(path.join(ROOT, 'package.json'));
const electronVersion = (pkg.devDependencies.electron || '^31.7.2').replace(/^[\^~]/, '');

const dir = path.join(ROOT, 'node_modules', 'better-sqlite3');
if (!fs.existsSync(dir)) {
  console.error('Run `npm install` first.');
  process.exit(1);
}

console.log(`→ Fetching better-sqlite3 prebuild for Electron ${electronVersion}…`);
const res = spawnSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['prebuild-install', '-r', 'electron', '-t', electronVersion],
  { cwd: dir, stdio: 'inherit', shell: false }
);

if (res.status !== 0) {
  console.error('prebuild-install failed.');
  process.exit(res.status || 1);
}
console.log('✓ better-sqlite3 ready for Electron');
