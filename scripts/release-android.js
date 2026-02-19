const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const SIGNING_KEYS = [
  'REPATH_UPLOAD_STORE_FILE',
  'REPATH_UPLOAD_STORE_PASSWORD',
  'REPATH_UPLOAD_KEY_ALIAS',
  'REPATH_UPLOAD_KEY_PASSWORD'
];

const VARIANTS = {
  debug: {
    artifactDefaults: ['apk'],
    artifacts: {
      apk: {
        gradleTask: 'assembleDebug',
        inputPath: path.join('android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk'),
        outputName: (tag) => `app-debug-${tag}.apk`
      }
    },
    metadataIn: path.join('android', 'app', 'build', 'outputs', 'apk', 'debug', 'output-metadata.json')
  },
  release: {
    artifactDefaults: ['apk', 'aab'],
    artifacts: {
      apk: {
        gradleTask: 'assembleRelease',
        inputPath: path.join('android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk'),
        outputName: (tag) => `app-release-${tag}.apk`
      },
      aab: {
        gradleTask: 'bundleRelease',
        inputPath: path.join('android', 'app', 'build', 'outputs', 'bundle', 'release', 'app-release.aab'),
        outputName: (tag) => `app-release-${tag}.aab`
      }
    },
    metadataIn: path.join('android', 'app', 'build', 'outputs', 'apk', 'release', 'output-metadata.json')
  }
};

