/*
 * test_certificate_swap.mjs — the certificate tool must stay coherent while it
 * is building.
 *
 * Found by asking whether the photo tool's race had a sibling here. It did, and
 * this one was worse than the photo tool's: changing the file selection while a
 * build was running
 *   - wiped the progress line (the change handler calls clearStatus),
 *   - RE-ENABLED Build, so a second concurrent build could start,
 *   - and left the user looking at an empty panel — no result, no error, no
 *     explanation, and nothing in the console.
 * A user who picks the wrong file and immediately picks another sees the tool
 * silently do nothing.
 *
 * The fix: a `building` flag, and the inputs (file, requirement, custom KB) are
 * disabled for the duration, so a real user cannot change the inputs underneath
 * a running build. `build()` also snapshots its file list, so it cannot mix two
 * selections.
 *
 * Note on how this is driven: `setInputFiles` waits for a disabled input to
 * become enabled, so using it here would block until the build had FINISHED and
 * then measure the wrong moment entirely — which is exactly the false reading
 * that hid the bug for a while. The change event is therefore dispatched
 * in-page, with no actionability wait.
 *
 * Runs offline against the built single-file tool.
 *
 *   node _verify/test_certificate_swap.mjs
 */
import { chromium } from 'file:///C:/Users/harsh/.workbuddy-ai/binaries/node/workspace/node_modules/playwright-core/index.mjs';
import { join } from 'node:path';
import { ROOT, HERE } from './server.mjs';

const TOOL = 'file:///' + join(ROOT, 'dist', 'certificate-to-pdf.html').replace(/\\/g, '/');
const BIG = join(HERE, 'fixtures', 'photo_g32.jpg');   // large: keeps the build running long enough

let failures = 0;
const assert = (label, cond, detail = '', note = '') => {
  if (!cond) failures++;
  console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${label}${cond ? (note ? '  — ' + note : '') : (detail ? '  — ' + detail : '')}`);
};

const snap = (p) => p.evaluate(() => ({
  buildDisabled: document.getElementById('buildBtn').disabled,
  fileDisabled: document.getElementById('fileInput').disabled,
  reqDisabled: document.getElementById('requirement').disabled,
  statusHidden: document.getElementById('status').hidden,
  status: (document.getElementById('status').innerText || '').replace(/\s+/g, ' ').trim().slice(0, 80),
  resultHidden: document.getElementById('result').hidden,
  downloadHidden: document.getElementById('downloadBtn').hidden,
}));

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 }, acceptDownloads: true });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  console.log('='.repeat(100));
  console.log('CERTIFICATE TOOL — changing the inputs during a build');
  console.log('='.repeat(100));

  await p.goto(TOOL, { waitUntil: 'load' });
  await p.selectOption('#requirement', 'ssc-certificate');
  await p.waitForTimeout(200);

  /* ------------------------------------------- 1. the inputs lock while busy */
  console.log('\n--- 1. a running build must lock its inputs ---');
  await p.setInputFiles('#fileInput', BIG);
  await p.waitForTimeout(200);
  const idle = await snap(p);
  assert('the inputs are open before a build starts',
    !idle.fileDisabled && !idle.reqDisabled && !idle.buildDisabled,
    `file=${idle.fileDisabled} req=${idle.reqDisabled} build=${idle.buildDisabled}`);

  await p.click('#buildBtn');
  // Wait for the build to be genuinely under way, not for a fixed delay.
  await p.waitForFunction(() => {
    const s = document.getElementById('status');
    return document.getElementById('buildBtn').disabled && s && !s.hidden;
  }, null, { timeout: 20000 });
  const running = await snap(p);
  console.log(`  while building: "${running.status}"`);
  assert('the file input is disabled while building', running.fileDisabled,
    'a user can still swap files mid-build');
  assert('the requirement selector is disabled while building', running.reqDisabled,
    'a user can still change the requirement mid-build');
  assert('Build is disabled while building', running.buildDisabled);

  /* ------------------- 2. a change event fired mid-build must not corrupt it */
  console.log('\n--- 2. a change event mid-build must not wipe the progress or unlock Build ---');
  // Dispatched in-page: setInputFiles would wait for the disabled input and so
  // would fire AFTER the build had finished, testing nothing.
  const fired = await p.evaluate(() => {
    const inp = document.getElementById('fileInput');
    inp.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  });
  await p.waitForTimeout(80);
  const after = await snap(p);
  console.log(`  after the change event: status="${after.status}"`);
  assert('the change event actually fired', fired);
  assert('the progress line survives a change event mid-build', !after.statusHidden,
    'the status was wiped — the user is left staring at an empty panel');
  // Not an identity check: the build advances its own message as it works, so
  // comparing strings would fail on a healthy build. What matters is that the
  // line is still there and still says something.
  assert('the progress line still says something', after.status.length > 0,
    `the status is blank: "${after.status}"`);
  assert('Build stays disabled — no second concurrent build', after.buildDisabled,
    'Build was re-enabled mid-build, allowing two builds to race');

  /* ---------------------------------- 3. and the build still finishes properly */
  console.log('\n--- 3. the build still completes and offers a verified result ---');
  await p.waitForFunction(() => !document.getElementById('buildBtn').disabled, null, { timeout: 120000 });
  const done = await snap(p);
  console.log(`  final status: "${done.status}"`);
  assert('the result is shown', !done.resultHidden, 'no result panel');
  assert('a download is offered', !done.downloadHidden, 'no download button');
  assert('the result is reported as verified', /verified/i.test(done.status),
    `status was "${done.status}"`);
  assert('the inputs are re-enabled afterwards', !done.fileDisabled && !done.reqDisabled,
    `file=${done.fileDisabled} req=${done.reqDisabled}`);

  const rows = await p.$$eval('#resultBody tr', (trs) =>
    trs.map((tr) => [tr.querySelector('th')?.textContent, tr.querySelector('td')?.textContent]));
  for (const [k, v] of rows) console.log(`    ${String(k).padEnd(14)}: ${v}`);
  const pages = (rows.find(([k]) => k === 'Pages') || [])[1];
  assert('it produced exactly one page for one image', pages === '1', `Pages=${pages}`);

  assert('no page or console errors', errors.length === 0, errors.join(' | '), 'none');
  await ctx.close();
} finally {
  await browser.close();
}

console.log('\n' + '='.repeat(100));
console.log(failures
  ? `  ${failures} FAILED`
  : '  A running build owns its inputs, and a change mid-build cannot corrupt it.');
console.log('='.repeat(100));
process.exit(failures ? 1 : 0);
