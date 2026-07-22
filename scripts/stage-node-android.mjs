/**
 * Stage the embedded Node runtime project into the Android assets.
 *
 * DRAIS Android = Capacitor + nodejs-mobile-cordova. The nodejs-mobile-cordova
 * plugin is a *Cordova* plugin: its build.gradle (and its runtime asset loader)
 * require the node app at
 *     android/capacitor-cordova-android-plugins/src/main/assets/www/nodejs-project/
 * i.e. the Cordova `www` convention, resolved against the project the plugin is
 * applied in — which is `capacitor-cordova-android-plugins`, NOT `app` (the
 * plugin's www check uses that project's projectDir). Capacitor copies webDir
 * into app/assets/public and NEVER creates a www folder anywhere — so without
 * this step gradle fails at configuration time with:
 *     "nodejs-mobile-cordova couldn't find the www folder in the Android project."
 *
 * This script mirrors mobile/nodejs-project/ (produced by scripts/build-mobile.mjs)
 * into that www folder. It MUST run AFTER `cap sync android` (which regenerates
 * the capacitor-cordova-android-plugins project) and BEFORE `gradlew`.
 *
 * Idempotent: the destination www/nodejs-project is removed and recopied.
 */
import { promises as fs, existsSync, createReadStream, createWriteStream } from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { pipeline } from 'node:stream/promises';

const root    = process.cwd();
const pluginRoot = path.join(root, 'node_modules', 'nodejs-mobile-cordova');
// The plugin gradle is applied into BOTH the :app project (via
// app/capacitor.build.gradle) AND the capacitor-cordova-android-plugins project
// (via its own build.gradle), and each gets the plugin's externalNativeBuild.
// So the CMake sources must exist under libs/cdvnodejsmobile in both projects.
const nativeDsts = [
  path.join(root, 'android', 'app', 'libs', 'cdvnodejsmobile'),
  path.join(root, 'android', 'capacitor-cordova-android-plugins', 'libs', 'cdvnodejsmobile'),
];
const srcProj = path.join(root, 'mobile', 'nodejs-project');
// The plugin is applied in the capacitor-cordova-android-plugins project, so its
// projectDir is what the www lookup resolves against.
const wwwDir  = path.join(root, 'android', 'capacitor-cordova-android-plugins', 'src', 'main', 'assets', 'www');
const dstProj = path.join(wwwDir, 'nodejs-project');

async function copyTree(src, dst) {
  const stat = await fs.stat(src);
  if (stat.isDirectory()) {
    await fs.mkdir(dst, { recursive: true });
    for (const child of await fs.readdir(src)) {
      await copyTree(path.join(src, child), path.join(dst, child));
    }
  } else {
    await fs.copyFile(src, dst);
  }
}

async function main() {
  if (!existsSync(srcProj) || !existsSync(path.join(srcProj, 'main.js'))) {
    console.error(
      `[stage-node-android] mobile/nodejs-project/main.js not found — run "npm run mobile:build" first ` +
      `so the Next standalone server is mirrored before staging.`,
    );
    process.exit(1);
  }

  console.log('▶ Staging mobile/nodejs-project → android/.../assets/www/nodejs-project');
  // Clean prior copy so removed files don't linger inside the APK.
  await fs.rm(dstProj, { recursive: true, force: true });
  await fs.mkdir(wwwDir, { recursive: true });
  await copyTree(srcProj, dstProj);

  if (!existsSync(path.join(dstProj, 'main.js'))) {
    console.error('[stage-node-android] main.js missing after copy — staging failed.');
    process.exit(1);
  }
  console.log('✔ www/nodejs-project staged — nodejs-mobile-cordova will bundle it into the APK.');

  await stageBuiltinAssets();
  await patchBuildConfigReference();
  await stageNativeLibs();
}

/**
 * Stage the plugin's built-in runtime assets. NodeJS.java's asyncInit copies
 * "nodejs-mobile-cordova-assets" (builtin_modules etc.) from APK assets into
 * filesDir before the engine can start — without this folder AT THAT EXACT
 * PATH every launch fails with:
 *   "Node start error: Initialization failed:
 *    java.io.FileNotFoundException: nodejs-mobile-cordova assets"
 * Cordova's prepare stages it via plugin.xml <asset>; under Capacitor we do
 * it here. (An earlier manual attempt staged builtin_modules at the assets
 * ROOT, which the plugin never looks at — we also clean that up.)
 */
async function stageBuiltinAssets() {
  const src = path.join(pluginRoot, 'install', 'nodejs-mobile-cordova-assets');
  if (!existsSync(src)) {
    console.error('[stage-node-android] plugin install/nodejs-mobile-cordova-assets missing — is nodejs-mobile-cordova installed?');
    process.exit(1);
  }
  const assetsRoot = path.join(root, 'android', 'capacitor-cordova-android-plugins', 'src', 'main', 'assets');
  const dst = path.join(assetsRoot, 'nodejs-mobile-cordova-assets');
  await fs.rm(dst, { recursive: true, force: true });
  await copyTree(src, dst);
  // Remove the mis-staged wrong-level copy if a previous run left one behind.
  await fs.rm(path.join(assetsRoot, 'builtin_modules'), { recursive: true, force: true });
  if (!existsSync(path.join(dst, 'builtin_modules'))) {
    console.error('[stage-node-android] builtin_modules missing after staging — aborting.');
    process.exit(1);
  }
  console.log('✔ nodejs-mobile-cordova-assets staged (builtin runtime modules).');
}

