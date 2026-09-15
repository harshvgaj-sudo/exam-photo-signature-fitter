/*
 * probe_exif2.mjs — is the injected orientation tag VALID, and does each decode
 * path honour it?
 *
 * probe_exif.mjs found that createImageBitmap returned 3024x4032 for BOTH
 * {imageOrientation:'from-image'} and {imageOrientation:'none'}. That is only
 * meaningful if Chrome can parse the tag at all. So compare three paths:
 *
 *   <img>                       — browsers apply EXIF orientation by default here
 *   createImageBitmap from-image
 *   createImageBitmap none
 *
 * If <img> reports the rotated size and createImageBitmap does not, the tag is
 * valid and the createImageBitmap path is the thing that is wrong. If all three
 * agree, the tag is not being parsed and the probe proves nothing.
 */
import { chromium } from 'file:///C:/Users/harsh/.workbuddy-ai/binaries/node/workspace/node_modules/playwright-core/index.mjs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { serve, TOOL, ROOT } from './server.mjs';
import { withExifOrientation } from './fixtures.mjs';

const src = readFileSync(join(ROOT, '_verify', 'fixtures', 'photo_g12.jpg'));

const { server, port } = await serve(TOOL, { fx: join(ROOT, '_verify', 'fixtures') });
const browser = await chromium.launch({ channel: 'chrome', headless: true });

try {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });

  console.log('ORIENTATION   <img> (natural)   createImageBitmap from-image   none          img applies?');
  console.log('-'.repeat(96));

  for (const ori of [1, 3, 6, 8]) {
    const bytes = withExifOrientation(src, ori);
    const b64 = bytes.toString('base64');
    const r = await page.evaluate(async (b) => {
      const u8 = Uint8Array.from(atob(b), (c) => c.charCodeAt(0));
      const blob = new Blob([u8], { type: 'image/jpeg' });

      const img = await new Promise((res, rej) => {
        const im = new Image();
        im.onload = () => res(`${im.naturalWidth}x${im.naturalHeight}`);
        im.onerror = () => rej(new Error('img decode failed'));
        im.src = URL.createObjectURL(blob);
      });

      const bm = {};
      for (const mode of ['from-image', 'none']) {
        try {
          const x = await createImageBitmap(blob, { imageOrientation: mode });
          bm[mode] = `${x.width}x${x.height}`;
        } catch (e) { bm[mode] = 'THREW'; }
      }
      return { img, fromImage: bm['from-image'], none: bm['none'] };
    }, b64);

    const applied = r.img !== r.none;
    console.log(
      String(ori).padEnd(14) + r.img.padEnd(20) + r.fromImage.padEnd(31) + r.none.padEnd(14) +
      (applied ? 'YES' : 'no')
    );
  }

  console.log('\nOrientation meanings: 1=upright, 3=180, 6=rotate 90 CW, 8=rotate 90 CCW');
  console.log('Row 1 (Orientation=1) is the stored frame: the tag is a no-op there.');
  console.log('Rows 6 and 8 must show SWAPPED width/height if the tag is honoured.');
} finally {
  await browser.close();
  server.close();
}
