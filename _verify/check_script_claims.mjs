/*
 * check_script_claims.mjs — does the battle sheet tell the truth about what
 * appears on screen?
 *
 * The battle sheet is a shooting script. It says, at a specific timestamp, that
 * a specific thing will appear: "the requirement card", "the green result line",
 * "the tool refuses with best achieved 8.88 KB", "MPSC says no minimum". If any
 * of those is wrong, Harsh finds out with the camera running and has to re-shoot.
 *
 * This walks those claims against the DEPLOYED tool and reports which ones hold.
 * It needs the network, so it is deliberately not part of run_all.mjs.
 *
 *   node _verify/check_script_claims.mjs
 */
import { chromium } from 'file:///C:/Users/harsh/.workbuddy-ai/binaries/node/workspace/node_modules/playwright-core/index.mjs';
import { join } from 'node:path';
import { HERE } from './server.mjs';

const SITE = 'https://harshvgaj-sudo.github.io/exam-photo-signature-fitter';
const TOOL = `${SITE}/dist/photo-signature-fitter.html`;
const FX = join(HERE, 'fixtures');
const F_PRODUCES = join(FX, 'scan_g0_d2.jpg');   // clears the 10 KB floor
const F_REFUSED = join(FX, 'scan_g12_d1.jpg');   // cannot clear it

const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 };

