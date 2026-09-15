/*
 * test_old_algorithm.mjs — the OLD algorithm from the shipped build, measured.
 *
 * `shippedAlgorithm()` below is a faithful reproduction of
 * compressImageToTarget() (govdocs_studio/index.html lines 457-510), driven by a
 * real JPEG encoder instead of a browser canvas. Everything else uses the shared
 * fixtures.
 *
 * WHAT THIS SUITE IS FOR
 * It is not testing a working feature — it preserves the evidence that the old
 * algorithm did not work, so the findings in CODE_REVIEW_AND_PLAN.html stay
 * reproducible. A claim in a report that nobody can re-run is an opinion.
 *
 * So the assertions are inverted on purpose: they fail if the reproduction starts
 * looking correct, which would mean it has drifted from the shipped source and the
 * evidence no longer describes the real build.
 *
 * NOTE ON THE SPEC LIST BELOW
 * These are the OLD figures, taken from the channel's own research notes — the
 * numbers the old build was actually built against. They were later superseded by
 * the official SSC PDF (signature 140x60, photo 200x230). They are kept here
 * unchanged so this suite keeps measuring the build that shipped.
 */
import { makePhoto, makeScan, makeFlat, makeDetailed, downscale, render, encodeBytes, resetSeed, SEEDS } from './fixtures.mjs';

const line = (n = 118) => console.log('-'.repeat(n));

