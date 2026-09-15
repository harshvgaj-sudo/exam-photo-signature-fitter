/*
 * browser_truth.mjs — the measurement authority for registry feasibility.
 *
 * WHY THIS EXISTS
 * check_specs.mjs originally predicted feasibility with a Node re-implementation
 * of the pipeline: synthetic RGBA -> box filter -> jpeg-js. That model said the
 * 140x60 SSC signature box reached 10.22 KB against a 10.00 KB floor, so it
 * classified the box as 'marginal' and expected the search to PASS.
 *
 * The shipped tool, given the same document, produced 8.88 KB and correctly
 * REFUSED. probe_gap_cause.mjs located the difference:
 *
 *     raw pixels -> box filter -> jpeg-js                10.14 KB   (the model)
 *     + the JPEG round trip a real file imposes           9.30 KB
 *     + Chrome's resampler instead of a box filter        8.88 KB   (the truth)
 *
 * A model that overstates the achievable size by ~20% is not a margin. At a
 * boundary like 10 KB it flips the answer. So the model cannot be the authority
 * on feasibility — only the browser can, because the browser is what ships.
 *
 * WHAT THIS MEASURES
 * For every non-custom registry entry, over the exact grid that entry declares in
 * `measuredOver`, it drives the REAL reference-tool/js/core.js inside REAL Chrome:
 *   - the same fixture JPEG bytes a user would upload (not raw pixels)
 *   - the same createImageBitmap decode path as app.js
 *   - the same coverRect crop and imageSmoothingQuality:'high' draw
 *   - the same canvas.toBlob('image/jpeg', q) encoder
 *   - the same searchQuality() binary search from core.js
 *
 * The grid comes from the registry, so the evidence cannot drift away from the
 * claim it is supposed to support. Fixtures are written to _verify/fixtures/ so
 * the other browser suites upload byte-identical files — evidence that is not
 * reproducible is not evidence.
 */
import { chromium } from 'file:///C:/Users/harsh/.workbuddy-ai/binaries/node/workspace/node_modules/playwright-core/index.mjs';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { SPECS } from '../reference-tool/js/specs.js';
import { makePhoto, makeScan, makeThumb, makeText, writeJpeg, resetSeed, SEEDS } from './fixtures.mjs';
import { serve, TOOL, HERE } from './server.mjs';

export const FIXTURE_DIR = join(HERE, 'fixtures');

/** Filename for one point on the measurement grid. Also the URL under /fx/. */
export function fixtureKey(fixture, grain, density) {
  return density === undefined || density === null
    ? `${fixture}_g${grain}`
    : `${fixture}_g${grain}_d${density}`;
}

/**
 * Build one fixture deterministically. The JPEG round trip is deliberate: a real
 * user uploads a JPEG file, and JPEG quantisation removes fine detail before the
 * browser ever sees the pixels. Skipping that step is what made the old Node
 * model optimistic.
 */
export function makeFixture(fixture, grain, density) {
  switch (fixture) {
    case 'photo':
      resetSeed(SEEDS.photo);
      return writeJpeg(null, makePhoto(4032, 3024), 92);
    case 'thumb':
      resetSeed(SEEDS.thumb);
      return writeJpeg(null, makeThumb(1200, 1200, grain), 90);
    case 'text':
      resetSeed(SEEDS.text);
      return writeJpeg(null, makeText(2400, 1200, 8, grain), 90);
    case 'scan':
    default:
      resetSeed(SEEDS.scan);
      return writeJpeg(null, makeScan(2400, 1400, grain, density ?? 1), 90);
  }
}

/** Every fixture the registry's own sweeps require, deduplicated. */
export function buildFixturesFromRegistry(specs = SPECS) {
  const bytes = {};
  for (const s of specs) {
    if (s.status === 'CUSTOM' || !s.measuredOver) continue;
    const { fixture, grain = [], density } = s.measuredOver;
    const densities = density ?? [null];
    for (const g of grain) {
      for (const d of densities) {
        const key = fixtureKey(fixture, g, d);
        if (key in bytes) continue;
        bytes[key] = makeFixture(fixture, g, d);
      }
    }
  }
  return bytes;
}

/** One job per (registry entry, point on its declared sweep). */
export function buildJobsFromRegistry(specs = SPECS) {
  const jobs = [];
  for (const s of specs) {
    if (s.status === 'CUSTOM' || !s.measuredOver) continue;
    const { fixture, grain = [], density } = s.measuredOver;
    const densities = density ?? [null];
    for (const g of grain) {
      for (const d of densities) {
        jobs.push({
          key: { id: s.id, fixture, grain: g, density: d ?? null },
          fixtureKey: fixtureKey(fixture, g, d),
          width: s.width,
          height: s.height,
          minBytes: s.minKB * 1024,
          maxBytes: s.maxKB * 1024,
        });
      }
    }
  }
  return jobs;
}

