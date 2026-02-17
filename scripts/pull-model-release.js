#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");
const crypto = require("crypto");

const MODEL_BASENAME = "yolo-repath";

function usage() {
  console.log(
    "Usage: node scripts/pull-model-release.js [--version 1.2.3|v1.2.3|latest] [--repo krispeterson/repath-model] [--out-dir assets/models] [--config assets/models/model-release.json] [--skip-verify]"
  );
}

function parseArgs(argv) {
  const args = {
    version: "",
    repo: "",
    outDir: path.join("assets", "models"),
    config: path.join("assets", "models", "model-release.json"),
    skipVerify: false,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--version") {
      args.version = argv[++i];
    } else if (arg === "--repo") {
      args.repo = argv[++i];
    } else if (arg === "--out-dir") {
      args.outDir = argv[++i];
    } else if (arg === "--config") {
      args.config = argv[++i];
    } else if (arg === "--skip-verify") {
      args.skipVerify = true;
    } else if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    } else {
      throw new Error(`Unknown arg: ${arg}`);
    }
  }

  return args;
}

function readConfig(configPath) {
  const fullPath = path.resolve(configPath);
  if (!fs.existsSync(fullPath)) return {};
  try {
    const parsed = JSON.parse(fs.readFileSync(fullPath, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (_error) {
    return {};
  }
}

function normalizeRequestedVersion(version) {
  const raw = String(version || "").trim();
  if (!raw) return "";
  if (raw === "latest") return "latest";
  if (/^v\d+\.\d+\.\d+$/.test(raw)) return raw;
  if (/^\d+\.\d+\.\d+$/.test(raw)) return `v${raw}`;
  throw new Error(`Invalid --version '${raw}'. Use latest, X.Y.Z, or vX.Y.Z.`);
}

function requestRaw(url, headers, redirectCount) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https:") ? https : http;
    const req = lib.request(
      url,
      {
        method: "GET",
        headers,
      },
      (res) => {
        const status = res.statusCode || 0;
        if ([301, 302, 303, 307, 308].includes(status)) {
          if (redirectCount >= 6) {
            reject(new Error(`Too many redirects for ${url}`));
            return;
          }
          const location = res.headers.location;
          if (!location) {
            reject(new Error(`Redirect without location for ${url}`));
            return;
          }
          const nextUrl = location.startsWith("http") ? location : new URL(location, url).toString();
          resolve(requestRaw(nextUrl, headers, redirectCount + 1));
          return;
        }

        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          resolve({
            status,
            headers: res.headers,
            body: Buffer.concat(chunks),
          });
        });
      }
    );

    req.on("error", reject);
    req.end();
  });
}

