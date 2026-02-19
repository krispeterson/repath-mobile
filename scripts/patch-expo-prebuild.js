const fs = require('fs');
const path = require('path');

const MIN_ANDROID_GRADLE_PLUGIN_VERSION = '8.4.2';
const MIN_KOTLIN_VERSION = '1.9.24';
const MIN_GRADLE_VERSION = '8.6';

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

function replaceOnce(contents, from, to, label) {
  if (contents.includes(to)) {
    return contents;
  }
  if (!contents.includes(from)) {
    throw new Error(`[patch-prebuild] Could not find expected ${label} block in android/app/build.gradle.`);
  }
  return contents.replace(from, to);
}

function patchAndroidAppBuild() {
  const contents = readFileOrThrow(androidAppBuild);
  let updated = contents;

  const jscBlock = "def jscFlavor = 'io.github.react-native-community:jsc-android:2026004.+'";
  const signingVars = `${jscBlock}
def repathVersionCode = (findProperty('REPATH_ANDROID_VERSION_CODE') ?: '1').toString().toInteger()
def repathVersionName = (findProperty('REPATH_ANDROID_VERSION_NAME') ?: '0.0.1').toString()

def uploadStoreFile = (findProperty('REPATH_UPLOAD_STORE_FILE') ?: '').toString().trim()
def uploadStorePassword = (findProperty('REPATH_UPLOAD_STORE_PASSWORD') ?: '').toString().trim()
def uploadKeyAlias = (findProperty('REPATH_UPLOAD_KEY_ALIAS') ?: '').toString().trim()
def uploadKeyPassword = (findProperty('REPATH_UPLOAD_KEY_PASSWORD') ?: '').toString().trim()
def allowDebugReleaseSigning = (findProperty('REPATH_ALLOW_DEBUG_SIGNING') ?: 'false').toString().toBoolean()
def hasUploadSigning = uploadStoreFile && uploadStorePassword && uploadKeyAlias && uploadKeyPassword`;
  updated = replaceOnce(updated, jscBlock, signingVars, 'signing/version vars');

  const versionBlock = `        versionCode 1
        versionName "0.0.1"`;
  const patchedVersionBlock = `        versionCode repathVersionCode
        versionName repathVersionName`;
  updated = replaceOnce(updated, versionBlock, patchedVersionBlock, 'versionCode/versionName');

  const signingConfigBlock = `    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }`;
  const patchedSigningConfigBlock = `    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
        release {
            if (hasUploadSigning) {
                storeFile file(uploadStoreFile)
                storePassword uploadStorePassword
                keyAlias uploadKeyAlias
                keyPassword uploadKeyPassword
            }
        }
    }`;
  updated = replaceOnce(updated, signingConfigBlock, patchedSigningConfigBlock, 'signingConfigs');

  const releaseSigningBlock = `        release {
            // Caution! In production, you need to generate your own keystore file.
            // see https://reactnative.dev/docs/signed-apk-android.
            signingConfig signingConfigs.debug
            def enableShrinkResources = findProperty('android.enableShrinkResourcesInReleaseBuilds') ?: 'false'`;
  const patchedReleaseSigningBlock = `        release {
            if (hasUploadSigning) {
                signingConfig signingConfigs.release
            } else if (allowDebugReleaseSigning) {
                signingConfig signingConfigs.debug
            } else {
                throw new GradleException(
                    "Release signing config missing. Set REPATH_UPLOAD_STORE_FILE, REPATH_UPLOAD_STORE_PASSWORD, REPATH_UPLOAD_KEY_ALIAS, and REPATH_UPLOAD_KEY_PASSWORD."
                )
            }
            def enableShrinkResources = findProperty('android.enableShrinkResourcesInReleaseBuilds') ?: 'false'`;
  updated = replaceOnce(updated, releaseSigningBlock, patchedReleaseSigningBlock, 'release signing');

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
