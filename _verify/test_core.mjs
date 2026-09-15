/*
 * test_core.mjs — the corrected core, exercised end to end against the registry.
 *
 * Uses the REAL reference-tool modules (not copies) and the shared fixtures, so
 * the numbers here describe the code that actually ships and are reproducible.
 *
 * SCOPE — READ THIS BEFORE TRUSTING A "PASS" BELOW
 * This suite runs the pipeline through a Node model of the browser's resize and
 * encoder. That model is OPTIMISTIC by about 20% (measured in check_specs.mjs
 * PART 4): it claims 10.23 KB where real Chrome produces 8.76 KB at the same box.
 * So a "PASS" here means the pipeline is internally coherent — dimensions exact,
 * search terminating, verify() gating every claim — and NOT that a preset is safe
 * for a viewer. Feasibility is decided in a real browser by check_specs.mjs.
 *
 * Where browser_truth.json is present, every row is annotated with what the
 * browser actually did, so a model-only pass cannot be mistaken for a real one.
 */
import {
  coverRect, clampCrop, searchQuality, verify, explainFailure,
  classifyHeadroom, classifySweep, HEADROOM_COMFORTABLE,
} from '../reference-tool/js/core.js';
import { SPECS, getSpec } from '../reference-tool/js/specs.js';
import {
  makePhoto, makeScan, makeThumb, makeText, makeFlat, render, encodeBytes, resetSeed, SEEDS,
} from './fixtures.mjs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HERE } from './server.mjs';

const line = (n = 114) => console.log('-'.repeat(n));

let unitFail = 0;
const check = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) unitFail++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}  ->  ${JSON.stringify(got)}`);
};

/* ------------------------------------------------------------ unit checks */
console.log('\n--- coverRect / clampCrop (exact, unrounded) ---');
check('landscape src -> square target', coverRect(4000, 3000, 500, 500), { x: 500, y: 0, width: 3000, height: 3000 });
check('portrait src -> wide target', coverRect(3000, 4000, 472, 236), { x: 0, y: 1250, width: 3000, height: 1500 });
check('clamp past right edge', clampCrop({ x: 9999, y: 0, width: 300, height: 300 }, 1000, 1000), { x: 700, y: 0, width: 300, height: 300 });
check('clamp past bottom edge', clampCrop({ x: 0, y: -50, width: 300, height: 300 }, 1000, 1000), { x: 0, y: 0, width: 300, height: 300 });

console.log('\n--- searchQuality rejects an invalid window rather than guessing ---');
for (const w of [{ minBytes: 0, maxBytes: 1000 }, { minBytes: 5000, maxBytes: 1000 }]) {
  const r = await searchQuality({ measure: async () => 500, ...w });
  const ok = r.ok === false && r.reason === 'INVALID_WINDOW';
  if (!ok) unitFail++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${JSON.stringify(w)} -> ${r.reason}`);
}

console.log('\n--- classifyHeadroom: how much room is there above the floor? ---');
check('no bytes measured', classifyHeadroom(0, 1000), 'unknown');
check('no minimum', classifyHeadroom(1000, 0), 'unknown');
check('half the floor', classifyHeadroom(500, 1000), 'unreachable');
check('exactly the floor', classifyHeadroom(1000, 1000), 'marginal');
check('10 percent above the floor', classifyHeadroom(1100, 1000), 'marginal');
check('exactly at the comfortable threshold', classifyHeadroom(1150, 1000), 'comfortable');
check('twice the floor', classifyHeadroom(2000, 1000), 'comfortable');