/**
 * The fixture names this run intends to have on disk.
 * Written to disk after every sync so the NEXT run can tell which files it
 * created and which are leftovers — without ever listing or wiping the directory.
 */
const MANIFEST = join(FIXTURE_DIR, 'manifest.json');

/**
 * Put the current fixture set on disk WITHOUT deleting anything, ever.
 *
 * WHY NOT `rmSync(dir, {recursive:true})`, AND WHY NOT EVEN A TARGETED PRUNE:
 * the host environment guards against bulk deletion and throws out of `fs` when a
 * run tries to remove too many files — and it counts deletions CUMULATIVELY for the
 * session, so a harness that deletes on every run eventually cannot run at all.
 * An earlier version of this function tried to be clever and prune only the files a
 * previous run had created, which is a small number in the normal case — but "small"
 * still trips the guard once the session's budget is spent, and the failure surfaces
 * as a permission prompt in the middle of an unrelated test run.
 *
 * So this function deletes NOTHING. It overwrites in place and records what it
 * wrote. Leftovers from an earlier sweep are inert: nothing requests a fixture that
 * is not in a job list, and the reported counts come from the intended set below
 * rather than from a directory scan, so a leftover can never inflate a claim.
 */
export function syncFixtures(fixtureDir, fixtures, { log = () => {} } = {}) {
  mkdirSync(fixtureDir, { recursive: true });
  const want = Object.keys(fixtures).map((k) => k + '.jpg');

  let previous = [];
  try {
    const raw = JSON.parse(readFileSync(MANIFEST, 'utf8'));
    if (Array.isArray(raw)) previous = raw.filter((n) => typeof n === 'string');
  } catch {
    previous = [];
  }

  for (const [k, v] of Object.entries(fixtures)) writeFileSync(join(fixtureDir, k + '.jpg'), v);
  writeFileSync(MANIFEST, JSON.stringify(want.slice().sort(), null, 0));

  const wanted = new Set(want);
  const stale = previous.filter((n) => !wanted.has(n));
  if (stale.length) {
    log(`fixtures: ${stale.length} leftover(s) from an earlier sweep left in place — inert, never requested`);
  }
  return { written: want.length, stale: stale.length };
}

/* ------------------------------------------------------------------ browser */

/**
 * Run a grid of measurements inside real Chrome against the real core.js.
 *
 * @param {Object<string,Buffer>} fixtures  key -> JPEG bytes
 * @param {Array} jobs  { key:{}, fixtureKey, width, height, minBytes, maxBytes }
 */
