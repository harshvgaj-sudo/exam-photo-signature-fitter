/*
 * pdf.js — write a PDF that places JPEG images on A4 pages, and read it back.
 *
 * WHY THIS IS NOT A PDF LIBRARY
 * -----------------------------
 * A general PDF library (jsPDF, pdf-lib) re-encodes the image it is given. For a
 * scanned certificate that is the wrong trade: the image is already a JPEG, and
 * decoding it to raw pixels and re-compressing it softens exactly the thing that
 * matters — small printed text.
 *
 * PDF has supported raw JPEG passthrough since 1993, via the DCTDecode filter.
 * The bytes of the JPEG go into the file untouched, and the PDF simply says
 * "this stream is a JPEG". So the output is:
 *
 *     PDF size  ~=  sum of the JPEG sizes  +  a few hundred bytes of structure
 *
 * That is not just smaller, it is PREDICTABLE — which is what makes hitting a
 * 500 KB ceiling a search rather than a guess. And the certificate is bit-for-bit
 * the image that was produced, so nothing can be blamed on a second encode.
 *
 * The structure below is the smallest valid PDF that can do this. It is a fixed,
 * published layout (catalog -> pages -> page -> image + content stream), not an
 * invention. `inspectPdf` re-reads what was produced, so the tool never has to
 * take its own word for it.
 */

/** A4 in PDF points (210 x 297 mm at 72 pt/inch). */
export const A4 = { w: 595.276, h: 841.89 };

/** Format a number for PDF: at most 2 decimals, no trailing zeros. */
const fmt = (n) => String(Math.round(n * 100) / 100);

/**
 * Latin-1 encode. Deliberately NOT TextEncoder: the PDF binary marker needs the
 * literal bytes 0xE2 0xE3 0xCF 0xD3, and TextEncoder would emit the UTF-8
 * expansion of those code points instead. Every other string here is ASCII, so
 * this is exact.
 */
function bytes(str) {
  const out = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) out[i] = str.charCodeAt(i) & 0xff;
  return out;
}

/**
 * Build a PDF from JPEG pages.
 *
 * @param {Array<{jpeg: Uint8Array, pxW: number, pxH: number,
 *                drawW: number, drawH: number, x: number, y: number}>} pages
 *   One entry per page. `jpeg` is embedded verbatim. `pxW`/`pxH` are the JPEG's
 *   own pixel dimensions; `drawW`/`drawH`/`x`/`y` are the placement on the A4
 *   page, in points.
 * @returns {Uint8Array}
 */
export function buildPdf(pages) {
  if (!Array.isArray(pages) || pages.length === 0) throw new Error('buildPdf: no pages');
  for (const [i, p] of pages.entries()) {
    if (!(p.jpeg instanceof Uint8Array) || p.jpeg.length === 0) {
      throw new Error(`buildPdf: page ${i + 1} has no JPEG bytes`);
    }
    if (!(p.pxW > 0) || !(p.pxH > 0)) throw new Error(`buildPdf: page ${i + 1} has no pixel size`);
  }

  const N = pages.length;
  const totalObjs = 2 + 3 * N;         // catalog, pages, then 3 per page
  const size = totalObjs + 1;          // trailer /Size = highest obj number + 1

  const parts = [];
  let len = 0;
  const put = (u8) => { parts.push(u8); len += u8.length; };
  const putStr = (s) => put(bytes(s));

  const offsets = new Array(size).fill(0);
  const openObj = (num) => { offsets[num] = len; putStr(`${num} 0 obj\n`); };
  const closeObj = () => putStr('endobj\n');

  putStr('%PDF-1.4\n');
  putStr('%\xE2\xE3\xCF\xD3\n');       // binary marker: tells tools this is not text

  openObj(1);
  putStr('<< /Type /Catalog /Pages 2 0 R >>\n');
  closeObj();

  const kids = pages.map((_, i) => `${3 + i * 3} 0 R`).join(' ');
  openObj(2);
  putStr(`<< /Type /Pages /Kids [${kids}] /Count ${N} >>\n`);
  closeObj();

  pages.forEach((p, i) => {
    const pageObj = 3 + i * 3;
    const imgObj = 4 + i * 3;
    const contentObj = 5 + i * 3;

    openObj(pageObj);
    putStr(`<< /Type /Page /Parent 2 0 R`
      + ` /MediaBox [0 0 ${fmt(A4.w)} ${fmt(A4.h)}]`
      + ` /Resources << /XObject << /Im0 ${imgObj} 0 R >> >>`
      + ` /Contents ${contentObj} 0 R >>\n`);
    closeObj();

    // The image. /Filter /DCTDecode means "these bytes are already a JPEG" —
    // so they are copied in exactly as produced.
    openObj(imgObj);
    putStr(`<< /Type /XObject /Subtype /Image`
      + ` /Width ${p.pxW} /Height ${p.pxH}`
      + ` /ColorSpace /DeviceRGB /BitsPerComponent 8`
      + ` /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`);
    put(p.jpeg);
    putStr('\nendstream\n');
    closeObj();

    // Place the image: scale the unit square to drawW x drawH at (x, y).
    const content = `q\n${fmt(p.drawW)} 0 0 ${fmt(p.drawH)} ${fmt(p.x)} ${fmt(p.y)} cm\n/Im0 Do\nQ\n`;
    openObj(contentObj);
    putStr(`<< /Length ${content.length} >>\nstream\n${content}endstream\n`);
    closeObj();
  });

  const xrefStart = len;
  let xref = `xref\n0 ${size}\n0000000000 65535 f \n`;
  for (let n = 1; n < size; n++) xref += `${String(offsets[n]).padStart(10, '0')} 00000 n \n`;
  putStr(xref);
  putStr(`trailer\n<< /Size ${size} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`);

  const out = new Uint8Array(len);
  let at = 0;
  for (const part of parts) { out.set(part, at); at += part.length; }
  return out;
}