/**
 * Replicate the plugin's Cordova native-prepare into the :app project.
 *
 * The plugin's externalNativeBuild (applied into :app via app/capacitor.build.gradle)
 * compiles android/app/libs/cdvnodejsmobile/CMakeLists.txt, which needs its C++
 * bridge sources and the prebuilt libnode alongside it. Cordova copies these via
 * plugin.xml <source-file> entries and gunzips libnode.so.gz in a plugin-install
 * hook; Capacitor's cap sync does neither. So we do both here (post-sync):
 *   - copy CMakeLists.txt, native-lib.cpp, cordova-bridge.{cpp,h}
 *   - copy libnode/ (include + bin) and gunzip each bin/<ABI>/libnode.so.gz → .so
 * Idempotent: the libnode dir is cleaned and recopied each run.
 */
async function stageNativeLibs() {
  const files = [
    ['src/android/CMakeLists.txt', 'CMakeLists.txt'],
    ['src/android/jni/native-lib.cpp', 'native-lib.cpp'],
    ['src/common/cordova-bridge/cordova-bridge.cpp', 'cordova-bridge.cpp'],
    ['src/common/cordova-bridge/cordova-bridge.h', 'cordova-bridge.h'],
  ];
  for (const [src] of files) {
    if (!existsSync(path.join(pluginRoot, src))) {
      console.error(`[stage-node-android] plugin native source missing: ${src} — is nodejs-mobile-cordova installed?`);
      process.exit(1);
    }
  }

  for (const nativeDst of nativeDsts) {
    await fs.mkdir(nativeDst, { recursive: true });
    for (const [src, name] of files) {
      await fs.copyFile(path.join(pluginRoot, src), path.join(nativeDst, name));
    }

    // libnode: headers + prebuilt per-ABI libs (shipped gzipped to save space).
    const libnodeDst = path.join(nativeDst, 'libnode');
    await fs.rm(libnodeDst, { recursive: true, force: true });
    await copyTree(path.join(pluginRoot, 'libs', 'android', 'libnode'), libnodeDst);

    let gunzipped = 0;
    for (const abi of ['armeabi-v7a', 'arm64-v8a', 'x86', 'x86_64']) {
      const gz = path.join(libnodeDst, 'bin', abi, 'libnode.so.gz');
      const so = path.join(libnodeDst, 'bin', abi, 'libnode.so');
      if (existsSync(gz)) {
        await pipeline(createReadStream(gz), zlib.createGunzip(), createWriteStream(so));
        await fs.rm(gz); // jniLibs must see .so, not .so.gz
        gunzipped++;
      }
    }
    console.log(`✔ native libs staged into ${path.relative(root, nativeDst)} (libnode gunzipped for ${gunzipped} ABIs).`);
  }
}

/**
 * Fix the AGP-8 BuildConfig package mismatch in the regenerated plugin Java.
 *
 * nodejs-mobile-cordova's NodeJS.java (package com.janeasystems.cdvnodejsmobile)
 * references a bare `BuildConfig.DEBUG`, expecting BuildConfig in its OWN package.
 * But the capacitor-cordova-android-plugins module generates BuildConfig in the
 * module namespace (capacitor.cordova.android.plugins), so the bare reference
 * fails with "cannot find symbol: BuildConfig". `cap sync` regenerates this file
 * from node_modules, so we patch it post-sync: fully-qualify the reference to the
 * module's generated class (generation is enabled via
 * android.defaults.buildfeatures.buildconfig=true in gradle.properties).
 * Idempotent — only rewrites the bare reference.
 */
async function patchBuildConfigReference() {
  const nodeJava = path.join(
    root, 'android', 'capacitor-cordova-android-plugins',
    'src', 'main', 'java', 'com', 'janeasystems', 'cdvnodejsmobile', 'NodeJS.java',
  );
  if (!existsSync(nodeJava)) {
    console.warn('[stage-node-android] NodeJS.java not found — skipping BuildConfig patch (run cap sync first).');
    return;
  }
  const src = await fs.readFile(nodeJava, 'utf8');
  // Only match the bare reference (not an already-qualified one) so re-runs are no-ops.
  const patched = src.replace(
    /([^.\w])BuildConfig\.DEBUG/g,
    '$1capacitor.cordova.android.plugins.BuildConfig.DEBUG',
  );
  if (patched !== src) {
    await fs.writeFile(nodeJava, patched);
    console.log('✔ patched NodeJS.java — fully-qualified BuildConfig.DEBUG (AGP 8 namespace fix).');
  } else {
    console.log('• NodeJS.java BuildConfig reference already qualified — no change.');
  }
}

main().catch((e) => { console.error('[stage-node-android]', e); process.exit(1); });
