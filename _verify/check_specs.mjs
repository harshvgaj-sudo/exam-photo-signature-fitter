/*
 * check_specs.mjs — does every registry entry actually hold its own size window?
 *
 * This is the anti-drift guard, and it exists because of a real failure.
 *
 * The registry states a pixel box and a KB window for each requirement. Those two
 * numbers can contradict each other, and when they do the tool either refuses a
 * valid image or, worse, claims success on an impossible one. Neither is visible
 * from reading the numbers. It is only visible by measuring.
 *
 * So every entry DECLARES a feasibility and this suite MEASURES it — in a real
 * browser, over the exact grid the entry declares in `measuredOver`, with the real
 * core.js and the real Chrome encoder. If a declaration drifts from the
 * measurement, the suite fails. The claim cannot silently become wrong.
 *
 * WHY THE BROWSER AND NOT A NODE MODEL
 * The first version of this suite measured with a Node re-implementation of the
 * pipeline, and that model overstated the achievable size by 14%: it said the
 * 140x60 SSC signature box reached 10.22 KB, where real Chrome produced 8.88 KB.
 * A model is not evidence about the thing it models. See probe_gap_cause.mjs.
 * The Node model is still run, in PART 4, purely to quantify its own error.
 *
 * Run: node check_specs.mjs
 */
import { SPECS } from '../reference-tool/js/specs.js';
import { verify, classifySweep, HEADROOM_COMFORTABLE } from '../reference-tool/js/core.js';
import { checkRegistry } from '../registry_guard.mjs';
import { measureBrowserTruth } from './browser_truth.mjs';
import { render, encodeBytes, resetSeed, SEEDS, makeScan } from './fixtures.mjs';

/** Below this JPEG quality a document stops being "clearly visible", which the
 *  official PDF states as a requirement in its own right. */
const LEGIBILITY_QUALITY_FLOOR = 0.30;

let failures = 0;
const fail = (msg) => { failures++; console.log('  FAIL  ' + msg); };
const ok = (msg) => console.log('  ok    ' + msg);
const bar = (c = '=') => console.log(c.repeat(112));

/* ============================================================ PART 1: static */
bar();
console.log('PART 1 — STATIC REGISTRY GUARD');
console.log('The same rules the build enforces, run against the shipping registry.');
bar();

const staticProblems = checkRegistry(SPECS);
if (staticProblems.length) {
  for (const p of staticProblems) fail(p);
} else {
  ok(`all ${SPECS.length} entries satisfy the registry guard`);
}

const verified = SPECS.filter((s) => s.status === 'VERIFIED');
ok(`${verified.length} of ${SPECS.length} entries are VERIFIED: ${verified.map((s) => s.id).join(', ')}`);
const measured = SPECS.filter((s) => s.measuredOver);
ok(`${measured.length} of ${SPECS.length} entries declare a measurement sweep`);
const totalPoints = measured.reduce((a, s) =>
  a + s.measuredOver.grain.length * (s.measuredOver.density || [null]).length, 0);
ok(`${totalPoints} measurement points in total`);

/* =================================================== PART 2: browser truth */
console.log('');
bar();
console.log('PART 2 — FEASIBILITY, MEASURED IN A REAL BROWSER');
console.log('Every declaration is checked against the browser, over the grid the entry declares.');
console.log(`A box is 'comfortable' when EVERY input clears the floor by at least ${HEADROOM_COMFORTABLE}x.`);
console.log(`'marginal' means some inputs clear it and some do not — input-dependent by definition.`);
bar();

const { records, meta } = await measureBrowserTruth({ log: (m) => console.log('  ' + m) });
console.log(`  measured : ${meta.measuredAt}`);
console.log('');

const byId = new Map();
for (const r of records) {
  if (!byId.has(r.id)) byId.set(r.id, []);
  byId.get(r.id).push(r);
}

console.log(
  'SPEC'.padEnd(22) + 'BOX'.padEnd(11) + 'WINDOW'.padEnd(12) +
  'q1.0 OVER THE SWEEP'.padEnd(20) + 'PASS'.padEnd(8) +
  'DECLARED'.padEnd(13) + 'MEASURED'.padEnd(13) + 'RESULT'
);
console.log('-'.repeat(112));

const report = [];
const legibility = [];

