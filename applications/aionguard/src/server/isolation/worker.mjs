import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export function pathAllowed(urlText, requestPath) {
  try {
    const url = new URL(urlText);
    if (
      url.protocol !== 'https:' ||
      typeof requestPath !== 'string' ||
      !requestPath.startsWith('/') ||
      !requestPath.endsWith('/')
    )
      return false;
    // Root fixtures retain their original origin-wide asset scope.
    if (requestPath === '/') return true;
    const raw = /^https:\/\/[^/?#]+(\/[^?#]*)?(?:[?#].*)?$/i.exec(urlText);
    const path = raw?.[1] ?? '/';
    // Project scopes reject encoded separators and traversal rather than
    // depending on differences between browser and hosted-server normalization.
    const canonicalPath = /^\/(?:[A-Za-z0-9._~-]+\/)*[A-Za-z0-9._~-]*$/;
    if (
      !raw ||
      !canonicalPath.test(path) ||
      !canonicalPath.test(requestPath) ||
      [...path.split('/'), ...requestPath.split('/')].some(
        (segment) => segment === '.' || segment === '..',
      ) ||
      url.pathname !== path
    )
      return false;
    return path === requestPath.slice(0, -1) || path.startsWith(requestPath);
  } catch {
    return false;
  }
}

export function allowedRequest(urlText, method, allowedOrigins, requestPath = '/') {
  try {
    const url = new URL(urlText);
    return (
      ['GET', 'HEAD'].includes(method) &&
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      allowedOrigins.includes(url.origin) &&
      pathAllowed(urlText, requestPath)
    );
  } catch {
    return false;
  }
}

// This function is evaluated in the isolated page. It uses no closure or page-defined callbacks.
export function pageFacts() {
  const clip = (text, max) => String(text ?? '').slice(0, max);
  const password = document.querySelector('input[type="password"]');
  const form = password?.form ?? document.querySelector('form');
  if (
    new Set([...document.querySelectorAll('input[type="password"]')].map((input) => input.form))
      .size > 1
  )
    throw new Error('AMBIGUOUS_FORMS');
  const declared = form?.getAttribute('action');
  let action = null,
    origin = null;
  if (form) {
    try {
      const destination = new URL(declared || location.href, document.baseURI);
      action = destination.href;
      origin = destination.origin;
    } catch {
      /* Invalid declarations remain unknown. */
    }
    if (action !== null && action.length > 2048) throw new Error('OVERSIZED_FORM_ACTION');
  }
  const text = clip(document.body?.innerText, 1000);
  // Branding is an observed title/body marker, never inferred from a form URL.
  // Multiple supported names are ambiguous rather than a reason to pick one.
  const branding = `${document.title} ${text}`;
  const brands = [];
  if (/\bacme\b/i.test(branding)) brands.push('ACME');
  if (/\baionphish\b/i.test(branding)) brands.push('AIONPHISH');
  const downloadLinks = [];
  // Read declarations only: no clicks, downloads, or page-authored JavaScript.
  for (const anchor of [...document.querySelectorAll('a[href]')].slice(0, 200)) {
    const declaredHref = anchor.getAttribute?.('href');
    if (!declaredHref) continue;
    try {
      const url = new URL(declaredHref, document.baseURI);
      if (!['http:', 'https:'].includes(url.protocol) || url.href.length > 2048) continue;
      downloadLinks.push({ href: url.href, text: clip(anchor.innerText, 200) });
      if (downloadLinks.length >= 20) break;
    } catch {
      /* Invalid link declarations provide no evidence. */
    }
  }
  return {
    title: clip(document.title, 200),
    text,
    claimedService: brands.length === 1 ? brands[0] : 'UNKNOWN',
    passwordField: Boolean(password),
    formAction: action,
    formDestinationOrigin: origin,
    downloadLinks,
  };
}

export async function main() {
  const startedAt = new Date().toISOString();
  const origin = performance.now();
  const events = { workerStarted: 0 };
  const mark = (name) => {
    events[name] = performance.now() - origin;
  };
  const request = JSON.parse(await readFile('/vercel/sandbox/aionguard-request.json', 'utf8'));
  const expectedPath = new URL(request.url).pathname.replace(/[^/]*$/, '');
  if (request.requestPath !== expectedPath) throw new Error('INVALID_REQUEST_SCOPE');
  const { chromium } = await import('/vercel/sandbox/node_modules/playwright/index.mjs');
  const browser = await chromium.launch({ headless: true, timeout: request.navigationTimeoutMs });
  mark('browserReady');
  let context;
  try {
    context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      javaScriptEnabled: false,
      serviceWorkers: 'block',
      acceptDownloads: false,
      ignoreHTTPSErrors: false,
    });
    const redirects = [];
    let deniedNavigation = false;
    await context.route('**/*', async (route) => {
      const req = route.request();
      if (
        !allowedRequest(req.url(), req.method(), request.navigationOrigins, request.requestPath)
      ) {
        if (req.isNavigationRequest()) deniedNavigation = true;
        await route.abort('blockedbyclient');
        return;
      }
      if (req.isNavigationRequest() && req.redirectedFrom()) {
        if (redirects.length >= 10) {
          deniedNavigation = true;
          await route.abort('blockedbyclient');
          return;
        }
        redirects.push(req.url().slice(0, 2048));
      }
      await route.continue();
    });
    const page = await context.newPage();
    let documentRevision = 0;
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) documentRevision += 1;
    });
    page.on('download', (download) => {
      void download.cancel();
    });
    context.on('page', (unexpected) => {
      if (unexpected !== page) void unexpected.close();
    });
    page.setDefaultTimeout(request.navigationTimeoutMs);
    try {
      mark('navigationStarted');
      const response = await page.goto(request.url, {
        waitUntil: 'domcontentloaded',
        timeout: request.navigationTimeoutMs,
      });
      mark('pageLoaded');
      if (deniedNavigation) throw new Error('NAVIGATION_DENIED');
      if (!response || !response.ok()) throw new Error('INVALID_EVIDENCE');
      const finalUrl = page.url();
      if (!allowedRequest(finalUrl, 'GET', request.navigationOrigins, request.requestPath))
        throw new Error('NAVIGATION_DENIED');
      const observedRevision = documentRevision;
      const facts = await page.evaluate(pageFacts);
      mark('factsCollected');
      const png = await page.screenshot({
        type: 'png',
        fullPage: false,
        animations: 'disabled',
        timeout: request.navigationTimeoutMs,
      });
      mark('screenshotCollected');
      if (
        png.length > 2_500_000 ||
        finalUrl.length > 2048 ||
        page.url() !== finalUrl ||
        documentRevision !== observedRevision ||
        deniedNavigation
      )
        throw new Error('INVALID_EVIDENCE');
      await writeFile(
        '/vercel/sandbox/aionguard-result.json',
        JSON.stringify({
          ...(typeof request.inspectionNonce === 'string'
            ? { inspectionNonce: request.inspectionNonce }
            : {}),
          ...(request.benchmarkTiming === true ? { benchmarkTiming: { startedAt, events } } : {}),
          observation: { ...facts, finalUrl, redirects, observedAt: new Date().toISOString() },
          pngBase64: png.toString('base64'),
        }),
        { mode: 0o600 },
      );
    } catch (error) {
      const code = deniedNavigation
        ? 'NAVIGATION_DENIED'
        : error?.name === 'TimeoutError'
          ? 'TIMEOUT'
          : 'INVALID_EVIDENCE';
      await writeFile('/vercel/sandbox/aionguard-result.json', JSON.stringify({ failure: code }), {
        mode: 0o600,
      });
    }
  } finally {
    if (context) await context.close().catch(() => {});
    await browser.close();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(() => {
    process.stderr.write('INSPECTION_WORKER_FAILED\n');
    process.exitCode = 1;
  });
}
