/*
 * TEST J — the single-file build, opened from file:// with NO web server.
 * This is the "must work locally" requirement. Also checks responsive behaviour
 * across phone, tablet and desktop widths.
 *
 * This suite asserts rather than narrates, and exits non-zero on any failure. An
 * earlier version only printed observations, so it reported PASS no matter what
 * the page did — a check that cannot fail is not a check.
 */
import { chromium } from 'file:///C:/Users/harsh/.workbuddy-ai/binaries/node/workspace/node_modules/playwright-core/index.mjs';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';

const OUT = 'C:/Users/harsh/WorkBuddy AI/2026-09-14-10-03-21/govdocs-review/_verify/shots';
mkdirSync(OUT, { recursive: true });

const FILE = 'C:/Users/harsh/WorkBuddy AI/2026-09-14-10-03-21/govdocs-review/dist/photo-signature-fitter.html';
const FILE_URL = 'file:///' + FILE.replace(/\\/g, '/');
const V = 'C:/Users/harsh/WorkBuddy AI/2026-09-14-10-03-21/govdocs-review/_verify';
const FX = `${V}/fixtures`;
const PHOTO = `${FX}/photo_g12.jpg`;
const SPARSE = `${FX}/scan_g12_d1.jpg`;  // compact signature — measured below the 10 KB floor
const DENSE = `${FX}/scan_g12_d2.jpg`;   // elaborate signature — measured above it

if (!existsSync(FILE)) { console.error('build missing: ' + FILE); process.exit(1); }

/*
 * The declaration text, typed here INDEPENDENTLY from the official SSC PDF
 * ("Guidelines for scanning and Upload of Documents", page 2). The shipped value
 * lives in reference-tool/js/specs.js. The two must agree exactly — a test that
 * imports the value it is checking would prove nothing.
 */
const PDF_DECLARATION =
  'I, __________ (Name of the candidate), hereby declare that all the information ' +
  'submitted by me in the application form is correct, true and valid. I will present ' +
  'the supporting documents as and when required.';