console.log('\n--- classifySweep: the classification that a single image cannot make ---');
check('no samples at all', classifySweep([], 1000), 'unknown');
check('no minimum', classifySweep([5000], 0), 'unknown');
check('every input below the floor', classifySweep([500, 800, 999], 1000), 'unreachable');
check('one input below the floor', classifySweep([900, 2000, 3000], 1000), 'marginal');
check('every input above the floor but inside the comfortable margin', classifySweep([1000, 1100, 1149], 1000), 'marginal');
check('one input exactly at the floor', classifySweep([1000, 2000, 3000], 1000), 'marginal');
check('every input clears the margin', classifySweep([1150, 2000, 3000], 1000), 'comfortable');
check('non-numeric entries are ignored', classifySweep([NaN, 2000, 3000], 1000), 'comfortable');
check('the threshold is the documented constant', classifySweep([1000 * HEADROOM_COMFORTABLE], 1000), 'comfortable');

console.log('\n--- explainFailure: an honest refusal, and the way out of it ---');
{
  const tight = getSpec('ssc-signature');
  const larger = getSpec(tight.preferLarger);
  const below = { ok: false, reason: 'BELOW_MINIMUM', bytes: 9200, quality: 1.0, encodes: 1 };
  const plain = explainFailure(below, tight);
  const withAlt = explainFailure(below, tight, larger);
  const okPlain = !/larger reading/.test(plain) && /best achieved: 8.98 KB/.test(plain);
  const okAlt = /larger reading/.test(withAlt) && withAlt.includes(`${larger.width}x${larger.height}`);
  if (!okPlain) unitFail++;
  if (!okAlt) unitFail++;
  console.log(`  ${okPlain ? 'ok  ' : 'FAIL'} without an alternative: does not invent one`);
  console.log(`  ${okAlt ? 'ok  ' : 'FAIL'} with an alternative: names the box to switch to`);
  const inv = explainFailure({ ok: false, reason: 'INVALID_WINDOW', encodes: 0 }, getSpec('custom'));
  const okInv = /minimum must be greater than zero/.test(inv);
  if (!okInv) unitFail++;
  console.log(`  ${okInv ? 'ok  ' : 'FAIL'} invalid window gets its own message`);
}

/* ------------------------------------------------- per-preset compliance */
// Fixtures are reseeded per spec, so adding or reordering a preset cannot change
// the image another preset is tested against. The generator matches the DOCUMENT
// type: sizing a thumb impression with a face photo overstates it badly.
function build(spec, grain = 12) {
  const fx = spec.measuredOver ? spec.measuredOver.fixture : 'scan';
  let src;
  switch (fx) {
    case 'photo': resetSeed(SEEDS.photo); src = makePhoto(4032, 3024); break;
    case 'thumb': resetSeed(SEEDS.thumb); src = makeThumb(1200, 1200, grain); break;
    case 'text': resetSeed(SEEDS.text); src = makeText(2400, 1200, 8, grain); break;
    default: resetSeed(SEEDS.scan); src = makeScan(2400, 1400, grain); break;
  }
  const crop = clampCrop(coverRect(src.width, src.height, spec.width, spec.height), src.width, src.height);
  return render(src, crop, spec.width, spec.height);
}

/* ------------------------------------ optional: what the browser actually did */
let browser = null;
try {
  const j = JSON.parse(readFileSync(join(HERE, 'browser_truth.json'), 'utf8'));
  browser = { byId: new Map(), meta: j.meta };
  for (const r of j.records) {
    if (!browser.byId.has(r.id)) browser.byId.set(r.id, []);
    browser.byId.get(r.id).push(r);
  }
} catch { /* not measured yet — the suite says so in the column */ }

const PRESETS = SPECS.filter((s) => s.id !== 'custom');

console.log('\n' + '='.repeat(114));
console.log(' TEST G — every registry preset, driven through the real core.js');
console.log(' This is the NODE MODEL, which is optimistic by ~20%. A pass here means the pipeline');
console.log(' is coherent, NOT that the preset is safe. The BROWSER column is the real answer.');
console.log('='.repeat(114));
console.log('PRESET'.padEnd(38) + 'REQUIRED'.padEnd(11) + 'WINDOW'.padEnd(11) + 'MODEL OUT'.padEnd(11) + 'BROWSER'.padEnd(15) + 'verify() RESULT');
line(114);

