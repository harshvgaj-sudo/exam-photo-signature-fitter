/*
 * test_image_swap.mjs — a second photograph must be judged on its own contents.
 *
 * Found while checking the video script: the battle sheet's deliberate-failure
 * demo produced
 *   "Produced, but it failed its own check — size 8.88 KB is below the 10 KB minimum"
 * instead of the
 *   "Not produced — This image cannot reach 10 KB at 140x60 ... Try a sharper,
 *    higher-contrast capture."
 * the script quotes.
 *
 * Root cause: `state.img` is assigned after `await loadBitmap(file)`, but the
 * crop card is ALREADY on screen from the previous file. So nothing signals
 * "not ready", and a Fit pressed while the new photo is still decoding measures
 * the OLD one. The search then reports an in-window size for a photograph the
 * user is no longer looking at, and the final re-encode disagrees — which is the
 * defence-in-depth check doing its job, but arriving at a contradictory message.
 *
 * Measured window on a fast desktop: under 50ms (0ms = 2/3 wrong, 50ms = clean).
 * That is why it survived every previous suite: they all wait ~250ms, which is
 * roughly human reaction time. On a phone decoding a multi-megapixel photo the
 * window is far wider, and the audience is on phones.
 *
 * The fix disables Fit while decoding. This asserts that guarantee directly,
 * rather than relying on a timing race to reproduce.
 *
 * Runs offline against the modular tool over HTTP, so run_all covers it.
 *
 *   node _verify/test_image_swap.mjs
 */
import { chromium } from 'file:///C:/Users/harsh/.workbuddy-ai/binaries/node/workspace/node_modules/playwright-core/index.mjs';
import { join } from 'node:path';
import { serve, TOOL, HERE } from './server.mjs';

const F_OK = join(HERE, 'fixtures', 'scan_g0_d2.jpg');     // clears the 10 KB floor
const F_BAD = join(HERE, 'fixtures', 'scan_g12_d1.jpg');   // cannot clear it

