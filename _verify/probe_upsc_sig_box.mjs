/*
 * probe_upsc_sig_box.mjs — which square holds UPSC's triple-signature window?
 *
 * WHY THIS EXISTS
 * UPSC states the signature window (20-100 KB) and a pixel RANGE (350-500 pixels),
 * but not a single box. So the box is a choice, and the choice decides whether the
 * preset refuses a real document.
 *
 * Two official UPSC documents disagree about that range, and the disagreement is
 * why the candidates here stop at 500:
 *
 *   "Instructions for Uploading the Photo & Signature" (upsconline.nic.in, CAF)
 *       File size 20 KB - 100 KB, image dimensions 350 - 500 pixels
 *   OTR FAQ Q44 (upsconline.gov.in)
 *       not less than 20 KB and not exceeding 300 KB, 350x350 min, 1000x1000 max
 *
 * 350-500 is the INTERSECTION of the two. A file inside the intersection satisfies
 * both documents; a file only inside the FAQ's range satisfies the FAQ and fails
 * the instructions. So the preset ships the intersection, and these are the only
 * boxes that are unambiguously legal under both.
 *
 * The triple signature carries roughly three times the ink of an ordinary one, so
 * the risk here is the CEILING rather than the floor — the opposite of the SSC and
 * IBPS signature boxes. Which is another reason not to reason about it: the same
 * bytes-per-pixel intuition points the wrong way.
 *
 * Run: node _verify/probe_upsc_sig_box.mjs
 */
import { classifySweep, HEADROOM_COMFORTABLE } from '../reference-tool/js/core.js';
import { buildFixturesFromRegistry, buildJobsFromRegistry, runInBrowser } from './browser_truth.mjs';

const SWEEP = { fixture: 'triple', grain: [0, 4, 8, 12, 16, 24, 32], density: [1, 2, 4, 6] };
const MIN_KB = 20;
const MAX_KB = 100;

/** Every square inside the 350-500 px range both official documents agree on. */
const SIDES = [350, 400, 450, 500];

const cands = SIDES.map((s) => ({
  id: `upsc-sig-${s}`,
  width: s,
  height: s,
  minKB: MIN_KB,
  maxKB: MAX_KB,
  status: 'UNVERIFIED',
  measuredOver: SWEEP,
}));

const fixtures = buildFixturesFromRegistry(cands);
const jobs = buildJobsFromRegistry(cands);
console.log(`fixtures: ${Object.keys(fixtures).length} JPEG file(s)`);
console.log(`jobs    : ${jobs.length} measurement(s) over ${cands.length} candidate boxes\n`);

const { records, meta } = await runInBrowser(fixtures, jobs, { log: (m) => console.log('  ' + m) });
console.log(`browser : ${meta.chrome}\n`);

const byId = new Map();
for (const r of records) {
  if (!byId.has(r.id)) byId.set(r.id, []);
  byId.get(r.id).push(r);
}

const bar = '='.repeat(112);
console.log(bar);
console.log('UPSC TRIPLE SIGNATURE — every square in the range both official documents agree on');
console.log(`window ${MIN_KB}-${MAX_KB} KB · 'comfortable' needs every input >= ${HEADROOM_COMFORTABLE}x the floor`);
console.log(bar);
console.log(
  'SIDE'.padEnd(7) + 'PIXELS'.padEnd(10) + 'q1.0 OVER THE SWEEP'.padEnd(22) +
  'PASS'.padEnd(8) + 'MIN/floor'.padEnd(11) + 'Q TO FIT'.padEnd(14) + 'VERDICT'
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
  const q = passed.map((r) => r.quality);
  rows.push({ c, rs, samples, passed, verdict, lo, q });

  console.log(
    `${c.width}`.padEnd(7) +
    `${c.width * c.height}`.padEnd(10) +
    `${(lo / 1024).toFixed(1)}-${(Math.max(...samples) / 1024).toFixed(1)}KB`.padEnd(22) +
    `${passed.length}/${rs.length}`.padEnd(8) +
    `${(lo / minBytes).toFixed(2)}x`.padEnd(11) +
    (q.length ? `${Math.min(...q).toFixed(3)}-${Math.max(...q).toFixed(3)}` : 'n/a').padEnd(14) +
    verdict
  );
}
console.log('-'.repeat(112));

/* The SMALLEST comfortable box is the answer. Smallest matters here in the opposite
 * direction to RRB: the ceiling is what this preset has to respect, and a smaller
 * box keeps the three signatures further from it without lowering quality. */
const best = rows.filter((r) => r.verdict === 'comfortable').sort((a, b) => a.lo - b.lo)[0];
console.log('');
if (!best) {
  const marg = rows.filter((r) => r.verdict === 'marginal');
  console.log(marg.length
    ? 'NO square in the agreed range is comfortable. Best available:'
    : 'NO square in the agreed range reaches the floor at all.');
  for (const m of marg.sort((a, b) => b.passed.length - a.passed.length)) {
    console.log(`  ${m.c.width}x${m.c.height}: ${m.passed.length}/${m.rs.length} pass, ` +
      `${(m.lo / 1024).toFixed(1)}-${(Math.max(...m.samples) / 1024).toFixed(1)} KB`);
  }
  process.exit(1);
}
console.log(`SMALLEST COMFORTABLE BOX: ${best.c.width}x${best.c.height} px — ` +
  `${best.passed.length}/${best.rs.length} pass, worst input ${(best.lo / 1024).toFixed(1)} KB ` +
  `= ${(best.lo / (MIN_KB * 1024)).toFixed(2)}x the floor, ` +
  `quality ${Math.min(...best.q).toFixed(3)}-${Math.max(...best.q).toFixed(3)} to fit ${MAX_KB} KB.`);
console.log(bar);
