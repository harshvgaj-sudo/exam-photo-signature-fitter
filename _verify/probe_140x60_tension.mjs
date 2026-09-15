/*
 * The 140 x 60 tension.
 *
 * The official SSC PDF asks for BOTH:
 *   - signature dimensions 140 x 60 pixels (preferred)
 *   - file size between 10 KB and 20 KB
 *
 * 140 x 60 is 8,400 pixels. To reach 10 KB (10,240 bytes) a JPEG must average
 * 1.22 bytes per pixel. A signature on white paper compresses far below that,
 * because most of the frame is blank. So the two halves of the requirement pull
 * against each other, and how hard they pull depends on how clean the scan is.
 *
 * This sweep measures the best achievable file size at each pixel box across a
 * range of scan cleanliness, and compares it against the 10 KB floor.
 */
import { searchQuality } from '../reference-tool/js/core.js';
import { makeScan, render, encodeBytes, resetSeed, SEEDS } from './fixtures.mjs';

const SCAN_W = 2400, SCAN_H = 1400;
const MIN_KB = 10, MAX_KB = 20;
const FLOOR = MIN_KB * 1024;

function coverCrop(srcW, srcH, dstW, dstH) {
  const a = srcW / srcH, b = dstW / dstH;
  let w, h;
  if (a > b) { h = srcH; w = srcH * b; } else { w = srcW; h = srcW / b; }
  return { x: Math.round((srcW - w) / 2), y: Math.round((srcH - h) / 2), width: Math.round(w), height: Math.round(h) };
}

function sigAt(w, h, grain) {
  resetSeed(SEEDS.scan);
  const S = makeScan(SCAN_W, SCAN_H, grain);
  return render(S, coverCrop(SCAN_W, SCAN_H, w, h), w, h);
}

async function bestKB(img) {
  const r = await searchQuality({
    measure: async (q) => encodeBytes(img, q),
    minBytes: FLOOR,
    maxBytes: MAX_KB * 1024,
  });
  // searchQuality reports the best size it reached even when it refuses.
  const bytes = r.ok ? r.bytes : (r.bytes ?? null);
  return { kb: bytes === null ? null : bytes / 1024, ok: r.ok, reason: r.reason, q: r.quality };
}

const GRAINS = [0, 1, 2, 3, 4, 6, 8, 10, 12, 16, 20, 26, 32];
const BOXES = [
  ['140x60 (official)', 140, 60],
  ['315x157', 315, 157],
  ['472x236', 472, 236],
];

console.log('SIGNATURE - best achievable file size at each pixel box, vs the 10 KB floor');
console.log('floor = 10.00 KB. A value below the floor means the requirement cannot be met at that box.\n');

const results = {};
for (const [label, w, h] of BOXES) {
  results[label] = [];
  for (const g of GRAINS) {
    const r = await bestKB(sigAt(w, h, g));
    results[label].push({ grain: g, ...r });
  }
}

const head = 'GRAIN'.padEnd(8);
console.log(head + BOXES.map(([l]) => l.padEnd(22)).join(''));
console.log('-'.repeat(8 + BOXES.length * 22));
for (let i = 0; i < GRAINS.length; i++) {
  let line = String(GRAINS[i]).padEnd(8);
  for (const [label] of BOXES) {
    const r = results[label][i];
    const txt = r.kb === null ? '--' : `${r.kb.toFixed(2)} KB`;
    const mark = r.ok ? ' ok' : ' BELOW FLOOR';
    line += (txt + mark).padEnd(22);
  }
  console.log(line);
}
console.log('-'.repeat(8 + BOXES.length * 22));

console.log('\nSUMMARY');
for (const [label, w, h] of BOXES) {
  const rows = results[label];
  const below = rows.filter((r) => !r.ok).length;
  const atMax = rows.filter((r) => r.ok && r.q >= 0.999).length;
  const roomy = rows.filter((r) => r.ok && r.q < 0.999).length;
  const lo = Math.min(...rows.map((r) => r.kb ?? Infinity));
  const hi = Math.max(...rows.map((r) => r.kb ?? -Infinity));
  console.log(
    label.padEnd(22) +
    `pixels ${String(w * h).padStart(7)}  ` +
    `range ${lo.toFixed(2)}-${hi.toFixed(2)} KB  ` +
    `below floor: ${String(below).padStart(2)}/${rows.length}  ` +
    `only-at-max: ${String(atMax).padStart(2)}  ` +
    `comfortable: ${String(roomy).padStart(2)}`
  );
}

const bytesPerPx = FLOOR / (140 * 60);
console.log(`\nAt 140x60 the floor demands ${bytesPerPx.toFixed(2)} bytes per pixel.`);
console.log('A signature is mostly blank paper, so a clean scan cannot get there.');
console.log('The size window and the pixel box are in direct tension at the official figure.\n');
