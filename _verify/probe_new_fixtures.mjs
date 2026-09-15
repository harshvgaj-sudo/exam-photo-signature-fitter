/*
 * Sanity-check the two new fixtures against the official windows before the
 * registry is built on top of them. If these numbers are absurd, the fixtures
 * are wrong, not the requirements.
 *
 *   Left thumb impression  240 x 240 px, 20-50 KB
 *   Handwritten declaration 800 x 400 px, 50-100 KB
 */
import { searchQuality } from '../reference-tool/js/core.js';
import { makeThumb, makeText, render, encodeBytes, resetSeed, SEEDS } from './fixtures.mjs';

function coverCrop(srcW, srcH, dstW, dstH) {
  const a = srcW / srcH, b = dstW / dstH;
  let w, h;
  if (a > b) { h = srcH; w = srcH * b; } else { w = srcW; h = srcW / b; }
  return { x: Math.round((srcW - w) / 2), y: Math.round((srcH - h) / 2), width: Math.round(w), height: Math.round(h) };
}

async function probe(label, img, minKB, maxKB) {
  const r = await searchQuality({
    measure: async (q) => encodeBytes(img, q),
    minBytes: minKB * 1024,
    maxBytes: maxKB * 1024,
  });
  const at1 = encodeBytes(img, 1.0);
  const at50 = encodeBytes(img, 0.5);
  let verdict;
  if (!r.ok) verdict = 'REFUSED ' + r.reason;
  else if (r.quality >= 0.999) verdict = 'no headroom';
  else if (r.quality > 0.95) verdict = 'narrow';
  else verdict = 'comfortable';
  console.log(
    label.padEnd(34) +
    `${img.width}x${img.height}`.padEnd(12) +
    `${(at1 / 1024).toFixed(2)}KB`.padEnd(10) +
    `${(at50 / 1024).toFixed(2)}KB`.padEnd(10) +
    (r.ok ? `${(r.bytes / 1024).toFixed(2)}KB` : '--').padEnd(10) +
    (r.ok ? r.quality.toFixed(3) : '--').padEnd(9) +
    verdict
  );
}

console.log('FIXTURE SANITY CHECK - new document-type fixtures vs official windows\n');
console.log('IMAGE'.padEnd(34) + 'SIZE'.padEnd(12) + 'q=1.00'.padEnd(10) + 'q=0.50'.padEnd(10) + 'CHOSEN'.padEnd(10) + 'QUALITY'.padEnd(9) + 'VERDICT');
console.log('-'.repeat(112));

resetSeed(SEEDS.thumb);
const T = makeThumb(1200, 1200);
await probe('thumb impression', render(T, coverCrop(1200, 1200, 240, 240), 240, 240), 20, 50);

resetSeed(SEEDS.text);
const X = makeText(2400, 1200, 8);
await probe('handwritten declaration', render(X, coverCrop(2400, 1200, 800, 400), 800, 400), 50, 100);

console.log('-'.repeat(112));

console.log('\nFor contrast, the same windows sized with the WRONG fixture:');
resetSeed(SEEDS.photo);
const { makePhoto } = await import('./fixtures.mjs');
const P = makePhoto(4032, 3024);
await probe('  LTI using a face photo', render(P, coverCrop(4032, 3024, 240, 240), 240, 240), 20, 50);

resetSeed(SEEDS.scan);
const { makeScan } = await import('./fixtures.mjs');
const S = makeScan(2400, 1400);
await probe('  declaration using a signature', render(S, coverCrop(2400, 1400, 800, 400), 800, 400), 50, 100);

console.log('\nA large gap between the two pairs means the old fixtures were mis-sizing');
console.log('these presets, and the registry notes based on them need correcting.\n');