async function requestJson(url, token) {
  const headers = {
    "User-Agent": "repath-mobile-model-puller",
    Accept: "application/vnd.github+json",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await requestRaw(url, headers, 0);
  if (res.status < 200 || res.status >= 300) {
    const bodyText = res.body ? String(res.body) : "";
    throw new Error(`GitHub API request failed (${res.status}) for ${url}: ${bodyText.slice(0, 300)}`);
  }
  return JSON.parse(String(res.body));
}

async function downloadBytes(url, token) {
  const headers = {
    "User-Agent": "repath-mobile-model-puller",
    Accept: "application/octet-stream",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await requestRaw(url, headers, 0);
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Download failed (${res.status}) for ${url}`);
  }

  return res.body;
}

function writeFile(outPath, contents) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, contents);
}

function findAsset(assets, names) {
  const map = new Map();
  assets.forEach((asset) => {
    if (asset && typeof asset.name === "string") {
      map.set(asset.name, asset);
    }
  });
  for (const name of names) {
    if (map.has(name)) return map.get(name);
  }
  return null;
}

async function resolveRelease(repo, version, token) {
  const apiBase = `https://api.github.com/repos/${repo}`;
  if (version === "latest") {
    return requestJson(`${apiBase}/releases/latest`, token);
  }

  try {
    return await requestJson(`${apiBase}/releases/tags/${encodeURIComponent(version)}`, token);
  } catch (error) {
    if (version.startsWith("v")) {
      const noV = version.slice(1);
      return requestJson(`${apiBase}/releases/tags/${encodeURIComponent(noV)}`, token);
    }
    throw error;
  }
}

function sha256Of(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function parseManifest(buffer, manifestPathForError) {
  try {
    return JSON.parse(String(buffer));
  } catch (error) {
    throw new Error(`Invalid release manifest JSON (${manifestPathForError}): ${error.message}`);
  }
}

function normalizeHex(value) {
  return String(value || "").trim().toLowerCase();
}

function findManifestArtifact(manifest, filename) {
  const artifacts = Array.isArray(manifest && manifest.artifacts) ? manifest.artifacts : [];
  return artifacts.find((artifact) => artifact && artifact.filename === filename) || null;
}

function verifyManifestChecksum(manifest, releaseAssetName, bytes, label) {
  const artifact = findManifestArtifact(manifest, releaseAssetName);
  if (!artifact) {
    throw new Error(`Release manifest is missing checksum entry for ${label} asset: ${releaseAssetName}`);
  }

  const expected = normalizeHex(artifact.sha256);
  if (!expected) {
    throw new Error(`Release manifest checksum entry for ${releaseAssetName} is missing sha256.`);
  }

  const actual = sha256Of(bytes);
  if (actual !== expected) {
    throw new Error(`Checksum mismatch for ${label} asset ${releaseAssetName}. Expected ${expected}, got ${actual}.`);
  }

  return {
    filename: releaseAssetName,
    sha256: actual,
    bytes: bytes.length,
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const config = readConfig(args.config);

  const repo = String(args.repo || config.repo || "krispeterson/repath-model").trim();
  if (!repo) {
    throw new Error("Missing repo. Provide --repo or set repo in config.");
  }

  const requestedVersion = normalizeRequestedVersion(args.version || config.version || "latest");
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";

  const release = await resolveRelease(repo, requestedVersion || "latest", token);
  const tag = String(release.tag_name || "").trim();
  if (!tag) throw new Error("Release missing tag_name");

  const assets = Array.isArray(release.assets) ? release.assets : [];
  const modelAsset = findAsset(assets, [`${MODEL_BASENAME}-${tag}.tflite`, `${MODEL_BASENAME}.tflite`]);
  const labelsAsset = findAsset(assets, [`${MODEL_BASENAME}-${tag}.labels.json`, `${MODEL_BASENAME}.labels.json`]);
  const manifestAsset = findAsset(assets, [`release-manifest-${tag}.json`, "release-manifest.json"]);

  if (!modelAsset) {
    throw new Error(`Could not find model asset in release ${tag}`);
  }
  if (!labelsAsset) {
    throw new Error(`Could not find labels asset in release ${tag}`);
  }

  const outDir = path.resolve(args.outDir);
  const modelOut = path.join(outDir, `${MODEL_BASENAME}.tflite`);
  const labelsOut = path.join(outDir, `${MODEL_BASENAME}.labels.json`);
  const manifestOut = path.join(outDir, `${MODEL_BASENAME}.release-manifest.json`);
  const metadataOut = path.join(outDir, "active-model.release.json");

  const modelBytes = await downloadBytes(modelAsset.browser_download_url, token);
  const labelsBytes = await downloadBytes(labelsAsset.browser_download_url, token);

  let manifestBytes = null;
  let manifest = null;
  let verification = {
    enabled: !args.skipVerify,
    manifest_required: !args.skipVerify,
    manifest_present: false,
    verified: false,
    model: null,
    labels: null,
  };

  if (manifestAsset && manifestAsset.browser_download_url) {
    manifestBytes = await downloadBytes(manifestAsset.browser_download_url, token);
    verification.manifest_present = true;
    manifest = parseManifest(manifestBytes, manifestAsset.name);
  }

  if (!args.skipVerify) {
    if (!manifest) {
      throw new Error(
        `Release manifest asset is required for checksum verification. Missing in release ${tag}. Re-run with --skip-verify only if you trust this source.`
      );
    }

    verification.model = verifyManifestChecksum(manifest, modelAsset.name, modelBytes, "model");
    verification.labels = verifyManifestChecksum(manifest, labelsAsset.name, labelsBytes, "labels");
    verification.verified = true;
  }

  writeFile(modelOut, modelBytes);
  writeFile(labelsOut, labelsBytes);
  if (manifestBytes) {
    writeFile(manifestOut, manifestBytes);
  }

  const metadata = {
    pulled_at: new Date().toISOString(),
    repo,
    requested_version: requestedVersion || "latest",
    release_tag: tag,
    release_name: release.name || null,
    model_asset: modelAsset.name,
    labels_asset: labelsAsset.name,
    model_path: path.relative(process.cwd(), modelOut).split(path.sep).join("/"),
    labels_path: path.relative(process.cwd(), labelsOut).split(path.sep).join("/"),
    manifest_path: fs.existsSync(manifestOut)
      ? path.relative(process.cwd(), manifestOut).split(path.sep).join("/")
      : null,
    verification,
  };

  fs.writeFileSync(metadataOut, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");

  console.log("Model release pull complete");
  console.log(JSON.stringify(metadata, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