function parseArgs(argv) {
  const args = {
    tag: '',
    variant: 'release',
    artifact: 'auto',
    outDir: path.join('dist', 'releases'),
    notesFile: 'release-notes.md',
    title: '',
    skipBuild: false,
    publish: false,
    allowDebugSigning: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--tag') args.tag = String(argv[++i] || '').trim();
    else if (arg === '--variant') args.variant = String(argv[++i] || '').trim().toLowerCase();
    else if (arg === '--artifact') args.artifact = String(argv[++i] || '').trim().toLowerCase();
    else if (arg === '--out-dir') args.outDir = String(argv[++i] || '').trim() || args.outDir;
    else if (arg === '--notes-file') args.notesFile = String(argv[++i] || '').trim() || args.notesFile;
    else if (arg === '--title') args.title = String(argv[++i] || '').trim();
    else if (arg === '--skip-build') args.skipBuild = true;
    else if (arg === '--publish') args.publish = true;
    else if (arg === '--allow-debug-signing') args.allowDebugSigning = true;
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
  return spawnSync(cmd, cmdArgs, {
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    cwd: options.cwd || process.cwd(),
    env: options.env || process.env
  });
}

function normalizeTag(tag) {
  const raw = String(tag || '').trim();
  if (!raw) return '';
  return raw.startsWith('v') ? raw : `v${raw}`;
}

function semverFromTag(tag) {
  const match = String(tag || '').trim().match(/^v?(\d+)\.(\d+)\.(\d+)$/);
  if (!match) {
    return null;
  }
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

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function usage() {
  console.log(
    'Usage: node scripts/release-android.js [--tag vX.Y.Z] [--variant release|debug] [--artifact auto|apk|aab|all] [--out-dir dist/releases] [--notes-file release-notes.md] [--title "RePath Mobile vX.Y.Z"] [--skip-build] [--publish] [--allow-debug-signing]'
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

function resolveArtifacts(variant, artifactFlag) {
  if (artifactFlag === 'auto' || !artifactFlag) {
    return variant.artifactDefaults.slice();
  }
  if (artifactFlag === 'all') {
    return Object.keys(variant.artifacts);
  }
  if (!variant.artifacts[artifactFlag]) {
    console.error(`Artifact "${artifactFlag}" is not supported for this variant.`);
    process.exit(1);
  }
  return [artifactFlag];
}

function collectSigningFromEnv() {
  const out = {};
  for (const key of SIGNING_KEYS) {
    out[key] = String(process.env[key] || '').trim();
  }
  return out;
}

function hasSigning(signing) {
  return SIGNING_KEYS.every((key) => Boolean(signing[key]));
}

function missingSigningKeys(signing) {
  return SIGNING_KEYS.filter((key) => !signing[key]);
}

function gradlePropArgs(props) {
  return Object.entries(props).map(([key, value]) => `-P${key}=${value}`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    process.exit(0);
  }

  if (!Object.prototype.hasOwnProperty.call(VARIANTS, args.variant)) {
    console.error(`Unsupported --variant "${args.variant}". Use "release" or "debug".`);
    process.exit(1);
  }

  const variant = VARIANTS[args.variant];
  const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));
  const tag = normalizeTag(args.tag || pkg.version || 'v0.0.0');
  const title = args.title || `RePath Mobile ${tag}`;
  const notesFilePath = path.resolve(process.cwd(), args.notesFile);

  const semver = semverFromTag(tag);
  if (!semver) {
    console.error(`Tag "${tag}" is not semver. Expected format like v0.1.3.`);
    process.exit(1);
  }

  const selectedArtifacts = resolveArtifacts(variant, args.artifact);
  const releaseDir = path.resolve(process.cwd(), args.outDir, tag);
  const signing = collectSigningFromEnv();
  const missingSigning = missingSigningKeys(signing);
  const signingReady = hasSigning(signing);

  if (args.variant === 'release' && !signingReady && !args.allowDebugSigning) {
    console.error(
      `Release signing not configured. Missing: ${missingSigning.join(', ')}.\n` +
        'Provide signing env vars or pass --allow-debug-signing for local non-production builds.'
    );
    process.exit(1);
  }

  if (signingReady && !fs.existsSync(signing.REPATH_UPLOAD_STORE_FILE)) {
    console.error(`REPATH_UPLOAD_STORE_FILE does not exist: ${signing.REPATH_UPLOAD_STORE_FILE}`);
    process.exit(1);
  }

  const gradleProps = {
    REPATH_ANDROID_VERSION_NAME: `${semver.major}.${semver.minor}.${semver.patch}`,
    REPATH_ANDROID_VERSION_CODE: String(androidVersionCode(semver))
  };

  if (args.variant === 'release') {
    if (signingReady) {
      for (const key of SIGNING_KEYS) {
        gradleProps[key] = signing[key];
      }
    } else if (args.allowDebugSigning) {
      gradleProps.REPATH_ALLOW_DEBUG_SIGNING = 'true';
    }
  }

  if (!args.skipBuild) {
    const tasks = Array.from(
      new Set(selectedArtifacts.map((artifact) => variant.artifacts[artifact].gradleTask))
    );
    run(
      './gradlew',
      [...tasks, ...gradlePropArgs(gradleProps)],
      { cwd: path.join(process.cwd(), 'android') }
    );
  }

  ensureDir(releaseDir);

  const uploadPaths = [];
  for (const artifact of selectedArtifacts) {
    const descriptor = variant.artifacts[artifact];
    const input = descriptor.inputPath;
    const output = path.join(releaseDir, descriptor.outputName(tag));
    const shaOut = `${output}.sha256`;

    if (!fs.existsSync(input)) {
      console.error(`Missing artifact: ${input}`);
      process.exit(1);
    }

    fs.copyFileSync(input, output);
    const sha = sha256File(output);
    fs.writeFileSync(shaOut, `${sha}  ${path.basename(output)}\n`);

    console.log(`Wrote ${output}`);
    console.log(`Wrote ${shaOut}`);

    uploadPaths.push(output, shaOut);
  }

  if (fs.existsSync(variant.metadataIn)) {
    const metaOut = path.join(releaseDir, `output-metadata-${args.variant}-${tag}.json`);
    fs.copyFileSync(variant.metadataIn, metaOut);
    console.log(`Wrote ${metaOut}`);
    uploadPaths.push(metaOut);
  }

  if (!args.publish) {
    return;
  }

  ensureReleaseExists(tag, title, notesFilePath);
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