let failures = 0;
const assert = (label, cond, detail = '') => {
  if (!cond) failures++;
  console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${label}${detail ? '  — ' + detail : ''}`);
};

/* ==========================================================================
 *  THE SHIPPED ALGORITHM — reproduced verbatim from index.html:457-510
 * ========================================================================== */
function shippedAlgorithm(source, targetKB) {
  const targetBytes = targetKB * 1024;
  // Every getBlob() is a full JPEG encode of the CURRENT canvas, on the main
  // thread. Counting the encodes is not enough to see the cost — the canvas can be
  // multi-megapixel — so the pixels are accumulated too.
  let pixels = 0;
  const getBlob = (c, q) => { pixels += c.width * c.height; return { size: encodeBytes(c, q) }; };

  let current = source;
  let currentWidth = source.width;
  let currentHeight = source.height;
  let downscaleSteps = 0;

  // Step 1: guarantee fit at min quality by downscaling dimensions
  let minBlob = getBlob(current, 0.05);
  while (minBlob && minBlob.size > targetBytes) {
    const scale = Math.max(0.1, Math.sqrt(targetBytes / minBlob.size) * 0.92);
    const newWidth = Math.max(1, Math.floor(currentWidth * scale));
    const newHeight = Math.max(1, Math.floor(currentHeight * scale));
    current = downscale(current, newWidth, newHeight);
    currentWidth = newWidth; currentHeight = newHeight;
    downscaleSteps++;
    // The real code has NO cap here. One is added so this test can report the
    // hang instead of hanging itself.
    if (downscaleSteps > 500) {
      return { hung: true, downscaleSteps, dims: [currentWidth, currentHeight], sizeBytes: minBlob.size, pixels };
    }
    minBlob = getBlob(current, 0.05);
  }

  // Step 2: binary search for best quality
  let low = 0.05, high = 0.98, bestBlob = minBlob, encodes = 0;
  for (let i = 0; i < 8; i++) {
    const mid = (low + high) / 2;
    const testBlob = getBlob(current, mid);
    encodes++;
    if (testBlob && testBlob.size <= targetBytes) { bestBlob = testBlob; low = mid; }
    else { high = mid; }
  }
  return { hung: false, downscaleSteps, encodes, dims: [currentWidth, currentHeight], sizeBytes: bestBlob.size, pixels };
}

/* ==========================================================================
 *  THE SPECS THE OLD BUILD WAS BUILT AGAINST (its own research notes)
 * ========================================================================== */
const SPECS = [
  { name: 'SSC signature  (315x157 @200dpi)', w: 315, h: 157, minKB: 10, maxKB: 20, kind: 'scan' },
  { name: 'SSC signature  (472x236 @300dpi)', w: 472, h: 236, minKB: 10, maxKB: 20, kind: 'scan' },
  { name: 'IBPS photo     (200x230 px)', w: 200, h: 230, minKB: 20, maxKB: 50, kind: 'photo' },
  { name: 'IBPS signature (140x60 px)', w: 140, h: 60, minKB: 10, maxKB: 20, kind: 'scan' },
  { name: 'IBPS LTI       (240x240 px)', w: 240, h: 240, minKB: 20, maxKB: 50, kind: 'photo' },
  { name: 'IBPS declaration (800x400 px)', w: 800, h: 400, minKB: 50, maxKB: 100, kind: 'photo' },
  { name: 'UPSC photo     (500x500 px)', w: 500, h: 500, minKB: 20, maxKB: 300, kind: 'photo' },
];

const build = (kind) => {
  if (kind === 'scan') { resetSeed(SEEDS.scan); return makeScan(1200, 700); }
  resetSeed(SEEDS.photo); return makePhoto(4032, 3024);
};

/* ------------------------------------------------------------ TEST A */
console.log('\n' + '='.repeat(118));
console.log(' TEST A — the old algorithm fed images ALREADY at the correct pixel size (its best case)');
console.log(' It is only ever told "target maximum KB". The spec also fixes dimensions and a MINIMUM.');
console.log('='.repeat(118));
console.log('SPEC'.padEnd(40) + 'DIMS IN'.padEnd(12) + 'ASKED'.padEnd(10) + 'GOT'.padEnd(11) + 'DIMS OUT'.padEnd(12) + 'RESULT');
line(118);

let aFails = 0;
const aFailNames = [];
for (const s of SPECS) {
  const img = build(s.kind);
  const pre = render(img, { x: 0, y: 0, width: img.width, height: Math.round(img.width * s.h / s.w) }, s.w, s.h);
  const r = shippedAlgorithm(pre, s.maxKB);
  const dimsOk = r.dims[0] === s.w && r.dims[1] === s.h;
  const sizeKB = r.sizeBytes / 1024;
  const minOk = sizeKB >= s.minKB;
  let verdict = 'PASS';
  if (!dimsOk && !minOk) verdict = 'FAIL: wrong dimensions AND below minimum';
  else if (!dimsOk) verdict = 'FAIL: wrong dimensions';
  else if (!minOk) verdict = 'FAIL: below minimum size';
  if (verdict !== 'PASS') { aFails++; aFailNames.push(s.name.trim()); }
  console.log(
    s.name.padEnd(40) + `${s.w}x${s.h}`.padEnd(12) + `<=${s.maxKB}KB`.padEnd(10) +
    `${sizeKB.toFixed(2)}KB`.padEnd(11) + `${r.dims[0]}x${r.dims[1]}`.padEnd(12) + verdict
  );
}
console.log('');
assert('even at the correct input size, the old algorithm fails real specs',
  aFails > 0, `${aFails} of ${SPECS.length} specs failed: ${aFailNames.join(', ')}`);

/* ------------------------------------------------------------ TEST D */
console.log('\n' + '='.repeat(118));
console.log(' TEST D — the old algorithm fed a REAL 4032x3024 phone photo (what actually happens)');
console.log('='.repeat(118));
resetSeed(SEEDS.photo);
const PHONE = makePhoto(4032, 3024);
console.log(`source: 4032 x 3024, ${(encodeBytes(PHONE, 0.9) / 1024 / 1024).toFixed(2)} MB at q=0.9\n`);
console.log('SPEC'.padEnd(16) + 'REQUIRED DIMS'.padEnd(16) + 'SIZE WINDOW'.padEnd(14) + 'OUTPUT DIMS'.padEnd(16) + 'OUTPUT'.padEnd(11) + 'DIM OK?  SIZE OK?');
line(105);
let dDimFails = 0;
for (const s of SPECS) {
  const r = shippedAlgorithm(PHONE, s.maxKB);
  const dimOk = r.dims[0] === s.w && r.dims[1] === s.h;
  if (!dimOk) dDimFails++;
  const sizeKB = r.sizeBytes / 1024;
  const sizeOk = sizeKB >= s.minKB && sizeKB <= s.maxKB;
  console.log(
    s.name.split(' ').slice(0, 2).join(' ').padEnd(16) +
    `${s.w}x${s.h}`.padEnd(16) + `${s.minKB}-${s.maxKB}KB`.padEnd(14) +
    `${r.dims[0]}x${r.dims[1]}`.padEnd(16) + `${sizeKB.toFixed(2)}KB`.padEnd(11) +
    (dimOk ? 'yes' : 'NO').padEnd(9) + (sizeOk ? 'yes' : 'NO')
  );
}
console.log('');
assert('the algorithm never returns the required pixel dimensions for a phone photo',
  dDimFails === SPECS.length, `${dDimFails} of ${SPECS.length} wrong`);
console.log('\n  The algorithm is never told the required pixel dimensions, so for a phone photo it');
console.log('  returns a multi-megapixel JPEG that no government portal will accept.');

/* ------------------------------------------------------------ TEST B */
console.log('\n' + '='.repeat(118));
console.log(' TEST B — termination. The shipped while-loop has no iteration cap.');
console.log('='.repeat(118));
resetSeed(SEEDS.detailed);
const DETAILED = makeDetailed(600, 600);
let hung = 0;
for (const tkb of [5, 2, 0.8, 0.5, 0.3]) {
  const r = shippedAlgorithm(DETAILED, tkb);
  if (r.hung) hung++;
  console.log(
    `  targetKB=${String(tkb).padEnd(6)} -> ` +
    (r.hung
      ? `*** DID NOT TERMINATE after 500 downscales (stuck at ${r.dims[0]}x${r.dims[1]}, ${r.sizeBytes} bytes) ***`
      : `terminated after ${r.downscaleSteps} downscale(s), final ${r.dims[0]}x${r.dims[1]}, ${(r.sizeBytes / 1024).toFixed(2)}KB`)
  );
}
console.log('');
assert('at least one reachable input does not terminate', hung > 0, `${hung} of 5 targets hung`);
console.log('\n  In a browser this is not a slow result, it is a dead tab. The input has min="5",');
console.log('  but the attribute does not stop typing 0.5, and the guard only rejects values <= 0.');

/* ------------------------------------------------------------ TEST C */
console.log('\n' + '='.repeat(118));
console.log(' TEST C — work performed. Each getBlob() is a full JPEG encode of the CURRENT canvas.');
console.log(' The encode count is not the cost. The canvas can be multi-megapixel, so what matters');
console.log(' is the total PIXELS pushed through the encoder, on the main thread.');
console.log('='.repeat(118));
console.log('SPEC'.padEnd(38) + 'ENCODES'.padEnd(10) + 'CANVAS OUT'.padEnd(14) + 'MEGAPIXELS'.padEnd(13) + 'CORRECTED'.padEnd(12) + 'RATIO');
line(118);
let worstRatio = 0;
for (const s of SPECS.slice(0, 5)) {
  const img = build(s.kind);
  const r = shippedAlgorithm(img, s.maxKB);
  // The corrected search never changes dimensions, so its worst case is the exact
  // target box encoded once per probe in the binary search.
  const corrected = s.w * s.h * 13;
  const ratio = r.pixels / corrected;
  worstRatio = Math.max(worstRatio, ratio);
  console.log(
    s.name.padEnd(38) +
    String(r.downscaleSteps + 1 + r.encodes).padEnd(10) +
    `${r.dims[0]}x${r.dims[1]}`.padEnd(14) +
    `${(r.pixels / 1e6).toFixed(1)} MP`.padEnd(13) +
    `${(corrected / 1e6).toFixed(2)} MP`.padEnd(12) +
    `${ratio.toFixed(0)}x`
  );
}
line(118);
assert('the old algorithm pushes far more pixels through the encoder than the corrected search',
  worstRatio > 10, `worst case ${worstRatio.toFixed(0)}x the corrected pipeline`);

/* ------------------------------------------------------------ TEST E */
console.log('\n' + '='.repeat(118));
console.log(' TEST E — a perfectly flat signature. The old code reports success on a rejected file.');
console.log('='.repeat(118));
let eBelow = 0;
for (const [w, h] of [[315, 157], [472, 236], [140, 60]]) {
  const flat = makeFlat(w, h);
  const r = shippedAlgorithm(flat, 20);
  const kb = r.sizeBytes / 1024;
  if (kb < 10) eBelow++;
  console.log(
    `  ${`${w}x${h}`.padEnd(10)} max=20KB -> ${kb.toFixed(2)}KB  ` +
    (kb >= 10
      ? 'within the 10-20KB window'
      : '*** BELOW the 10KB minimum. The old tool prints "Success!" anyway. ***')
  );
}
console.log('');
assert('a flat sheet produces a file below the minimum that the old tool still calls success',
  eBelow > 0, `${eBelow} of 3 boxes below the floor`);

console.log('\n' + '='.repeat(62));
console.log(failures
  ? `${failures} assertion(s) FAILED — the reproduction has drifted from the shipped source`
  : 'the old algorithm still reproduces its defects, so the report\'s evidence holds');
console.log('='.repeat(62));

process.exit(failures === 0 ? 0 : 1);
