/*
 * fixtures.mjs — one source of truth for test images.
 *
 * Why this file exists: the earlier suites each generated their own images, and
 * the generator was seeded at module scope. Adding a preset changed the order of
 * calls, which changed the images, which changed the numbers. Evidence that is
 * not reproducible is not evidence.
 *
 * Everything here is deterministic and reseeded explicitly.
 */
import jpeg from 'file:///C:/Users/harsh/.workbuddy-ai/binaries/node/workspace/node_modules/jpeg-js/index.js';

let seed = 1;
export const resetSeed = (s) => { seed = s; };
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };

export const SEEDS = { photo: 2002, scan: 1001, detailed: 3003, thumb: 4004, text: 5005 };

/* ------------------------------------------------------------------ images */

/**
 * A photograph, with structure at several scales.
 *
 * The multi-scale detail matters. An earlier version was a smooth gradient plus
 * fine grain; box-downscaling from 4032x3024 to 200x230 averaged the grain away
 * and left a near-flat image that compressed to a few KB. That made the fixture
 * behave nothing like a real photograph. Real scenes keep detail when reduced,
 * because the structure is large relative to the pixels.
 */
export function makePhoto(w, h) {
  const d = Buffer.alloc(w * h * 4);
  const cx = 0.5 * w, cy = 0.44 * h, rx = 0.24 * w, ry = 0.32 * h;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Background: a wall, lit unevenly.
      let v = 96 + 54 * (x / w) + 26 * (y / h);
      v += 11 * Math.sin((x / w) * 6.3) + 7 * Math.sin((y / h) * 4.1);

      // Head: a brighter oval.
      const e = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
      if (e < 1) v = 158 + 30 * (1 - e) - 26 * (y / h);

      // Hair: coarse dark texture above the face.
      if (y < cy - ry * 0.5 && Math.abs(x - cx) < rx * 1.2) {
        v -= 62 + 34 * (((x * 13 + y * 7) % 5) / 5);
      }
      // Collar: a dark band low down.
      if (y > cy + ry * 0.72 && Math.abs(x - cx) < rx * 1.05) v -= 78;

      // Facial features. These matter for realism: they are sharp, high-contrast
      // edges, and edges are what survive reduction. A face without them reduces
      // to a soft blob that compresses far smaller than a real portrait.
      const fx = (x - cx) / rx;
      const fy = (y - cy) / ry;
      const eye = (dx) => ((fx - dx) / 0.17) ** 2 + ((fy + 0.18) / 0.11) ** 2;
      if (eye(-0.42) < 1 || eye(0.42) < 1) v = 58;                        // eyes
      if (fy > -0.44 && fy < -0.30 && Math.abs(Math.abs(fx) - 0.42) < 0.22) v = 66;  // brows
      if (fy > 0.32 && fy < 0.44 && Math.abs(fx) < 0.28) v = 86;           // mouth
      if (fy > -0.04 && fy < 0.26 && Math.abs(fx) < 0.11) v -= 28;         // nose shadow

      // Texture at scales that SURVIVE reduction, for the areas that are still
      // smooth after the features above.
      v += 10 * Math.sin(x / 3.1) * Math.cos(y / 2.7);
      v += 7 * Math.sin(x / 1.7 + y / 1.3);

      // Sensor grain.
      v += (rnd() - 0.5) * 16;

      const c = Math.max(0, Math.min(255, v));
      const i = (y * w + x) * 4;
      d[i] = c; d[i + 1] = c * 0.965; d[i + 2] = c * 0.925; d[i + 3] = 255;
    }
  }
  return { data: d, width: w, height: h };
}

/**
 * A phone photo of a signature on paper: off-white sheet, uneven lighting,
 * sensor grain, and dark pen strokes.
 *
 * Two independent knobs, because they are two independent axes of real variation:
 *   grain   — how much fine detail the scan carries (lighting, sensor noise)
 *   density — how much ink is on the page (how large and elaborate the signature is)
 *
 * Grain alone is not enough to classify this box. A sparse signature on clean
 * paper and a dense signature on noisy paper are both common, and they land at
 * opposite ends of the size range. `density = 1` reproduces the original fixture
 * exactly, so earlier measurements stay valid.
 */
