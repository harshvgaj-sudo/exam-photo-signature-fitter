/*
 * TEST I — end-to-end browser test of the reference tool.
 * Drives the real system Chrome, uploads real JPEGs, clicks the real button,
 * and reads the real on-screen report. No mocks.
 *
 * The centrepiece is step 5. The 140x60 SSC signature preset is MARGINAL: measured
 * over 28 realistic signatures, 7 reach the 10 KB floor and 21 do not. So the same
 * preset must refuse one real document and succeed on the next. Both cases are
 * asserted here, because a preset that always refuses and a preset that always
 * claims success are both wrong — and the difference between them is the whole
 * point of the registry's measured feasibility field.
 */
import { chromium } from 'file:///C:/Users/harsh/.workbuddy-ai/binaries/node/workspace/node_modules/playwright-core/index.mjs';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CSP, ROOT } from './server.mjs';
import { withExifOrientation, readExifOrientation } from './fixtures.mjs';

const OUT = 'C:/Users/harsh/WorkBuddy AI/2026-09-14-10-03-21/govdocs-review/_verify/shots';
mkdirSync(OUT, { recursive: true });

const V = 'C:/Users/harsh/WorkBuddy AI/2026-09-14-10-03-21/govdocs-review/_verify';
const FX = `${V}/fixtures`;
// The canonical fixtures, written by browser_truth.mjs, so this suite uploads the
// exact bytes the feasibility claim was measured against.
const PHOTO = `${FX}/photo_g12.jpg`;
const SPARSE = `${FX}/scan_g12_d1.jpg`;  // compact signature — measured 8.76 KB, below the floor
const DENSE = `${FX}/scan_g12_d2.jpg`;   // elaborate signature — measured 13.25 KB, clears the floor

const BASE = process.env.BASE_URL || 'http://127.0.0.1:8099/';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({ viewport: { width: 420, height: 900 }, acceptDownloads: true });
const page = await ctx.newPage();

/*
 * A monotonic write-counter for the status element, installed before every
 * navigation so it survives reloads.
 *
 * "Wait for the status text to change" is not a safe way to detect a finished fit:
 * two consecutive fits can legitimately produce IDENTICAL text (same preset, same
 * document), and then the change never arrives and the wait times out on a correct
 * run. Counting WRITES instead of comparing text is deterministic — every
 * showStatus() call bumps the counter, whatever it writes.
 */
await page.addInitScript(() => {
  window.__statusSeq = 0;
  // Observe the whole document from document-start and count only mutations that
  // touch #status. Attaching to #status directly would have to wait for it to
  // exist, which risks missing a write that happens earlier during parse.
  const inStatus = (node) => {
    const el = node && node.nodeType === 1 ? node : node && node.parentElement;
    return !!(el && (el.id === 'status' || (el.closest && el.closest('#status'))));
  };
  new MutationObserver((records) => {
    for (const r of records) {
      if (inStatus(r.target)) { window.__statusSeq += 1; return; }
    }
  }).observe(document, { attributes: true, childList: true, subtree: true, characterData: true });
});

const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

