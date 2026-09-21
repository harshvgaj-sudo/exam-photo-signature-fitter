/*
 * test_certificate_pdf.mjs — verify the PDF writer before anything is built on it.
 *
 * The claim under test is specific and falsifiable:
 *
 *   1. the output is a structurally valid PDF that reports itself as A4
 *   2. the JPEG is embedded BYTE-FOR-BYTE — no re-encode, no quality loss
 *   3. the size is predictable: PDF bytes ~= JPEG bytes + fixed overhead
 *
 * (2) is the whole reason this is a hand-built writer rather than a library, so
 * it is asserted by locating the exact input bytes inside the output, not by
 * trusting a comment.
 *
 * Runs in Node against the real module. No browser needed.
 */
import jpeg from 'file:///C:/Users/harsh/.workbuddy-ai/binaries/node/workspace/node_modules/jpeg-js/index.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildPdf, inspectPdf, A4 } from '../tools/certificate-pdf/js/pdf.js';
import { ROOT } from './server.mjs';

let failures = 0;
const assert = (label, cond, detail = '') => {
  if (!cond) failures++;
  console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${label}${detail ? '  — ' + detail : ''}`);
};

/* ---------------------------------------------------------------- helpers */

/** A document-like image: light paper, dark text-ish marks, some noise. */
function documentJpeg(w, h, seed = 7) {
  let s = seed;
  const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      // Paper is near-white with a slight gradient, like a phone photo of a sheet.
      let v = 236 - Math.floor((y / h) * 22);
      // Horizontal "text lines" with word-like gaps.
      const lineBand = Math.floor(y / 26) % 2 === 0 && y % 26 < 9;
      if (lineBand && Math.floor(x / 17) % 3 !== 0 && x > w * 0.1 && x < w * 0.9) v = 38;
      v += Math.floor(rnd() * 14) - 7;
      v = v < 0 ? 0 : v > 255 ? 255 : v;
      data[i] = v; data[i + 1] = v; data[i + 2] = v; data[i + 3] = 255;
    }
  }
  return new Uint8Array(jpeg.encode({ data, width: w, height: h }, 80).data);
}

/** Index of `needle` inside `hay`, or -1. */
function indexOfBytes(hay, needle) {
  outer: for (let i = 0; i + needle.length <= hay.length; i++) {
    for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) continue outer;
    return i;
  }
  return -1;
}

/** Fit an image inside an A4 page with a margin, preserving aspect ratio. */
function placeOnA4(pxW, pxH, marginPt = 36) {
  const maxW = A4.w - marginPt * 2;
  const maxH = A4.h - marginPt * 2;
  const scale = Math.min(maxW / pxW, maxH / pxH);
  const drawW = pxW * scale;
  const drawH = pxH * scale;
  return { drawW, drawH, x: (A4.w - drawW) / 2, y: (A4.h - drawH) / 2 };
}

/* ------------------------------------------------------------------ tests */

console.log('=== CERTIFICATE PDF WRITER ===\n');

console.log('1. a single-page A4 PDF from a real JPEG');
{
  const jpegBytes = documentJpeg(1240, 1754);        // A4 at 150 dpi
  const place = placeOnA4(1240, 1754);
  const pdf = buildPdf([{ jpeg: jpegBytes, pxW: 1240, pxH: 1754, ...place }]);
  const info = inspectPdf(pdf);

  console.log(`   jpeg     : ${jpegBytes.length} bytes (${(jpegBytes.length / 1024).toFixed(1)} KB)`);
  console.log(`   pdf      : ${info.sizeBytes} bytes (${(info.sizeBytes / 1024).toFixed(1)} KB)`);
  console.log(`   overhead : ${info.sizeBytes - jpegBytes.length} bytes`);

  assert('the PDF is structurally valid', info.ok, info.problems.join('; ') || 'no problems');
  assert('it reports PDF version', info.version === '1.4', info.version);
  assert('it has exactly one page', info.pageCount === 1, `${info.pageCount}`);
  assert('that page is A4', info.a4Pages === 1, `${info.a4Pages} of ${info.pageCount}`);
}

console.log('\n2. the JPEG is embedded BYTE-FOR-BYTE (the reason for a hand-built writer)');
{
  const jpegBytes = documentJpeg(800, 600, 21);
  const place = placeOnA4(800, 600);
  const pdf = buildPdf([{ jpeg: jpegBytes, pxW: 800, pxH: 600, ...place }]);

  const at = indexOfBytes(pdf, jpegBytes);
  assert('the entire original JPEG appears verbatim inside the PDF', at !== -1,
    at === -1 ? 'not found — the image was re-encoded' : `found at byte ${at}`);
  assert('no second, re-encoded copy is present',
    indexOfBytes(pdf, jpegBytes) !== -1 && at !== -1);
  assert('the PDF declares DCTDecode passthrough',
    new TextDecoder('latin1').decode(pdf).includes('/Filter /DCTDecode'));
  assert('overhead is fixed and small',
    pdf.length - jpegBytes.length < 1024, `${pdf.length - jpegBytes.length} bytes`);
}

console.log('\n3. multiple certificates -> multiple A4 pages');
{
  const a = documentJpeg(1000, 1400, 3);
  const b = documentJpeg(1400, 1000, 9);              // landscape, must still fit A4
  const c = documentJpeg(600, 800, 15);
  const pdf = buildPdf([
    { jpeg: a, pxW: 1000, pxH: 1400, ...placeOnA4(1000, 1400) },
    { jpeg: b, pxW: 1400, pxH: 1000, ...placeOnA4(1400, 1000) },
    { jpeg: c, pxW: 600, pxH: 800, ...placeOnA4(600, 800) },
  ]);
  const info = inspectPdf(pdf);
  console.log(`   pages    : ${info.pageCount}, size ${(info.sizeBytes / 1024).toFixed(1)} KB`);
  assert('three pages are produced', info.pageCount === 3, `${info.pageCount}`);
  assert('every page is A4', info.a4Pages === 3, `${info.a4Pages}`);
  assert('all three JPEGs are embedded verbatim',
    indexOfBytes(pdf, a) !== -1 && indexOfBytes(pdf, b) !== -1 && indexOfBytes(pdf, c) !== -1);
  assert('the landscape image is centred inside the portrait page', (() => {
    const p = placeOnA4(1400, 1000);
    return p.drawW <= A4.w - 72 + 0.01 && p.drawH <= A4.h - 72 + 0.01 && p.x > 0 && p.y > 0;
  })());
}

console.log('\n4. the size is predictable, which is what makes a 500 KB ceiling searchable');
{
  const jpegBytes = documentJpeg(1240, 1754, 42);
  const place = placeOnA4(1240, 1754);
  const pdf = buildPdf([{ jpeg: jpegBytes, pxW: 1240, pxH: 1754, ...place }]);
  const overhead = pdf.length - jpegBytes.length;
  assert('overhead is under 1 KB regardless of image size', overhead < 1024, `${overhead} bytes`);
  assert('so PDF size ~= JPEG size, and a JPEG budget IS a PDF budget',
    Math.abs(pdf.length - jpegBytes.length) < 1024);

  // The landing page quotes this figure to visitors. The bound above (< 1 KB) would
  // still pass at 900 bytes while the page kept saying "~700", so the stated number
  // is pinned to the measurement rather than left to drift. The claim is written
  // with a "~", so the tolerance is generous — it catches a wrong figure, not
  // ordinary jitter.
  const landing = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const claim = landing.match(/<b>~(\d+) bytes<\/b>/);
  assert('the landing page states an overhead figure', claim !== null,
    claim ? `~${claim[1]} bytes` : 'no "<b>~N bytes</b>" found');
  if (claim) {
    const stated = Number(claim[1]);
    assert(`the stated "~${stated} bytes" matches the measured ${overhead}`,
      Math.abs(overhead - stated) <= 100,
      `page says ~${stated}, measurement says ${overhead}`);
  }
}

console.log('\n5. the writer refuses input it cannot represent');
{
  const throws = (fn) => { try { fn(); return null; } catch (e) { return e.message; } };
  assert('rejects an empty page list', !!throws(() => buildPdf([])));
  assert('rejects a page with no JPEG bytes',
    !!throws(() => buildPdf([{ jpeg: new Uint8Array(0), pxW: 10, pxH: 10, drawW: 1, drawH: 1, x: 0, y: 0 }])));
  assert('rejects a page with no pixel size',
    !!throws(() => buildPdf([{ jpeg: new Uint8Array([1, 2, 3]), pxW: 0, pxH: 10, drawW: 1, drawH: 1, x: 0, y: 0 }])));
}

console.log('\n6. inspectPdf can actually FAIL — a corrupted file must be caught');
{
  const jpegBytes = documentJpeg(600, 600, 5);
  const place = placeOnA4(600, 600);
  const good = buildPdf([{ jpeg: jpegBytes, pxW: 600, pxH: 600, ...place }]);

  const truncated = good.slice(0, 400);
  const t = inspectPdf(truncated);
  assert('a truncated PDF is rejected', !t.ok, t.problems.join('; '));

  const corrupted = Uint8Array.from(good);
  corrupted[2] = 0x58;                                  // break "%PDF"
  const c = inspectPdf(corrupted);
  assert('a corrupted header is rejected', !c.ok, c.problems.join('; '));
}

console.log('\n' + '='.repeat(58));
console.log(failures ? `${failures} assertion(s) FAILED` : 'PDF writer verified — A4, verbatim JPEG, predictable size');
console.log('='.repeat(58));
process.exit(failures === 0 ? 0 : 1);