export function makeScan(w, h, grain = 12, density = 1) {
  const d = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const lighting = 244 - 15 * (x / w) - 9 * (y / h);
      const v = Math.max(0, Math.min(255, lighting + (rnd() - 0.5) * grain * 2));
      const i = (y * w + x) * 4;
      d[i] = v; d[i + 1] = v; d[i + 2] = v * 0.99; d[i + 3] = 255;
    }
  }
  const put = (x, y) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = (y * w + x) * 4;
    d[i] = 22; d[i + 1] = 26; d[i + 2] = 90; d[i + 3] = 255;
  };
  const th = Math.max(1, Math.round(h * 0.042 * (1 + (density - 1) * 0.6)));
  const extra = Math.max(0, Math.round((density - 1) * 4));
  for (let x = Math.floor(w * 0.07); x < w * 0.93; x++) {
    const t = (x / w - 0.07) / 0.86;
    const y1 = h * (0.40 + 0.28 * Math.sin(t * Math.PI * 1.7));
    const y2 = h * (0.66 - 0.24 * Math.sin(t * Math.PI * 2.3));
    for (let k = 0; k < th; k++) { put(x, Math.round(y1) + k); put(x, Math.round(y2) + k); }
    // Extra flourishes. A more elaborate signature puts more ink in the frame,
    // which is the other half of why one viewer's file is 8 KB and another's is 14 KB.
    for (let e = 0; e < extra; e++) {
      const y3 = h * (0.46 + 0.19 * Math.sin(t * Math.PI * (1.3 + e * 0.7) + e));
      for (let k = 0; k < th; k++) put(x, Math.round(y3) + k);
    }
  }
  for (let x = Math.floor(w * 0.10); x < w * 0.86; x++) put(x, Math.round(h * 0.86));
  return { data: d, width: w, height: h };
}

/** A perfectly flat sheet. Pathological, but it is exactly what breaks a size ceiling. */
export function makeFlat(w, h) {
  const d = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    d[i * 4] = 251; d[i * 4 + 1] = 251; d[i * 4 + 2] = 249; d[i * 4 + 3] = 255;
  }
  return { data: d, width: w, height: h };
}

/** Maximum high-frequency detail. The hardest thing to compress. */
export function makeDetailed(w, h) {
  const d = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const v = rnd() * 255;
    d[i * 4] = v; d[i * 4 + 1] = v; d[i * 4 + 2] = v; d[i * 4 + 3] = 255;
  }
  return { data: d, width: w, height: h };
}

/* ------------------------------------------------- document-type fixtures */

/**
 * A left thumb impression on white paper.
 *
 * This is a third document class, not a photo and not a signature. A real
 * impression is a dark oval of ridge detail on a blank sheet: the ridges are
 * high-frequency content, so it compresses worse than a signature but far better
 * than a photograph.
 *
 * The earlier suites sized this preset with makePhoto, which rendered a face.
 * That badly overstates the file, because a portrait carries far more detail than
 * an oval of ridges. This fixture exists so the preset is measured against
 * something shaped like the document it actually asks for.
 */
export function makeThumb(w, h, grain = 10) {
  const d = Buffer.alloc(w * h * 4);
  const cx = 0.5 * w, cy = 0.5 * h, rx = 0.40 * w, ry = 0.44 * h;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = 245 - 10 * (x / w) - 6 * (y / h);
      v += (rnd() - 0.5) * grain * 2;

      const nx = (x - cx) / rx, ny = (y - cy) / ry;
      const r = Math.sqrt(nx * nx + ny * ny);

      if (r < 1.06) {
        const edge = Math.min(1, (1.06 - r) / 0.14);
        let ink = 54 + 24 * (1 - edge);
        // Ridges. Roughly 30 of them across the pad, which is what a real
        // impression shows and what makes it resist compression.
        ink += (Math.sin(r * 188 + nx * 2.4) * 0.5 + 0.5) * 44;
        // Uneven ink deposit.
        ink += (rnd() - 0.5) * 28;
        v = v * (1 - edge) + ink * edge;
      }

      const c = Math.max(0, Math.min(255, v));
      const i = (y * w + x) * 4;
      d[i] = c; d[i + 1] = c * 0.985; d[i + 2] = c * 0.96; d[i + 3] = 255;
    }
  }
  return { data: d, width: w, height: h };
}

