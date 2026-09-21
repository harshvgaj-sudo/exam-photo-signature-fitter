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

await browser.close();

console.log('\n' + '='.repeat(100));
console.log(failures ? `  ${failures} FAILED` : '  The deployed site serves both tools, and the crop drag works on a phone.');
console.log('='.repeat(100));
process.exit(failures ? 1 : 0);
