/**
 * Stage the embedded Node runtime project into the Android assets.
 *
 * DRAIS Android = Capacitor + nodejs-mobile-cordova. The nodejs-mobile-cordova
 * plugin is a *Cordova* plugin: its build.gradle (and its runtime asset loader)
 * require the node app at
 *     android/app/src/main/assets/www/nodejs-project/
 * i.e. the Cordova `www` convention. Capacitor, however, copies webDir into
 * `assets/public` and NEVER creates a `www` folder — so without this step gradle
 * fails at configuration time with:
 *     "nodejs-mobile-cordova couldn't find the www folder in the Android project."
 *
 * This script mirrors mobile/nodejs-project/ (produced by scripts/build-mobile.mjs)
 * into android/app/src/main/assets/www/nodejs-project/. It MUST run AFTER
 * `cap sync android` (which manages assets/public but not assets/www) and BEFORE
 * `gradlew assembleDebug`.
 *
 * Idempotent: the destination www/nodejs-project is removed and recopied.
 */
import { promises as fs, existsSync } from 'node:fs';
import path from 'node:path';

const root    = process.cwd();
const srcProj = path.join(root, 'mobile', 'nodejs-project');
const wwwDir  = path.join(root, 'android', 'app', 'src', 'main', 'assets', 'www');
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
}

main().catch((e) => { console.error('[stage-node-android]', e); process.exit(1); });
