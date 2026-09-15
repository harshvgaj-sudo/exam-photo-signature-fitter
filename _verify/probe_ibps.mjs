/*
 * Which reading of the IBPS photograph requirement is physically credible?
 *
 * The research note says: "4.5cm x 3.5cm, 20-50 KB, 200x230 pixels".
 * 4.5 x 3.5 cm is LANDSCAPE. 200 x 230 px is PORTRAIT. They cannot both be right.
 *
 * The test that settles it runs the real size search from core.js on each reading
 * and looks at the JPEG quality it needed. Almost any pixel box can be forced
 * into a size window at maximum quality, because quality 1.0 uses near-lossless
 * quantisation tables. A requirement that only works at quality 1.0 has no
 * headroom, so the next photograph will miss it. That is a sign the pixel figure
 * is wrong, not that the candidate is careless.
 */
import { searchQuality } from '../reference-tool/js/core.js';
import { makePhoto, render, encodeBytes, resetSeed, SEEDS } from './fixtures.mjs';

resetSeed(SEEDS.photo);
const P = makePhoto(4032, 3024);

const MIN_KB = 20, MAX_KB = 50;

const CANDIDATES = [
  ['200x230 (the stated pixel figure)', 200, 230],
  ['4.5x3.5cm @200dpi = 354x276', 354, 276],
  ['4.5x3.5cm @300dpi = 531x413', 531, 413],
  ['3.5x4.5cm @300dpi = 413x531', 413, 531],
];

console.log('IBPS PHOTOGRAPH - the note states 4.5cm x 3.5cm AND 200x230 px.');
console.log('4.5x3.5cm is landscape. 200x230 is portrait. One of them is wrong.\n');
console.log(`Required window: ${MIN_KB}-${MAX_KB} KB.`);
console.log('Quality needed is the point: a window reachable only at quality 1.0 has no headroom.\n');
console.log('READING'.padEnd(38) + 'RESULT'.padEnd(12) + 'SIZE'.padEnd(10) + 'QUALITY NEEDED'.padEnd(16) + 'VERDICT');
console.log('-'.repeat(112));

const rows = [];
for (const [label, w, h] of CANDIDATES) {
  const cropW = Math.min(3024, Math.round(3024 * w / h));
  const c = render(P, { x: Math.round((4032 - cropW) / 2), y: 0, width: cropW, height: 3024 }, w, h);

  const r = await searchQuality({
    measure: async (q) => encodeBytes(c, q),
    minBytes: MIN_KB * 1024,
    maxBytes: MAX_KB * 1024,
  });

  const q = r.quality;
  let verdict;
  if (!r.ok) verdict = 'not reachable: ' + r.reason;
  else if (q >= 0.999) verdict = 'NO HEADROOM - only works at maximum quality';
  else if (q > 0.95) verdict = 'narrow - needs quality above 0.95';
  else verdict = 'CREDIBLE - reached at ordinary quality';

  rows.push({ label, verdict, q });
  console.log(
    label.padEnd(38) +
    (r.ok ? 'ok' : 'refused').padEnd(12) +
    (r.ok ? `${(r.bytes / 1024).toFixed(1)}KB` : '--').padEnd(10) +
    (r.ok ? q.toFixed(3) : '--').padEnd(16) +
    verdict
  );
}
console.log('-'.repeat(112));

const credible = rows.filter((r) => r.verdict.startsWith('CREDIBLE'));
console.log('\nReadings that hold the window with real headroom:');
if (credible.length) for (const r of credible) console.log('  - ' + r.label + `  (quality ${r.q.toFixed(3)})`);
else console.log('  none');

const noHeadroom = rows.filter((r) => r.verdict.startsWith('NO HEADROOM'));
console.log('\nReadings that technically pass but only at maximum quality:');
if (noHeadroom.length) for (const r of noHeadroom) console.log('  - ' + r.label);
else console.log('  none');

console.log('\nA pixel box that only reaches the stated size at maximum JPEG quality is a');
console.log('red flag on the pixel figure. Note this, then check the upload screen.\n');
