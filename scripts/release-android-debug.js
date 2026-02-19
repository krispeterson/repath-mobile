const path = require('path');
const { spawnSync } = require('child_process');

const args = process.argv.slice(2);
const cmdArgs = [path.join(__dirname, 'release-android.js'), '--variant', 'debug', ...args];

const result = spawnSync(process.execPath, cmdArgs, {
  stdio: 'inherit',
  cwd: process.cwd(),
  env: process.env
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status || 0);
