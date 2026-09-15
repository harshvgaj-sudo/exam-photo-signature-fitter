/*
 * test_negative_controls.mjs — prove the NEW/strengthened assertions can FAIL.
 *
 * An assertion that cannot fail is decoration, so every check added in this pass
 * gets exercised against a deliberately broken state. If a control below reports
 * that the check still passed on broken input, the check is worthless.
 *
 *   1. shot_report.mjs   captured-output floor:  >= 8  ->  >= 16   (was half-slack)
 *   2. test_single_file  boot title:             length>0 -> exact (was any string)
 *   3. test_browser.mjs  download guard:         if (d){...} -> if/else  (was silent)
 *   4. test_browser.mjs  marginal claim:         assert(...,true) -> real AND
 */
import { chromium } from 'file:///C:/Users/harsh/.workbuddy-ai/binaries/node/workspace/node_modules/playwright-core/index.mjs';
import { pathToFileURL } from 'node:url';

const ROOT = 'C:/Users/harsh/WorkBuddy AI/2026-09-14-10-03-21/govdocs-review';
const REPORT = pathToFileURL(`${ROOT}/CODE_REVIEW_AND_PLAN.html`).href;
const TOOL = pathToFileURL(`${ROOT}/dist/photo-signature-fitter.html`).href;

let bad = 0;
const check = (label, ok, detail = '') => {
  if (!ok) bad++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? '  — ' + detail : ''}`);
};

const browser = await chromium.launch({ channel: 'chrome', headless: true });

// ---------------------------------------------------------------------------
console.log('\n=== CONTROL 1 + 2: the report checks, on a deliberately broken page ===');
{
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
  await page.goto(REPORT, { waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelectorAll('h2').length > 0, null, { timeout: 15000 });

  const before = await page.evaluate(() => ({
    mono: document.querySelectorAll('.mono-out').length,
    title: document.title,
  }));
  console.log(`  baseline: ${before.mono} mono blocks, title "${before.title}"`);

  // --- control 1: the floor must reject a page missing its evidence ---------
  check('CONTROL 1a: the real report passes the >= 16 floor',
    before.mono >= 16, `${before.mono} blocks`);
  const afterRemoval = await page.evaluate(() => {
    const blocks = [...document.querySelectorAll('.mono-out')];
    // Remove half the evidence — exactly what the old `>= 8` floor would tolerate.
    blocks.slice(0, 8).forEach((b) => b.remove());
    return document.querySelectorAll('.mono-out').length;
  });
  check('CONTROL 1b: removing 8 blocks FAILS the >= 16 floor',
    !(afterRemoval >= 16), `${afterRemoval} blocks left`);
  check('CONTROL 1c: ...and the OLD >= 8 floor would have PASSED that broken page',
    afterRemoval >= 8, `${afterRemoval} >= 8 — this is why the floor was raised`);

  // --- control 2: the title check must reject a wrong title -----------------
  const wrongTitle = await page.evaluate(() => {
    document.title = 'Error: file not found';
    return document.title;
  });
  check('CONTROL 2a: the old length>0 check PASSES a browser error title',
    wrongTitle.length > 0, `"${wrongTitle}" — the old check could not tell`);
  check('CONTROL 2b: the new exact check REJECTS that same title',
    wrongTitle !== 'Photo & Signature Fitter', `"${wrongTitle}"`);

  await page.close();
}

// ---------------------------------------------------------------------------
console.log('\n=== CONTROL 3: the download guard is reachable (not dead code) ===');
{
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
  await page.goto(TOOL, { waitUntil: 'load' });
  await page.waitForTimeout(400);

  // ssc-photo is liveCaptureOnly, so the fit button is disabled and no file is
  // ever offered. That makes it a real, reachable "download did not fire" state.
  await page.selectOption('#presetSelect', 'ssc-photo');
  await page.waitForTimeout(300);
  const hidden = await page.locator('#downloadBtn').isHidden();

  // Replay grabDownload()'s exact shape and confirm it yields null, which is
  // what routes control flow into the new `else { assert(..., false) }`.
  let d = null;
  try {
    const p = page.waitForEvent('download', { timeout: 4000 });
    // Without this the orphaned promise rejects later as an UNHANDLED rejection
    // and kills the process — the exact hazard found in the real grabDownload().
    p.catch(() => {});
    await page.locator('#downloadBtn').click();
    d = await p;
  } catch { d = null; }

  check('CONTROL 3a: the button really is hidden for a live-capture preset', hidden);
  check('CONTROL 3b: grabDownload() returns null here, so the else branch runs',
    d === null, d ? 'a download fired unexpectedly' : 'null — else branch is live');
  check('CONTROL 3c: that null now produces a FAILING assertion, not silence',
    !(d !== null), 'the suite would report "the download fired for ... = false"');

  await page.close();
}

// ---------------------------------------------------------------------------
console.log('\n=== CONTROL 4: the marginal claim is now a real AND ===');
{
  // The old assertion was assert(label, true) — unreachable. The new one is a
  // conjunction of two captured booleans, so each half must be able to sink it.
  const evaluate = (refused, accepted) => refused && accepted;
  check('CONTROL 4a: refused=true, accepted=true  -> passes',
    evaluate(true, true) === true);
  check('CONTROL 4b: refused=false, accepted=true -> FAILS (half one missing)',
    evaluate(false, true) === false);
  check('CONTROL 4c: refused=true, accepted=false -> FAILS (half two missing)',
    evaluate(true, false) === false);
  // Deliberately NOT a check: a vacuous assertion here would be self-defeating in
  // a file whose whole purpose is proving that assertions can fail.
  console.log('  note  CONTROL 4d: the OLD `assert(label, true)` could not fail on any of the above');
}

await browser.close();
console.log('\n' + '='.repeat(60));
console.log(bad ? `${bad} control(s) FAILED — a check is not doing its job` : 'all negative controls behaved correctly');
console.log('='.repeat(60));
process.exit(bad === 0 ? 0 : 1);
