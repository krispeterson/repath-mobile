const fs = require('fs');
const path = require('path');

const MIN_ANDROID_GRADLE_PLUGIN_VERSION = '8.4.2';
const MIN_KOTLIN_VERSION = '1.9.24';
const MIN_GRADLE_VERSION = '8.6';

const root = process.cwd();
const androidBuild = path.join(root, 'android', 'build.gradle');
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
    throw new Error('[patch-prebuild] Could not find AGP or Kotlin plugin versions to patch in android/build.gradle.');
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

function main() {
  const buildChanged = patchAndroidBuild();
  const wrapperChanged = patchGradleWrapper();

  if (!buildChanged && !wrapperChanged) {
    console.log('[patch-prebuild] Already up to date.');
  }
}

try {
  main();
} catch (error) {
  console.error(String(error.message || error));
  process.exitCode = 1;
}