let failures = 0;
const step = (s) => console.log('\n--- ' + s + ' ---');
const assert = (label, cond, detail = '') => {
  if (!cond) failures++;
  console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${label}${detail ? '  — ' + detail : ''}`);
};

/*
 * CLICK, THEN WAIT FOR THE VERDICT — by state, never by a clock.
 *
 * Three bugs have lived here, and every one of them produced a RED run on correct
 * code, which is worse than a green run on broken code because it teaches you to
 * ignore the result:
 *
 *   1. A fixed waitForTimeout(900) read the status mid-fit and caught
 *      "Fitting... Measuring candidate qualities."
 *
 *   2. waitForSelector('#report:not([hidden]), #status.bad') matches INSTANTLY if a
 *      previous step already left the status on 'bad', so it could return the
 *      previous click's verdict.
 *
 *   3. Comparing the status TEXT before and after the click is not reliable either:
 *      two consecutive fits can produce identical text (same preset, same document),
 *      so "has it changed?" never becomes true and the wait times out on a correct
 *      run. A baseline sampled after the click is worse still — it compares the new
 *      verdict against itself.
 *
 * So this uses a WRITE COUNTER (window.__statusSeq, installed via addInitScript)
 * rather than text comparison, and it performs the click itself so the baseline can
 * never be sampled at the wrong moment:
 *
 *   phase 1 — showStatus() has been called at least once since the click
 *   phase 2 — the status is terminal: kind is 'ok' or 'bad'
 *
 * Phase 1 rejects a stale verdict (it requires a NEW write). Phase 2 cannot return
 * while the fit is still running. Neither depends on what the text says.
 */
async function fitAndWait() {
  const seq = await page.evaluate(() => window.__statusSeq || 0);

  await page.locator('#processBtn').click();

  await page.waitForFunction((s) => (window.__statusSeq || 0) > s, seq, { timeout: 60000 });

  await page.waitForFunction(
    () => {
      const el = document.querySelector('#status');
      if (!el) return false;
      const kind = (el.className || '').replace(/^status\s*/, '').trim();
      return kind === 'ok' || kind === 'bad';
    },
    null,
    { timeout: 60000 }
  );

  return {
    cls: (await page.locator('#status').getAttribute('class')) || '',
    text: (await page.locator('#status').innerText()).replace(/\s+/g, ' '),
  };
}

/**
 * Choose a file and wait until it has been decoded and its dimensions are shown.
 *
 * Detects completion by the file NAME and a WxH pair, not by "the text changed":
 * two consecutive steps can legitimately load the SAME fixture, in which case the
 * text does not change and a change-based wait times out on a correct run. Matching
 * on the name also means this cannot return early for a different file, and it owns
 * the setInputFiles call so the ordering can never be got wrong at the call site.
 */
async function loadFile(path) {
  const name = path.split(/[\\/]/).pop();
  await page.locator('#fileInput').setInputFiles(path);
  await page.waitForFunction(
    (n) => {
      const t = (document.querySelector('#fileInfo') || {}).textContent || '';
      return t.includes(n) && /\d+\s*x\s*\d+/.test(t);
    },
    name,
    { timeout: 30000 }
  );
}

/** Read the real JPEG's pixel dimensions out of its SOF marker, not from the UI. */
function sofDims(buf) {
  for (let i = 2; i < buf.length - 9;) {
    if (buf[i] !== 0xff) { i++; continue; }
    const m = buf[i + 1];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return null;
}

/** Click download, wait for the event, and report what the file actually is. */
async function grabDownload(label) {
  try {
    const p = page.waitForEvent('download', { timeout: 20000 });
    // If the click below throws (button hidden or disabled), `p` is never awaited
    // and rejects 20s later as an UNHANDLED rejection — which terminates the
    // process instead of failing a check. This side-branch absorbs that; the
    // `await p` below still throws normally and is caught.
    p.catch(() => {});
    await page.locator('#downloadBtn').click();
    const dl = await p;
    const buf = readFileSync(await dl.path());
    const dims = sofDims(buf);
    const kb = buf.length / 1024;
    console.log(`  file            : ${dl.suggestedFilename()}, ${buf.length} bytes (${kb.toFixed(2)} KB)`);
    console.log(`  jpeg SOF dims   : ${dims ? `${dims.w}x${dims.h}` : 'unreadable'}`);
    return { buf, dims, kb, name: dl.suggestedFilename() };
  } catch {
    console.log(`  download        : ${label} did not fire`);
    return null;
  }
}

/** Upload a fixture and run the process button, then wait for a verdict. */
async function runPreset(presetId, fixture) {
  await page.selectOption('#presetSelect', presetId);
  await loadFile(fixture);
  const verdict = await fitAndWait();
  return verdict.text;
}

await page.goto(BASE, { waitUntil: 'load' });
await page.waitForTimeout(300);

step('1. page loads, preset applied, provenance shown');
console.log('title      :', await page.title());
console.log('preset     :', await page.locator('#presetSelect').inputValue());
console.log('provenance :', (await page.locator('#provenance').innerText()).replace(/\s+/g, ' ').slice(0, 150));
console.log('footer note:', (await page.locator('#presetNote').innerText()).replace(/\s+/g, ' '));
assert('custom fields are hidden on a preset', await page.locator('#customFields').isHidden());
await page.screenshot({ path: `${OUT}/mobile_top.png` });

step('2. upload a real 4032x3024 phone photo against the SSC signature spec');
await page.locator('#fileInput').setInputFiles(PHOTO);
await page.waitForSelector('#cropCard:not([hidden])', { timeout: 15000 });
await page.waitForTimeout(500);
console.log('fileInfo   :', await page.locator('#fileInfo').innerText());
console.log('crop       :', await page.locator('#cropReadout').innerText());
console.log('canvas dims:', await page.locator('#preview').evaluate((c) => `${c.width}x${c.height}`));

step('3. crop frame is locked to the required aspect ratio');
const box = await page.locator('#cropBox').boundingBox();
const spec = { w: 140, h: 60 };
const boxAspect = box.width / box.height;
console.log(`cropBox on screen: ${box.width.toFixed(1)} x ${box.height.toFixed(1)}  aspect ${boxAspect.toFixed(4)}`);
console.log(`required aspect  : ${(spec.w / spec.h).toFixed(4)}`);
assert('aspect is locked', Math.abs(boxAspect - spec.w / spec.h) < 0.02);

step('4. drag the frame, then process');
const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
await page.mouse.move(cx, cy);
await page.mouse.down();
await page.mouse.move(cx - 40, cy - 30, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(200);
console.log('crop after drag :', await page.locator('#cropReadout').innerText());

await fitAndWait();
console.log('status class    :', await page.locator('#status').getAttribute('class'));
console.log('status          :', (await page.locator('#status').innerText()).replace(/\s+/g, ' '));
assert('the download button is never offered before verify() passes',
  await page.locator('#downloadBtn').isHidden());

// Carried across steps 5 and 5b so the "both halves" claim is a real check.
// It used to be `assert(..., true)`, which could never fail.
let marginalRefused = false;
let marginalAccepted = false;

step('5. MARGINAL, half one: a compact signature at 140x60 must be REFUSED honestly');
{
  const status = await runPreset('ssc-signature', SPARSE);
  console.log('status          :', status);
  const cls = await page.locator('#status').getAttribute('class');
  marginalRefused = /bad/.test(cls);
  assert('the tool refuses rather than producing a failing file', marginalRefused, cls);
  assert('the refusal names the real best achievable size', /best achieved: [\d.]+ KB/.test(status));
  assert('the refusal explains the cause rather than just saying no', /too simple to compress/.test(status));
  assert('the refusal offers the documented larger box', /larger reading of this same requirement/.test(status));
  assert('no download is offered for a file that would be rejected',
    await page.locator('#downloadBtn').isHidden());
  await page.screenshot({ path: `${OUT}/ssc_signature_refusal.png`, fullPage: true });
}

step('5b. MARGINAL, half two: the SAME preset with a denser signature must SUCCEED');
{
  const status = await runPreset('ssc-signature', DENSE);
  console.log('status          :', status);
  marginalAccepted = /Matches these file requirements/.test(status);
  assert('the tool accepts the input that genuinely reaches the floor', marginalAccepted);
  const d = await grabDownload('dense signature');
  if (d) {
    assert('the downloaded file is 140x60', d.dims && d.dims.w === 140 && d.dims.h === 60,
      d.dims ? `${d.dims.w}x${d.dims.h}` : 'unreadable');
    assert('the downloaded file is inside 10-20 KB', d.kb >= 10 && d.kb <= 20, `${d.kb.toFixed(2)} KB`);
  } else {
    // Without this branch the two assertions above simply VANISH and the suite
    // still passes — a broken download would read as a green run. This is the
    // same defect class as "printed is not asserted": a check that can be skipped.
    assert('the download fired for the dense signature', false, 'no download event');
  }
  // The actual claim: the SAME preset refused one real document and accepted
  // another. That is what makes the requirement "marginal" rather than broken.
  assert('both halves of the marginal claim were observed end to end',
    marginalRefused && marginalAccepted,
    `refused=${marginalRefused} accepted=${marginalAccepted}`);
  await page.screenshot({ path: `${OUT}/ssc_signature_success.png`, fullPage: true });
}

step('6. the larger box is comfortable: 472x157, 10-20 KB, same compact signature');
{
  const status = await runPreset('ssc-signature-large', SPARSE);
  console.log('status          :', status);
  assert('the larger box accepts the input the official box refused',
    /Matches these file requirements/.test(status));
  const d = await grabDownload('larger box');
  if (d) {
    assert('the downloaded file is 472x157', d.dims && d.dims.w === 472 && d.dims.h === 157,
      d.dims ? `${d.dims.w}x${d.dims.h}` : 'unreadable');
    assert('the downloaded file is inside 10-20 KB', d.kb >= 10 && d.kb <= 20, `${d.kb.toFixed(2)} KB`);
  } else {
    assert('the download fired for the larger box', false, 'no download event');
  }
}

step('7. second preset: UPSC 500x500, 20-300 KB');
{
  const status = await runPreset('upsc-photo', SPARSE);
  console.log('status          :', status);
  const d = await grabDownload('upsc');
  if (d) {
    assert('the downloaded file is 500x500', d.dims && d.dims.w === 500 && d.dims.h === 500,
      d.dims ? `${d.dims.w}x${d.dims.h}` : 'unreadable');
    assert('the downloaded file is inside 20-300 KB', d.kb >= 20 && d.kb <= 300, `${d.kb.toFixed(2)} KB`);
  } else {
    assert('the download fired for the UPSC preset', false, 'no download event');
  }
}

step('8. the live-capture requirement refuses before the user invests any effort');
{
  await page.selectOption('#presetSelect', 'ssc-photo');
  await page.waitForTimeout(250);
  assert('a live-capture warning is shown up front', !(await page.locator('#liveCaptureWarn').isHidden()));
  assert('the process button is disabled for it', await page.locator('#processBtn').isDisabled());
  console.log('warning         :', (await page.locator('#liveCaptureWarn').innerText()).replace(/\s+/g, ' ').slice(0, 170));
}

step('9. custom requirement with a genuinely impossible window must refuse');
{
  await page.selectOption('#presetSelect', 'custom');
  await page.waitForTimeout(200);
  // 200x200 px can never weigh 500 KB, even at maximum JPEG quality.
  await page.fill('#cw', '200');
  await page.fill('#ch', '200');
  await page.fill('#cmin', '500');
  await page.fill('#cmax', '600');
  await page.waitForTimeout(300);
  await loadFile(SPARSE);
  await fitAndWait();
  const cls = await page.locator('#status').getAttribute('class');
  console.log('status class    :', cls);
  console.log('status          :', (await page.locator('#status').innerText()).replace(/\s+/g, ' '));
  assert('the impossible custom window is refused', /bad/.test(cls));
  assert('no download offered', await page.locator('#downloadBtn').isHidden());
  await page.screenshot({ path: `${OUT}/custom_refusal.png`, fullPage: true });
}

step('10. the tight preset warns, and the larger-box button switches to it');
{
  await page.selectOption('#presetSelect', 'ssc-signature');
  await page.waitForTimeout(250);
  const warn = (await page.locator('#presetWarning').innerText()).replace(/\s+/g, ' ');
  console.log('caution text    :', warn.slice(0, 200));
  assert('a caution is shown', !(await page.locator('#presetWarning').isHidden()));
  assert('the caution says the risk is being too SMALL', /too SMALL/.test(warn));
  assert('the caution says which inputs fail', /ink/i.test(warn), 'riskNote mentions ink');
  assert('the larger box is offered', !(await page.locator('#preferLargerRow').isHidden()));
  await page.locator('#preferLargerBtn').click();
  await page.waitForTimeout(250);
  assert('clicking it switches the preset', (await page.locator('#presetSelect').inputValue()) === 'ssc-signature-large');
  console.log('canvas dims     :', await page.locator('#preview').evaluate((c) => `${c.width}x${c.height}`));
}

step('11. desktop layout screenshot');
await page.selectOption('#presetSelect', 'ssc-signature');
await page.setViewportSize({ width: 1100, height: 900 });
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/desktop.png` });
await page.screenshot({ path: `${OUT}/desktop_full.png`, fullPage: true });