/**
 * A handwritten declaration: several lines of cursive-like strokes on white paper.
 *
 * The declaration preset is a full page of writing, so its size is driven by how
 * much ink is on the page. The signature fixture is two long strokes plus an
 * underline — far less ink — so using it here would understate the file and make
 * a comfortable preset look like a tight one.
 */
export function makeText(w, h, lines = 8, grain = 10) {
  const d = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = 246 - 9 * (x / w) - 7 * (y / h);
      v += (rnd() - 0.5) * grain * 2;
      const c = Math.max(0, Math.min(255, v));
      const i = (y * w + x) * 4;
      d[i] = c; d[i + 1] = c * 0.99; d[i + 2] = c * 0.965; d[i + 3] = 255;
    }
  }

  const put = (x, y) => {
    const xi = Math.round(x), yi = Math.round(y);
    if (xi < 0 || yi < 0 || xi >= w || yi >= h) return;
    const i = (yi * w + xi) * 4;
    d[i] = 28; d[i + 1] = 30; d[i + 2] = 84; d[i + 3] = 255;
  };

  const marginL = w * 0.08, marginR = w * 0.92;
  const top = h * 0.12, bottom = h * 0.88;
  const lineGap = (bottom - top) / lines;
  const xh = lineGap * 0.34;
  const asc = lineGap * 0.62;

  for (let L = 0; L < lines; L++) {
    const base = top + L * lineGap + lineGap * 0.7;
    // The last line is short, as a real declaration ends mid-line.
    const lineEnd = marginR - (L === lines - 1 ? w * 0.18 : 0);
    let x = marginL;

    while (x < lineEnd) {
      const wordLen = 3 + Math.floor(rnd() * 5);
      for (let k = 0; k < wordLen; k++) {
        const bw = xh * (0.42 + rnd() * 0.34);
        const hh = rnd() < 0.28 ? asc : xh;
        const strokes = 2 + Math.floor(rnd() * 3);
        for (let s = 0; s < strokes; s++) {
          const sx = x + (s / strokes) * bw + (rnd() - 0.5) * bw * 0.3;
          const wob = (rnd() - 0.5) * hh * 0.22;
          for (let t = 0; t <= 1.0001; t += 0.11) {
            const px = sx + Math.sin(t * Math.PI * 1.3 + s) * bw * 0.34 + wob * t;
            put(px, base - t * hh);
            put(px, base - t * hh + 1);
          }
        }
        x += bw + xh * 0.16;
        if (x > lineEnd) break;
      }
      x += xh * (0.5 + rnd() * 0.4);
    }
  }
  return { data: d, width: w, height: h };
}

/* ---------------------------------------------------------------- geometry */

/** Box-filter downscale — what drawImage() into a smaller canvas approximates. */
export function downscale(src, dw, dh) {
  const out = Buffer.alloc(dw * dh * 4);
  const sx = src.width / dw, sy = src.height / dh;
  for (let y = 0; y < dh; y++) {
    for (let x = 0; x < dw; x++) {
      let r = 0, g = 0, b = 0, n = 0;
      const y0 = Math.floor(y * sy), y1 = Math.min(src.height, Math.ceil((y + 1) * sy));
      const x0 = Math.floor(x * sx), x1 = Math.min(src.width, Math.ceil((x + 1) * sx));
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const i = (yy * src.width + xx) * 4;
          r += src.data[i]; g += src.data[i + 1]; b += src.data[i + 2]; n++;
        }
      }
      const o = (y * dw + x) * 4;
      out[o] = n ? r / n : 0; out[o + 1] = n ? g / n : 0; out[o + 2] = n ? b / n : 0; out[o + 3] = 255;
    }
  }
  return { data: out, width: dw, height: dh };
}

