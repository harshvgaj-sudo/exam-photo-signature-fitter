/*
 * test_mobile_touch.mjs — the core interaction, driven by a real finger.
 *
 * The primary tool exists to do one thing: drag a crop frame over a photograph
 * until it sits on the face. Everything else is packaging. That interaction is
 * implemented with pointer events and `touch-action: none` on the frame, and it
 * was tested by test_browser.mjs — at a phone-width viewport, but in a context
 * created WITHOUT `hasTouch`. Playwright then synthesises mouse input, so every
 * run in this repo's history has dragged that frame with a mouse. The audience
 * is on phones. An untested interaction on the device most people use is exactly
 * the gap worth closing.
 *
 * Why CDP and not dispatchEvent. The obvious way to "test touch" is to
 * synthesise PointerEvents and dispatch them. That would be worthless here: it
 * bypasses the browser's gesture pipeline entirely, so it would pass on a page
 * where the real drag is broken. `touch-action: none` is what stops the browser
 * treating a drag as a scroll, and only genuine input exercises it.
 * Input.dispatchTouchEvent produces real touch input that Chrome processes
 * through its normal gesture recogniser.
 *
 * Why two presets. The frame is not always free to move on both axes. For
 * ssc-signature the required box is full-width, so the crop's x is pinned at 0
 * and a horizontal drag legitimately does nothing — measured, not assumed. A
 * test that asserted "the frame moved right" against that preset would be
 * asserting a bug. So the suite runs a preset with room on both axes AND the
 * full-width one, and checks each axis only where the geometry leaves it free.
 *
 * The three negative controls, because a check that cannot fail is not a check:
 *   1. A touch on empty stage, away from the frame, must NOT move the frame.
 *      Without this, "the frame moved" could be an animation or a layout shift
 *      that happened to coincide with the drag.
 *   2. With `touch-action: none` overridden back to `auto`, the page must scroll
 *      instead. That is the load-bearing claim in the stylesheet's comment, and
 *      this is the only way to know the rule is doing anything at all.
 *   3. The zoom slider is shrunk back to the 32px it used to be, and the 44px
 *      tap-target check must report it. That check is what found the defect; an
 *      assertion that has never failed is indistinguishable from one that cannot.
 *
 * Runs against the modular tool over HTTP (where the real source lives) and
 * against the single-file build from file:// (which is what a visitor actually
 * opens). Same gesture, same assertions, both artifacts.
 *
 *   node _verify/test_mobile_touch.mjs
 */
import { chromium } from 'file:///C:/Users/harsh/.workbuddy-ai/binaries/node/workspace/node_modules/playwright-core/index.mjs';
import { join } from 'node:path';
import { serve, TOOL, HERE, ROOT } from './server.mjs';

const DIST = 'file:///' + join(ROOT, 'dist', 'photo-signature-fitter.html').replace(/\\/g, '/');
const FX = join(HERE, 'fixtures', 'scan_g12_d1.jpg');

// A real phone: touch enabled, mobile behaviour, 3x DPR. `hasTouch` is the whole
// point of this file.
const PHONE = {
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
  deviceScaleFactor: 3,
};

// The gesture is deliberately vertical-dominant. A mostly-horizontal drag cannot
// scroll a page that has no horizontal overflow, so it could never distinguish
// "touch-action is working" from "there was nothing to scroll anyway". 6px of
// vertical travel per step clears the browser's touch slop (~8px) by the second
// step while staying well inside the image bounds.
const DRAG = { dx: 20, dy: 60, steps: 10 };

const CASES = [
  ['ssc-photo', 'photo'],
  ['ssc-signature', 'signature'],
];