step('12. the CSP is real: it matches the deployment, and it is enforced');
/*
 * server.mjs says the CSP string "must stay identical to the [[headers]] block in
 * reference-tool/netlify.toml". Until this step existed, that was a comment — so
 * the two could drift and every suite would still pass, under headers the real
 * deployment never sends.
 *
 * And a CSP header that is present but malformed blocks nothing while looking
 * exactly like protection. So the policy is not just read here, it is exercised.
 */
{
  const toml = readFileSync(join(ROOT, 'reference-tool', 'netlify.toml'), 'utf8');
  const found = toml.match(/Content-Security-Policy\s*=\s*"([^"]+)"/);
  const deployed = found ? found[1] : null;
  const dirs = (s) => new Set((s || '').split(';').map((d) => d.trim()).filter(Boolean));
  const a = dirs(CSP);
  const b = dirs(deployed);
  const onlyServer = [...a].filter((d) => !b.has(d));
  const onlyDeploy = [...b].filter((d) => !a.has(d));
  assert('netlify.toml declares a Content-Security-Policy', !!deployed);
  assert('the served policy and the deployed policy carry the same directives',
    onlyServer.length === 0 && onlyDeploy.length === 0,
    onlyServer.length || onlyDeploy.length
      ? `server-only [${onlyServer}] deployed-only [${onlyDeploy}]`
      : `${a.size} directives, identical`);
}