/** Crop then resample to exact target dimensions — the browser's drawImage path. */
export function render(src, crop, tw, th) {
  const out = Buffer.alloc(tw * th * 4);
  const sx = crop.width / tw, sy = crop.height / th;
  for (let y = 0; y < th; y++) {
    for (let x = 0; x < tw; x++) {
      let r = 0, g = 0, b = 0, n = 0;
      const y0 = crop.y + Math.floor(y * sy), y1 = Math.min(src.height, crop.y + Math.ceil((y + 1) * sy));
      const x0 = crop.x + Math.floor(x * sx), x1 = Math.min(src.width, crop.x + Math.ceil((x + 1) * sx));
      for (let yy = Math.max(0, Math.floor(y0)); yy < y1; yy++) {
        for (let xx = Math.max(0, Math.floor(x0)); xx < x1; xx++) {
          const i = (yy * src.width + xx) * 4;
          r += src.data[i]; g += src.data[i + 1]; b += src.data[i + 2]; n++;
        }
      }
      const o = (y * tw + x) * 4;
      out[o] = n ? r / n : 0; out[o + 1] = n ? g / n : 0; out[o + 2] = n ? b / n : 0; out[o + 3] = 255;
    }
  }
  return { data: out, width: tw, height: th };
}

/* ------------------------------------------------------------------ encode */

/** canvas.toBlob('image/jpeg', q) equivalent. q in 0..1. */
export function encodeBytes(img, q) {
  const quality = Math.max(1, Math.min(100, Math.round(q * 100)));
  return jpeg.encode({ data: img.data, width: img.width, height: img.height }, quality).data.length;
}

export function writeJpeg(path, img, quality = 90) {
  const out = jpeg.encode({ data: img.data, width: img.width, height: img.height }, quality);
  return out.data;
}

/* -------------------------------------------------------------------- exif */

/**
 * Insert an APP1/EXIF segment carrying a single Orientation tag, right after SOI.
 *
 * WHY: a phone in portrait usually stores a LANDSCAPE frame plus Orientation=6
 * ("rotate 90 deg CW to display"). If a decoder ignores the tag the photo comes
 * out sideways, and a sideways signature is a rejected upload. Every other
 * fixture here is upright, so nothing exercised that path.
 *
 * Orientation values: 1=upright, 3=180, 6=rotate 90 CW, 8=rotate 90 CCW.
 * 6 and 8 are the ones that SWAP width and height, which is what makes them
 * testable — the swap is visible in the dimensions, not just in the pixels.
 *
 * @param {Buffer} buf  an existing JPEG
 * @param {number} orientation  1..8
 */
export function withExifOrientation(buf, orientation) {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) throw new Error('not a JPEG (no SOI)');

  const tiff = Buffer.alloc(26);
  tiff.write('II', 0, 'latin1');          // little-endian
  tiff.writeUInt16LE(42, 2);              // 0x002A
  tiff.writeUInt32LE(8, 4);               // IFD0 offset
  tiff.writeUInt16LE(1, 8);               // one entry
  tiff.writeUInt16LE(0x0112, 10);         // tag: Orientation
  tiff.writeUInt16LE(3, 12);              // type: SHORT
  tiff.writeUInt32LE(1, 14);              // count: 1
  tiff.writeUInt16LE(orientation, 18);    // value
  tiff.writeUInt32LE(0, 22);              // no next IFD

  const payload = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff]);
  const head = Buffer.alloc(4);
  head.writeUInt16BE(0xffe1, 0);          // APP1
  head.writeUInt16BE(payload.length + 2, 2);

  return Buffer.concat([buf.subarray(0, 2), head, payload, buf.subarray(2)]);
}

/** Read the Orientation tag back out of a JPEG's EXIF, or null if absent. */
export function readExifOrientation(buf) {
  const at = buf.indexOf(Buffer.from('Exif\0\0', 'latin1'));
  if (at < 0) return null;
  const t = at + 6;
  if (buf.toString('latin1', t, t + 2) !== 'II') return null;
  const ifd = t + buf.readUInt32LE(t + 4);
  const n = buf.readUInt16LE(ifd);
  for (let i = 0; i < n; i++) {
    const e = ifd + 2 + i * 12;
    if (buf.readUInt16LE(e) === 0x0112) return buf.readUInt16LE(e + 8);
  }
  return null;
}
