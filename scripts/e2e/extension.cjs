// The built extension, copied with the optional platform access already granted (a browser grants it only on a click).
const fs = require('fs');
const os = require('os');
const path = require('path');

const BUILT = path.resolve(__dirname, '../../.output/chrome-mv3');

function extensionCopy() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dueboard-e2e-'));
  fs.cpSync(BUILT, dir, { recursive: true });
  const m = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  m.host_permissions.push('https://*.aleks.com/*', 'https://*.wwnorton.com/*', 'https://*.wiley.com/*', 'https://*.wileyplus.com/*');
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(m));
  return dir;
}

module.exports = { BUILT, extensionCopy };
