const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const VARIANTS = {
  debug: {
    artifactDefaults: ['apk'],
    prefix: 'app-debug',
    metadataName: (tag) => `output-metadata-debug-${tag}.json`
  },
  release: {
    artifactDefaults: ['apk', 'aab'],
    prefix: 'app-release',
    metadataName: (tag) => `output-metadata-release-${tag}.json`
  }
};

function parseArgs(argv) {
  const args = {
    tag: '',
    variant: 'release',
    artifact: 'auto',
    outDir: path.join('dist', 'releases')
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--tag') args.tag = String(argv[++i] || '').trim();
    else if (arg === '--variant') args.variant = String(argv[++i] || '').trim().toLowerCase();
    else if (arg === '--artifact') args.artifact = String(argv[++i] || '').trim().toLowerCase();
    else if (arg === '--out-dir') args.outDir = String(argv[++i] || '').trim() || args.outDir;
    else if (arg === '--help' || arg === '-h') args.help = true;
  }

  return args;
}

function usage() {
  console.log(
    'Usage: node scripts/verify-android-release-artifacts.js [--tag vX.Y.Z] [--variant release|debug] [--artifact auto|apk|aab|all] [--out-dir dist/releases]'
  );
}

function normalizeTag(tag) {
  const raw = String(tag || '').trim();
  if (!raw) return '';
  return raw.startsWith('v') ? raw : `v${raw}`;
}

function semverFromTag(tag) {
  const match = String(tag || '').trim().match(/^v?(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3])
  };
}

function androidVersionCode(version) {
  return version.major * 10000 + version.minor * 100 + version.patch;
}

function sha256File(filePath) {
  const bytes = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function resolveArtifacts(variant, artifactFlag) {
  if (artifactFlag === 'auto' || !artifactFlag) {
    return variant.artifactDefaults.slice();
  }
  if (artifactFlag === 'all') {
    return ['apk', 'aab'];
  }
  if (artifactFlag !== 'apk' && artifactFlag !== 'aab') {
    fail(`Unsupported --artifact "${artifactFlag}". Use auto|apk|aab|all.`);
  }
  return [artifactFlag];
}

function verifyFileChecksum(filePath, checksumPath) {
  if (!fs.existsSync(filePath)) fail(`Missing artifact: ${filePath}`);
  if (!fs.existsSync(checksumPath)) fail(`Missing checksum file: ${checksumPath}`);

  const checksumLine = fs.readFileSync(checksumPath, 'utf8').trim();
  const match = checksumLine.match(/^([a-f0-9]{64})\s{2}(.+)$/i);
  if (!match) {
    fail(`Invalid checksum format in ${checksumPath}`);
  }
  const expectedHash = match[1].toLowerCase();
  const expectedName = match[2].trim();
  const actualName = path.basename(filePath);

  if (expectedName !== actualName) {
    fail(`Checksum filename mismatch in ${checksumPath}: expected ${actualName}, got ${expectedName}`);
  }

  const actualHash = sha256File(filePath);
  if (actualHash !== expectedHash) {
    fail(`Checksum mismatch for ${filePath}: expected ${expectedHash}, got ${actualHash}`);
  }
}

function verifyApkHasEmbeddedBundle(apkPath) {
  const unzip = spawnSync('unzip', ['-l', apkPath], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  if (unzip.error) {
    fail(`Failed to run unzip: ${unzip.error.message}`);
  }
  if (unzip.status !== 0) {
    fail(`Failed to inspect APK with unzip: ${unzip.stderr || unzip.stdout}`);
  }
  if (!String(unzip.stdout).includes('assets/index.android.bundle')) {
    fail(`APK is missing embedded JS bundle: ${apkPath}`);
  }
}

function verifyMetadata(metadataPath, tag, variantName) {
  if (!fs.existsSync(metadataPath)) fail(`Missing output metadata: ${metadataPath}`);

  const raw = fs.readFileSync(metadataPath, 'utf8');
  let metadata;
  try {
    metadata = JSON.parse(raw);
  } catch (error) {
    fail(`Invalid JSON in ${metadataPath}: ${error.message}`);
  }

  if (metadata.variantName !== variantName) {
    fail(`Metadata variant mismatch in ${metadataPath}: expected ${variantName}, got ${metadata.variantName}`);
  }

  const version = semverFromTag(tag);
  if (!version) return;

  const output = Array.isArray(metadata.elements) ? metadata.elements[0] : null;
  if (!output) fail(`Missing metadata elements in ${metadataPath}`);

  const expectedVersionName = `${version.major}.${version.minor}.${version.patch}`;
  const expectedVersionCode = androidVersionCode(version);

  if (output.versionName !== expectedVersionName) {
    fail(`Metadata versionName mismatch in ${metadataPath}: expected ${expectedVersionName}, got ${output.versionName}`);
  }
  if (Number(output.versionCode) !== expectedVersionCode) {
    fail(`Metadata versionCode mismatch in ${metadataPath}: expected ${expectedVersionCode}, got ${output.versionCode}`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    process.exit(0);
  }

  if (!Object.prototype.hasOwnProperty.call(VARIANTS, args.variant)) {
    fail(`Unsupported --variant "${args.variant}". Use release|debug.`);
  }

  const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));
  const tag = normalizeTag(args.tag || pkg.version || 'v0.0.0');
  const variant = VARIANTS[args.variant];
  const artifacts = resolveArtifacts(variant, args.artifact);
  const releaseDir = path.resolve(process.cwd(), args.outDir, tag);

  for (const artifact of artifacts) {
    const artifactPath = path.join(releaseDir, `${variant.prefix}-${tag}.${artifact}`);
    const checksumPath = `${artifactPath}.sha256`;
    verifyFileChecksum(artifactPath, checksumPath);
    if (args.variant === 'release' && artifact === 'apk') {
      verifyApkHasEmbeddedBundle(artifactPath);
    }
  }

  verifyMetadata(path.join(releaseDir, variant.metadataName(tag)), tag, args.variant);
  console.log(`Release artifacts verified for ${tag} (${args.variant})`);
}

try {
  main();
} catch (error) {
  fail(error.message || String(error));
}
