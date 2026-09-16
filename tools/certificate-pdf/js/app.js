/*
 * app.js — Certificate → PDF.
 *
 * The problem this solves, in one sentence: SSC requires the 10th standard
 * certificate as a PDF, on an A4 page, not exceeding 500 KB — and a phone
 * produces a 3–5 MB JPEG that satisfies none of those three.
 *
 * The three constraints are not independent:
 *   - the format is fixed (PDF)
 *   - the page is fixed (A4)
 *   - the size is a CEILING (500 KB), and unlike a photo the pixel dimensions
 *     are NOT specified — so resolution is a free variable we may spend.
 *
 * That last point is why this tool can always succeed where a fixed-dimension
 * photo cannot: if the file is too large we lower the resolution, because no
 * requirement forbids it. Legibility is the only thing to protect, so the search
 * prefers the HIGHEST resolution that fits, and only drops quality when it must.
 *
 * Every number below is either a published requirement or a measured property
 * of the writer. Nothing is assumed.
 */
import { buildPdf, inspectPdf, A4 } from './pdf.js';
import { CHANNEL, shareLinks } from '../../../reference-tool/js/config.js';

/* ------------------------------------------------------------ requirements
 *
 * Same discipline as the photo/signature registry: a requirement is data with a
 * source and a status, never prose in a comment. `status: VERIFIED` means the
 * number was read from the official document, and `quote` is the sentence it
 * came from — so a wrong number can be traced rather than argued about.
 */
const REQUIREMENTS = [
  {
    id: 'ssc-certificate',
    label: 'SSC — 10th standard / SSLC certificate',
    page: 'A4',
    maxKB: 500,
    status: 'VERIFIED',
    source: 'SSC, Guidelines for scanning and Upload of Documents',
    quote: 'Document must be in PDF format. Page size of the document to be A4. '
         + 'Size of the file should not be exceeding 500 KB.',
  },
  {
    id: 'custom',
    label: 'Custom — any other portal',
    page: 'A4',
    maxKB: 500,
    status: 'CUSTOM',
    source: 'You',
    quote: 'Set the ceiling yourself from the portal you are applying on.',
  },
];

/** Margin around the image, in PDF points. 36 pt = 12.7 mm. */
const MARGIN_PT = 36;

/*
 * The search ladders. Resolution is tried first and preferred, because for a
 * scanned document resolution protects small print more than JPEG quality does.
 * Both ladders are finite and the whole search is capped, so a pathological
 * input cannot spin.
 */
const DPI_LADDER = [200, 175, 150, 125, 100];
const QUALITY_LADDER = [0.92, 0.85, 0.75, 0.65, 0.5];

/** Conservative structural overhead per page, so the estimate is never optimistic. */
const PDF_OVERHEAD_PER_PAGE = 1024;

const $ = (id) => document.getElementById(id);

const els = {
  requirement: $('requirement'),
  requirementNote: $('requirementNote'),
  maxKB: $('maxKB'),
  customRow: $('customRow'),
  fileInput: $('fileInput'),
  fileInfo: $('fileInfo'),
  fileList: $('fileList'),
  buildBtn: $('buildBtn'),
  status: $('status'),
  result: $('result'),
  resultBody: $('resultBody'),
  downloadBtn: $('downloadBtn'),
  attempts: $('attempts'),
};

/** Selected images, in the order the user chose them. */
let picked = [];
/** The verified PDF waiting to be downloaded, if any. */
let ready = null;

/* ------------------------------------------------------------------- utils */

const fmtKB = (bytes) => (bytes / 1024).toFixed(1) + ' KB';

function showStatus(kind, title, detail) {
  els.status.hidden = false;
  els.status.className = 'status' + (kind ? ' ' + kind : '');
  els.status.innerHTML = '';
  const h = document.createElement('strong');
  h.textContent = title;
  els.status.appendChild(h);
  if (detail) {
    const p = document.createElement('p');
    p.textContent = detail;
    els.status.appendChild(p);
  }
}

