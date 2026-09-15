/*
 * probe_formats.mjs — what actually happens with PNG, a corrupt file, and HEIC?
 *
 * The UI hint in index.html says: "JPEG, PNG or HEIC. A photo straight from the
 * phone camera is fine."
 * The error path in app.js says: "Choose a JPEG or PNG photo. Some phones save
 * HEIC files that older browsers cannot read."
 *
 * Those two sentences disagree about HEIC. Neither claim is tested anywhere, and
 * for a tool whose entire value is being trustworthy about a government upload,
 * telling an iPhone user "HEIC is fine" and then failing is exactly the kind of
 * thing that loses a viewer.
 *
 * This measures all three paths instead of guessing.
 */
import { chromium } from 'file:///C:/Users/harsh/.workbuddy-ai/binaries/node/workspace/node_modules/playwright-core/index.mjs';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { serve, TOOL, ROOT } from './server.mjs';

const FX = join(ROOT, '_verify', 'fixtures');
mkdirSync(FX, { recursive: true });

/* ---- build the three probe files ---- */
const PNG = join(FX, 'format_probe.png');
const CORRUPT = join(FX, 'format_probe_corrupt.jpg');
const HEIC = join(FX, 'format_probe.heic');

// A genuine PNG, produced by the same encoder the browser ships.
const { server, port } = await serve(TOOL, { fx: FX });
const browser = await chromium.launch({ channel: 'chrome', headless: true });

try {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });

  const pngB64 = await page.evaluate(async () => {
    const c = document.createElement('canvas');
    c.width = 800; c.height = 900;
    const g = c.getContext('2d');
    g.fillStyle = '#e8eef5'; g.fillRect(0, 0, 800, 900);
    g.fillStyle = '#2b3a4a'; g.beginPath(); g.arc(400, 380, 150, 0, Math.PI * 2); g.fill();
    const b = await new Promise((r) => c.toBlob(r, 'image/png'));
    const buf = new Uint8Array(await b.arrayBuffer());
    let s = ''; for (const x of buf) s += String.fromCharCode(x);
    return btoa(s);
  });
  writeFileSync(PNG, Buffer.from(pngB64, 'base64'));

  // A truncated JPEG: real SOI and header, then nothing. Not decodable.
  const real = readFileSync(join(FX, 'photo_g12.jpg'));
  writeFileSync(CORRUPT, real.subarray(0, 300));

  // A plausible HEIC container: ISO-BMFF ftyp box branded 'heic', then junk.
  const ftyp = Buffer.alloc(24);
  ftyp.writeUInt32BE(24, 0);
  ftyp.write('ftyp', 4, 'latin1');
  ftyp.write('heic', 8, 'latin1');
  ftyp.writeUInt32BE(0, 12);
  ftyp.write('heic', 16, 'latin1');
  ftyp.write('mif1', 20, 'latin1');
  writeFileSync(HEIC, Buffer.concat([ftyp, Buffer.alloc(4096, 0x21)]));

  console.log('=== PROBE FILES ===');
  for (const [label, p] of [['png', PNG], ['corrupt jpeg', CORRUPT], ['heic', HEIC]]) {
    console.log(`${label.padEnd(14)}: ${p.split(/[\\/]/).pop()} ${readFileSync(p).length} bytes`);
  }

  /* ---- upload each and record what the UI does ---- */
  const probe = async (path, label) => {
    // Reset the visible state so a stale result cannot be mistaken for a new one.
    await page.reload({ waitUntil: 'load' });
    const before = await page.evaluate(() => ({
      info: (document.querySelector('#fileInfo') || {}).textContent || '',
    }));

    await page.setInputFiles('#fileInput', path);
    await page.waitForTimeout(1500);

    const after = await page.evaluate(() => ({
      info: (document.querySelector('#fileInfo') || {}).textContent || '',
      cropShown: !document.querySelector('#cropCard')?.hidden,
      processShown: !document.querySelector('#processCard')?.hidden,
      statusCls: (document.querySelector('#status') || {}).className || '',
      statusTxt: (document.querySelector('#status') || {}).textContent || '',
    }));

    const accepted = after.cropShown && /\d+\s*x\s*\d+/.test(after.info);
    console.log(`\n--- ${label} ---`);
    console.log('  fileInfo   :', (after.info || '(unchanged)').slice(0, 110));
    console.log('  crop card  :', after.cropShown ? 'shown' : 'hidden');
    console.log('  status     :', after.statusCls, '|', after.statusTxt.slice(0, 110));
    console.log('  VERDICT    :', accepted ? 'ACCEPTED' : 'REJECTED');
    return accepted;
  };

  const pngOk = await probe(PNG, 'PNG (800x900)');
  const corruptOk = await probe(CORRUPT, 'corrupt / truncated JPEG');
  const heicOk = await probe(HEIC, 'HEIC container');

  console.log('\n=== SUMMARY ===');
  console.log('PNG accepted      :', pngOk, pngOk ? '(matches the UI hint)' : '(the UI hint says PNG is fine — it is not)');
  console.log('corrupt rejected  :', !corruptOk);
  console.log('HEIC accepted     :', heicOk, heicOk ? '' : '(the UI hint says "JPEG, PNG or HEIC" — HEIC is NOT usable)');
} finally {
  await browser.close();
  server.close();
}