let failures = 0;
const assert = (label, cond, detail = '', note = '') => {
  if (!cond) failures++;
  console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${label}${cond ? (note ? '  — ' + note : '') : (detail ? '  — ' + detail : '')}`);
};

const kind = (s) => s.startsWith('Not produced') ? 'NOT-PRODUCED'
  : s.startsWith('Produced, but') ? 'PRODUCED-BUT-FAILED'
  : s.startsWith('Matches') ? 'MATCHES'
  : s.startsWith('That file') ? 'DECODE-FAIL' : 'OTHER';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const { server, port } = await serve(TOOL, { fx: join(HERE, 'fixtures') });
const BASE = `http://127.0.0.1:${port}/`;

try {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 } });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  console.log('='.repeat(100));
  console.log('IMAGE SWAP — is the second photograph measured, or the first?');
  console.log('='.repeat(100));

  await p.goto(BASE, { waitUntil: 'load' });
  await p.selectOption('#presetSelect', 'ssc-signature');
  await p.waitForTimeout(200);

  /** Wait for a terminal verdict. */
  const settle = async () => {
    await p.waitForFunction(() => {
      const el = document.querySelector('#status');
      if (!el || el.hidden) return false;
      const k = (el.className || '').replace(/^status\s*/, '').trim();
      return k === 'ok' || k === 'bad';
    }, null, { timeout: 90000 });
    return (await p.locator('#status').innerText()).replace(/\s+/g, ' ').trim();
  };

  /* ---------------------------------------------- 1. the two files differ */
  console.log('\n--- 1. the two fixtures genuinely disagree, so the test means something ---');
  await p.setInputFiles('#fileInput', F_OK);
  await p.waitForFunction(() => {
    const el = document.querySelector('#cropBox');
    return el && el.offsetWidth > 0;
  }, null, { timeout: 30000 });
  await p.waitForSelector('#processBtn:not([disabled])', { timeout: 30000 });
  await p.click('#processBtn');
  const firstText = await settle();
  const firstKind = kind(firstText);
  console.log(`  first  (g0_d2)  : ${firstKind}  — ${firstText.slice(0, 90)}`);
  assert('the first photograph fits the window', firstKind === 'MATCHES',
    `expected MATCHES, got ${firstKind}: ${firstText.slice(0, 140)}`);

  /* --------------------------- 2. the guard: Fit is disabled while decoding */
  console.log('\n--- 2. choosing a new file must disable Fit until that file is loaded ---');
  // Register the probe BEFORE the change fires. The app's own listener was
  // registered first, so by the time this one runs the button state is final —
  // which makes this a deterministic check, not a timing race.
  const [disabledAtChange] = await Promise.all([
    p.evaluate(() => new Promise((resolve) => {
      const btn = document.getElementById('processBtn');
      document.getElementById('fileInput').addEventListener('change',
        () => resolve(btn.disabled), { once: true });
    })),
    p.setInputFiles('#fileInput', F_BAD),
  ]);
  assert('Fit is disabled at the moment a new file is chosen', disabledAtChange === true,
    'the button stayed enabled, so a fit can still be pressed mid-decode',
    'disabled');

  /* ------------------- 3. the verdict is about the SECOND file, not the first */
  console.log('\n--- 3. the second photograph is judged on its own contents ---');
  await p.waitForSelector('#processBtn:not([disabled])', { timeout: 30000 });
  await p.click('#processBtn');
  const secondText = await settle();
  const secondKind = kind(secondText);
  console.log(`  second (g12_d1) : ${secondKind}  — ${secondText.slice(0, 140)}`);

  assert('the second photograph gets its own verdict, not the first one\'s',
    secondKind === 'NOT-PRODUCED',
    `got ${secondKind}. If this is MATCHES the tool measured the previous photo; ` +
    `PRODUCED-BUT-FAILED means it measured one photo and encoded another. Text: ${secondText.slice(0, 180)}`);
  assert('the contradictory "Produced, but it failed its own check" message is gone',
    secondKind !== 'PRODUCED-BUT-FAILED',
    `the message still reads: ${secondText.slice(0, 180)}`);
  assert('the refusal still tells the user what to do',
    /sharper|higher-contrast|contrast/i.test(secondText),
    `no actionable advice in: ${secondText.slice(0, 200)}`);
  assert('no download is offered for the refused file',
    await p.locator('#downloadBtn').isHidden(), 'the download button is visible');

  /* ----------------------------- 4. hammer the race: press Fit immediately */
  console.log('\n--- 4. pressing Fit the instant a file is chosen must not corrupt the verdict ---');
  for (let i = 1; i <= 3; i++) {
    await p.setInputFiles('#fileInput', F_OK);
    await p.waitForFunction(() => {
      const el = document.querySelector('#cropBox');
      return el && el.offsetWidth > 0;
    }, null, { timeout: 30000 });
    await p.waitForSelector('#processBtn:not([disabled])', { timeout: 30000 });
    await p.click('#processBtn');
    await settle();

    // Now swap to the bad file and press Fit as fast as the page allows.
    await p.setInputFiles('#fileInput', F_BAD);
    await p.waitForFunction(() => {
      const el = document.querySelector('#cropBox');
      return el && el.offsetWidth > 0;
    }, null, { timeout: 30000 });
    // Deliberately NO settle wait — this is the window that used to break.
    try { await p.click('#processBtn', { timeout: 150 }); } catch { /* disabled: correct */ }
    await p.waitForSelector('#processBtn:not([disabled])', { timeout: 30000 });
    await p.click('#processBtn');
    const text = await settle();
    assert(`round ${i}: the verdict is still about the second file`, kind(text) === 'NOT-PRODUCED',
      `got ${kind(text)}: ${text.slice(0, 140)}`, kind(text));
  }

  assert('no page or console errors', errors.length === 0, errors.join(' | '), 'none');
  await ctx.close();
} finally {
  await browser.close();
  server.close();
}

console.log('\n' + '='.repeat(100));
console.log(failures
  ? `  ${failures} FAILED`
  : '  A second photograph is judged on its own contents, and Fit cannot be pressed mid-decode.');
console.log('='.repeat(100));
process.exit(failures ? 1 : 0);
