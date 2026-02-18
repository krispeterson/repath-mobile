const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

function parseArgs(argv) {
  const args = {
    tag: '',
    outDir: path.join('dist', 'releases'),
    notesFile: 'release-notes.md',
    title: '',
    skipBuild: false,
    publish: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--tag') args.tag = String(argv[++i] || '').trim();
    else if (arg === '--out-dir') args.outDir = String(argv[++i] || '').trim() || args.outDir;
    else if (arg === '--notes-file') args.notesFile = String(argv[++i] || '').trim() || args.notesFile;
    else if (arg === '--title') args.title = String(argv[++i] || '').trim();
    else if (arg === '--skip-build') args.skipBuild = true;
    else if (arg === '--publish') args.publish = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
  }

  return args;
}

function run(cmd, cmdArgs, options = {}) {
  const result = spawnSync(cmd, cmdArgs, {
    stdio: 'inherit',
    cwd: options.cwd || process.cwd(),
    env: options.env || process.env
  });
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

function runCapture(cmd, cmdArgs, options = {}) {
  const result = spawnSync(cmd, cmdArgs, {
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    cwd: options.cwd || process.cwd(),
    env: options.env || process.env
  });
  return result;
}

function normalizeTag(tag) {
  const raw = String(tag || '').trim();
  if (!raw) return '';
  return raw.startsWith('v') ? raw : `v${raw}`;
}

function sha256File(filePath) {
  const bytes = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function usage() {
  console.log(
    'Usage: node scripts/release-android-debug.js [--tag vX.Y.Z] [--out-dir dist/releases] [--notes-file release-notes.md] [--title "RePath Mobile vX.Y.Z"] [--skip-build] [--publish]'
  );
}

function ensureReleaseExists(tag, title, notesFilePath) {
  const view = runCapture('gh', ['release', 'view', tag, '--json', 'tagName']);
  if (view.status === 0) return;

  if (fs.existsSync(notesFilePath)) {
    run('gh', ['release', 'create', tag, '--title', title, '--notes-file', notesFilePath]);
    return;
  }

  run('gh', ['release', 'create', tag, '--title', title, '--generate-notes']);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    process.exit(0);
  }

  const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));
  const tag = normalizeTag(args.tag || pkg.version || 'v0.0.0');
  const title = args.title || `RePath Mobile ${tag}`;
  const notesFilePath = path.resolve(process.cwd(), args.notesFile);

  const apkIn = path.join('android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
  const metaIn = path.join('android', 'app', 'build', 'outputs', 'apk', 'debug', 'output-metadata.json');
  const releaseDir = path.resolve(process.cwd(), args.outDir, tag);
  const apkOut = path.join(releaseDir, `app-debug-${tag}.apk`);
  const shaOut = path.join(releaseDir, `app-debug-${tag}.apk.sha256`);
  const metaOut = path.join(releaseDir, `output-metadata-${tag}.json`);

  if (!args.skipBuild) {
    run('./gradlew', ['assembleDebug'], { cwd: path.join(process.cwd(), 'android') });
  }

  if (!fs.existsSync(apkIn)) {
    console.error(`Missing APK: ${apkIn}`);
    process.exit(1);
  }

  ensureDir(releaseDir);
  fs.copyFileSync(apkIn, apkOut);

  if (fs.existsSync(metaIn)) {
    fs.copyFileSync(metaIn, metaOut);
  }

  const apkSha = sha256File(apkOut);
  fs.writeFileSync(shaOut, `${apkSha}  ${path.basename(apkOut)}\n`);

  console.log(`Wrote ${apkOut}`);
  console.log(`Wrote ${shaOut}`);
  if (fs.existsSync(metaOut)) {
    console.log(`Wrote ${metaOut}`);
  }

  if (!args.publish) {
    return;
  }

  ensureReleaseExists(tag, title, notesFilePath);

  const uploadPaths = [apkOut, shaOut];
  if (fs.existsSync(metaOut)) uploadPaths.push(metaOut);
  run('gh', ['release', 'upload', tag, ...uploadPaths, '--clobber']);

  if (fs.existsSync(notesFilePath)) {
    run('gh', ['release', 'edit', tag, '--title', title, '--notes-file', notesFilePath]);
  }
}

try {
  main();
} catch (error) {
  console.error(error.message || String(error));
  process.exit(1);
}