for (const spec of SPECS) {
  if (spec.status === 'CUSTOM') continue;
  const rs = byId.get(spec.id);
  if (!rs || !rs.length) { fail(`${spec.id}: no browser measurement was produced`); continue; }

  const samples = rs.map((r) => r.atMax);
  const minBytes = spec.minKB * 1024;
  const passed = rs.filter((r) => r.ok);
  const measuredVerdict = classifySweep(samples, minBytes);

  const win = `${spec.minKB}-${spec.maxKB}KB`;
  const box = `${spec.width}x${spec.height}`;
  const range = `${(Math.min(...samples) / 1024).toFixed(1)}-${(Math.max(...samples) / 1024).toFixed(1)}KB`;

  let result = 'ok';
  if (measuredVerdict !== spec.feasibility) {
    result = 'MISMATCH';
    fail(`${spec.id}: declared '${spec.feasibility}' but the browser measures '${measuredVerdict}' ` +
      `(${range} across ${rs.length} inputs, ${passed.length} pass)`);
  } else if (spec.feasibility === 'comfortable' && passed.length !== rs.length) {
    result = 'MISMATCH';
    fail(`${spec.id}: declared comfortable but ${rs.length - passed.length} of ${rs.length} inputs refused`);
  } else if (spec.feasibility === 'marginal' && (passed.length === 0 || passed.length === rs.length)) {
    result = 'MISMATCH';
    fail(`${spec.id}: declared marginal but ${passed.length}/${rs.length} passed — not input-dependent`);
  } else if (spec.feasibility === 'unreachable' && passed.length > 0) {
    result = 'MISMATCH';
    fail(`${spec.id}: declared unreachable but ${passed.length} input(s) passed`);
  } else {
    ok(`${spec.id}: '${spec.feasibility}' confirmed — ${range} over ${rs.length} inputs, ${passed.length} pass`);
  }

  // A produced file must survive verify() — the same gate the UI uses.
  for (const r of passed) {
    const v = verify(spec, {
      width: spec.width, height: spec.height, bytes: r.bytes, mime: 'image/jpeg',
    });
    if (!v.pass) fail(`${spec.id}: verify() rejected the tool's own output: ${v.problems.join('; ')}`);
    // Crushing quality to fit means the document may no longer be "clearly
    // visible", which the official PDF states as a requirement in its own right.
    if (r.quality < LEGIBILITY_QUALITY_FLOOR) {
      legibility.push(`${spec.id}: had to drop to JPEG quality ${r.quality.toFixed(3)} to fit ${win}`);
    }
  }

  report.push({ spec, samples, measuredVerdict, passed, rs });
  console.log(
    spec.id.padEnd(22) + box.padEnd(11) + win.padEnd(12) +
    range.padEnd(20) + `${passed.length}/${rs.length}`.padEnd(8) +
    spec.feasibility.padEnd(13) + measuredVerdict.padEnd(13) + result
  );
}
console.log('-'.repeat(112));

/* ============================================ PART 3: legibility of artefacts */
console.log('');
bar();
console.log('PART 3 — ARTEFACT INTEGRITY AND LEGIBILITY');
console.log(`The official PDF requires the image to be "clearly visible". Any produced file that needed`);
console.log(`JPEG quality below ${LEGIBILITY_QUALITY_FLOOR} to fit its window fails that requirement.`);
bar();

if (legibility.length) {
  for (const l of legibility) fail(l);
} else {
  ok(`every produced file kept JPEG quality at or above ${LEGIBILITY_QUALITY_FLOOR}`);
  const qs = records.filter((r) => r.ok).map((r) => r.quality);
  ok(`quality range across all ${qs.length} produced files: ${Math.min(...qs).toFixed(3)} - ${Math.max(...qs).toFixed(3)}`);
}

/*
 * The per-entry numbers, printed so they can be pasted straight into the registry
 * comments instead of being recalled. Those comments quote measured ranges, and
 * nothing checked them against the measurement: the suite verifies the VERDICT
 * ('comfortable' / 'marginal'), so three comments had quietly drifted out of date
 * by the time this table was added. Printing the range next to the entry makes the
 * drift visible in the run output rather than only in a stale sentence.
 */
console.log('');
console.log('  Per-entry measured range, for the registry comments:');
console.log('  ' + 'SPEC'.padEnd(22) + 'q1.0 RANGE'.padEnd(22) + 'QUALITY TO FIT'.padEnd(18) +
  'PASS'.padEnd(8) + 'WORST INPUT');
console.log('  ' + '-'.repeat(96));
for (const { spec, samples, passed, rs } of report) {
  const q = passed.map((r) => r.quality);
  const qTxt = q.length ? `${Math.min(...q).toFixed(3)} - ${Math.max(...q).toFixed(3)}` : 'n/a';
  // The riskNote on a marginal entry has to name which inputs fall short, so the
  // harness names the worst one. That is the sentence a user reads before deciding
  // whether to trust the preset, and it should not be recall.
  const worst = rs.reduce((a, b) => (b.atMax < a.atMax ? b : a), rs[0]);
  const worstTxt = `grain ${worst.grain}${worst.density === null ? '' : `, density ${worst.density}`} ` +
    `= ${(worst.atMax / 1024).toFixed(1)}KB`;
  console.log(
    '  ' + spec.id.padEnd(22) +
    `${(Math.min(...samples) / 1024).toFixed(1)}-${(Math.max(...samples) / 1024).toFixed(1)}KB`.padEnd(22) +
    qTxt.padEnd(18) +
    `${passed.length}/${samples.length}`.padEnd(8) +
    worstTxt
  );
}
console.log('  ' + '-'.repeat(96));

