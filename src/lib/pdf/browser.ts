/**
 * Serverless-aware Chromium launcher for every PDF route.
 *
 * On Vercel / AWS Lambda there is no Chrome binary and no way to run
 * `npx puppeteer browsers install chrome` — puppeteer's download cache
 * (~/.cache/puppeteer) exists only in the build container, never in the
 * runtime lambda. There we launch the lambda-packaged Chromium shipped by
 * `@sparticuz/chromium` (brotli-decompressed into /tmp at first use).
 *
 * Everywhere else (local dev, self-hosted Node, Electron) we launch the
 * full `puppeteer` package exactly as before, so desktop/offline DRAIS
 * keeps its existing behaviour.
 *
 * All PDF routes must launch through this helper — never call
 * `puppeteer.launch` directly.
 */
import type { Browser, LaunchOptions } from 'puppeteer';

/** True when running inside a serverless function runtime (not the build). */
function isServerlessRuntime(): boolean {
  return Boolean(
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
    process.env.AWS_EXECUTION_ENV ||
    process.env.VERCEL_DEPLOYMENT_ID ||
    (process.env.VERCEL && process.env.NODE_ENV === 'production'),
  );
}

export async function launchPdfBrowser(opts: LaunchOptions = {}): Promise<Browser> {
  const puppeteer = (await import('puppeteer')).default;

  if (isServerlessRuntime()) {
    const chromium = (await import('@sparticuz/chromium')).default;
    return puppeteer.launch({
      ...opts,
      headless: true,
      // Serverless flags first (they configure single-process/,no-zygote
      // operation the lambda sandbox requires); route-specific args append.
      args: [...chromium.args, ...(opts.args ?? [])],
      executablePath: await chromium.executablePath(),
      defaultViewport: { width: 1280, height: 800 },
    });
  }

  return puppeteer.launch({ headless: true, ...opts });
}
