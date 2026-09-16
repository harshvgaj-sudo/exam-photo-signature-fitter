/*
 * test_certificate_tool.mjs — drive the built tool in a real browser.
 *
 * The writer is unit-tested. This tests everything around it, which is where the
 * failures actually live: does the resolution/quality search converge, does the
 * page render, does the download fire, and does the tool REFUSE when it should.
 *
 * The central claim under test is the one the official SSC document makes:
 * PDF format, A4 page size, not exceeding 500 KB. So the downloaded file is
 * opened and inspected — never taken on the tool's word.
 *
 * Fixtures go to the OS temp directory, not the project, so running this does
 * not leave anything behind in the repo.
 */
import { chromium } from 'file:///C:/Users/harsh/.workbuddy-ai/binaries/node/workspace/node_modules/playwright-core/index.mjs';
import jpeg from 'file:///C:/Users/harsh/.workbuddy-ai/binaries/node/workspace/node_modules/jpeg-js/index.js';
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { inspectPdf, A4 } from '../tools/certificate-pdf/js/pdf.js';

const ROOT = 'C:/Users/harsh/WorkBuddy AI/2026-09-14-10-03-21/govdocs-review';
const TOOL = pathToFileURL(join(ROOT, 'dist', 'certificate-to-pdf.html')).href;

const FX = join(tmpdir(), 'cert-pdf-test');
mkdirSync(FX, { recursive: true });