const cspCtx = await browser.newContext({ viewport: { width: 420, height: 900 } });
const cspViolations = [];
await cspCtx.exposeFunction('__cspViolation', (v) => cspViolations.push(v));
await cspCtx.addInitScript(() => {
  document.addEventListener('securitypolicyviolation', (e) => {
    window.__cspViolation(`${e.violatedDirective} <- ${e.blockedURI}`);
  });
});
const cspPage = await cspCtx.newPage();
const cspResp = await cspPage.goto(BASE, { waitUntil: 'load' });
const sent = cspResp.headers()['content-security-policy'];
assert('the response actually carries the CSP header', !!sent);
assert('the header is byte-identical to the policy under test', sent === CSP,
  sent === CSP ? 'identical' : 'DIFFERENT — the suites are not testing the shipped policy');

// connect-src 'none' must block even a SAME-ORIGIN fetch.
const fetchBlocked = await cspPage.evaluate(async () => {
  try { await fetch('/index.html'); return false; } catch { return true; }
});
assert("connect-src 'none' blocks a same-origin fetch", fetchBlocked,
  fetchBlocked ? 'blocked' : "ALLOWED — the policy is present but NOT enforced");

// default-src 'none' must block a cross-origin script.
const scriptBlocked = await cspPage.evaluate(() => new Promise((resolve) => {
  const s = document.createElement('script');
  s.src = 'https://example.com/evil.js';
  s.onload = () => resolve(false);
  s.onerror = () => resolve(true);
  document.head.appendChild(s);
  setTimeout(() => resolve(true), 2500);
}));
assert("default-src 'none' blocks a cross-origin script", scriptBlocked,
  scriptBlocked ? 'blocked' : 'ALLOWED — the policy is present but NOT enforced');

