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
  await writeAssetLists();
  await patchBuildConfigReference();
  await stageNativeLibs();
}

/**
 * Generate file.list / dir.list at the assets root — the plugin's FAST PATH.
 *
 * NodeJS.java's first-launch copy reads these lists and copies exactly those
 * entries. Without them it falls back to recursively enumerating the asset
 * tree via AssetManager.list(), which is extremely slow on-device — with the
 * ~4k files of the Next standalone tree that meant 10+ minutes stuck on the
 * "Starting DRAIS" screen on budget phones. Cordova generates these lists in
 * its after-prepare hook (install/hooks/android/after-prepare-build-node-
 * assets-lists.js); this replicates it against the staged tree.
 *
 * Same skip rules as the hook: dotfiles, *.gz, *~ (aapt strips dotfiles from
 * APK assets anyway, so the list must match what actually ships).
 */
async function writeAssetLists() {
  const assetsRoot = path.join(root, 'android', 'capacitor-cordova-android-plugins', 'src', 'main', 'assets');
  const files = [];
  const dirs = [];
  async function enumFolder(rel) {
    for (const entry of await fs.readdir(path.join(assetsRoot, rel), { withFileTypes: true })) {
      const name = entry.name;
      if (name.startsWith('.')) continue;
      const relPath = `${rel}/${name}`;
      if (entry.isDirectory()) {
        dirs.push(relPath);
        await enumFolder(relPath);
      } else if (!name.endsWith('.gz') && !name.endsWith('~')) {
        files.push(relPath);
      }
    }
  }
  await enumFolder('www/nodejs-project');
  await fs.writeFile(path.join(assetsRoot, 'file.list'), files.join('\n'));
  await fs.writeFile(path.join(assetsRoot, 'dir.list'), dirs.join('\n'));
  console.log(`✔ asset lists written (fast first-launch copy): ${files.length} files, ${dirs.length} dirs.`);
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
 * Stage the embedded Node runtime — **Node 18.20.4**, not the plugin's own.
 *
 * nodejs-mobile-cordova is abandoned at 0.4.3 and bundles Node **12.19.0**,
 * which cannot even parse Next 15's syntax (`??` in picocolors.js was the
 * first crash; hundreds more behind it — Next 15 requires Node >= 18.18).
 * The nodejs-mobile project ships current prebuilts through its React
 * Native package, so we source the runtime from nodejs-mobile-react-native
 * (Node 18.20.4) and keep the Cordova plugin's Java/JS layer:
 *
 *   - libnode.so + headers  → from nodejs-mobile-react-native/android/libnode
 *     (plain .so, no gunzip; ships armeabi-v7a / arm64-v8a / x86_64 — NO x86,
 *      see patchPluginAbiFilters below)
 *   - native-lib.cpp        → RN's Node-18-compatible JNI layer, with the
 *     JNI symbol prefix renamed to the Cordova plugin's Java class
 *     (…rn_1nodejs_1mobile_RNNodeJsMobileModule_ → …cdvnodejsmobile_NodeJS_).
 *     Same four natives, same signatures — verified against both Java files.
 *   - cordova-bridge.cpp/.h → RN's rn-bridge.cpp/.h with the linked-binding
 *     renamed rn_bridge → cordova_bridge (what builtin_modules/cordova-bridge
 *     JS resolves via process._linkedBinding). Exports match what the JS
 *     calls: sendMessage / registerChannel / getDataDir.
 *   - CMakeLists.txt        → the Cordova plugin's (same filenames/target).
 *
 * Idempotent: destinations are cleaned and regenerated each run.
 */
const rnRoot = path.join(root, 'node_modules', 'nodejs-mobile-react-native');

