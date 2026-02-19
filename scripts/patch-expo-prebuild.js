const fs = require('fs');
const path = require('path');

const MIN_ANDROID_GRADLE_PLUGIN_VERSION = '8.4.2';
const MIN_KOTLIN_VERSION = '1.9.24';
const MIN_GRADLE_VERSION = '8.6';
const RELEASE_SIGNING_BLOCK_START = '// repath-release-signing:start';
const RELEASE_SIGNING_BLOCK_END = '// repath-release-signing:end';

const root = process.cwd();
const androidBuild = path.join(root, 'android', 'build.gradle');
const androidAppBuild = path.join(root, 'android', 'app', 'build.gradle');
const gradleWrapper = path.join(root, 'android', 'gradle', 'wrapper', 'gradle-wrapper.properties');

function readFileOrThrow(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Expected file not found: ${filePath}. Did you run \"npx expo prebuild\" first?`);
  }
  return fs.readFileSync(filePath, 'utf8');
}

function writeIfChanged(filePath, next, label) {
  const prev = fs.readFileSync(filePath, 'utf8');
  if (prev === next) {
    console.log(`[patch-prebuild] ${label}: no changes needed`);
    return false;
  }
  fs.writeFileSync(filePath, next, 'utf8');
  console.log(`[patch-prebuild] ${label}: updated`);
  return true;
}

function parseVersion(value) {
  return value.split('.').map((part) => parseInt(part, 10));
}

function isLessThan(a, b) {
  const av = parseVersion(a);
  const bv = parseVersion(b);
  const len = Math.max(av.length, bv.length);
  for (let i = 0; i < len; i += 1) {
    const ai = av[i] ?? 0;
    const bi = bv[i] ?? 0;
    if (ai < bi) return true;
    if (ai > bi) return false;
  }
  return false;
}

function patchAndroidBuild() {
  const contents = readFileOrThrow(androidBuild);
  let updated = contents;

  const agpRegex = /com\.android\.tools\.build:gradle:([0-9.]+)/g;
  const kotlinRegex = /org\.jetbrains\.kotlin:kotlin-gradle-plugin:([0-9.]+)/g;

  const agpMatches = [...updated.matchAll(agpRegex)];
  const kotlinMatches = [...updated.matchAll(kotlinRegex)];

  if (agpMatches.length === 0 && kotlinMatches.length === 0) {
    return writeIfChanged(androidBuild, updated, 'android/build.gradle');
  }

  if (agpMatches.length > 0) {
    const currentAgp = agpMatches[0][1];
    if (isLessThan(currentAgp, MIN_ANDROID_GRADLE_PLUGIN_VERSION)) {
      updated = updated.replace(agpRegex, `com.android.tools.build:gradle:${MIN_ANDROID_GRADLE_PLUGIN_VERSION}`);
    }
  }

  if (kotlinMatches.length > 0) {
    const currentKotlin = kotlinMatches[0][1];
    if (isLessThan(currentKotlin, MIN_KOTLIN_VERSION)) {
      updated = updated.replace(kotlinRegex, `org.jetbrains.kotlin:kotlin-gradle-plugin:${MIN_KOTLIN_VERSION}`);
    }
  }

  return writeIfChanged(androidBuild, updated, 'android/build.gradle');
}

function patchGradleWrapper() {
  const contents = readFileOrThrow(gradleWrapper);
  const distRegex = /distributionUrl=.*gradle-([0-9.]+)-(all|bin)\.zip/;
  const match = contents.match(distRegex);

  if (!match) {
    throw new Error('[patch-prebuild] Could not find Gradle distributionUrl to patch in gradle-wrapper.properties.');
  }

  const currentGradle = match[1];
  if (!isLessThan(currentGradle, MIN_GRADLE_VERSION)) {
    return writeIfChanged(gradleWrapper, contents, 'android/gradle/wrapper/gradle-wrapper.properties');
  }

  const suffix = match[2];
  const updated = contents.replace(distRegex, `distributionUrl=https\\://services.gradle.org/distributions/gradle-${MIN_GRADLE_VERSION}-${suffix}.zip`);

  return writeIfChanged(gradleWrapper, updated, 'android/gradle/wrapper/gradle-wrapper.properties');
}

function findBlock(contents, headerRegex, label) {
  const headerMatch = contents.match(headerRegex);
  if (!headerMatch || typeof headerMatch.index !== 'number') {
    throw new Error(`[patch-prebuild] Could not find expected ${label} block in android/app/build.gradle.`);
  }
  const start = headerMatch.index;
  let depth = 0;
  let opened = false;
  for (let i = start; i < contents.length; i += 1) {
    const ch = contents[i];
    if (ch === '{') {
      depth += 1;
      opened = true;
      continue;
    }
    if (ch === '}') {
      depth -= 1;
      if (opened && depth === 0) {
        return {
          start,
          end: i + 1,
          block: contents.slice(start, i + 1)
        };
      }
    }
  }
  throw new Error(`[patch-prebuild] Could not parse ${label} block in android/app/build.gradle.`);
}

