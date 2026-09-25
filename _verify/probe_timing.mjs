/*
 * probe_timing.mjs — how long after choosing a file is it safe to press Fit?
 *
 * check_script_claims.mjs got "Produced, but it failed its own check" where three
 * other probes, in every sequence order, got "Not produced". The only remaining
 * difference is that the probes wait 250ms after the crop frame appears and
 * check_script_claims clicks immediately.
 *
 * That would mean the tool measures a STALE image if Fit is pressed too soon —
 * serious, because it would report a size for the previous photo.
 *
 * But a defect only matters if a person can trigger it. So this measures the
 * actual safe window rather than just proving it exists:
 *
 *   delay 0ms   -> is the race real at all?
 *   delay 50ms  -> faster than any human reaction
 *   delay 250ms -> the probes' delay, expected clean
 *
 * If only 0ms fails, the bug is real but unreachable by hand, and the fix belongs
 * in the test harness. If 50ms or 250ms also fails, a user WILL hit it.
 */
import { chromium } from 'file:///C:/Users/harsh/.workbuddy-ai/binaries/node/workspace/node_modules/playwright-core/index.mjs';
import { join } from 'node:path';
import { HERE } from './server.mjs';

const TOOL = 'https://harshvgaj-sudo.github.io/exam-photo-signature-fitter/dist/photo-signature-fitter.html';
const F_OK = join(HERE, 'fixtures', 'scan_g0_d2.jpg');     // clears the floor (13.42 KB)
const F_BAD = join(HERE, 'fixtures', 'scan_g12_d1.jpg');   // cannot (8.88 KB)

const DELAYS = [0, 50, 250];
const REPS = 3;

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3,
});

const verdict = (s) => s.startsWith('Not produced') ? 'NOT-PRODUCED'
  : s.startsWith('Produced, but') ? 'PRODUCED-BUT-FAILED'
  : s.startsWith('Matches') ? 'MATCHES'
  : s.startsWith('That file') ? 'DECODE-FAIL' : 'OTHER';

async function fit(p, file, delayMs) {
  await p.setInputFiles('#fileInput', file);
  await p.waitForFunction(() => {
    const el = document.querySelector('#cropBox');
    return el && el.offsetWidth > 0;
  }, null, { timeout: 30000 });
  if (delayMs) await p.waitForTimeout(delayMs);
  await p.click('#processBtn');
  await p.waitForFunction(() => {
    const el = document.querySelector('#status');
    if (!el || el.hidden) return false;
    const k = (el.className || '').replace(/^status\s*/, '').trim();
    return k === 'ok' || k === 'bad';
  }, null, { timeout: 90000 });
  return (await p.locator('#status').innerText()).replace(/\s+/g, ' ').trim();
}

console.log('='.repeat(100));
console.log('TIMING — is the Fit button safe to press immediately after choosing a file?');
console.log('='.repeat(100));

const results = {};
for (const delay of DELAYS) {
  const kinds = [];
  for (let i = 0; i < REPS; i++) {
    // Fresh page each rep: the failing case followed a successful fit, so the
    // prior image has to be present for the race to be able to show itself.
    const p = await ctx.newPage();
    await p.goto(TOOL, { waitUntil: 'load' });
    await p.selectOption('#presetSelect', 'ssc-signature');
    await p.waitForTimeout(200);
    await fit(p, F_OK, 250);            // prime with a good file, as the script does
    const text = await fit(p, F_BAD, delay);
    await p.close();
    kinds.push(verdict(text));
    if (i === 0) results[`${delay}ms`] = text;
  }
  const stable = [...new Set(kinds)];
  console.log(`\n  delay ${String(delay).padStart(3)}ms : ${kinds.join(', ')}`
    + (stable.length === 1 ? '   (stable)' : '   <-- UNSTABLE'));
  if (stable.length > 1 || stable[0] !== 'NOT-PRODUCED') {
    console.log(`     ${(results[`${delay}ms`] || '').slice(0, 150)}`);
  }
}

console.log('\n' + '='.repeat(100));
const at0 = results['0ms'] ? verdict(results['0ms']) : null;
console.log('  Human reaction time to a button is ~250ms+, so a 0ms-only failure is');
console.log('  not reachable by hand. What matters is whether 50ms/250ms fail too.');
console.log('='.repeat(100));

await browser.close();
process.exit(0);
