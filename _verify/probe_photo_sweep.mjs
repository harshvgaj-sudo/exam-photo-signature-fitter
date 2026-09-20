/*
 * probe_photo_sweep.mjs — are the photo presets actually comfortable, or only
 * comfortable on one fixture?
 *
 * WHY THIS EXISTS
 * Every photo entry in the registry declared a sweep of `{ fixture: 'photo', grain:
 * [12] }` — a single point. That is not a sweep, and classifySweep() says so in its
 * own doc comment: "a single measurement cannot separate 'marginal' from
 * 'comfortable', because the thing that actually breaks a preset is input variation".
 * The reason it was one point is mechanical — makePhoto() had no grain parameter, so
 * asking for several grain levels produced the same image several times over. The
 * parameter now exists, so the claim can finally be measured properly.
 *
 * WHY IT COULD FLIP
 * The photo window is 20-50 KB (SSC, IBPS) and 20-200 KB (UPSC). A 200x230 box is
 * 46,000 pixels, so a 20 KB floor demands 0.45 bytes per pixel. A CLEAN capture is
 * exactly the case that compresses smallest, and grain 0 is now on the grid. The
 * floor is the risk, not the ceiling — the same direction as the SSC signature and
 * the opposite of the UPSC triple signature.
 *
 * Run: node _verify/probe_photo_sweep.mjs
 */
import { pxFromCm } from '../reference-tool/js/specs.js';
import { classifySweep, HEADROOM_COMFORTABLE } from '../reference-tool/js/core.js';
import { buildFixturesFromRegistry, buildJobsFromRegistry, runInBrowser } from './browser_truth.mjs';

const SWEEP = { fixture: 'photo', grain: [0, 6, 12, 20, 32] };

/** Every photo box in the registry, plus the two readings of the IBPS printed size. */
const CANDIDATES = [
  { id: 'ssc-photo', width: 200, height: 230, minKB: 20, maxKB: 50 },
  { id: 'ssc-photo-large', width: pxFromCm(3.5, 300), height: pxFromCm(4.5, 300), minKB: 20, maxKB: 50 },
  { id: 'ibps-photo', width: 200, height: 230, minKB: 20, maxKB: 50 },
  { id: 'ibps-photo-cm-200dpi', width: pxFromCm(4.5, 200), height: pxFromCm(3.5, 200), minKB: 20, maxKB: 50 },
  { id: 'ibps-photo-cm-300dpi', width: pxFromCm(4.5, 300), height: pxFromCm(3.5, 300), minKB: 20, maxKB: 50 },
  { id: 'upsc-photo', width: 500, height: 500, minKB: 20, maxKB: 200 },
  { id: 'mpsc-photo', width: pxFromCm(3.5, 200), height: pxFromCm(4.5, 200), minKB: 1, maxKB: 50 },
];

const cands = CANDIDATES.map((c) => ({ ...c, status: 'UNVERIFIED', measuredOver: SWEEP }));

const fixtures = buildFixturesFromRegistry(cands);
const jobs = buildJobsFromRegistry(cands);
console.log(`fixtures: ${Object.keys(fixtures).length} JPEG file(s)`);
console.log(`jobs    : ${jobs.length} measurement(s) over ${cands.length} photo boxes\n`);

const { records, meta } = await runInBrowser(fixtures, jobs, { log: (m) => console.log('  ' + m) });
console.log(`browser : ${meta.chrome}\n`);

const byId = new Map();
for (const r of records) {
  if (!byId.has(r.id)) byId.set(r.id, []);
  byId.get(r.id).push(r);
}

const bar = '='.repeat(118);
console.log(bar);
console.log('PHOTO BOXES over a REAL 5-point capture-quality sweep (grain 0 = clean, 32 = noisy)');
console.log(`'comfortable' needs EVERY input >= ${HEADROOM_COMFORTABLE}x the floor.`);
console.log(bar);
console.log(
  'BOX'.padEnd(24) + 'PIXELS'.padEnd(10) + 'WINDOW'.padEnd(12) +
  'q1.0 OVER THE SWEEP'.padEnd(22) + 'PASS'.padEnd(8) + 'MIN/floor'.padEnd(11) + 'VERDICT'
);
console.log('-'.repeat(118));

for (const c of cands) {
  const rs = byId.get(c.id) || [];
  const samples = rs.map((r) => r.atMax);
  const minBytes = c.minKB * 1024;
  const passed = rs.filter((r) => r.ok);
  const verdict = classifySweep(samples, minBytes);
  const lo = Math.min(...samples);
  const worst = rs.reduce((a, b) => (b.atMax < a.atMax ? b : a), rs[0]);

  console.log(
    c.id.padEnd(24) +
    `${c.width}x${c.height}`.padEnd(10) +
    `${c.minKB}-${c.maxKB}KB`.padEnd(12) +
    `${(lo / 1024).toFixed(1)}-${(Math.max(...samples) / 1024).toFixed(1)}KB`.padEnd(22) +
    `${passed.length}/${rs.length}`.padEnd(8) +
    `${(lo / minBytes).toFixed(2)}x`.padEnd(11) +
    `${verdict}   (worst: grain ${worst.grain})`
  );
}
console.log('-'.repeat(118));

const flipped = cands.filter((c) => {
  const rs = byId.get(c.id) || [];
  return classifySweep(rs.map((r) => r.atMax), c.minKB * 1024) !== 'comfortable';
});
console.log('');
if (!flipped.length) {
  console.log('Every photo box is still comfortable under a real sweep. The single-fixture');
  console.log('declaration happened to be right — but it was not evidence, and now it is.');
} else {
  console.log('BOXES THAT ARE NOT COMFORTABLE ONCE THE SWEEP IS REAL:');
  for (const c of flipped) {
    const rs = byId.get(c.id) || [];
    const samples = rs.map((r) => r.atMax);
    const passed = rs.filter((r) => r.ok);
    console.log(`  ${c.id} (${c.width}x${c.height}, ${c.minKB}-${c.maxKB} KB): ` +
      `${classifySweep(samples, c.minKB * 1024)}, ${passed.length}/${rs.length} pass, ` +
      `${(Math.min(...samples) / 1024).toFixed(1)}-${(Math.max(...samples) / 1024).toFixed(1)} KB`);
  }
}
console.log(bar);