// Wait for the violation events rather than sleeping and hoping: exposeFunction
// delivers them to Node asynchronously, so a fixed wait is a flake waiting to
// happen on a loaded machine.
for (let i = 0; i < 100 && cspViolations.length === 0; i++) await new Promise((r) => setTimeout(r, 50));
assert('a securitypolicyviolation event fires, so the policy is genuinely parsed',
  cspViolations.length > 0, cspViolations.join(' | ') || 'none — the header may be malformed');
await cspCtx.close();

step('13. EXIF orientation: a portrait phone photo must not come out sideways');
/*
 * app.js says EXIF orientation is "the single most common cause of 'my photo came
 * out sideways' on phones" — and until this step existed, nothing tested it. Every
 * fixture was upright, so the code path was never exercised.
 *
 * A phone in portrait stores a LANDSCAPE frame plus Orientation=6. Applying the tag
 * SWAPS width and height, which makes it visible in the numbers rather than only in
 * the pixels. The untagged copy is the control: if both reported the same size, the
 * swap would be coming from somewhere else and the test would prove nothing.
 */
{
  const tagged = withExifOrientation(readFileSync(PHOTO), 6);
  const EXIF6 = `${FX}/photo_exif6.jpg`;
  const PLAIN = `${FX}/photo_exif1.jpg`;
  writeFileSync(EXIF6, tagged);
  writeFileSync(PLAIN, withExifOrientation(readFileSync(PHOTO), 1));

  assert('the fixture really carries Orientation=6',
    readExifOrientation(readFileSync(EXIF6)) === 6,
    `read back ${readExifOrientation(readFileSync(EXIF6))}`);

  // Both waits are the shared helpers defined at the top of this file — see the
  // long note on fitAndWait() for why neither of these is a sleep.
  const dimsFor = async (path) => {
    await loadFile(path);
    return page.evaluate(() => {
      const info = (document.querySelector('#fileInfo') || {}).textContent || '';
      const m = info.match(/(\d+)\s*x\s*(\d+)/);
      return { info: m ? `${m[1]}x${m[2]}` : 'no dims' };
    });
  };

  const control = await dimsFor(PLAIN);
  const rotated = await dimsFor(EXIF6);
  console.log('  Orientation=1 (control) :', control.info);
  console.log('  Orientation=6 (rotated) :', rotated.info);

  const cw = Number(control.info.split('x')[0]);
  const ch = Number(control.info.split('x')[1]);
  const rw = Number(rotated.info.split('x')[0]);
  const rh = Number(rotated.info.split('x')[1]);

  assert('the control reports a landscape frame', cw > ch, `${control.info}`);
  assert('the rotated file reports a PORTRAIT frame, so the tag was applied',
    rw < rh && rw === ch && rh === cw, `${rotated.info} vs control ${control.info}`);

  // And the rotated photo must still produce a valid file. NOTE: ssc-photo cannot
  // be used here — it is liveCaptureOnly, so the tool disables the button (that is
  // asserted separately below). ssc-lti accepts an upload.
  await page.locator('#presetSelect').selectOption('ssc-lti');
  await page.waitForTimeout(300);
  const fit = await fitAndWait();
  console.log('  fit status              :', fit.text.slice(0, 160));
  assert('the rotated photo still fits the 240x240 / 20-50 KB preset',
    /\bok\b/.test(fit.cls) && /240\s*x\s*240/.test(fit.text),
    `class=${fit.cls} | ${fit.text.slice(0, 140)}`);

  /*
   * The live-capture rule is ENFORCED, not merely warned about. The warning text
   * was already asserted; whether the button is actually disabled was not — and a
   * warning that does not block is decoration. A photograph is exactly the file a
   * candidate would try to upload here, so this is the case that matters.
   */
  await page.locator('#presetSelect').selectOption('ssc-photo');
  await page.waitForTimeout(300);
  const disabled = await page.locator('#processBtn').isDisabled();
  console.log('  ssc-photo (live capture): process button disabled =', disabled);
  assert('ssc-photo disables the fit button, because the portal needs a live capture',
    disabled, 'the tool must refuse an uploaded photograph, not just warn');
  assert('no file is offered for a live-capture preset',
    await page.locator('#downloadBtn').isHidden());

  /*
   * The disabled attribute is UX. The GUARD is the `if (spec.liveCaptureOnly)`
   * check inside the click handler — so re-enable the button and click it for
   * real, to prove the refusal comes from the code and not from the attribute.
   *
   * A plain click({force:true}) would NOT work here: a disabled button does not
   * dispatch a click event at all, so the handler never runs and the assertion
   * would silently be reading the PREVIOUS verdict.
   */
  await page.evaluate(() => { document.querySelector('#processBtn').disabled = false; });
  const forced = await fitAndWait();
  console.log('  guard, button re-enabled:', forced.cls, '|', forced.text.slice(0, 90));
  assert('the guard refuses even when the button is re-enabled',
    /\bbad\b/.test(forced.cls), forced.text.slice(0, 130));
  assert('still no file offered after the forced attempt',
    await page.locator('#downloadBtn').isHidden());
}