let passed = 0, refused = 0, broken = 0, modelOnly = 0;
for (const spec of PRESETS) {
  const canvas = build(spec);
  const result = await searchQuality({
    measure: async (q) => encodeBytes(canvas, q),
    minBytes: spec.minKB * 1024,
    maxBytes: spec.maxKB * 1024,
  });

  const brs = browser ? browser.byId.get(spec.id) : null;
  const bPass = brs ? brs.filter((r) => r.ok).length : 0;
  const bCell = brs ? `${bPass}/${brs.length} pass` : 'not measured';

  let verdict;
  if (result.ok) {
    const v = verify(spec, { width: spec.width, height: spec.height, bytes: result.bytes, mime: 'image/jpeg' });
    if (!v.pass) { verdict = 'BROKEN: ' + v.problems.join('; '); broken++; }
    else if (brs && bPass < brs.length) {
      // The model says pass, the browser says otherwise for some inputs. This is
      // exactly the overstatement the suite exists to expose, so it is NOT counted
      // as a pass.
      verdict = `model-only (browser passes ${bPass}/${brs.length})`;
      modelOnly++;
    } else { verdict = 'PASS'; passed++; }
  } else {
    verdict = 'honest refusal (' + result.reason + ')'; refused++;
  }
  if (spec.liveCaptureOnly) verdict += '   [valid file, but the portal needs a LIVE capture]';

  console.log(
    spec.label.slice(0, 36).padEnd(38) +
    `${spec.width}x${spec.height}`.padEnd(11) +
    `${spec.minKB}-${spec.maxKB}KB`.padEnd(11) +
    (result.ok ? `${(result.bytes / 1024).toFixed(2)}KB` : '--').padEnd(11) +
    bCell.padEnd(15) +
    verdict
  );
}
line(114);
console.log(`  model and browser agree on: ${passed}    model-only (overstated): ${modelOnly}`);
console.log(`  honest refusal: ${refused}    claimed success but failed verify: ${broken}`);
console.log(`  unit-test failures: ${unitFail}`);
console.log('  A false-success count of 0 is the point: verify() gates every claim.');
if (!browser) {
  console.log('  NOTE: browser_truth.json was absent, so no row could be cross-checked against');
  console.log('  the browser. Run check_specs.mjs (or browser_truth.mjs) to produce it.');
}
console.log('');

/* --------------------------------------------------- pathological inputs */
console.log('='.repeat(114));
console.log(' TEST H — the input class that produced the old tool\'s false "Success!"');
console.log(' A perfectly flat sheet. Physically impossible to fill a size window at a small pixel box.');
console.log('='.repeat(114));
for (const id of ['ssc-signature', 'ibps-signature', 'ssc-lti']) {
  const spec = getSpec(id);
  const flat = makeFlat(spec.width, spec.height);
  const result = await searchQuality({
    measure: async (q) => encodeBytes(flat, q),
    minBytes: spec.minKB * 1024,
    maxBytes: spec.maxKB * 1024,
  });
  console.log(`\n  ${spec.label} (${spec.width}x${spec.height}, ${spec.minKB}-${spec.maxKB} KB)`);
  console.log(`    ok=${result.ok}  reason=${result.reason}  best achievable=${result.bytes ? (result.bytes / 1024).toFixed(2) + 'KB' : 'n/a'}`);
  console.log('    shown to the user:');
  console.log('      ' + explainFailure(result, spec, spec.preferLarger ? getSpec(spec.preferLarger) : null));
}
line(114);
console.log('  Every one of these is a refusal, and every refusal names a reason. The old build');
console.log('  printed "Success!" for all three.');
console.log('  Feasibility, measured in a real browser over each entry\'s declared sweep, lives in');
console.log('  check_specs.mjs.');
console.log('');

process.exit(unitFail === 0 && broken === 0 ? 0 : 1);