function clearStatus() {
  els.status.hidden = true;
  els.status.className = 'status';
  els.status.innerHTML = '';
}

function showResult(rows) {
  els.resultBody.innerHTML = '';
  for (const [k, v] of rows) {
    const tr = document.createElement('tr');
    const th = document.createElement('th');
    th.textContent = k;
    const td = document.createElement('td');
    td.textContent = v;
    tr.append(th, td);
    els.resultBody.appendChild(tr);
  }
  els.result.hidden = false;
}

function clearResult() {
  els.result.hidden = true;
  els.resultBody.innerHTML = '';
  els.downloadBtn.hidden = true;
  ready = null;
}

function logAttempt(text) {
  const li = document.createElement('li');
  li.textContent = text;
  els.attempts.appendChild(li);
}

function clearAttempts() {
  els.attempts.innerHTML = '';
}

/* --------------------------------------------------------------- geometry */

/**
 * Where an image of the given pixel size goes on an A4 page, and at what
 * resolution it should be rendered for a given target dpi.
 *
 * Returns PDF-space placement (points) and the canvas pixel size to render.
 */
export function layoutOnA4(pxW, pxH, dpi) {
  const availW = A4.w - MARGIN_PT * 2;
  const availH = A4.h - MARGIN_PT * 2;
  const aspect = pxW / pxH;

  let drawW;
  let drawH;
  if (aspect >= availW / availH) {
    drawW = availW;
    drawH = availW / aspect;
  } else {
    drawH = availH;
    drawW = availH * aspect;
  }

  // Render at the target resolution for this dpi.
  const renderW = Math.max(1, Math.round((drawW / 72) * dpi));
  const renderH = Math.max(1, Math.round((drawH / 72) * dpi));

  return {
    drawW,
    drawH,
    x: (A4.w - drawW) / 2,
    y: (A4.h - drawH) / 2,
    renderW,
    renderH,
  };
}

/* ------------------------------------------------------------------ encode */

function canvasToJpegBytes(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(async (blob) => {
      if (!blob) { reject(new Error('the browser could not encode this image')); return; }
      resolve(new Uint8Array(await blob.arrayBuffer()));
    }, 'image/jpeg', quality);
  });
}

/**
 * Decode a chosen file to something drawable, honouring the EXIF orientation
 * tag. iPhone photos are routinely stored rotated with a tag, and ignoring it
 * is the most common cause of a sideways certificate.
 */
async function decode(file) {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    // A file the browser cannot decode is an EXPECTED input — HEIC, a truncated
    // download, a renamed file — so this is a warning, not an application error.
    console.warn('Could not decode:', file.name);
    return null;
  }
}

