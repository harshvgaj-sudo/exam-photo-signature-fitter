/*
 * The OFFICIAL SSC guideline PDF (photo_upload_guide.pdf) states pixel dimensions
 * that the registry does not have. This probe measures the real algorithm at the
 * official numbers and at the registry's cm-derived guesses, so the two can be
 * compared instead of argued about.
 *
 * Official figures, quoted verbatim from the PDF:
 *   Photograph           4.5cm x 3.5cm, "Dimensions 200 x 230 pixels (preferred)", 20-50 KB
 *   Signature            "Dimensions 140 x 60 pixels (preferred)", 10-20 KB, black ink, no capitals
 *   Left thumb impression "240 x 240 pixels in 200 DPI" i.e. 3cm x 3cm, 20-50 KB
 *   Handwritten declaration "800 x 400 pixels in 200 DPI" i.e. 10cm x 5cm, 50-100 KB
 *   10th certificate      PDF, A4, not exceeding 500 KB
 *
 * Note that both pixel figures carry the word "(preferred)". The PDF says the portal
 * raises an error when "the file size and format are not as prescribed" - size and
 * format - and tells the candidate to check dimensions themselves in Explorer.
 */
import { searchQuality } from '../reference-tool/js/core.js';
import { makeScan, makePhoto, render, encodeBytes, resetSeed, SEEDS } from './fixtures.mjs';

const SCAN_W = 2400, SCAN_H = 1400;

function coverCrop(srcW, srcH, dstW, dstH) {
  const srcAspect = srcW / srcH;
  const dstAspect = dstW / dstH;
  let w, h;
  if (srcAspect > dstAspect) { h = srcH; w = srcH * dstAspect; }
  else { w = srcW; h = srcW / dstAspect; }
  return {
    x: Math.round((srcW - w) / 2),
    y: Math.round((srcH - h) / 2),
    width: Math.round(w),
    height: Math.round(h),
  };
}

function sigAt(w, h, grain) {
  resetSeed(SEEDS.scan);
  const S = makeScan(SCAN_W, SCAN_H, grain);
  return render(S, coverCrop(SCAN_W, SCAN_H, w, h), w, h);
}

function photoAt(w, h) {
  resetSeed(SEEDS.photo);
  const P = makePhoto(4032, 3024);
  return render(P, coverCrop(4032, 3024, w, h), w, h);
}

async function run(label, img, minKB, maxKB) {
  const r = await searchQuality({
    measure: async (q) => encodeBytes(img, q),
    minBytes: minKB * 1024,
    maxBytes: maxKB * 1024,
  });
  let verdict;
  if (!r.ok) verdict = 'REFUSED (' + r.reason + ')';
  else if (r.quality >= 0.999) verdict = 'passes only at MAXIMUM quality - no headroom';
  else if (r.quality > 0.95) verdict = 'narrow - needs quality above 0.95';
  else verdict = 'comfortable';
  return { label, r, verdict };
}

function table(title, rows, minKB, maxKB) {
  console.log('\n' + '='.repeat(104));
  console.log(title);
  console.log(`window ${minKB}-${maxKB} KB`);
  console.log('='.repeat(104));
  console.log('PIXEL BOX'.padEnd(40) + 'RESULT'.padEnd(10) + 'SIZE'.padEnd(10) + 'QUALITY'.padEnd(10) + 'VERDICT');
  console.log('-'.repeat(104));
  for (const row of rows) {
    const { label, r, verdict } = row;
    console.log(
      label.padEnd(40) +
      (r.ok ? 'ok' : 'refused').padEnd(10) +
      (r.ok ? `${(r.bytes / 1024).toFixed(2)}KB` : '--').padEnd(10) +
      (r.ok ? r.quality.toFixed(3) : '--').padEnd(10) +
      verdict
    );
  }
  console.log('-'.repeat(104));
}

console.log('SSC OFFICIAL SPECS - measured with the real core.js search, not estimated.');

/* ---------------------------------------------------------------- signature */
const SIG_MIN = 10, SIG_MAX = 20;
const sigRows = [];
for (const [label, w, h] of [
  ['140x60    OFFICIAL PDF', 140, 60],
  ['315x157   registry, 4.0x2.0cm @200dpi', 315, 157],
  ['472x236   registry, 4.0x2.0cm @300dpi', 472, 236],
  ['472x157   6.0x2.0cm @200dpi (pasted quote)', 472, 157],
  ['280x140   DeepSeek brief', 280, 140],
]) {
  sigRows.push(await run(label, sigAt(w, h, 12), SIG_MIN, SIG_MAX));
}
table('SIGNATURE - official figure is 140x60 px, 10-20 KB, black ink, no capitals', sigRows, SIG_MIN, SIG_MAX);

/* ------------------------------------------- signature, across scan quality */
console.log('\n' + '='.repeat(104));
console.log('SIGNATURE AT THE OFFICIAL 140x60 - does it reach the 10 KB floor?');
console.log('The pixel box is tiny (8,400 px). Whether 10 KB is even reachable depends on the scan.');
console.log('='.repeat(104));
console.log('SCAN QUALITY'.padEnd(40) + 'RESULT'.padEnd(10) + 'SIZE'.padEnd(10) + 'QUALITY'.padEnd(10) + 'VERDICT');
console.log('-'.repeat(104));
for (const [label, grain] of [
  ['very clean scan', 2],
  ['clean scan', 8],
  ['typical phone scan', 12],
  ['grainy / low light', 24],
]) {
  const row = await run(label, sigAt(140, 60, grain), SIG_MIN, SIG_MAX);
  console.log(
    row.label.padEnd(40) +
    (row.r.ok ? 'ok' : 'refused').padEnd(10) +
    (row.r.ok ? `${(row.r.bytes / 1024).toFixed(2)}KB` : '--').padEnd(10) +
    (row.r.ok ? row.r.quality.toFixed(3) : '--').padEnd(10) +
    row.verdict
  );
}
console.log('-'.repeat(104));

/* -------------------------------------------------------------------- photo */
const PH_MIN = 20, PH_MAX = 50;
const phRows = [];
for (const [label, w, h] of [
  ['200x230   OFFICIAL PDF', 200, 230],
  ['500x600   registry', 500, 600],
  ['276x354   3.5x4.5cm @200dpi', 276, 354],
  ['413x531   3.5x4.5cm @300dpi', 413, 531],
]) {
  phRows.push(await run(label, photoAt(w, h), PH_MIN, PH_MAX));
}
table('PHOTOGRAPH - official figure is 4.5cm x 3.5cm AND 200x230 px, 20-50 KB', phRows, PH_MIN, PH_MAX);

/* -------------------------------------------------- lti and declaration */
const ltiRows = [await run('240x240   OFFICIAL PDF (3cm @200dpi)', photoAt(240, 240), 20, 50)];
table('LEFT THUMB IMPRESSION - 240x240 px @200 DPI, 20-50 KB', ltiRows, 20, 50);

const decRows = [await run('800x400   OFFICIAL PDF (10x5cm @200dpi)', sigAt(800, 400, 12), 50, 100)];
table('HANDWRITTEN DECLARATION - 800x400 px @200 DPI, 50-100 KB', decRows, 50, 100);

console.log('\nDONE.\n');