let failures = 0;
const assert = (label, cond, detail = '', note = '') => {
  if (!cond) failures++;
  console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${label}${cond ? (note ? '  — ' + note : '') : (detail ? '  — ' + detail : '')}`);
};

/** Every visible text region of the requirement card, joined. */
const cardText = (p) =>
  p.evaluate(() => {
    const out = [];
    for (const id of ['liveCaptureWarn', 'presetWarning', 'presetRules', 'presetNote', 'preferLargerRow']) {
      const el = document.getElementById(id);
      if (el && !el.hidden) {
        const t = (el.innerText || '').replace(/\s+/g, ' ').trim();
        if (t) out.push(t);
      }
    }
    return out.join('  ||  ');
  });

/**
 * Press Fit the way a person does — wait until the button is actually available.
 *
 * The tool disables it while a photograph is decoding, because a fit pressed in
 * that window measures the PREVIOUS image. Clicking a disabled button is a
 * no-op, so this wait is not politeness: it is what makes the walkthrough mirror
 * a user instead of driving the page faster than any human could.
 */
async function clickFit(p) {
  await p.waitForSelector('#processBtn:not([disabled])', { timeout: 30000 });
  await clickFit(p);
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext(PHONE);
const p = await ctx.newPage();
const errors = [];
p.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
p.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

console.log('='.repeat(100));
console.log('SCRIPT CLAIMS — does what the battle sheet promises actually appear on screen?');
console.log('='.repeat(100));
console.log(`\n  ${TOOL}`);

await p.goto(TOOL, { waitUntil: 'load' });

/* ============================================ A. the dropdown, per PART 4 */
console.log('\n--- A. "Point out the exam names — SSC, IBPS, UPSC, RRB, MPSC" (PART 4) ---');
const options = await p.locator('#presetSelect option').evaluateAll((os) =>
  os.map((o) => ({ value: o.value, label: o.textContent.trim() })));
console.log(`  ${options.length} options in the dropdown`);

for (const exam of ['SSC', 'IBPS', 'UPSC', 'RRB', 'MPSC']) {
  const hit = options.some((o) => o.label.toUpperCase().includes(exam));
  assert(`the dropdown offers ${exam}`, hit,
    `no option mentions ${exam}. Labels: ${options.map((o) => o.label).join(' / ').slice(0, 200)}`);
}

/* ================================= B. the requirement cards, per PARTS 5-7 */
// Each claim is [preset id, what the sheet says, substring that must be present].
const CARD_CLAIMS = [
  ['ssc-signature', 'PART 4: "SSC Signature — 140 by 60 pixels, 10 to 20 KB"', ['140', '60', '10', '20']],
  ['ssc-photo', 'PART 5: "Select SSC Photo — the warning card appears"', ['live', 'capture']],
  ['upsc-photo', 'PART 6: "UPSC Photo is 500 by 500, between 20 and 200 KB"', ['500', '20', '200']],
  ['upsc-signature', 'PART 6: "a TRIPLE signature ... 350 by 350, 20 to 100 KB"', ['350', 'triple']],
  ['rrb-signature', 'PART 7: "this tool ships 551 by 315"', ['551', '315']],
  ['mpsc-photo', 'PART 7: "MPSC ... a maximum of 50 KB and no minimum at all"', ['50', 'no minimum']],
];

console.log('\n--- B. the requirement cards the script points the camera at (PARTS 4-7) ---');
for (const [id, claim, needles] of CARD_CLAIMS) {
  await p.selectOption('#presetSelect', id);
  await p.waitForTimeout(250);
  const text = await cardText(p);
  const lower = text.toLowerCase();
  const missing = needles.filter((n) => !lower.includes(n.toLowerCase()));
  console.log(`\n  [${id}] ${text.slice(0, 230)}`);
  assert(claim, missing.length === 0,
    `the card never says: ${missing.join(', ')}`);
}

/* ============================== C. the UPSC myth-buster is a real absence */
console.log('\n--- C. PART 6: "you may have read that your name and date must be printed" ---');
await p.selectOption('#presetSelect', 'upsc-photo');
await p.waitForTimeout(250);
const overlayControls = await p.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll('input, textarea')) {
    const label = (el.id + ' ' + el.name + ' ' + (el.getAttribute('aria-label') || '')).toLowerCase();
    if (/name|date/.test(label)) out.push(el.id || el.name);
  }
  return out;
});
assert('there is genuinely no name/date overlay control in the tool', overlayControls.length === 0,
  `found controls: ${overlayControls.join(', ')}`);
const upscText = (await cardText(p)).toLowerCase();
assert('the UPSC card does not claim a name/date requirement', !/name and date|name & date/.test(upscText),
  'the card mentions a name/date requirement');

/* ================================ D. the demo flow, per PART 4 */
console.log('\n--- D. the live demo: result line, filename, and the deliberate failure (PART 4) ---');
await p.selectOption('#presetSelect', 'ssc-signature');
await p.setInputFiles('#fileInput', F_PRODUCES);
await p.waitForFunction(() => {
  const el = document.querySelector('#cropBox');
  return el && el.offsetWidth > 0;
}, null, { timeout: 30000 });
await clickFit(p);
await p.waitForSelector('#downloadBtn:not([hidden])', { timeout: 60000 });

const status = (await p.locator('#status').innerText()).replace(/\s+/g, ' ').trim();
console.log(`  status: ${status}`);
assert('the green result line reports 140x60', /140x60/.test(status), `got: ${status.slice(0, 140)}`);
assert('it reports a size inside the 10-20 KB window', /10-20 KB window/.test(status),
  `got: ${status.slice(0, 140)}`);
assert('it says "Still confirm on the official upload page"', /Still confirm on the official upload page/.test(status),
  `got: ${status.slice(0, 200)}`);

const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 30000 }), p.click('#downloadBtn')]);
assert('the filename is ssc-signature_140x60.jpg', dl.suggestedFilename() === 'ssc-signature_140x60.jpg',
  `got ${dl.suggestedFilename()}`, dl.suggestedFilename());

// The deliberate failure — the best 30 seconds of the video.
await p.selectOption('#presetSelect', 'ssc-signature');
await p.setInputFiles('#fileInput', F_REFUSED);
await p.waitForFunction(() => {
  const el = document.querySelector('#cropBox');
  return el && el.offsetWidth > 0;
}, null, { timeout: 30000 });
await clickFit(p);
await p.waitForFunction(() => {
  const el = document.querySelector('#status');
  if (!el || el.hidden) return false;
  const k = (el.className || '').replace(/^status\s*/, '').trim();
  return k === 'ok' || k === 'bad';
}, null, { timeout: 90000 });

const refusal = (await p.locator('#status').innerText()).replace(/\s+/g, ' ').trim();
console.log(`  refusal: ${refusal.slice(0, 190)}`);
assert('the tool refuses the plain signature', /Not produced/i.test(refusal), `got: ${refusal.slice(0, 140)}`);
assert('the refusal quotes the 10 KB target and 140x60', /10 KB/.test(refusal) && /140x60/.test(refusal),
  `got: ${refusal.slice(0, 160)}`);
assert('the refusal states the best achievable size (8.88 KB)', /8\.88 KB/.test(refusal),
  `the script quotes 8.88 KB but the tool says something else: ${refusal.slice(0, 190)}`);
assert('the refusal says what to do about it ("sharper")', /sharper/i.test(refusal),
  `no actionable advice found: ${refusal.slice(0, 190)}`);
assert('no download is offered for the refused file', await p.locator('#downloadBtn').isHidden());

/* ============================== E. the offline claim, per the script */
console.log('\n--- E. "works with no internet connection after the page loads" ---');
await p.selectOption('#presetSelect', 'ssc-signature');
await p.setInputFiles('#fileInput', F_PRODUCES);
await p.waitForFunction(() => {
  const el = document.querySelector('#cropBox');
  return el && el.offsetWidth > 0;
}, null, { timeout: 30000 });

await ctx.setOffline(true);
console.log('  network cut (context offline)');

const failedWhileOffline = [];
p.on('requestfailed', (r) => failedWhileOffline.push(r.url()));

await clickFit(p);
let offlineProduced = true;
try {
  await p.waitForSelector('#downloadBtn:not([hidden])', { timeout: 60000 });
} catch { offlineProduced = false; }

const offlineStatus = (await p.locator('#status').innerText()).replace(/\s+/g, ' ').trim();
console.log(`  offline result: ${offlineStatus.slice(0, 120)}`);
assert('the tool still produces a file with the network cut', offlineProduced,
  `it failed offline: ${offlineStatus.slice(0, 160)}`);

if (offlineProduced) {
  const [dl2] = await Promise.all([p.waitForEvent('download', { timeout: 30000 }), p.click('#downloadBtn')]);
  assert('the offline download fires too', !!dl2.suggestedFilename(), 'no filename', dl2.suggestedFilename());
}
await ctx.setOffline(false);

assert('no page or console errors anywhere in this run', errors.length === 0, errors.join(' | '), 'none');

await browser.close();

console.log('\n' + '='.repeat(100));
console.log(failures
  ? `  ${failures} claim(s) FAILED — fix the tool or fix the script before recording`
  : '  Every on-screen claim in the battle sheet holds against the deployed tool.');
console.log('='.repeat(100));
process.exit(failures ? 1 : 0);