step('14. input formats: PNG works, and every failure explains itself');
/*
 * The UI hint used to read "JPEG, PNG or HEIC. A photo straight from the phone
 * camera is fine." Measured: PNG is accepted, but HEIC is NOT — no Chromium-based
 * browser can decode it. So the hint promised a format the tool cannot read, which
 * is the worst possible copy for a tool whose whole value is being trustworthy
 * about an upload. An iPhone user would read it, upload, and get an error.
 *
 * These paths had no test at all. They do now, including a guard on the wording.
 */
{
  const PNG_F = `${FX}/format_probe.png`;
  const BAD_F = `${FX}/format_probe_corrupt.jpg`;
  const HEIC_F = `${FX}/format_probe.heic`;

  // A real PNG, encoded by the browser itself rather than hand-rolled.
  const b64 = await page.evaluate(async () => {
    const c = document.createElement('canvas');
    c.width = 800; c.height = 900;
    const g = c.getContext('2d');
    g.fillStyle = '#e8eef5'; g.fillRect(0, 0, 800, 900);
    g.fillStyle = '#2b3a4a'; g.beginPath(); g.arc(400, 380, 150, 0, Math.PI * 2); g.fill();
    const b = await new Promise((r) => c.toBlob(r, 'image/png'));
    const u = new Uint8Array(await b.arrayBuffer());
    let s = ''; for (const x of u) s += String.fromCharCode(x);
    return btoa(s);
  });
  writeFileSync(PNG_F, Buffer.from(b64, 'base64'));

  // A truncated JPEG: a real SOI and header, then nothing. Undecodable.
  writeFileSync(BAD_F, readFileSync(PHOTO).subarray(0, 300));

  // A plausible HEIC container: ISO-BMFF ftyp box branded 'heic', then filler.
  const ftyp = Buffer.alloc(24);
  ftyp.writeUInt32BE(24, 0);
  ftyp.write('ftyp', 4, 'latin1');
  ftyp.write('heic', 8, 'latin1');
  ftyp.writeUInt32BE(0, 12);
  ftyp.write('heic', 16, 'latin1');
  ftyp.write('mif1', 20, 'latin1');
  writeFileSync(HEIC_F, Buffer.concat([ftyp, Buffer.alloc(4096, 0x21)]));

  // Upload and wait for EITHER outcome, by state: the crop card appears, or a
  // status write happens. No fixed sleep.
  const attempt = async (path) => {
    await page.reload({ waitUntil: 'load' });
    const hint = await page.evaluate(
      () => (document.querySelector('#fileInfo') || {}).textContent || '');
    const seq = await page.evaluate(() => window.__statusSeq || 0);
    await page.locator('#fileInput').setInputFiles(path);
    await page.waitForFunction(
      (s) => {
        const crop = document.querySelector('#cropCard');
        return (crop && !crop.hidden) || (window.__statusSeq || 0) > s;
      },
      seq,
      { timeout: 30000 }
    );
    return {
      hint,
      ...(await page.evaluate(() => ({
        info: (document.querySelector('#fileInfo') || {}).textContent || '',
        crop: !document.querySelector('#cropCard')?.hidden,
        cls: (document.querySelector('#status') || {}).className || '',
        txt: (document.querySelector('#status') || {}).textContent || '',
      }))),
    };
  };

  const png = await attempt(PNG_F);
  console.log('  PNG      :', png.crop ? 'accepted' : 'REJECTED', '|', png.info.slice(0, 60));
  assert('a real PNG is accepted', png.crop && /800\s*x\s*900/.test(png.info), png.info.slice(0, 80));

  const bad = await attempt(BAD_F);
  console.log('  corrupt  :', bad.crop ? 'ACCEPTED' : 'rejected', '|', bad.txt.slice(0, 70));
  assert('a truncated JPEG is rejected', !bad.crop && /\bbad\b/.test(bad.cls));
  assert('the rejection names the formats that DO work',
    /JPEG/i.test(bad.txt) && /PNG/i.test(bad.txt), bad.txt.slice(0, 120));

  const heic = await attempt(HEIC_F);
  console.log('  HEIC     :', heic.crop ? 'ACCEPTED' : 'rejected', '|', heic.txt.slice(0, 70));
  assert('a HEIC file is rejected rather than silently mangled', !heic.crop && /\bbad\b/.test(heic.cls));
  assert('the HEIC rejection says what to do about it',
    /HEIC/i.test(heic.txt), 'a user with an iPhone photo must be told the format is the problem');

  // The copy guard. The hint must not promise HEIC, because nothing here can read it.
  console.log('  hint     :', heic.hint.slice(0, 80));
  assert('the hint does not advertise HEIC as an accepted format',
    !/or\s+HEIC/i.test(heic.hint), heic.hint.slice(0, 90));
  assert('the hint names the formats that actually work',
    /JPEG/i.test(heic.hint) && /PNG/i.test(heic.hint), heic.hint.slice(0, 90));
}

console.log('\n=== console/page errors captured ===');
console.log(errors.length ? errors.join('\n') : 'none');
// This suite used to PRINT the captured errors and never assert on them — the same
// "printed is not asserted" gap found in the responsive sweep. The list is
// meaningful precisely because step 14 deliberately feeds the app files it cannot
// decode: a handled user input must not surface as a console error.
assert('no console or page errors, even after deliberately bad input',
  errors.length === 0, errors.join(' | ') || 'none');

console.log('\n' + '='.repeat(62));
console.log(failures ? `${failures} assertion(s) FAILED` : 'all assertions passed');
console.log('='.repeat(62));

await browser.close();
process.exit(failures === 0 ? 0 : 1);