export async function runInBrowser(fixtures, jobs, { log = () => {}, fixtureDir = FIXTURE_DIR } = {}) {
  // Write the fixtures where the browser can read them, so the page loads real
  // files over HTTP instead of receiving tens of megabytes through the debugger.
  syncFixtures(fixtureDir, fixtures, { log });

  const { server, port } = await serve(TOOL, { fx: fixtureDir });
  let browser;
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') pageErrors.push('console: ' + m.text()); });
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
    const ua = await page.evaluate(() => navigator.userAgent);

    // Everything below runs inside the page, against the real module graph.
    const records = await page.evaluate(async ({ jobs }) => {
      const core = await import('/js/core.js');

      const loadImage = (key) => new Promise((resolve, reject) => {
        const im = new Image();
        im.onload = () => resolve(im);
        im.onerror = () => reject(new Error('fixture failed to load: ' + key));
        im.src = '/fx/' + key + '.jpg';
      });

      const canvas = document.createElement('canvas');
      const toBlob = (q) => new Promise((res) => canvas.toBlob((b) => res(b), 'image/jpeg', q));

      // Group by fixture so each image is decoded once and released after, rather
      // than holding dozens of full-size bitmaps in memory at the same time.
      const byFixture = new Map();
      for (const job of jobs) {
        if (!byFixture.has(job.fixtureKey)) byFixture.set(job.fixtureKey, []);
        byFixture.get(job.fixtureKey).push(job);
      }

      const out = [];
      for (const [key, group] of byFixture) {
        const img = await loadImage(key);
        // Identical to app.js loadBitmap(): the decoded file becomes an
        // ImageBitmap before anything is drawn from it.
        const bmp = await createImageBitmap(img);
        const src = { w: bmp.width, h: bmp.height };

        for (const job of group) {
          canvas.width = job.width;
          canvas.height = job.height;
          const g = canvas.getContext('2d');
          // Identical to app.js renderPreview().
          g.imageSmoothingEnabled = true;
          g.imageSmoothingQuality = 'high';
          g.fillStyle = '#ffffff';
          g.fillRect(0, 0, canvas.width, canvas.height);
          const crop = core.coverRect(src.w, src.h, job.width, job.height);
          g.drawImage(bmp, crop.x, crop.y, crop.width, crop.height, 0, 0, canvas.width, canvas.height);

          const measure = async (q) => {
            const b = await toBlob(q);
            return b ? b.size : Number.MAX_SAFE_INTEGER;
          };

          // The best file this box can produce at all — the number feasibility
          // actually depends on. Measured directly, not inferred from a search.
          const atMax = await measure(1.0);

          // Then the real search against the real window, so the outcome the user
          // would see is recorded next to the classification.
          const r = await core.searchQuality({
            measure,
            minBytes: job.minBytes,
            maxBytes: job.maxBytes,
          });

          out.push({
            ...job.key,
            specWidth: job.width,
            specHeight: job.height,
            minBytes: job.minBytes,
            maxBytes: job.maxBytes,
            decoded: src,
            crop: { w: Math.round(crop.width), h: Math.round(crop.height) },
            atMax,
            ok: r.ok,
            reason: r.reason,
            bytes: r.bytes ?? null,
            quality: r.quality ?? null,
            encodes: r.encodes,
          });
        }
        bmp.close();
      }
      return out;
    }, { jobs });

    if (pageErrors.length) log(`page errors: ${pageErrors.join(' | ')}`);
    return {
      records,
      meta: {
        measuredAt: new Date().toISOString(),
        userAgent: ua,
        chrome: (ua.match(/Chrome\/[\d.]+/) || ['unknown'])[0],
        pageErrors,
      },
    };
  } finally {
    if (browser) await browser.close();
    server.close();
  }
}

/** Measure the whole registry in a real browser. */
export async function measureBrowserTruth({ log = () => {} } = {}) {
  const fixtures = buildFixturesFromRegistry();
  const jobs = buildJobsFromRegistry();
  log(`fixtures: ${Object.keys(fixtures).length} JPEG file(s), ` +
    `${(Object.values(fixtures).reduce((a, b) => a + b.length, 0) / 1048576).toFixed(1)} MB total`);
  log(`jobs    : ${jobs.length} measurement(s) across ${new Set(jobs.map((j) => j.key.id)).size} registry entries`);
  const { records, meta } = await runInBrowser(fixtures, jobs, { log });
  log(`browser : ${meta.chrome} (real system Chrome)`);
  return { records, meta };
}

/* ------------------------------------------------------------------- CLI */
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const { records, meta } = await measureBrowserTruth({ log: (m) => console.log(m) });
  const byId = new Map();
  for (const r of records) {
    if (!byId.has(r.id)) byId.set(r.id, []);
    byId.get(r.id).push(r);
  }
  console.log('\n' + '='.repeat(104));
  console.log('BROWSER-MEASURED BEST ACHIEVABLE SIZE  (JPEG quality 1.0, real Chrome, real core.js)');
  console.log('='.repeat(104));
  console.log('SPEC'.padEnd(24) + 'BOX'.padEnd(11) + 'WINDOW'.padEnd(12) +
    'q1.0 ACROSS THE DECLARED SWEEP'.padEnd(40) + 'MIN'.padEnd(9) + 'SEARCH');
  console.log('-'.repeat(104));
  for (const [id, rs] of byId) {
    const first = rs[0];
    const all = rs.map((r) => r.atMax);
    console.log(
      id.padEnd(24) +
      `${first.specWidth}x${first.specHeight}`.padEnd(11) +
      `${first.minBytes / 1024}-${first.maxBytes / 1024}KB`.padEnd(12) +
      `${(Math.min(...all) / 1024).toFixed(1)} - ${(Math.max(...all) / 1024).toFixed(1)} KB`.padEnd(40) +
      `${(Math.min(...all) / 1024).toFixed(1)}KB`.padEnd(9) +
      (rs.every((r) => r.ok) ? `passes (${rs.length})` : rs.some((r) => r.ok)
        ? `mixed (${rs.filter((r) => r.ok).length}/${rs.length} pass)` : `refuses (${rs.length})`)
    );
  }
  console.log('-'.repeat(104));
  writeFileSync(join(HERE, 'browser_truth.json'), JSON.stringify({ meta, records }, null, 2));
  console.log('written: _verify/browser_truth.json');
}