/* ============================== PART 4: how wrong is the old Node model? */
console.log('');
bar();
console.log('PART 4 — CROSS-CHECK: THE NODE MODEL vs THE BROWSER  (informational)');
console.log('The model that used to decide these declarations. It no longer decides anything;');
console.log('it is measured here so its error stays visible and cannot creep back in.');
bar();
console.log('SPEC'.padEnd(22) + 'BOX'.padEnd(11) + 'NODE MODEL'.padEnd(14) + 'BROWSER'.padEnd(12) + 'MODEL ERROR');
console.log('-'.repeat(112));

const modelErrors = [];
for (const spec of SPECS) {
  if (spec.status === 'CUSTOM' || !spec.measuredOver) continue;
  const fx = spec.measuredOver.fixture;
  if (fx !== 'scan') continue; // the only fixture the model was ever trusted on
  const rs = byId.get(spec.id);
  const ref = rs.find((r) => r.grain === 12 && (r.density === 1 || r.density === null));
  if (!ref) continue;

  resetSeed(SEEDS.scan);
  const src = makeScan(2400, 1400, 12, 1);
  const a = src.width / src.height, b = spec.width / spec.height;
  let w, h;
  if (a > b) { h = src.height; w = src.height * b; } else { w = src.width; h = src.width / b; }
  const crop = { x: Math.round((src.width - w) / 2), y: Math.round((src.height - h) / 2), width: Math.round(w), height: Math.round(h) };
  const model = encodeBytes(render(src, crop, spec.width, spec.height), 1.0);
  const err = (model - ref.atMax) / ref.atMax;
  modelErrors.push(err);

  console.log(
    spec.id.padEnd(22) + `${spec.width}x${spec.height}`.padEnd(11) +
    `${(model / 1024).toFixed(2)} KB`.padEnd(14) +
    `${(ref.atMax / 1024).toFixed(2)} KB`.padEnd(12) +
    `${err >= 0 ? '+' : ''}${(err * 100).toFixed(1)}%`
  );
}
console.log('-'.repeat(112));
if (modelErrors.length) {
  const mean = modelErrors.reduce((a, b) => a + b, 0) / modelErrors.length;
  console.log(`The model is optimistic by ${(mean * 100).toFixed(1)}% on average. That is why it cannot decide`);
  console.log('feasibility: at a 10 KB boundary an overstatement of that size is the difference');
  console.log('between "passes" and "refuses". It is retained only as a fast pre-screen.');
}

/* ================================================ PART 5: the headline */
const sig = report.find((x) => x.spec.id === 'ssc-signature');
if (sig) {
  const below = sig.rs.filter((r) => r.atMax < sig.spec.minKB * 1024).length;
  console.log('');
  bar();
  console.log('PART 5 — THE HEADLINE: the official SSC signature box against the official size window');
  bar();
  console.log(`  Official pixel box        : ${sig.spec.width} x ${sig.spec.height} px = ${sig.spec.width * sig.spec.height} pixels`);
  console.log(`  Official window           : ${sig.spec.minKB}-${sig.spec.maxKB} KB`);
  console.log(`  Floor demands             : ${(sig.spec.minKB * 1024 / (sig.spec.width * sig.spec.height)).toFixed(2)} bytes per pixel`);
  console.log(`  Best achievable, measured : ${(Math.min(...sig.samples) / 1024).toFixed(2)} - ${(Math.max(...sig.samples) / 1024).toFixed(2)} KB across ${sig.rs.length} inputs`);
  console.log(`  Inputs that fall short    : ${below} of ${sig.rs.length}`);
  console.log(`  Measured verdict          : ${sig.measuredVerdict}`);
  console.log('');
  console.log('  A signature on white paper compresses far below 1.22 bytes per pixel unless it is');
  console.log('  dense. So the practical risk for an SSC signature is being UNDER 10 KB, not over');
  console.log('  20 KB — every "reduce your file size" tutorial has this backwards. The tool therefore');
  console.log(`  offers the documented larger box (${sig.spec.preferLarger}), which is comfortable on both bounds.`);
  bar();
}

console.log('');
bar();
if (failures === 0) {
  console.log('ALL REGISTRY DECLARATIONS MATCH BROWSER MEASUREMENT.');
} else {
  console.log(`${failures} MISMATCH(ES). The registry is making a claim that is not true.`);
}
bar();

process.exit(failures === 0 ? 0 : 1);
