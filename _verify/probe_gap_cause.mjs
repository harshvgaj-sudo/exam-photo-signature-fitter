/*
 * probe_gap_cause.mjs — why does the Node model predict 10.22 KB where Chrome
 * produces 8.88 KB at 140x60?
 *
 * The two paths differ in exactly two places:
 *
 *   model : synthetic RGBA  -> box filter      -> jpeg-js encode
 *   real  : JPEG on disk    -> Chrome decode   -> Chrome resize -> Chrome encode
 *
 * This probe closes ONE of those differences at a time, in Node, to see which
 * one carries the 1.45 KB.
 *
 * Step 1  synthetic RGBA -> box filter -> jpeg-js            (the current model)
 * Step 2  synthetic RGBA -> jpeg-js q90 -> jpeg-js decode -> box filter -> jpeg-js
 *         (adds the JPEG round-trip the fixture file imposes on a real user)
 *
 * If step 2 lands near 8.8 KB, the gap was the JPEG source and the Node model is
 * fixable. If it stays near 10.2 KB, the gap is Chrome's resampler and only the
 * browser can be the authority.
 */
import jpeg from 'file:///C:/Users/harsh/.workbuddy-ai/binaries/node/workspace/node_modules/jpeg-js/index.js';
import { makeScan, render, encodeBytes, resetSeed, SEEDS } from './fixtures.mjs';

const W = 140, H = 60, MIN = 10 * 1024;

function coverCrop(srcW, srcH, dstW, dstH) {
  const a = srcW / srcH, b = dstW / dstH;
  let w, h;
  if (a > b) { h = srcH; w = srcH * b; } else { w = srcW; h = srcW / b; }
  return { x: Math.round((srcW - w) / 2), y: Math.round((srcH - h) / 2), width: Math.round(w), height: Math.round(h) };
}

/** Re-decode a JPEG buffer back to RGBA, the way a browser decoder would. */
function decode(buf) {
  const out = jpeg.decode(buf, { useTArray: true, formatAsRGBA: true });
  return { data: Buffer.from(out.data), width: out.width, height: out.height };
}

console.log('='.repeat(96));
console.log('WHERE DOES THE 1.45 KB GO?  target box 140x60, floor 10.00 KB');
console.log('='.repeat(96));
console.log('fixture grain   step1 (raw -> box)   step2 (+ JPEG round trip)   step3 (+ resample blur)');
console.log('-'.repeat(96));

const rows = [];

for (const grain of [0, 4, 8, 12, 16, 24, 32]) {
  resetSeed(SEEDS.scan);
  const raw = makeScan(2400, 1400, grain);
  const crop = coverCrop(raw.width, raw.height, W, H);

  // step 1 — the current model
  const s1 = encodeBytes(render(raw, crop, W, H), 1.0);

  // step 2 — put the fixture through the same JPEG the browser would read
  const fileJpeg = jpeg.encode({ data: raw.data, width: raw.width, height: raw.height }, 90).data;
  const decoded = decode(fileJpeg);
  const s2 = encodeBytes(render(decoded, crop, W, H), 1.0);

  // step 3 — approximate a wider resampling kernel (3x3 tent on the result),
  // which is the remaining structural difference from Chrome's resize.
  const base = render(decoded, crop, W, H);
  const blur = Buffer.alloc(base.data.length);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let r = 0, g = 0, b = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          const w = (dx === 0 ? 2 : 1) * (dy === 0 ? 2 : 1);
          const i = (yy * W + xx) * 4;
          r += base.data[i] * w; g += base.data[i + 1] * w; b += base.data[i + 2] * w; n += w;
        }
      }
      const o = (y * W + x) * 4;
      blur[o] = r / n; blur[o + 1] = g / n; blur[o + 2] = b / n; blur[o + 3] = 255;
    }
  }
  const s3 = encodeBytes({ data: blur, width: W, height: H }, 1.0);

  rows.push({ grain, s1, s2, s3 });
  console.log(
    String(grain).padEnd(16) +
    `${(s1 / 1024).toFixed(2)} KB`.padEnd(23) +
    `${(s2 / 1024).toFixed(2)} KB`.padEnd(28) +
    `${(s3 / 1024).toFixed(2)} KB`
  );
}
console.log('-'.repeat(96));

const avg = (k) => rows.reduce((a, r) => a + r[k], 0) / rows.length / 1024;
console.log(`mean            ${avg('s1').toFixed(2)} KB${' '.repeat(14)}${avg('s2').toFixed(2)} KB${' '.repeat(19)}${avg('s3').toFixed(2)} KB`);

const drop12 = (avg('s1') - avg('s2'));
const drop23 = (avg('s2') - avg('s3'));
console.log('');
console.log('VERDICT');
console.log(`  JPEG round-trip explains : ${drop12.toFixed(2)} KB of the gap`);
console.log(`  extra resample smoothing : ${drop23.toFixed(2)} KB of the gap`);
console.log(`  browser ground truth     : 8.88 KB (measured in Chrome, same fixture)`);
console.log(`  model step 1             : ${avg('s1').toFixed(2)} KB`);
console.log('');
if (Math.abs(avg('s2') - 8.88) < 0.7) {
  console.log('  -> The JPEG source was the cause. A Node fixture that goes through JPEG');
  console.log('     reproduces the browser closely, so the model is fixable.');
} else if (Math.abs(avg('s3') - 8.88) < 0.7) {
  console.log('  -> The resampling kernel was the cause. The model needs a wider kernel.');
} else {
  console.log('  -> Neither alone closes it. Chrome is doing something else as well, and the');
  console.log('     only trustworthy authority is the browser itself.');
}
console.log('='.repeat(96));