async function stageNativeLibs() {
  const rnCpp = path.join(rnRoot, 'android', 'src', 'main', 'cpp');
  const needed = [
    path.join(pluginRoot, 'src/android/CMakeLists.txt'),
    path.join(rnCpp, 'native-lib.cpp'),
    path.join(rnCpp, 'rn-bridge.cpp'),
    path.join(rnCpp, 'rn-bridge.h'),
    path.join(rnRoot, 'android', 'libnode', 'bin'),
  ];
  for (const p of needed) {
    if (!existsSync(p)) {
      console.error(`[stage-node-android] missing: ${p} — run npm install (needs nodejs-mobile-cordova AND nodejs-mobile-react-native).`);
      process.exit(1);
    }
  }

  // Transform RN sources → Cordova naming.
  const renameIncludes = (s) => s.replaceAll('rn-bridge.h', 'cordova-bridge.h');
  const nativeLib = renameIncludes(await fs.readFile(path.join(rnCpp, 'native-lib.cpp'), 'utf8'))
    .replaceAll('Java_com_janeasystems_rn_1nodejs_1mobile_RNNodeJsMobileModule_', 'Java_com_janeasystems_cdvnodejsmobile_NodeJS_')
    // rcv_message's runtime FindClass — MUST point at the Cordova plugin class
    // or the first node→Java message ('ready-for-app-events', sent the moment
    // Node boots) throws ClassNotFoundException on the JNI env and the app
    // dies instantly. Both plugins expose the identical static
    // sendMessageToApplication(String,String) target.
    .replaceAll('com/janeasystems/rn_nodejs_mobile/RNNodeJsMobileModule', 'com/janeasystems/cdvnodejsmobile/NodeJS');
  const bridgeCpp = renameIncludes(await fs.readFile(path.join(rnCpp, 'rn-bridge.cpp'), 'utf8'))
    .replaceAll('NODE_MODULE_LINKED(rn_bridge,', 'NODE_MODULE_LINKED(cordova_bridge,');
  const bridgeH = renameIncludes(await fs.readFile(path.join(rnCpp, 'rn-bridge.h'), 'utf8'));
  if (!nativeLib.includes('Java_com_janeasystems_cdvnodejsmobile_NodeJS_startNodeWithArguments')) {
    console.error('[stage-node-android] JNI rename failed — RN native-lib.cpp layout changed; review the transform.');
    process.exit(1);
  }
  if (nativeLib.includes('rn_nodejs_mobile') || nativeLib.includes('RNNodeJsMobileModule')) {
    console.error('[stage-node-android] RN class references survived the transform — the app would crash on the first node→Java message. Review native-lib.cpp.');
    process.exit(1);
  }
  if (!bridgeCpp.includes('NODE_MODULE_LINKED(cordova_bridge,')) {
    console.error('[stage-node-android] linked-binding rename failed — rn-bridge.cpp layout changed; review the transform.');
    process.exit(1);
  }

  for (const nativeDst of nativeDsts) {
    await fs.mkdir(nativeDst, { recursive: true });
    await fs.copyFile(path.join(pluginRoot, 'src/android/CMakeLists.txt'), path.join(nativeDst, 'CMakeLists.txt'));
    await fs.writeFile(path.join(nativeDst, 'native-lib.cpp'), nativeLib);
    await fs.writeFile(path.join(nativeDst, 'cordova-bridge.cpp'), bridgeCpp);
    await fs.writeFile(path.join(nativeDst, 'cordova-bridge.h'), bridgeH);

    // libnode 18.20.4: headers + per-ABI prebuilt .so (plain, no gunzip).
    const libnodeDst = path.join(nativeDst, 'libnode');
    await fs.rm(libnodeDst, { recursive: true, force: true });
    await copyTree(path.join(rnRoot, 'android', 'libnode'), libnodeDst);
    const abis = await fs.readdir(path.join(libnodeDst, 'bin'));
    console.log(`✔ Node 18 runtime staged into ${path.relative(root, nativeDst)} (ABIs: ${abis.join(', ')}).`);
  }

  await patchPluginAbiFilters();
}

/**
 * Node 18 prebuilts have no x86 slice, but the plugin gradle (applied from
 * node_modules by BOTH the :app and plugins projects) defaults abiFilters to
 * a list including x86 — which would fail CMake with a missing libnode.so.
 * Patch the default in place (idempotent; reapplied after every npm install).
 */
async function patchPluginAbiFilters() {
  const gradleFile = path.join(pluginRoot, 'src', 'android', 'build.gradle');
  const before = await fs.readFile(gradleFile, 'utf8');
  const after = before.replaceAll('["armeabi-v7a", "x86", "arm64-v8a", "x86_64"]', '["armeabi-v7a", "arm64-v8a", "x86_64"]');
  if (after !== before) {
    await fs.writeFile(gradleFile, after);
    console.log('✔ plugin gradle abiFilters patched (dropped x86 — Node 18 prebuilts ship 3 ABIs).');
  } else if (before.includes('["armeabi-v7a", "arm64-v8a", "x86_64"]')) {
    console.log('• plugin gradle abiFilters already patched.');
  } else {
    console.error('[stage-node-android] could not patch plugin abiFilters default — build.gradle layout changed.');
    process.exit(1);
  }

  // The plugin's default above applies POST-configuration — too late to stop
  // AGP from configuring an x86 CMake variant. Inject filters EARLY into the
  // regenerated capacitor-cordova-android-plugins project (cap sync rewrites
  // it, so this must run after every sync; :app has them in its own gradle).
  const pluginsGradle = path.join(root, 'android', 'capacitor-cordova-android-plugins', 'build.gradle');
  const pg = await fs.readFile(pluginsGradle, 'utf8');
  if (!pg.includes('abiFilters')) {
    const marker = 'defaultConfig {';
    if (!pg.includes(marker)) {
      console.error('[stage-node-android] could not inject abiFilters — plugins build.gradle has no defaultConfig block.');
      process.exit(1);
    }
    const injected = pg.replace(marker, marker + "\n        ndk { abiFilters 'armeabi-v7a', 'arm64-v8a', 'x86_64' } // Node 18 prebuilts: no x86 (stage-node-android)");
    await fs.writeFile(pluginsGradle, injected);
    console.log('✔ abiFilters injected into capacitor-cordova-android-plugins/build.gradle.');
  } else {
    console.log('• plugins project abiFilters already present.');
  }

  // Drop stale per-ABI CMake configurations (an old x86 config would still
  // try to build against the removed x86 libnode).
  for (const proj of ['app', 'capacitor-cordova-android-plugins']) {
    await fs.rm(path.join(root, 'android', proj, '.cxx'), { recursive: true, force: true });
  }
  console.log('✔ stale .cxx CMake configurations cleared.');
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