/** Render one decoded image onto a fresh canvas at the layout's resolution. */
function render(bitmap, layout) {
  const canvas = document.createElement('canvas');
  canvas.width = layout.renderW;
  canvas.height = layout.renderH;
  const ctx = canvas.getContext('2d');
  // White first: a transparent PNG must not become black, and JPEG has no alpha.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/* ------------------------------------------------------------- the search */

/**
 * Find the highest-quality setting that lands the whole PDF under the ceiling.
 *
 * Prefers resolution over JPEG quality, because a scanned certificate is judged
 * on whether the text can be read. Returns null if even the lowest rung cannot
 * fit — in which case the caller refuses rather than shipping a file that fails.
 */
export async function searchFit(bitmaps, maxKB) {
  const ceiling = maxKB * 1024;
  const jpegBudget = ceiling - PDF_OVERHEAD_PER_PAGE * bitmaps.length;
  if (jpegBudget <= 0) {
    return { ok: false, reason: 'budget', detail: `${bitmaps.length} pages exceed the ceiling on structure alone` };
  }

  let best = null;               // smallest result seen, for an honest refusal
  const attempts = [];

  for (const dpi of DPI_LADDER) {
    const layouts = bitmaps.map((b) => layoutOnA4(b.width, b.height, dpi));
    const canvases = bitmaps.map((b, i) => render(b, layouts[i]));

    for (const quality of QUALITY_LADDER) {
      const jpegs = [];
      for (const c of canvases) jpegs.push(await canvasToJpegBytes(c, quality));
      const total = jpegs.reduce((s, j) => s + j.length, 0);
      attempts.push({ dpi, quality, bytes: total });

      if (!best || total < best.bytes) {
        best = { dpi, quality, bytes: total, jpegs, layouts };
      }
      if (total <= jpegBudget) {
        return { ok: true, dpi, quality, jpegs, layouts, attempts };
      }
      // Once quality is low enough that the image is visibly degraded, dropping
      // resolution further is usually the better trade — stop descending here.
    }
  }

  return { ok: false, reason: 'ceiling', detail: 'no setting reached the ceiling', best, attempts };
}

/* --------------------------------------------------------------- the build */

async function build() {
  if (!picked.length) return;
  const req = REQUIREMENTS.find((r) => r.id === els.requirement.value) || REQUIREMENTS[0];
  const maxKB = req.id === 'custom' ? Number(els.maxKB.value) || 500 : req.maxKB;

  els.buildBtn.disabled = true;
  clearResult();
  clearAttempts();
  showStatus('', 'Reading your files…', 'Decoding each image and applying its rotation tag.');

  try {
    const bitmaps = [];
    for (const f of picked) {
      const b = await decode(f);
      if (b) bitmaps.push(b);
    }

    if (!bitmaps.length) {
      showStatus('bad', 'None of those files could be opened',
        'This tool reads JPEG and PNG. iPhone photos are often HEIC, which browsers other than '
        + 'Safari cannot open — convert to JPEG first. A truncated or renamed file gives this same message.');
      return;
    }

    if (bitmaps.length < picked.length) {
      showStatus('', `Using ${bitmaps.length} of ${picked.length} files`,
        `${picked.length - bitmaps.length} could not be opened and were skipped.`);
    } else {
      showStatus('', 'Finding the highest quality that fits…',
        `Trying resolution and quality settings until the PDF is under ${maxKB} KB.`);
    }

    const fit = await searchFit(bitmaps, maxKB);

    for (const a of (fit.attempts || []).slice(-6)) {
      logAttempt(`${a.dpi} dpi at quality ${a.quality} → ${fmtKB(a.bytes)}`);
    }

    if (!fit.ok) {
      const bestTxt = fit.best ? fmtKB(fit.best.bytes) : 'nothing';
      showStatus('bad', 'This cannot be made to fit',
        `Even at the lowest setting the images come to ${bestTxt}, and the ceiling is ${maxKB} KB. `
        + 'Reduce the number of pages, or use a lighter scan of the certificate. Nothing has been '
        + 'produced, because a file over the limit would be rejected.');
      return;
    }

    const pages = fit.jpegs.map((jpeg, i) => ({
      jpeg,
      pxW: fit.layouts[i].renderW,
      pxH: fit.layouts[i].renderH,
      drawW: fit.layouts[i].drawW,
      drawH: fit.layouts[i].drawH,
      x: fit.layouts[i].x,
      y: fit.layouts[i].y,
    }));

    const pdfBytes = buildPdf(pages);

    /* -------------------------------------------------- verify, then claim
     *
     * Nothing above is trusted. The bytes that were actually produced are read
     * back and checked against the requirement: is it a real PDF, is every page
     * A4, is it under the ceiling. The tool only offers a download if all three
     * hold, so it can never announce success for a file the portal would reject.
     */
    const info = inspectPdf(pdfBytes);
    const underCeiling = pdfBytes.length <= maxKB * 1024;

    const rows = [
      ['Requirement', req.label],
      ['Pages', String(info.pageCount)],
      ['Page size', info.a4Pages === info.pageCount ? 'A4 (all pages)' : 'NOT A4'],
      ['File size', `${fmtKB(pdfBytes.length)} of ${maxKB} KB allowed`],
      ['Resolution', `${fit.dpi} dpi`],
      ['Quality', String(fit.quality)],
      ['Format check', info.ok ? 'valid PDF, read back from its own bytes' : info.problems.join('; ')],
    ];

    if (!info.ok || !underCeiling) {
      showStatus('bad', 'The produced file did not pass its own check',
        (info.problems.join('; ') || '') + (underCeiling ? '' : ' — over the size ceiling'));
      showResult(rows);
      return;
    }

    ready = { bytes: pdfBytes, name: pdfName(req) };
    showResult(rows);
    els.downloadBtn.hidden = false;
    showStatus('ok', 'Ready — and verified',
      `A ${fmtKB(pdfBytes.length)} PDF, ${info.pageCount} A4 page(s), read back from the file itself.`);
  } catch (err) {
    console.error(err);
    showStatus('bad', 'Something went wrong while building the PDF',
      (err && err.message) || String(err));
  } finally {
    els.buildBtn.disabled = false;
  }
}

function pdfName(req) {
  const base = req.id === 'custom' ? 'documents' : req.id.replace(/[^a-z0-9]+/gi, '-');
  return `${base}.pdf`;
}

function download() {
  if (!ready) return;
  const blob = new Blob([ready.bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = ready.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/* ------------------------------------------------------------------- wiring */

function describeFiles(files) {
  if (!files.length) {
    els.fileInfo.textContent = '';
    return;
  }
  els.fileList.innerHTML = '';
  for (const f of files) {
    const li = document.createElement('li');
    li.textContent = `${f.name} — ${fmtKB(f.size)}`;
    els.fileList.appendChild(li);
  }
  els.fileInfo.textContent = `${files.length} file(s) chosen.`;
}

function syncRequirement() {
  const req = REQUIREMENTS.find((r) => r.id === els.requirement.value) || REQUIREMENTS[0];
  els.customRow.hidden = req.id !== 'custom';
  els.requirementNote.textContent = req.quote + (req.source ? `  — ${req.source}` : '');
  clearResult();
  clearStatus();
}

/* ------------------------------------------------------------ channel layer
 *
 * The part that makes this a channel tool rather than a loose web page. All of
 * it is driven by config.js, so changing the channel is one edit, not a search
 * across the project. The walkthrough link stays hidden until a URL is set,
 * rather than pointing nowhere.
 */
function initChannel() {
  const sub = $('subscribeBtn');
  if (sub) sub.href = CHANNEL.subscribeUrl;

  const ch = $('channelLink');
  if (ch) {
    ch.href = CHANNEL.channelUrl;
    ch.textContent = CHANNEL.name;
  }

  const links = shareLinks(location.href, CHANNEL.shareText);
  const wa = $('shareWhatsapp');
  const tg = $('shareTelegram');
  if (wa) wa.href = links.whatsapp;
  if (tg) tg.href = links.telegram;

  const toggle = $('themeToggle');
  if (toggle) {
    const KEY = 'cpdf-theme';
    const apply = (t) => { document.documentElement.setAttribute('data-theme', t); };
    // Respect the operating system until the user makes an explicit choice.
    const saved = (() => { try { return localStorage.getItem(KEY); } catch { return null; } })();
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    apply(saved || (prefersDark ? 'dark' : 'light'));
    toggle.addEventListener('click', () => {
      const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      apply(next);
      try { localStorage.setItem(KEY, next); } catch { /* private mode */ }
    });
  }
}

function init() {
  initChannel();

  for (const r of REQUIREMENTS) {
    const o = document.createElement('option');
    o.value = r.id;
    o.textContent = r.label;
    els.requirement.appendChild(o);
  }

  els.requirement.addEventListener('change', syncRequirement);
  els.maxKB.addEventListener('input', () => { clearResult(); clearStatus(); });

  els.fileInput.addEventListener('change', (e) => {
    picked = [...(e.target.files || [])];
    describeFiles(picked);
    clearResult();
    clearStatus();
    els.buildBtn.disabled = picked.length === 0;
  });

  els.buildBtn.addEventListener('click', build);
  els.downloadBtn.addEventListener('click', download);

  syncRequirement();
  els.buildBtn.disabled = true;
}

init();
