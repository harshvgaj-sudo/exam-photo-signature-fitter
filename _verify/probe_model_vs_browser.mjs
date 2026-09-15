/*
 * probe_model_vs_browser.mjs
 *
 * My Node harness predicted 10.22 KB for a signature at 140x60. The real browser
 * produced 8.88 KB and therefore REFUSED. A 1.3 KB gap is the difference between
 * "passes" and "fails", so the model and the shipped artefact disagree about the
 * thing that matters most.
 *
 * That is a flaw in my verification, not in the tool. This probe isolates where
 * the gap comes from, by splitting it into its two candidate causes:
 *
 *   A. the RESAMPLER — Chrome's high-quality smoothing vs my box filter
 *   B. the ENCODER   — Chrome's JPEG encoder vs jpeg-js
 *   C. the SOURCE    — a real user's file is already a JPEG, so it has been
 *                      through one generation of compression before we see it
 *
 * Method: do the resize in the browser, pull the resulting pixels back out, and
 * re-encode those exact pixels in Node. If the two encoders agree on identical
 * pixels, the gap is the resampler or the source, not the encoder.
 */
import { chromium } from 'file:///C:/Users/harsh/.workbuddy-ai/binaries/node/workspace/node_modules/playwright-core/index.mjs';
import jpeg from 'file:///C:/Users/harsh/.workbuddy-ai/binaries/node/workspace/node_modules/jpeg-js/index.js';
import { readFileSync } from 'node:fs';
import { makeScan, render, encodeBytes, resetSeed, SEEDS } from './fixtures.mjs';

const V = 'C:/Users/harsh/WorkBuddy AI/2026-09-14-10-03-21/govdocs-review/_verify';
const SIGN = `${V}/fixtures/scan_g12_d1.jpg`;

const W = 140, H = 60;

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage();
await page.goto('about:blank');

/* ---------------------------------------------------------------- browser side */
const b64 = readFileSync(SIGN).toString('base64');

const out = await page.evaluate(async ({ b64, W, H }) => {
  const img = new Image();
  img.src = 'data:image/jpeg;base64,' + b64;
  await img.decode();

  const crop = (() => {
    const a = img.width / img.height, b = W / H;
    let w, h;
    if (a > b) { h = img.height; w = img.height * b; } else { w = img.width; h = img.width / b; }
    return { x: (img.width - w) / 2, y: (img.height - h) / 2, width: w, height: h };
  })();

  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, W, H);
  g.drawImage(img, crop.x, crop.y, crop.width, crop.height, 0, 0, W, H);

  const blobAt = (q) => new Promise((r) => c.toBlob((b) => r(b.size), 'image/jpeg', q));
  const sizes = {};
  for (const q of [1.0, 0.95, 0.9, 0.8]) sizes[q] = await blobAt(q);

  const px = g.getImageData(0, 0, W, H).data;
  return { crop, sizes, sourceW: img.width, sourceH: img.height, pixels: Array.from(px) };
}, { b64, W, H });

await browser.close();

/* ------------------------------------------------------------------ node side */
const px = Buffer.from(out.pixels);
const jpegSizes = {};
for (const q of [1.0, 0.95, 0.9, 0.8]) {
  jpegSizes[q] = jpeg.encode({ data: px, width: W, height: H }, Math.round(q * 100)).data.length;
}

console.log('='.repeat(96));
console.log('MODEL vs BROWSER — where does the 1.3 KB gap come from?');
console.log('='.repeat(96));
console.log(`source JPEG        : ${out.sourceW}x${out.sourceH}`);
console.log(`crop applied       : x=${out.crop.x.toFixed(1)} y=${out.crop.y.toFixed(1)} ${out.crop.width.toFixed(0)}x${out.crop.height.toFixed(0)}`);
console.log(`target             : ${W}x${H}`);
console.log('');
console.log('C. ENCODER comparison — SAME pixels, two encoders:');
console.log('QUALITY'.padEnd(12) + 'CHROME'.padEnd(14) + 'JPEG-JS'.padEnd(14) + 'DIFFERENCE');
console.log('-'.repeat(96));
for (const q of [1.0, 0.95, 0.9, 0.8]) {
  const b = out.sizes[q] / 1024, n = jpegSizes[q] / 1024;
  const d = ((n - b) / b) * 100;
  console.log(
    String(q).padEnd(12) + `${b.toFixed(2)} KB`.padEnd(14) + `${n.toFixed(2)} KB`.padEnd(14) +
    `${d >= 0 ? '+' : ''}${d.toFixed(1)}%`
  );
}
console.log('-'.repeat(96));

const chromeBest = out.sizes[1.0] / 1024;
const nodeSamePixels = jpegSizes[1.0] / 1024;
console.log(`\nChrome's best on the browser-resized pixels : ${chromeBest.toFixed(2)} KB`);
console.log(`jpeg-js's best on those SAME pixels         : ${nodeSamePixels.toFixed(2)} KB`);
console.log(`=> the encoders differ by ${(((nodeSamePixels - chromeBest) / chromeBest) * 100).toFixed(1)}% on identical input.`);

/* --------------------------- A + C: what my harness measured, from raw pixels */
resetSeed(SEEDS.scan);
const raw = makeScan(2400, 1400, 12);
const nodeRaw = render(raw, { x: 0, y: (1400 - 2400 / (W / H)) / 2, width: 2400, height: 2400 / (W / H) }, W, H);
const nodeRawBest = encodeBytes(nodeRaw, 1.0) / 1024;

console.log('\nA. RESAMPLER + C. SOURCE, in one comparison at quality 1.0:');
console.log('-'.repeat(96));
console.log('PATH'.padEnd(52) + 'BEST ACHIEVABLE');
console.log('-'.repeat(96));
console.log('my harness: raw pixels -> box filter -> jpeg-js'.padEnd(52) + `${nodeRawBest.toFixed(2)} KB`);
console.log('real:       JPEG -> Chrome decode -> Chrome resize'.padEnd(52) + `${chromeBest.toFixed(2)} KB`);
console.log('-'.repeat(96));

const gap = nodeRawBest - chromeBest;
console.log(`\nGap to explain: ${gap.toFixed(2)} KB`);
console.log(`  encoder difference alone  : ${(nodeSamePixels - chromeBest).toFixed(2)} KB`);
console.log(`  resampler + JPEG source   : ${(nodeRawBest - nodeSamePixels).toFixed(2)} KB`);
console.log('');

console.log('VERDICT');
console.log('-'.repeat(96));
const dominant = Math.abs(nodeSamePixels - chromeBest) > Math.abs(nodeRawBest - nodeSamePixels)
  ? 'the ENCODER' : 'the RESAMPLER and the JPEG source';
console.log(`The dominant cause is ${dominant}.`);
console.log('');
console.log(`Either way the consequence is the same: my harness OVERSTATES what the`);
console.log(`shipped tool can achieve at a tight pixel box, by roughly ` +
  `${(((nodeRawBest - chromeBest) / chromeBest) * 100).toFixed(0)}% here.`);
console.log('A 10.22 KB prediction against a 10.00 KB floor is not a margin — it is noise.');
console.log('The browser is the ground truth, and the browser refuses.');
console.log('='.repeat(96));