let failures = 0;
// `detail` explains a FAILURE, so it is only printed when the check fails. A
// failure-phrased string printed next to "ok" reads as if the check did not pass.
const assert = (label, cond, detail = '', note = '') => {
  if (!cond) failures++;
  console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${label}${cond ? (note ? '  — ' + note : '') : (detail ? '  — ' + detail : '')}`);
};

/** Frame position in CSS px, plus whether the geometry leaves each axis free. */
const readFrame = (p) =>
  p.locator('#cropBox').evaluate((el) => {
    const img = document.querySelector('#stageImg');
    const imgW = Math.round(img.getBoundingClientRect().width);
    const imgH = Math.round(img.getBoundingClientRect().height);
    const w = el.offsetWidth, h = el.offsetHeight;
    return {
      left: Math.round(parseFloat(el.style.left) || 0),
      top: Math.round(parseFloat(el.style.top) || 0),
      w, h,
      imgW, imgH,
      freeX: w < imgW - 1,
      freeY: h < imgH - 1,
      fullWidth: w >= imgW - 1,
    };
  });

/**
 * Dispatch a genuine touch drag through CDP.
 *
 * CDP touch coordinates are VIEWPORT-relative, not page-relative. On a 390x844
 * phone the crop frame sits well below the fold (page y ~1800), so dispatching
 * at its page position sends the touch into empty space and nothing moves. It
 * has to be scrolled in first.
 *
 * The scroll is measured as a DELTA from just before the drag. An absolute
 * reading of window.scrollY would flag this function's own scrollIntoView as a
 * failure.
 */
async function touchDrag(p, cdp, { dx, dy, steps }) {
  await p.locator('#cropBox').scrollIntoViewIfNeeded();
  await p.waitForTimeout(150);

  const scrollBefore = await p.evaluate(() => window.scrollY);
  const box = await p.locator('#cropBox').boundingBox();
  const sx = box.x + box.width / 2;
  const sy = box.y + box.height / 2;

  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: sx, y: sy }],
  });
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: sx + (dx * i) / steps, y: sy + (dy * i) / steps }],
    });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await p.waitForTimeout(300);

  const scrollAfter = await p.evaluate(() => window.scrollY);
  return { scrollDelta: scrollAfter - scrollBefore, from: { x: Math.round(sx), y: Math.round(sy) } };
}

/** Open the tool, choose a preset, load a photo, wait for the frame to appear. */
async function openTool(p, base, preset) {
  await p.goto(base, { waitUntil: 'load' });
  await p.selectOption('#presetSelect', preset);
  await p.setInputFiles('#fileInput', FX);
  await p.waitForFunction(() => {
    const el = document.querySelector('#cropBox');
    return el && el.offsetWidth > 0;
  }, null, { timeout: 30000 });
  await p.waitForTimeout(250);
}

/** Tap targets, measured on the device that has to hit them. */
const measureTargets = (p) =>
  p.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('button, select, input, a.sub-btn, a.ghost-btn')) {
      if (el.offsetParent === null) continue;          // visually hidden (the file input is)
      if (el.type === 'hidden') continue;
      const r = el.getBoundingClientRect();
      if (r.height > 0 && r.height < 44) {
        out.push(`${el.id || el.tagName.toLowerCase()} ${Math.round(r.width)}x${Math.round(r.height)}`);
      }
    }
    return out;
  });

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const { server, port } = await serve(TOOL, { fx: join(HERE, 'fixtures') });
const BASE = `http://127.0.0.1:${port}/`;

try {
  console.log('='.repeat(100));
  console.log('MOBILE TOUCH — the crop drag under real touch input, on a 390x844 phone');
  console.log('='.repeat(100));

  const ctx = await browser.newContext(PHONE);
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  const cdp = await ctx.newCDPSession(p);

  /* ============================================ 1. the drag, both geometries */
  const geometry = {};
  for (const [preset, kind] of CASES) {
    console.log(`\n--- 1. touch drag: ${preset} (${kind}) ---`);
    await openTool(p, BASE, preset);

    const before = await readFrame(p);
    geometry[preset] = before;
    const drag = await touchDrag(p, cdp, DRAG);
    const after = await readFrame(p);
    const dx = after.left - before.left;
    const dy = after.top - before.top;

    console.log(`  frame      ${JSON.stringify({ left: before.left, top: before.top, w: before.w, h: before.h })}` +
      `  ->  ${JSON.stringify({ left: after.left, top: after.top, w: after.w, h: after.h })}`);
    console.log(`  image      ${before.imgW}x${before.imgH} rendered; frame free on` +
      ` x=${before.freeX} y=${before.freeY}${before.fullWidth ? ' (full-width crop)' : ''}`);
    console.log(`  touch      from (${drag.from.x}, ${drag.from.y}) viewport-relative, ${DRAG.dx}x${DRAG.dy}px over ${DRAG.steps} steps`);
    console.log(`  moved      dx=${dx} dy=${dy}   readout: ${await p.locator('#cropReadout').innerText()}`);

    assert('the frame moved under touch', dx !== 0 || dy !== 0,
      'the frame did not move at all');
    assert('it tracked the drag vertically', before.freeY ? dy > 0 : true,
      before.freeY ? `dy=${dy}, expected > 0` : '',
      before.freeY ? `dy=${dy}` : 'no vertical room');
    assert('it tracked the drag horizontally wherever x is free', before.freeX ? dx > 0 : true,
      before.freeX ? `dx=${dx}, expected > 0` : '',
      before.freeX ? `dx=${dx}` : `x is pinned: the crop is full-width (${before.w}px of ${before.imgW}px)`);
    assert('the page did not scroll during the drag (touch-action: none is doing its job)',
      drag.scrollDelta === 0, `the page scrolled ${drag.scrollDelta}px instead of dragging`,
      '0px of scroll');
  }

  // The full-width claim above is load-bearing for the x-axis assertion, so it is
  // checked rather than asserted in a comment.
  assert('ssc-signature really is a full-width crop, which is why its x axis cannot move',
    geometry['ssc-signature'].fullWidth,
    `frame ${geometry['ssc-signature'].w}px on a ${geometry['ssc-signature'].imgW}px image — if this is not full-width, the x axis is free and dx should have been asserted`);
  assert('ssc-photo is NOT full-width, so it exercises the horizontal axis',
    geometry['ssc-photo'].freeX,
    `frame ${geometry['ssc-photo'].w}px on a ${geometry['ssc-photo'].imgW}px image — no horizontal room, so the x assertion proved nothing`);

  /* ------------------------------------- 2. negative control: empty stage space */
  console.log('\n--- 2. negative control: a touch on empty stage must NOT move the frame ---');
  await openTool(p, BASE, 'ssc-signature');
  await p.locator('#resetCrop').click();
  await p.waitForTimeout(200);

  await p.locator('#stage').scrollIntoViewIfNeeded();
  await p.waitForTimeout(200);
  const stageBox = await p.locator('#stage').boundingBox();

  // Choose a point inside the stage the frame does not cover, confirmed by
  // hit-testing rather than inferred from geometry.
  const pt = { x: stageBox.x + 10, y: stageBox.y + 10 };
  const hit = await p.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y);
    if (!el) return 'none';
    return el.closest('#cropBox') ? 'cropBox' : (el.id || el.tagName.toLowerCase());
  }, pt);

  const ctrlBefore = await readFrame(p);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt] });
  for (let i = 1; i <= DRAG.steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: pt.x + (DRAG.dx * i) / DRAG.steps, y: pt.y + (DRAG.dy * i) / DRAG.steps }],
    });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await p.waitForTimeout(250);

  const ctrlAfter = await readFrame(p);
  const cdx = ctrlAfter.left - ctrlBefore.left;
  const cdy = ctrlAfter.top - ctrlBefore.top;
  console.log(`  point (${Math.round(pt.x)}, ${Math.round(pt.y)}) hit-tests to "${hit}"`);

  assert('the control touch landed on the stage, not the frame', hit === 'stage',
    `it landed on "${hit}" — this control only means something if it misses the frame`);
  assert('the frame did not move when the touch missed it', cdx === 0 && cdy === 0,
    `dx=${cdx} dy=${cdy} — the frame moved on a touch that did not land on it`,
    'dx=0 dy=0');

  /* --------------------------------------- 3. tap targets, overflow, errors */
  console.log('\n--- 3. every control on the tool is at least 44px tall ---');
  const small = await measureTargets(p);
  assert('every visible control is at least 44px tall', small.length === 0,
    small.join(', '), 'all >= 44px');

  const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert('no horizontal overflow at phone width', overflow <= 0, `${overflow}px`, `${overflow}px`);

  assert('no page or console errors', errors.length === 0, errors.join(' | '), 'none');

  /* ------------------------------- 4. negative control: touch-action is load-bearing */
  console.log('\n--- 4. negative control: without touch-action: none the page must scroll ---');
  await openTool(p, BASE, 'ssc-signature');
  await p.locator('#resetCrop').click();
  await p.waitForTimeout(200);

  // Injected last: addStyleTag persists for the life of the page, so anything
  // measured after this point would be measured under a modified stylesheet.
  await p.addStyleTag({ content: '.crop-box { touch-action: auto !important; }' });

  const freeBefore = await readFrame(p);
  const drag2 = await touchDrag(p, cdp, DRAG);
  const freeAfter = await readFrame(p);
  const fdy = freeAfter.top - freeBefore.top;

  console.log(`  frame moved dy=${fdy} (was 26px with touch-action: none)`);
  console.log(`  page scrolled ${drag2.scrollDelta}px`);
  assert('removing touch-action: none makes the page scroll instead of dragging',
    drag2.scrollDelta !== 0,
    'the page did not scroll — so touch-action is not what makes the drag work, and the ' +
    'stylesheet comment claiming it is would be wrong',
    `the page scrolled ${drag2.scrollDelta}px`);

  /* -------------------- 5. negative control: the 44px check must be able to fail */
  // The tap-target assertion above is what caught the zoom slider at 32px. An
  // assertion that has never failed is indistinguishable from one that cannot, so
  // the slider is shrunk back to the size it was and the measurement must object.
  // Injected on the same page, after every clean measurement has been taken.
  console.log('\n--- 5. negative control: shrinking the slider back to 32px must be reported ---');
  await p.addStyleTag({ content: 'input[type="range"] { height: 32px !important; }' });
  const regressed = await measureTargets(p);
  console.log('  controls under 44px: ' + (regressed.length ? regressed.join(', ') : 'none'));
  assert('the 44px check fails when a control is shrunk below it', regressed.length > 0,
    'shrinking the slider to 32px was NOT reported — the check cannot fail, so it proves nothing');
  assert('it names the range input specifically', regressed.some((s) => s.startsWith('zoom')),
    `reported [${regressed.join(', ')}] — expected the zoom slider`);

  /* ================================================ 6. the file:// build */
  console.log('\n' + '='.repeat(100));
  console.log('THE SINGLE-FILE BUILD — the same gesture on the artifact a visitor downloads');
  console.log('='.repeat(100));
  console.log(`\n  ${DIST}`);

  const ctx2 = await browser.newContext(PHONE);
  const p2 = await ctx2.newPage();
  const errors2 = [];
  p2.on('pageerror', (e) => errors2.push('pageerror: ' + e.message));
  p2.on('console', (m) => { if (m.type() === 'error') errors2.push('console: ' + m.text()); });
  const cdp2 = await ctx2.newCDPSession(p2);

  for (const [preset, kind] of CASES) {
    console.log(`\n--- touch drag: ${preset} (${kind}) ---`);
    await openTool(p2, DIST, preset);
    const b = await readFrame(p2);
    const d = await touchDrag(p2, cdp2, DRAG);
    const a = await readFrame(p2);
    const bdx = a.left - b.left, bdy = a.top - b.top;
    console.log(`  frame ${JSON.stringify({ left: b.left, top: b.top })}  ->  ${JSON.stringify({ left: a.left, top: a.top })}  (dx=${bdx} dy=${bdy})`);

    assert('the frame moved under touch', bdx !== 0 || bdy !== 0, `dx=${bdx} dy=${bdy}`);
    assert('it tracked the drag vertically', b.freeY ? bdy > 0 : true,
      `dy=${bdy}, expected > 0`, b.freeY ? `dy=${bdy}` : 'no vertical room');
    assert('it tracked the drag horizontally wherever x is free', b.freeX ? bdx > 0 : true,
      `dx=${bdx}, expected > 0`, b.freeX ? `dx=${bdx}` : 'x is pinned: full-width crop');
    assert('the page did not scroll during the drag', d.scrollDelta === 0,
      `the page scrolled ${d.scrollDelta}px`, '0px of scroll');
  }

  const small2 = await measureTargets(p2);
  assert('every visible control is at least 44px tall', small2.length === 0,
    small2.join(', '), 'all >= 44px');
  assert('no page or console errors', errors2.length === 0, errors2.join(' | '), 'none');

  await browser.close();
} finally {
  server.close();
}

console.log('\n' + '='.repeat(100));
console.log(failures
  ? `  ${failures} FAILED`
  : '  The crop drag works under real touch input, on both artifacts, on both axes, and the controls are finger-sized.');
console.log('='.repeat(100));
process.exit(failures ? 1 : 0);
