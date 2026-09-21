/*
 * check_live_site.mjs — does the DEPLOYED site actually work?
 *
 * Deliberately NOT part of run_all.mjs. Every other suite runs offline against
 * local files; this one requires the network and a live deployment, so folding
 * it into run_all would make the offline suite fail on a plane.
 *
 * Run it after every deploy:
 *
 *   node _verify/check_live_site.mjs
 *
 * It exists because "the HTML downloaded" is not the same claim as "the tool
 * works". A subpath deploy can serve 200 for the page while every asset inside
 * it 404s — a relative path that was fine at the domain root breaks under
 * /exam-photo-signature-fitter/, and nothing about the response code says so.
 * So this opens the deployed pages in a real browser, watches the network for
 * failed requests, and drives the crop drag with genuine touch input.
 */
import { chromium } from 'file:///C:/Users/harsh/.workbuddy-ai/binaries/node/workspace/node_modules/playwright-core/index.mjs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HERE } from './server.mjs';

const SITE = 'https://harshvgaj-sudo.github.io/exam-photo-signature-fitter';
const FX = join(HERE, 'fixtures', 'scan_g12_d1.jpg');

const PHONE = {
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
  deviceScaleFactor: 3,
};

let failures = 0;
const assert = (label, cond, detail = '', note = '') => {
  if (!cond) failures++;
  console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${label}${cond ? (note ? '  — ' + note : '') : (detail ? '  — ' + detail : '')}`);
};

const browser = await chromium.launch({ channel: 'chrome', headless: true });

console.log('='.repeat(100));
console.log('LIVE SITE — the deployed pages, opened in a real browser');
console.log('='.repeat(100));
console.log(`\n  ${SITE}`);

/* ------------------------------------------------ 1. the landing page */
console.log('\n--- 1. the landing page loads with no failed requests ---');
{
  const ctx = await browser.newContext(PHONE);
  const p = await ctx.newPage();
  const failed = [];
  const errors = [];
  p.on('requestfailed', (r) => failed.push(`${r.url()} (${r.failure()?.errorText})`));
  p.on('response', (r) => { if (r.status() >= 400) failed.push(`${r.url()} -> HTTP ${r.status()}`); });
  p.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  const resp = await p.goto(SITE + '/', { waitUntil: 'load' });
  assert('the landing page returns 200', resp.status() === 200, `HTTP ${resp.status()}`, `HTTP ${resp.status()}`);
  assert('nothing failed to load', failed.length === 0, failed.join(' | '), '0 failed requests');
  assert('no page errors', errors.length === 0, errors.join(' | '), 'none');

  // The tool cards are how a visitor reaches anything. Check they point at the
  // deployed files, not at a path that only exists locally.
  const cards = await p.locator('a.tool-card').evaluateAll((els) =>
    els.map((e) => ({ href: e.getAttribute('href'), text: e.textContent.trim().slice(0, 40) })));
  console.log(`  ${cards.length} tool cards:`);
  for (const c of cards) console.log(`    "${c.text}" -> ${c.href}`);
  assert('both tool cards are present', cards.length === 2, `${cards.length} found`);

  // Follow each card for real: a 200 on the card's href is what a visitor gets.
  for (const c of cards) {
    const target = new URL(c.href, SITE + '/').toString();
    const r = await ctx.request.get(target);
    assert(`the card target resolves: ${c.href}`, r.status() === 200, `HTTP ${r.status()}`);
  }
  await ctx.close();
}

/* ------------------------------- 2. the deployed tool, driven by touch */
console.log('\n--- 2. the deployed photo tool: real touch drag ---');
{
  const ctx = await browser.newContext(PHONE);
  const p = await ctx.newPage();
  const failed = [];
  const errors = [];
  p.on('requestfailed', (r) => failed.push(`${r.url()} (${r.failure()?.errorText})`));
  p.on('response', (r) => { if (r.status() >= 400) failed.push(`${r.url()} -> HTTP ${r.status()}`); });
  p.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  const url = `${SITE}/dist/photo-signature-fitter.html`;
  const resp = await p.goto(url, { waitUntil: 'load' });
  assert('the tool returns 200', resp.status() === 200, `HTTP ${resp.status()}`, `HTTP ${resp.status()}`);

  await p.selectOption('#presetSelect', 'ssc-signature');
  await p.setInputFiles('#fileInput', FX);
  await p.waitForFunction(() => {
    const el = document.querySelector('#cropBox');
    return el && el.offsetWidth > 0;
  }, null, { timeout: 30000 });
  await p.waitForTimeout(250);

  const read = () => p.locator('#cropBox').evaluate((el) => ({
    left: Math.round(parseFloat(el.style.left) || 0),
    top: Math.round(parseFloat(el.style.top) || 0),
  }));

  const cdp = await ctx.newCDPSession(p);
  await p.locator('#cropBox').scrollIntoViewIfNeeded();
  await p.waitForTimeout(150);
  const scrollBefore = await p.evaluate(() => window.scrollY);
  const box = await p.locator('#cropBox').boundingBox();
  const sx = box.x + box.width / 2;
  const sy = box.y + box.height / 2;

  const before = await read();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: sx, y: sy }] });
  for (let i = 1; i <= 10; i++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove', touchPoints: [{ x: sx + 2 * i, y: sy + 6 * i }],
    });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await p.waitForTimeout(300);
  const after = await read();
  const scrollDelta = await p.evaluate((y) => window.scrollY - y, scrollBefore);

  console.log(`  frame ${JSON.stringify(before)} -> ${JSON.stringify(after)}  (dy=${after.top - before.top})`);
  assert('the crop drag works on the deployed build', after.top !== before.top,
    `frame did not move (dy=${after.top - before.top})`, `dy=${after.top - before.top}`);
  assert('the page did not scroll during the drag', scrollDelta === 0, `scrolled ${scrollDelta}px`, '0px');

  const targets = await p.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('button, select, input, a.sub-btn, a.ghost-btn')) {
      if (el.offsetParent === null || el.type === 'hidden') continue;
      const r = el.getBoundingClientRect();
      if (r.height > 0 && r.height < 44) out.push(`${el.id || el.tagName.toLowerCase()} ${Math.round(r.height)}px`);
    }
    return out;
  });
  assert('every control is at least 44px tall on the deployed build', targets.length === 0,
    targets.join(', '), 'all >= 44px');

  assert('no failed requests on the tool page', failed.length === 0, failed.join(' | '), 'none');
  assert('no page errors on the tool page', errors.length === 0, errors.join(' | '), 'none');
  await ctx.close();
}

/* --------------------- 3. the last mile: is the DOWNLOADED file correct? */
/*
 * Everything above stops at the UI. But the file the viewer walks away with has
 * never been opened and measured — and the filename is itself a claim:
 * `ssc-signature_140x60.jpg` asserts the bytes inside are 140x60. If they are
 * not, the tool has produced a file that lies about itself and the exam portal
 * rejects it, with the user having no way to tell why.
 *
 * So this completes the journey on the DEPLOYED build and parses the JPEG's own
 * header — the authoritative dimensions, not what the canvas claimed.
 */
const jpegSize = (buf) => {
  let i = 2; // skip SOI
  while (i < buf.length - 1) {
    if (buf[i] !== 0xff) { i++; continue; }
    const marker = buf[i + 1];
    // SOF0..SOF15 carry the frame dimensions; C4/C8/CC are not SOF markers.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return null;
};

// The SSC signature requirement, from the official PDF (_verify/pdf_text.txt):
// 140x60 px, 10-20 KB. Deliberately written out rather than read from the
// registry — if someone changes the registry, this check must fail and force a
// deliberate decision, not silently follow it.
const EXPECT = { id: 'ssc-signature', width: 140, height: 60, minKB: 10, maxKB: 20 };

// Two real viewer journeys. The second is the product's whole differentiator, so
// it gets asserted as hard as the first.
//
// At 140x60 a clean signature scan can fall UNDER the 10 KB floor — the risk on
// this preset is being too small, not too big. The tool must REFUSE rather than
// hand over a file the portal will reject. The original bug this project exists
// to fix printed "Success!" on a 6.53 KB file, so a refusal here is the feature
// working, not a failure. Measured on this machine: _d2 density clears the floor
// at ~13.4 KB, while g12_d1 tops out at 8.88 KB.
const JOURNEYS = [
  ['scan_g0_d2.jpg', 'produced'],
  ['scan_g12_d1.jpg', 'refused'],
];

console.log('\n--- 3. the full journey on the deployed site: process, download, measure ---');
for (const [fixture, expectation] of JOURNEYS) {
  console.log(`\n  [${fixture}]  expected outcome: ${expectation}`);
  const ctx = await browser.newContext({ ...PHONE, acceptDownloads: true });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  await p.goto(`${SITE}/dist/photo-signature-fitter.html`, { waitUntil: 'load' });
  await p.selectOption('#presetSelect', EXPECT.id);
  await p.setInputFiles('#fileInput', join(HERE, 'fixtures', fixture));
  await p.waitForFunction(() => {
    const el = document.querySelector('#cropBox');
    return el && el.offsetWidth > 0;
  }, null, { timeout: 30000 });

  await p.click('#processBtn');
  // The button is hidden until verify() passes, so its appearance IS the tool's
  // own claim that the file meets the requirement.
  let produced = true;
  try {
    await p.waitForSelector('#downloadBtn:not([hidden])', { timeout: 60000 });
  } catch { produced = false; }

  const status = (await p.locator('#status').innerText()).replace(/\s+/g, ' ').trim();
  console.log(`  tool said: ${status.slice(0, 170)}`);

  if (expectation === 'refused') {
    assert('the tool refused rather than shipping an out-of-window file', !produced,
      'it offered a download for a file that cannot meet the requirement');
    assert('the refusal explains why, in plain words', /KB/.test(status) && status.length > 40,
      `the message does not explain the cause: "${status.slice(0, 120)}"`);
  } else {
    assert('the deployed tool produced a file', produced,
      `the download button never appeared. Tool said: ${status.slice(0, 200)}`);

    if (produced) {
      const [download] = await Promise.all([
        p.waitForEvent('download', { timeout: 30000 }),
        p.click('#downloadBtn'),
      ]);
      const name = download.suggestedFilename();
      const bytes = readFileSync(await download.path());
      const dims = jpegSize(bytes);
      const kb = bytes.length / 1024;

      console.log(`  downloaded: ${name}  (${bytes.length} bytes, ${kb.toFixed(2)} KB)`);
      console.log(`  JPEG header: ${dims ? `${dims.width}x${dims.height}` : 'unparseable'}`);

      assert('the downloaded file is a real JPEG with a readable header', dims !== null,
        'no SOF marker found — the bytes are not a usable JPEG');
      if (dims) {
        assert(`the actual pixels are ${EXPECT.width}x${EXPECT.height}, as the requirement states`,
          dims.width === EXPECT.width && dims.height === EXPECT.height,
          `measured ${dims.width}x${dims.height}`);
        // The filename is a promise the user reads off their own disk. It must
        // match the bytes, or the file lies about itself.
        const claimed = name.match(/_(\d+)x(\d+)\.jpg$/);
        assert('the filename states the dimensions the file actually has',
          Boolean(claimed) && Number(claimed[1]) === dims.width && Number(claimed[2]) === dims.height,
          `filename claims ${claimed ? claimed[1] + 'x' + claimed[2] : 'nothing'}, bytes are ${dims.width}x${dims.height}`);
      }
      assert(`the file size is inside the ${EXPECT.minKB}-${EXPECT.maxKB} KB window`,
        kb >= EXPECT.minKB && kb <= EXPECT.maxKB,
        `${kb.toFixed(2)} KB is outside ${EXPECT.minKB}-${EXPECT.maxKB} KB`);
      assert('the download arrived with a usable filename',
        name.endsWith('.jpg') && name.length > 4, `filename was "${name}"`);
    }
  }

  assert('no page errors during the journey', errors.length === 0, errors.join(' | '), 'none');
  await ctx.close();
}

await browser.close();

console.log('\n' + '='.repeat(100));
console.log(failures ? `  ${failures} FAILED` : '  The deployed site serves both tools, and the crop drag works on a phone.');
console.log('='.repeat(100));
process.exit(failures ? 1 : 0);
