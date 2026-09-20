/*
 * probe_rrb_box.mjs — which reading of the RRB signature box actually holds 30-49 KB?
 *
 * WHY THIS EXISTS
 * The CEN fixes the file-size window (30-49 KB) and the scan box (35 mm x 20 mm) and
 * a MINIMUM scan resolution (100 DPI). It does not fix a pixel box, so the pixel box
 * is a choice, and the choice decides whether the preset works.
 *
 * The first choice was 300 dpi. check_specs.mjs measured it at 25.4-86.2 KB over the
 * 28-combination scan sweep — 27 of 28 inputs passed, and one compact signature on
 * clean paper reached only 25.4 KB against a 30 KB floor. So the entry was 'marginal',
 * not 'comfortable', and the default RRB preset would have refused a real document.
 *
 * The lesson from the SSC signature is that you cannot reason this out from bytes per
 * pixel: the ratio is not constant across box sizes, because JPEG header and table
 * overhead dominates small images. The earlier hand-extrapolation here predicted 300
 * dpi would be comfortable and it was wrong. So every candidate reading is MEASURED
 * here, in real Chrome, over the same sweep the registry uses, and the box is chosen
 * from the numbers.
 *
 * Run: node _verify/probe_rrb_box.mjs
 */
import { pxFromCm } from '../reference-tool/js/specs.js';
import { classifySweep, HEADROOM_COMFORTABLE } from '../reference-tool/js/core.js';
import { buildFixturesFromRegistry, buildJobsFromRegistry, runInBrowser } from './browser_truth.mjs';

const SWEEP = { fixture: 'scan', grain: [0, 4, 8, 12, 16, 24, 32], density: [1, 2, 4, 6] };
const MIN_KB = 30;
const MAX_KB = 49;

/** The CEN's 35 mm x 20 mm scan box, read at each permitted resolution. */
const DPIS = [100, 200, 300, 400, 500, 600];

const cands = DPIS.map((dpi) => ({
  id: `rrb-${dpi}dpi`,
  width: pxFromCm(3.5, dpi),
  height: pxFromCm(2.0, dpi),
  minKB: MIN_KB,
  maxKB: MAX_KB,
  status: 'UNVERIFIED',
  measuredOver: SWEEP,
}));

const fixtures = buildFixturesFromRegistry(cands);
const jobs = buildJobsFromRegistry(cands);
console.log(`fixtures: ${Object.keys(fixtures).length} JPEG file(s)`);
console.log(`jobs    : ${jobs.length} measurement(s) over ${cands.length} candidate readings\n`);

const { records, meta } = await runInBrowser(fixtures, jobs, { log: (m) => console.log('  ' + m) });
console.log(`browser : ${meta.chrome}\n`);

const byId = new Map();
for (const r of records) {
  if (!byId.has(r.id)) byId.set(r.id, []);
  byId.get(r.id).push(r);
}

const bar = '='.repeat(112);
console.log(bar);
console.log('RRB SIGNATURE — the CEN scan box (35 x 20 mm) read at each permitted resolution');
console.log(`window ${MIN_KB}-${MAX_KB} KB · floor demands 30 KB · 'comfortable' needs every input >= ${HEADROOM_COMFORTABLE}x`);
console.log(bar);
console.log(
  'DPI'.padEnd(7) + 'BOX'.padEnd(12) + 'PIXELS'.padEnd(10) +
  'q1.0 OVER THE SWEEP'.padEnd(22) + 'PASS'.padEnd(8) +
  'MIN/floor'.padEnd(11) + 'VERDICT'
);
console.log('-'.repeat(112));

const rows = [];
for (const c of cands) {
  const rs = byId.get(c.id) || [];
  const samples = rs.map((r) => r.atMax);
  const minBytes = c.minKB * 1024;
  const passed = rs.filter((r) => r.ok);
  const verdict = classifySweep(samples, minBytes);
  const lo = Math.min(...samples);
  rows.push({ c, rs, samples, passed, verdict, lo });

  console.log(
    `${c.id.replace('rrb-', '').replace('dpi', '')}`.padEnd(7) +
    `${c.width}x${c.height}`.padEnd(12) +
    `${c.width * c.height}`.padEnd(10) +
    `${(lo / 1024).toFixed(1)}-${(Math.max(...samples) / 1024).toFixed(1)}KB`.padEnd(22) +
    `${passed.length}/${rs.length}`.padEnd(8) +
    `${(lo / minBytes).toFixed(2)}x`.padEnd(11) +
    verdict
  );
}
console.log('-'.repeat(112));

/* The smallest box that is comfortable is the answer: it keeps the file small and
 * the compression light while never refusing a real document. */
const best = rows.filter((r) => r.verdict === 'comfortable').sort((a, b) => a.lo - b.lo)[0];
console.log('');
if (!best) {
  console.log('NO candidate reading is comfortable. The preset cannot ship at any permitted DPI.');
  process.exit(1);
}
console.log(`SMALLEST COMFORTABLE READING: ${best.c.width}x${best.c.height} px ` +
  `(${best.c.id.replace('rrb-', '')}), worst input ${(best.lo / 1024).toFixed(1)} KB ` +
  `= ${(best.lo / (MIN_KB * 1024)).toFixed(2)}x the floor.`);

// The ceiling must also be reachable without crushing the document, which is what
// PART 3 of check_specs.mjs enforces across the whole registry.
const qs = best.rs.filter((r) => r.ok).map((r) => r.quality);
console.log(`quality range needed to fit the ${MAX_KB} KB ceiling: ` +
  `${Math.min(...qs).toFixed(3)} - ${Math.max(...qs).toFixed(3)}`);
console.log(bar);