const norm = (s) => s.replace(/[\u201C\u201D"]/g, '').replace(/\s+/g, ' ').trim();

let failures = 0;
const assert = (label, cond, detail = '') => {
  if (!cond) failures++;
  console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${label}${detail ? '  — ' + detail : ''}`);
};

/*
 * CLICK, THEN WAIT FOR THE VERDICT — by state, not by clock.
 *
 * Three bugs have lived here, each producing a RED run on correct code:
 *   1. a fixed sleep read the status mid-fit ("Fitting... Measuring candidate qualities.")
 *   2. waitForSelector('#report:not([hidden]), #status.bad') matches instantly on a
 *      stale 'bad' from a previous step, returning the wrong click's verdict
 *   3. comparing the status TEXT before/after the click fails when two consecutive
 *      fits legitimately produce identical text — the change never arrives
 *
 * So this waits on a WRITE COUNTER (window.__statusSeq) instead of on text, and
 * performs the click itself so the baseline cannot be sampled at the wrong moment.
 *   phase 1 — showStatus() has been called at least once since the click
 *   phase 2 — the status is terminal: kind is 'ok' or 'bad'
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
  return (await page.locator('#status').innerText()).replace(/\s+/g, ' ');
}

/**
 * Choose a file and wait until it has been decoded and its dimensions are shown.
 * Detects completion by file NAME and a WxH pair, not by "the text changed" — two
 * consecutive steps can load the SAME fixture, in which case the text never changes
 * and a change-based wait times out on a correct run.
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

/**
 * Wait for layout to settle after a viewport change. Two animation frames is the
 * point at which style and layout have been recomputed — unlike a fixed delay,
 * which is either wasteful or wrong depending on how loaded the machine is.
 * Both sweeps below measure scrollWidth, so this has to be reliable.
 */
const settle = (p) => p.evaluate(
  () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));

const browser = await chromium.launch({ channel: 'chrome', headless: true });

const errors = [];
const requests = [];
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
const page = await ctx.newPage();

/*
 * A monotonic write-counter for the status element, installed before every
 * navigation so it survives reloads. "Wait for the status text to change" is not
 * safe: two consecutive fits can produce IDENTICAL text, so the change never
 * arrives and the wait times out on a correct run. Counting WRITES is
 * deterministic — every showStatus() call bumps it, whatever it writes.
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
page.on('request', (r) => requests.push(r.url()));
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

/** Read the real JPEG's pixel dimensions out of its own SOF marker. */
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

async function runFit(fixture) {
  await loadFile(fixture);
  await page.waitForSelector('#cropCard:not([hidden])', { timeout: 15000 });
  return fitAndWait();
}

async function grab() {
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
    return { buf, dims: sofDims(buf), kb: buf.length / 1024, name: dl.suggestedFilename() };
  } catch { return null; }
}

console.log('=== TEST J: single file, opened from file:// with no server ===');
console.log('url: ' + FILE_URL.slice(0, 78) + '...');

await page.goto(FILE_URL, { waitUntil: 'load' });
await page.waitForTimeout(400);

console.log('\n--- 1. does it even boot without a server? ---');
console.log('title            :', await page.title());
console.log('theme applied    :', await page.evaluate(() => document.documentElement.dataset.theme));
const presetCount = await page.locator('#presetSelect option').count();
console.log('presets populated:', presetCount);
const leftover = await page.evaluate(() =>
  [...document.querySelectorAll('script[src],link[href]')]
    .map((e) => e.getAttribute('src') || e.getAttribute('href'))
    // The manifest and icon are inlined as data: URLs by the bundler, which is the
    // point — they are not references to anything outside the file.
    .filter((u) => !u.startsWith('data:')));
console.log('module refs left :', leftover);
// `length > 0` passes for ANY non-empty title — including a browser error page,
// which is exactly what a broken file:// boot would give you. Assert the real one.
assert('the page boots from file:// with its real title',
  (await page.title()) === 'Photo & Signature Fitter', await page.title());
assert('presets are populated', presetCount >= 13, `${presetCount} options`);
assert('no external file references remain', leftover.length === 0, leftover.join(', '));

console.log('\n--- 2. deep link: ?preset=ibps-photo ---');
await page.goto(FILE_URL + '?preset=ibps-photo', { waitUntil: 'load' });
await page.waitForTimeout(300);
const dlPreset = await page.locator('#presetSelect').inputValue();
console.log('selected preset  :', dlPreset);
console.log('spec line        :', (await page.locator('#presetNote').innerText()).replace(/\s+/g, ' '));
console.log('caution shown    :', !(await page.locator('#presetWarning').isHidden()));
console.log('rules listed     :', await page.locator('#presetRulesList li').count());
assert('a ?preset= deep link selects that preset', dlPreset === 'ibps-photo');

console.log('\n--- 3. the marginal preset must say so, and offer the documented way out ---');
await page.selectOption('#presetSelect', 'ssc-signature');
await page.waitForTimeout(250);
const sigCaution = await page.locator('#presetWarning').innerText().catch(() => '');
const altVisible = !(await page.locator('#preferLargerRow').isHidden());
const altLabel = altVisible ? await page.locator('#preferLargerBtn').innerText() : '(not offered)';
console.log('caution visible  :', sigCaution.length > 0);
console.log('larger box offer :', altVisible, '|', altLabel);
console.log('rules for this   :', (await page.locator('#presetRulesList li').allInnerTexts()).join(' / '));
assert('the tight preset shows a caution', sigCaution.length > 0);
assert('the caution says the risk is being too SMALL', /too SMALL/.test(sigCaution));
assert('the caution names the driver of the failure', /ink/i.test(sigCaution), 'riskNote mentions ink');
assert('the documented larger box is offered', altVisible);

console.log('\n--- 3b. switching to the larger box must change the requirement ---');
if (altVisible) {
  await page.locator('#preferLargerBtn').click();
  await page.waitForTimeout(250);
  const now = await page.locator('#presetSelect').inputValue();
  console.log('preset now       :', now);
  console.log('spec line        :', (await page.locator('#presetNote').innerText()).replace(/\s+/g, ' '));
  console.log('url synced       :', page.url().split('?')[1] || '(none)');
  assert('the button switches to the larger box', now === 'ssc-signature-large');
  assert('the caution clears, because the larger box is comfortable',
    await page.locator('#presetWarning').isHidden());
} else {
  // `altVisible` is already asserted above, but without this branch the two
  // assertions inside would silently VANISH and the suite would still pass.
  // Reported explicitly so a missing "larger box" cannot look like a clean run.
  assert('the larger box is offered, so the switch can be tested', false, 'no #preferLargerBtn');
}

console.log('\n--- 3c. the declaration must match the official PDF wording exactly ---');
await page.selectOption('#presetSelect', 'ssc-declaration');
await page.waitForTimeout(250);
const declShown = !(await page.locator('#declarationBox').isHidden());
const shown = declShown ? norm(await page.locator('#declarationText').innerText()) : '';
console.log('declaration shown:', declShown);
console.log('text             :', shown.slice(0, 96) + '...');
assert('the declaration preset shows the text', declShown);
assert('the wording matches the official PDF verbatim', shown === norm(PDF_DECLARATION));

console.log('\n--- 4. live-capture preset must refuse before any effort is invested ---');
await page.selectOption('#presetSelect', 'ssc-photo');
await page.waitForTimeout(250);
const warnVisible = !(await page.locator('#liveCaptureWarn').isHidden());
const btnDisabled = await page.locator('#processBtn').isDisabled();
console.log('warning shown    :', warnVisible);
console.log('process disabled :', btnDisabled);
console.log('warning text     :', (await page.locator('#liveCaptureWarn').innerText()).replace(/\s+/g, ' ').slice(0, 130));
assert('a live-capture warning is shown', warnVisible);
assert('the process button is disabled', btnDisabled);

console.log('\n--- 5a. MARGINAL half one: a dense signature at 140x60 must SUCCEED ---');
await page.goto(FILE_URL + '?preset=ssc-signature', { waitUntil: 'load' });
await page.waitForTimeout(300);
{
  const status = await runFit(DENSE);
  console.log('status           :', status);
  assert('the tool accepts the input that reaches the floor', /Matches these file requirements/.test(status));
  const d = await grab();
  if (d) {
    console.log('downloaded       :', d.name, d.buf.length, 'bytes');
    console.log('jpeg SOF dims    :', d.dims ? `${d.dims.w}x${d.dims.h}` : 'unreadable');
    assert('the artefact is 140x60, read from its own SOF marker',
      d.dims && d.dims.w === 140 && d.dims.h === 60, d.dims ? `${d.dims.w}x${d.dims.h}` : 'unreadable');
    assert('the artefact is inside 10-20 KB', d.kb >= 10 && d.kb <= 20, `${d.kb.toFixed(2)} KB`);
  } else {
    assert('the download fired from file://', false);
  }
}

console.log('\n--- 5b. MARGINAL half two: a compact signature at 140x60 must REFUSE ---');
// The same preset, a different real document. This is the case the old build
// printed "Success!" for.
await page.goto(FILE_URL + '?preset=ssc-signature', { waitUntil: 'load' });
await page.waitForTimeout(300);
{
  const status = await runFit(SPARSE);
  const cls = await page.locator('#status').getAttribute('class');
  console.log('status class     :', cls);
  console.log('status           :', status.slice(0, 160));
  assert('the compact signature is refused', /bad/.test(cls));
  assert('the refusal names the real best achievable size', /best achieved: [\d.]+ KB/.test(status));
  assert('no download is offered', await page.locator('#downloadBtn').isHidden());
  assert('the refusal points at the larger box', /472x157/.test(status));
}

console.log('\n--- 5c. the larger box accepts what the official box refused ---');
await page.goto(FILE_URL + '?preset=ssc-signature-large', { waitUntil: 'load' });
await page.waitForTimeout(300);
{
  const status = await runFit(SPARSE);
  console.log('status           :', status);
  assert('the larger box accepts the same document', /Matches these file requirements/.test(status));
  const d = await grab();
  if (d) {
    console.log('jpeg SOF dims    :', d.dims ? `${d.dims.w}x${d.dims.h}` : 'unreadable');
    assert('the artefact is 472x157', d.dims && d.dims.w === 472 && d.dims.h === 157,
      d.dims ? `${d.dims.w}x${d.dims.h}` : 'unreadable');
    assert('the artefact is inside 10-20 KB', d.kb >= 10 && d.kb <= 20, `${d.kb.toFixed(2)} KB`);
  } else {
    assert('the download fired from file://', false);
  }
}

console.log('\n--- 6. responsive sweep: layout overflow (FINE pointer) ---');
const VIEWPORTS = [
  ['narrow       360x640', 360, 640],
  ['phone        390x844', 390, 844],
  ['phone large  430x932', 430, 932],
  ['land         844x390', 844, 390],
  ['tablet       768x1024', 768, 1024],
  ['laptop      1366x768', 1366, 768],
  ['desktop     1920x1080', 1920, 1080],
];
console.log('VIEWPORT'.padEnd(22) + 'H-OVERFLOW'.padEnd(12) + 'DOC WIDTH'.padEnd(11) + 'MIN BUTTON'.padEnd(12) + 'LAYOUT');
console.log('-'.repeat(80));
let badLayout = 0;
for (const [label, w, h] of VIEWPORTS) {
  await page.setViewportSize({ width: w, height: h });
  await settle(page);
  const m = await page.evaluate(() => {
    const de = document.documentElement;
    const btns = [...document.querySelectorAll('button, .sub-btn, .ghost-btn')]
      .filter((b) => b.offsetParent !== null)
      .map((b) => Math.round(b.getBoundingClientRect().height));
    return {
      overflow: de.scrollWidth > window.innerWidth + 1,
      scrollW: de.scrollWidth,
      innerW: window.innerWidth,
      minBtn: btns.length ? Math.min(...btns) : 0,
    };
  });
  const okLayout = !m.overflow;
  if (!okLayout) badLayout++;
  console.log(
    label.padEnd(22) +
    (m.overflow ? 'YES' : 'no').padEnd(12) +
    `${m.scrollW}/${m.innerW}`.padEnd(11) +
    `${m.minBtn}px`.padEnd(12) +
    (okLayout ? 'ok' : '*** HORIZONTAL OVERFLOW ***')
  );
}
assert('no viewport produces horizontal overflow', badLayout === 0, `${badLayout} of ${VIEWPORTS.length} bad`);

/*
 * 6b. TOUCH TARGETS NEED A COARSE POINTER TO TEST.
 *
 * The CSS raises buttons to min-height:44px under
 *   @media (max-width: 480px), (pointer: coarse)
 * The sweep above runs a fine pointer, so it exercises only the max-width half of
 * that rule and NEVER the coarse-pointer half. That matters because a real phone
 * in landscape is 844px wide — wider than the 480px breakpoint — so it is covered
 * by the (pointer: coarse) half alone. A broken coarse rule would therefore pass
 * the sweep above with the row even reading "phone land ... 42px ok".
 *
 * So measure it in a context that reports a coarse pointer, and assert it. Note
 * 42px is the correct FINE-pointer default (a mouse does not need 44), which is
 * why the two sweeps assert different floors rather than one shared number.
 */
console.log('\n--- 6b. touch targets on a COARSE pointer (emulated touch) ---');
const TOUCH_MIN = 44;   // Apple HIG 44pt; Material asks 48dp
const TOUCH_VIEWPORTS = [
  ['phone portrait ', 390, 844],
  ['phone landscape', 844, 390],
  ['tablet         ', 768, 1024],
  ['wide           ', 1366, 768],
];
const touchCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const touchPage = await touchCtx.newPage();
await touchPage.goto(FILE_URL, { waitUntil: 'load' });
let badTouch = 0;
let sawCoarse = false;
console.log('VIEWPORT'.padEnd(22) + 'POINTER'.padEnd(10) + 'MIN BUTTON'.padEnd(12) + 'VERDICT');
console.log('-'.repeat(70));
for (const [label, w, h] of TOUCH_VIEWPORTS) {
  await touchPage.setViewportSize({ width: w, height: h });
  await settle(touchPage);
  const t = await touchPage.evaluate(() => {
    const btns = [...document.querySelectorAll('button, .sub-btn, .ghost-btn')]
      .filter((b) => b.offsetParent !== null)
      .map((b) => Math.round(b.getBoundingClientRect().height));
    return {
      coarse: matchMedia('(pointer: coarse)').matches,
      minBtn: btns.length ? Math.min(...btns) : 0,
      n: btns.length,
    };
  });
  if (t.coarse) sawCoarse = true;
  const okTouch = t.coarse && t.minBtn >= TOUCH_MIN && t.n > 0;
  if (!okTouch) badTouch++;
  console.log(
    label.padEnd(22) +
    (t.coarse ? 'coarse' : 'fine').padEnd(10) +
    `${t.minBtn}px`.padEnd(12) +
    (okTouch ? 'ok' : `*** FAILS (n=${t.n}, coarse=${t.coarse}) ***`)
  );
}
await touchCtx.close();
assert('the emulated context really does report a coarse pointer',
  sawCoarse, 'otherwise the check below would be vacuous');
assert(`every touch target is at least ${TOUCH_MIN}px on a coarse pointer`,
  badTouch === 0, `${badTouch} of ${TOUCH_VIEWPORTS.length} bad`);

/*
 * 6c. Negative control. The assertions above only ever see correct CSS, so on
 * their own they prove nothing about whether they CAN fail. Neutralise the
 * touch-target rule and confirm the measurement actually drops below the floor.
 * If it does not move, the sweep is measuring the wrong element and a real
 * regression would sail straight through it.
 */
console.log('\n--- 6c. negative control: can the touch-target check actually fail? ---');
const ctlCtx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
const ctlPage = await ctlCtx.newPage();
await ctlPage.goto(FILE_URL, { waitUntil: 'load' });
const minBtnOn = () => ctlPage.evaluate(() => {
  const b = [...document.querySelectorAll('button, .sub-btn, .ghost-btn')].filter((x) => x.offsetParent !== null);
  return b.length ? Math.min(...b.map((x) => Math.round(x.getBoundingClientRect().height))) : 0;
});
const before = await minBtnOn();
await ctlPage.addStyleTag({
  content: '@media (max-width:480px),(pointer:coarse){button,.ghost-btn,.sub-btn,.linkrow a{min-height:0 !important}}',
});
// Wait for the neutralised rule to take effect instead of guessing at a delay.
// The catch matters: if the style never changes the measurement, that is exactly
// the failure this control exists to detect, so let the assertion below report it
// rather than throwing a timeout.
await ctlPage.waitForFunction(
  (b) => {
    const els = [...document.querySelectorAll('button, .sub-btn, .ghost-btn')]
      .filter((x) => x.offsetParent !== null);
    const m = els.length ? Math.min(...els.map((x) => Math.round(x.getBoundingClientRect().height))) : 0;
    return m !== b;
  },
  before,
  { timeout: 10000 }
).catch(() => {});
const after = await minBtnOn();
await ctlCtx.close();
console.log(`  min button with the rule: ${before}px   with the rule neutralised: ${after}px`);
assert('the touch-target check is sensitive — neutralising the rule drops it below the floor',
  before >= TOUCH_MIN && after < TOUCH_MIN, `${before}px -> ${after}px`);


console.log('\n--- 7. scroll-trap check (a phone must still be able to scroll over the image) ---');
const ta = await page.evaluate(() => ({
  stage: getComputedStyle(document.querySelector('.stage')).touchAction,
  crop: getComputedStyle(document.querySelector('.crop-box')).touchAction,
}));
console.log('touch-action .stage    :', ta.stage);
console.log('touch-action .crop-box :', ta.crop);
assert('the stage still scrolls', ta.stage === 'auto', ta.stage);
assert('the crop box does not scroll while dragging', ta.crop === 'none', ta.crop);

console.log('\n--- 8. "nothing is uploaded" — prove it, do not assert it ---');
const external = requests.filter((u) => !u.startsWith('file://') && !u.startsWith('data:') && !u.startsWith('blob:'));
console.log('total requests   :', requests.length);
console.log('non-local reqs   :', external.length, external.length === 0 ? '(none — the page cannot leak anything)' : external);
console.log('request kinds    :', [...new Set(requests.map((u) => u.split(':')[0]))].join(', '));
assert('the page makes no non-local request at all', external.length === 0);

console.log('\n--- 9. screenshots ---');
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/singlefile_phone.png` });
await page.setViewportSize({ width: 1920, height: 1080 });
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/singlefile_desktop.png` });

console.log('\n=== errors ===');
console.log(errors.length ? errors.join('\n') : 'none');
assert('no console or page errors', errors.length === 0);

console.log('\n' + '='.repeat(62));
console.log(failures ? `${failures} assertion(s) FAILED` : 'all assertions passed');
console.log('='.repeat(62));

await browser.close();
process.exit(failures === 0 ? 0 : 1);