function replaceBlock(contents, headerRegex, label, patchFn) {
  const found = findBlock(contents, headerRegex, label);
  const patched = patchFn(found.block);
  return contents.slice(0, found.start) + patched + contents.slice(found.end);
}

function patchAndroidAppBuild() {
  const contents = readFileOrThrow(androidAppBuild);
  let updated = contents;

  const jscBlockRegex = /^\s*def\s+jscFlavor\s*=\s*['"][^'"]+['"]\s*$/m;
  const jscBlockMatch = updated.match(jscBlockRegex);
  if (!jscBlockMatch) {
    throw new Error('[patch-prebuild] Could not find expected jscFlavor block in android/app/build.gradle.');
  }
  const jscBlock = jscBlockMatch[0];
  const jscBlockIndex = jscBlockMatch.index;
  const androidBlockMatch = updated.match(/^\s*android\s*\{/m);
  const androidBlockIndex = androidBlockMatch && typeof androidBlockMatch.index === 'number'
    ? androidBlockMatch.index
    : -1;
  const signingVars = `${jscBlock}
def repathVersionCode = (findProperty('REPATH_ANDROID_VERSION_CODE') ?: '1').toString().toInteger()
def repathVersionName = (findProperty('REPATH_ANDROID_VERSION_NAME') ?: '0.0.1').toString()

def uploadStoreFile = (findProperty('REPATH_UPLOAD_STORE_FILE') ?: '').toString().trim()
def uploadStorePassword = (findProperty('REPATH_UPLOAD_STORE_PASSWORD') ?: '').toString().trim()
def uploadKeyAlias = (findProperty('REPATH_UPLOAD_KEY_ALIAS') ?: '').toString().trim()
def uploadKeyPassword = (findProperty('REPATH_UPLOAD_KEY_PASSWORD') ?: '').toString().trim()
def allowDebugReleaseSigning = (findProperty('REPATH_ALLOW_DEBUG_SIGNING') ?: 'false').toString().toBoolean()
def hasUploadSigning = uploadStoreFile && uploadStorePassword && uploadKeyAlias && uploadKeyPassword
def requestedTaskNames = gradle.startParameter.taskNames.collect { it.toLowerCase() }
def enforceReleaseSigning = requestedTaskNames.any { it.contains('release') }`;

  if (androidBlockIndex > jscBlockIndex) {
    const beforeAndroid = updated.slice(0, androidBlockIndex);
    const cleanedBeforeAndroid = beforeAndroid
      .replace(/^def\s+repathVersionCode\s*=.*$/gm, '')
      .replace(/^def\s+repathVersionName\s*=.*$/gm, '')
      .replace(/^def\s+uploadStoreFile\s*=.*$/gm, '')
      .replace(/^def\s+uploadStorePassword\s*=.*$/gm, '')
      .replace(/^def\s+uploadKeyAlias\s*=.*$/gm, '')
      .replace(/^def\s+uploadKeyPassword\s*=.*$/gm, '')
      .replace(/^def\s+allowDebugReleaseSigning\s*=.*$/gm, '')
      .replace(/^def\s+hasUploadSigning\s*=.*$/gm, '')
      .replace(/^def\s+requestedTaskNames\s*=.*$/gm, '')
      .replace(/^def\s+enforceReleaseSigning\s*=.*$/gm, '')
      .replace(/\n{3,}/g, '\n\n');
    updated = cleanedBeforeAndroid + updated.slice(androidBlockIndex);
  }

  const freshJscMatch = updated.match(jscBlockRegex);
  if (!freshJscMatch) {
    throw new Error('[patch-prebuild] Could not locate jscFlavor after cleanup in android/app/build.gradle.');
  }
  const freshJscIndex = freshJscMatch.index;
  const freshAndroidMatch = updated.match(/^\s*android\s*\{/m);
  const freshAndroidIndex = freshAndroidMatch && typeof freshAndroidMatch.index === 'number'
    ? freshAndroidMatch.index
    : -1;

  const betweenJscAndAndroid =
    freshAndroidIndex > freshJscIndex
      ? updated.slice(freshJscIndex, freshAndroidIndex)
      : '';

  const needsSigningVars = !/^\s*def\s+repathVersionCode\s*=.*/m.test(betweenJscAndAndroid);
  if (needsSigningVars) {
    updated = updated.replace(jscBlockRegex, signingVars);
  }
  if (!needsSigningVars && !/^\s*def\s+enforceReleaseSigning\s*=.*/m.test(betweenJscAndAndroid)) {
    updated = updated.replace(
      /^def\s+hasUploadSigning\s*=.*$/m,
      "def hasUploadSigning = uploadStoreFile && uploadStorePassword && uploadKeyAlias && uploadKeyPassword\ndef requestedTaskNames = gradle.startParameter.taskNames.collect { it.toLowerCase() }\ndef enforceReleaseSigning = requestedTaskNames.any { it.contains('release') }"
    );
  }

  updated = replaceBlock(updated, /defaultConfig\s*\{/, 'defaultConfig', (block) => {
    let next = block;
    if (!/versionCode\s+repathVersionCode\b/.test(next)) {
      if (/versionCode\s+[^\n]+/.test(next)) {
        next = next.replace(/versionCode\s+[^\n]+/, 'versionCode repathVersionCode');
      } else {
        next = next.replace(/\n(\s*)\}/, '\n$1    versionCode repathVersionCode\n$1}');
      }
    }
    if (!/versionName\s+repathVersionName\b/.test(next)) {
      if (/versionName\s+["'][^"']*["']/.test(next)) {
        next = next.replace(/versionName\s+["'][^"']*["']/, 'versionName repathVersionName');
      } else {
        next = next.replace(/\n(\s*)\}/, '\n$1    versionName repathVersionName\n$1}');
      }
    }
    return next;
  });

  updated = replaceBlock(updated, /signingConfigs\s*\{/, 'signingConfigs', (block) => {
    if (/release\s*\{[\s\S]*hasUploadSigning/.test(block)) {
      return block;
    }
    const debugBlockMatch = block.match(/debug\s*\{[\s\S]*?\n\s*\}/);
    if (!debugBlockMatch) {
      throw new Error('[patch-prebuild] Could not find expected debug signing config block in android/app/build.gradle.');
    }
    const releaseSigningConfig = `
        release {
            if (hasUploadSigning) {
                storeFile file(uploadStoreFile)
                storePassword uploadStorePassword
                keyAlias uploadKeyAlias
                keyPassword uploadKeyPassword
            }
        }`;
    return block.replace(debugBlockMatch[0], `${debugBlockMatch[0]}${releaseSigningConfig}`);
  });

  updated = replaceBlock(updated, /buildTypes\s*\{/, 'buildTypes', (block) => {
    return replaceBlock(block, /release\s*\{/, 'buildTypes.release', (releaseBlock) => {
      if (releaseBlock.includes(RELEASE_SIGNING_BLOCK_START) && releaseBlock.includes('enforceReleaseSigning')) {
        return releaseBlock;
      }
      const replacement = `            ${RELEASE_SIGNING_BLOCK_START}
            if (hasUploadSigning) {
                signingConfig signingConfigs.release
            } else if (allowDebugReleaseSigning) {
                signingConfig signingConfigs.debug
            } else if (enforceReleaseSigning) {
                throw new GradleException(
                    "Release signing config missing. Set REPATH_UPLOAD_STORE_FILE, REPATH_UPLOAD_STORE_PASSWORD, REPATH_UPLOAD_KEY_ALIAS, and REPATH_UPLOAD_KEY_PASSWORD."
                )
            }
            ${RELEASE_SIGNING_BLOCK_END}`;
      const managedBlockRegex = /\/\/\s*repath-release-signing:start[\s\S]*?\/\/\s*repath-release-signing:end/m;
      if (managedBlockRegex.test(releaseBlock)) {
        return releaseBlock.replace(managedBlockRegex, replacement);
      }
      const legacyBlockRegex =
        /if\s*\(hasUploadSigning\)\s*\{[\s\S]*?\}\s*else if\s*\(allowDebugReleaseSigning\)\s*\{[\s\S]*?\}\s*else(?:\s*if\s*\(enforceReleaseSigning\))?\s*\{[\s\S]*?\}\s*/m;
      if (legacyBlockRegex.test(releaseBlock)) {
        return releaseBlock.replace(legacyBlockRegex, `${replacement}\n            `);
      }
      if (/^\s*signingConfig\s+signingConfigs\.[a-zA-Z0-9_]+\s*$/m.test(releaseBlock)) {
        return releaseBlock.replace(/^\s*signingConfig\s+signingConfigs\.[a-zA-Z0-9_]+\s*$/m, replacement);
      }
      return releaseBlock.replace(/\{\s*\n/, `{\n${replacement}\n`);
    });
  });
  updated = updated.replace(/^\s*\/\/\s*repath-release-signing:start\s*$/gm, '            // repath-release-signing:start');
  updated = updated.replace(/^\s*\/\/\s*repath-release-signing:end\s*$/gm, '            // repath-release-signing:end');
  updated = updated.replace(
    /^\s*def enableShrinkResources = findProperty\('android\.enableShrinkResourcesInReleaseBuilds'\) \?: 'false'\s*$/gm,
    "            def enableShrinkResources = findProperty('android.enableShrinkResourcesInReleaseBuilds') ?: 'false'"
  );

  return writeIfChanged(androidAppBuild, updated, 'android/app/build.gradle');
}

function main() {
  const buildChanged = patchAndroidBuild();
  const appBuildChanged = patchAndroidAppBuild();
  const wrapperChanged = patchGradleWrapper();

  if (!buildChanged && !appBuildChanged && !wrapperChanged) {
    console.log('[patch-prebuild] Already up to date.');
  }
}

try {
  main();
} catch (error) {
  console.error(String(error.message || error));
  process.exitCode = 1;
}
