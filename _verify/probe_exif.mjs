/*
 * probe_exif.mjs — END TO END: what does the real tool do with a portrait phone
 * photo that carries an EXIF orientation tag?
 *
 * Split of duties:
 *   probe_exif.mjs  (this)  the shipped UI, given a tagged file
 *   probe_exif2.mjs         the decoder itself: <img> vs createImageBitmap, 1/3/6/8
 *
 * NOTE ON LABELS: an earlier version of this file printed "source" over the
 * dimensions of the ROTATED file, which made a correct result look contradictory.
 * The stored frame is landscape (4032x3024); Orientation=6 swaps it to 3024x4032.
 * Both numbers are printed here, labelled, so the comparison is checkable.
 */
import { chromium } from 'file:///C:/Users/harsh/.workbuddy-ai/binaries/node/workspace/node_modules/playwright-core/index.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { serve, TOOL, ROOT } from './server.mjs';
import { withExifOrientation, readExifOrientation } from './fixtures.mjs';

const FX = join(ROOT, '_verify', 'fixtures');
const SRC = join(FX, 'photo_g12.jpg');
const ROT = join(FX, 'photo_exif6_probe.jpg');
const PLAIN = join(FX, 'photo_exif1_probe.jpg');

const src = readFileSync(SRC);
writeFileSync(ROT, withExifOrientation(src, 6));
writeFileSync(PLAIN, withExifOrientation(src, 1));

console.log('=== FIXTURES ===');
console.log('plain copy          :', PLAIN.split(/[\\/]/).pop(),
  `${src.length} bytes, Orientation=${readExifOrientation(readFileSync(PLAIN))}`);
console.log('rotated copy        :', ROT.split(/[\\/]/).pop(),
  `${readFileSync(ROT).length} bytes, Orientation=${readExifOrientation(readFileSync(ROT))}`);

const { server, port } = await serve(TOOL, { fx: FX });
const browser = await chromium.launch({ channel: 'chrome', headless: true });

try {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });

  const load = async (path, label) => {
    await page.setInputFiles('#fileInput', path);
    await page.waitForTimeout(900);
    const info = await page.evaluate(() => document.querySelector('#fileInfo')?.textContent?.trim() ?? '');
    console.log(`${label.padEnd(20)}: ${info || '(empty)'}`);
    return info;
  };

  console.log('\n=== THE REAL TOOL ===');
  const a = await load(PLAIN, 'Orientation=1');
  const b = await load(ROT, 'Orientation=6');

  const dims = (s) => {
    const m = s.match(/(\d+)\s*x\s*(\d+)/);
    return m ? [Number(m[1]), Number(m[2])] : null;
  };
  const da = dims(a);
  const db = dims(b);
  console.log('\n=== VERDICT ===');
  if (!da || !db) {
    console.log('could not read dimensions from the UI — inconclusive');
  } else {
    const swapped = db[0] === da[1] && db[1] === da[0];
    console.log(`control ${da[0]}x${da[1]}  ->  tagged ${db[0]}x${db[1]}`);
    console.log('width and height swapped:', swapped);
    console.log('=> the tool', swapped ? 'APPLIES the EXIF tag (correct)' : 'IGNORES the EXIF tag (photo would be sideways)');
  }

  // Does it still produce a valid file?
  await page.selectOption('#presetSelect', 'ssc-photo');
  await page.waitForTimeout(900);
  const status = await page.evaluate(() =>
    document.querySelector('#status')?.textContent?.replace(/\s+/g, ' ').trim() ?? '');
  console.log('\nfit result for the rotated photo:', status.slice(0, 200) || '(none)');
} finally {
  await browser.close();
  server.close();
}