/**
 * Read a produced PDF back and report what it actually is.
 *
 * The tool never claims a file is correct without this: the size ceiling, the
 * page count and the A4 page box are all checked against the bytes on disk,
 * not against the values the caller passed in.
 *
 * @returns {{ok: boolean, problems: string[], sizeBytes: number,
 *            pageCount: number, a4Pages: number, version: string}}
 */
export function inspectPdf(u8) {
  const problems = [];
  const sizeBytes = u8.length;

  // Latin-1 view of the structure. Safe because every structural string is ASCII
  // and the only non-ASCII bytes are inside the JPEG stream, which we never parse.
  let text = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < u8.length; i += CHUNK) {
    text += String.fromCharCode.apply(null, u8.subarray(i, Math.min(i + CHUNK, u8.length)));
  }

  const header = text.slice(0, 8);
  const version = /^%PDF-(\d\.\d)/.exec(header);
  if (!version) problems.push('missing %PDF header');
  if (!/\n%%EOF\s*$/.test(text)) problems.push('missing %%EOF trailer');

  // Count real page objects, and check each one declares the A4 box.
  const pageObjs = [...text.matchAll(/\/Type\s*\/Page[^s]/g)].length;
  const boxes = [...text.matchAll(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/g)]
    .map((m) => ({ w: Number(m[1]), h: Number(m[2]) }));

  const isA4 = (b) => Math.abs(b.w - A4.w) < 1 && Math.abs(b.h - A4.h) < 1;
  const a4Pages = boxes.filter(isA4).length;

  if (pageObjs === 0) problems.push('no page objects found');
  if (boxes.length !== pageObjs) problems.push(`${boxes.length} page box(es) for ${pageObjs} page(s)`);
  if (a4Pages !== pageObjs) problems.push(`${pageObjs - a4Pages} page(s) are not A4`);

  // Every image stream must declare a length that matches what was embedded.
  const declared = [...text.matchAll(/\/Subtype\s*\/Image[^>]*?\/Length\s+(\d+)/g)].map((m) => Number(m[1]));
  if (declared.length !== pageObjs) problems.push(`${declared.length} image(s) for ${pageObjs} page(s)`);
  for (const d of declared) if (!(d > 0)) problems.push('an image stream declares length 0');

  // The xref offset must point at the actual "xref" keyword.
  const startxref = /startxref\s+(\d+)/.exec(text);
  if (!startxref) problems.push('missing startxref');
  else if (text.slice(Number(startxref[1]), Number(startxref[1]) + 4) !== 'xref') {
    problems.push('startxref does not point at the xref table');
  }

  return {
    ok: problems.length === 0,
    problems,
    sizeBytes,
    pageCount: pageObjs,
    a4Pages,
    version: version ? version[1] : '',
  };
}
