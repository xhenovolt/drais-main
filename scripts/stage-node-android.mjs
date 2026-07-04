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
import { promises as fs, existsSync } from 'node:fs';
import path from 'node:path';

const root    = process.cwd();
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

  await patchBuildConfigReference();
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
