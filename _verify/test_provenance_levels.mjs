/*
 * test_provenance_levels.mjs — the three provenance levels must be VISIBLY
 * different, not merely differently worded.
 *
 * The registry has three levels of trust — VERIFIED (the document states these
 * pixels), DERIVED (the document states a printed size; the pixel box is our
 * conversion), and UNVERIFIED (relayed second-hand). The whole point of the model
 * is that a user can tell at a glance which one they are relying on.
 *
 * It did not work for DERIVED. The wording was distinct from VERIFIED, but the
 * element carried the same CSS class, so the two rendered as the identical neutral
 * box and the difference lived only in a paragraph the user had to actually read.
 * The status model was invisible exactly where it mattered.
 *
 * This asserts the property that was missing: three levels, three backgrounds, and
 * every combination legible. It fails if a level is ever collapsed back onto
 * another, or if a new colour drops below WCAG AA.
 *
 *   node _verify/test_provenance_levels.mjs
 */
import { chromium } from 'file:///C:/Users/harsh/.workbuddy-ai/binaries/node/workspace/node_modules/playwright-core/index.mjs';
const URL = 'file:///C:/Users/harsh/WorkBuddy%20AI/2026-09-14-10-03-21/govdocs-review/dist/photo-signature-fitter.html';
const b = await chromium.launch({ channel: 'chrome', headless: true });
const p = await b.newPage({ viewport: { width: 1280, height: 1000 } });
await p.goto(URL, { waitUntil: 'load' });

const lum = (r, g, bl) => {
  const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(bl);
};
const parse = (s) => s.match(/\d+/g).map(Number).slice(0, 3);
const ratio = (fg, bg) => {
  const L1 = lum(...parse(fg)), L2 = lum(...parse(bg));
  const hi = Math.max(L1, L2), lo = Math.min(L1, L2);
  return (hi + 0.05) / (lo + 0.05);
};
const pad = (s, n) => String(s).padEnd(n);

const probe = async (id) => {
  await p.selectOption('#presetSelect', id);
  return p.locator('#provenance').evaluate((el) => {
    const s = getComputedStyle(el);
    return { cls: el.className, fg: s.color, bg: s.backgroundColor };
  });
};

let failures = 0;
for (const theme of ['light', 'dark']) {
  await p.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
  console.log('\n=== ' + theme.toUpperCase() + ' ===');
  const rows = [
    ['VERIFIED  ssc-photo', await probe('ssc-photo')],
    ['DERIVED   ssc-photo-large', await probe('ssc-photo-large')],
    ['UNVERIFIED ssc-signature-large', await probe('ssc-signature-large')],
  ];
  const seen = new Set();
  for (const [label, r] of rows) {
    const c = ratio(r.fg, r.bg);
    const verdict = c >= 4.5 ? 'AA' : (c >= 3 ? 'AA-large-only' : 'FAIL');
    if (c < 4.5) failures++;
    console.log('  ' + pad(label, 32) + 'cls=' + pad(r.cls, 20) +
      'contrast=' + c.toFixed(2) + ':1  ' + verdict);
    seen.add(r.bg);
  }
  console.log('  three distinct backgrounds: ' + (seen.size === 3 ? 'YES' : 'NO (' + seen.size + ' unique)'));
  if (seen.size !== 3) failures++;
}

await p.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
await p.selectOption('#presetSelect', 'ssc-photo-large');
await p.screenshot({
  path: 'C:/Users/harsh/WorkBuddy AI/2026-09-14-10-03-21/govdocs-review/_verify/shots/derived_panel.png',
});
await b.close();
console.log('\n' + (failures ? failures + ' FAILURES' : 'all three levels distinct and >= 4.5:1 in both themes'));
process.exit(failures ? 1 : 0);
