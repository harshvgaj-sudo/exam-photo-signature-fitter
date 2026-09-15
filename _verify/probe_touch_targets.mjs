/*
 * probe_touch_targets.mjs — does the coarse-pointer branch of the touch-target
 * rule actually fire, and is it ever exercised by the responsive sweep?
 *
 * The CSS raises buttons to min-height:44px under
 *   @media (max-width: 480px), (pointer: coarse)
 * The sweep in test_single_file.mjs runs in a default (fine-pointer) context, so
 * the `(pointer: coarse)` half may never match. This measures the truth rather
 * than assuming it, across three emulation modes and two widths.
 */
import { chromium } from 'file:///C:/Users/harsh/.workbuddy-ai/binaries/node/workspace/node_modules/playwright-core/index.mjs';

const FILE = 'C:/Users/harsh/WorkBuddy AI/2026-09-14-10-03-21/govdocs-review/dist/photo-signature-fitter.html';
const FILE_URL = 'file:///' + FILE.replace(/\\/g, '/');

const browser = await chromium.launch({ channel: 'chrome', headless: true });

const MODES = [
  ['fine pointer (what the sweep uses)', { viewport: { width: 390, height: 844 } }],
  ['hasTouch only                     ', { viewport: { width: 390, height: 844 }, hasTouch: true }],
  ['isMobile + hasTouch               ', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }],
];

const SIZES = [
  ['portrait  ', 390, 844],
  ['landscape ', 844, 390],
  ['wide      ', 1366, 768],
];

const measure = async (opts, w, h) => {
  const ctx = await browser.newContext({ ...opts, viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  await page.goto(FILE_URL, { waitUntil: 'load' });
  const r = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button, .sub-btn, .ghost-btn')]
      .filter((b) => b.offsetParent !== null)
      .map((b) => Math.round(b.getBoundingClientRect().height));
    return {
      coarse: matchMedia('(pointer: coarse)').matches,
      fine: matchMedia('(pointer: fine)').matches,
      narrow: matchMedia('(max-width: 480px)').matches,
      minBtn: btns.length ? Math.min(...btns) : 0,
      n: btns.length,
    };
  });
  await ctx.close();
  return r;
};

console.log('MODE'.padEnd(36) + 'SIZE'.padEnd(12) + 'coarse'.padEnd(8) + 'narrow'.padEnd(8) + 'minBtn');
console.log('-'.repeat(78));
for (const [mode, opts] of MODES) {
  for (const [size, w, h] of SIZES) {
    const r = await measure(opts, w, h);
    console.log(
      mode.padEnd(36) + size.padEnd(12) +
      String(r.coarse).padEnd(8) + String(r.narrow).padEnd(8) + `${r.minBtn}px  (n=${r.n})`
    );
  }
}

await browser.close();