let failures = 0;
const assert = (label, cond, detail = '') => {
  if (!cond) failures++;
  console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${label}${detail ? '  — ' + detail : ''}`);
};

/* ------------------------------------------------------------- fixtures */

/** A phone-photo-like certificate: paper gradient, text bands, mild noise. */
function certificateJpeg(w, h, seed = 7, quality = 92) {
  let s = seed;
  const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      let v = 232 - Math.floor((y / h) * 30) + Math.floor((x / w) * 8);
      const band = Math.floor(y / 30) % 2 === 0 && y % 30 < 11;
      if (band && Math.floor(x / 21) % 4 !== 0 && x > w * 0.12 && x < w * 0.88) v = 44;
      // A "seal" so there is some solid dark area, like a real certificate.
      if (Math.hypot(x - w * 0.72, y - h * 0.8) < Math.min(w, h) * 0.09) v = 96;
      v += Math.floor(rnd() * 16) - 8;
      data[i] = v < 0 ? 0 : v > 255 ? 255 : v;
      data[i + 1] = data[i]; data[i + 2] = data[i]; data[i + 3] = 255;
    }
  }
  return Buffer.from(jpeg.encode({ data, width: w, height: h }, quality).data);
}

const CERT_A = join(FX, 'cert-a.jpg');
const CERT_B = join(FX, 'cert-b.jpg');
const NOT_AN_IMAGE = join(FX, 'broken.jpg');
writeFileSync(CERT_A, certificateJpeg(3024, 4032, 11));   // a 12 MP phone photo
writeFileSync(CERT_B, certificateJpeg(4032, 3024, 29));   // landscape
// A file that claims to be a JPEG but is truncated — a real, expected input.
writeFileSync(NOT_AN_IMAGE, Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]));

/* ---------------------------------------------------------------- helpers */

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 }, acceptDownloads: true });
const page = await ctx.newPage();

const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

/** Wait for a terminal verdict rather than a fixed delay. */
async function buildAndWait(files) {
  await page.locator('#fileInput').setInputFiles(files);
  await page.waitForFunction(() => {
    const b = document.querySelector('#buildBtn');
    return b && !b.disabled;
  }, null, { timeout: 20000 });

  await page.locator('#buildBtn').click();
  await page.waitForFunction(() => {
    const el = document.querySelector('#status');
    if (!el || el.hidden) return false;
    const kind = (el.className || '').replace(/^status\s*/, '').trim();
    return kind === 'ok' || kind === 'bad';
  }, null, { timeout: 90000 });

  return {
    cls: (await page.locator('#status').getAttribute('class')) || '',
    text: (await page.locator('#status').innerText()).replace(/\s+/g, ' '),
  };
}

/** Click download and return the file's bytes, or null. */
async function grabDownload() {
  try {
    const p = page.waitForEvent('download', { timeout: 20000 });
    p.catch(() => {});            // never let an orphaned wait kill the process
    await page.locator('#downloadBtn').click();
    const dl = await p;
    return { buf: readFileSync(await dl.path()), name: dl.suggestedFilename() };
  } catch {
    return null;
  }
}

const resultRows = () => page.$$eval('#resultBody tr', (trs) =>
  trs.map((tr) => [tr.querySelector('th').textContent, tr.querySelector('td').textContent]));

/* ------------------------------------------------------------------ tests */

console.log('=== CERTIFICATE TO PDF — end to end in a real browser ===\n');

await page.goto(TOOL, { waitUntil: 'load' });
await page.waitForTimeout(300);

console.log('1. one 12 MP phone photo -> one A4 PDF under 500 KB');
{
  const status = await buildAndWait([CERT_A]);
  console.log('   status   :', status.text.slice(0, 120));

  assert('the build succeeded', /\bok\b/.test(status.cls), status.text.slice(0, 120));

  const rows = await resultRows();
  for (const [k, v] of rows) console.log(`   ${k.padEnd(14)}: ${v}`);
  const row = (k) => (rows.find(([a]) => a === k) || [, ''])[1];

  assert('it reports one page', row('Pages') === '1', row('Pages'));
  assert('it reports A4 for every page', /A4 \(all pages\)/.test(row('Page size')), row('Page size'));
  assert('the format check passed', /valid PDF/.test(row('Format check')), row('Format check'));

  const d = await grabDownload();
  assert('a download fired', !!d, d ? d.name : 'no download event');
  if (d) {
    console.log(`   downloaded: ${d.name}, ${(d.buf.length / 1024).toFixed(1)} KB`);
    const info = inspectPdf(new Uint8Array(d.buf));
    assert('the downloaded file is a valid PDF', info.ok, info.problems.join('; ') || 'no problems');
    assert('it has exactly one page', info.pageCount === 1, `${info.pageCount}`);
    assert('the page really is A4 (595.276 x 841.89 pt)', info.a4Pages === 1, `${info.a4Pages}`);
    assert('it is under the 500 KB ceiling', d.buf.length <= 500 * 1024,
      `${(d.buf.length / 1024).toFixed(1)} KB`);
    assert('it is named .pdf', /\.pdf$/.test(d.name), d.name);
    // The image inside must be a real JPEG, not a re-encoded blob of a different size.
    const src = readFileSync(CERT_A);
    assert('the embedded image is smaller than the 12 MP original (it was downscaled to fit)',
      d.buf.length < src.length, `${(d.buf.length / 1024).toFixed(0)} KB vs ${(src.length / 1024).toFixed(0)} KB`);
  }
}

console.log('\n2. two certificates -> two A4 pages, still one file');
{
  const status = await buildAndWait([CERT_A, CERT_B]);
  assert('the build succeeded', /\bok\b/.test(status.cls), status.text.slice(0, 120));

  const rows = await resultRows();
  const row = (k) => (rows.find(([a]) => a === k) || [, ''])[1];
  assert('it reports two pages', row('Pages') === '2', row('Pages'));

  const d = await grabDownload();
  assert('a download fired', !!d);
  if (d) {
    const info = inspectPdf(new Uint8Array(d.buf));
    console.log(`   downloaded: ${(d.buf.length / 1024).toFixed(1)} KB, ${info.pageCount} pages`);
    assert('the PDF has two pages', info.pageCount === 2, `${info.pageCount}`);
    assert('both pages are A4', info.a4Pages === 2, `${info.a4Pages}`);
    assert('it is still under 500 KB', d.buf.length <= 500 * 1024,
      `${(d.buf.length / 1024).toFixed(1)} KB`);
  }
}

console.log('\n3. an impossible ceiling is REFUSED, with no download');
{
  await page.selectOption('#requirement', 'custom');
  await page.waitForTimeout(200);
  await page.fill('#maxKB', '40');                       // 40 KB cannot hold a full-page scan
  await page.waitForTimeout(150);

  const status = await buildAndWait([CERT_A]);
  console.log('   status   :', status.text.slice(0, 150));

  assert('the tool refuses rather than shipping a file over the limit',
    /\bbad\b/.test(status.cls), status.text.slice(0, 120));
  assert('the refusal says what the best achievable size was',
    /best|comes to|KB/i.test(status.text), 'mentions a size');
  assert('no download is offered for a file that would be rejected',
    await page.locator('#downloadBtn').isHidden());
}

console.log('\n4. a file the browser cannot decode is explained, not silently dropped');
{
  await page.selectOption('#requirement', 'ssc-certificate');
  await page.waitForTimeout(200);

  const status = await buildAndWait([NOT_AN_IMAGE]);
  console.log('   status   :', status.text.slice(0, 160));

  assert('it refuses clearly', /\bbad\b/.test(status.cls));
  assert('it names the formats that do work', /JPEG and PNG/.test(status.text), 'says JPEG and PNG');
  assert('it warns about HEIC rather than leaving the user guessing',
    /HEIC/i.test(status.text), 'mentions HEIC');
  assert('no download is offered', await page.locator('#downloadBtn').isHidden());
}

console.log('\n5. the tool makes no external request and logs no errors');
{
  const requests = [];
  const p2 = await ctx.newPage();
  p2.on('request', (r) => { if (!r.url().startsWith('file:') && !r.url().startsWith('data:')) requests.push(r.url()); });
  await p2.goto(TOOL, { waitUntil: 'load' });
  await p2.waitForTimeout(400);
  assert('nothing is requested from the network at load', requests.length === 0,
    requests.join(', ') || 'no external requests');
  await p2.close();

  assert('no console or page errors, even after deliberately bad input',
    errors.length === 0, errors.join(' | ') || 'none');
}

console.log('\n' + '='.repeat(60));
console.log(failures ? `${failures} assertion(s) FAILED` : 'certificate tool verified end to end');
console.log('='.repeat(60));

await browser.close();
process.exit(failures === 0 ? 0 : 1);
