/**
 * app.js — UI wiring only. All decision logic lives in core.js.
 *
 * Flow: pick requirement -> load image -> frame it -> fit -> VERIFY -> offer download.
 * The download button only ever appears after verify() passes.
 */
import { SPECS, getSpec } from './specs.js';
import { coverRect, clampCrop, searchQuality, verify, explainFailure, describeWindow } from './core.js';
import { CHANNEL, shareLinks } from './config.js';

/* ------------------------------------------------------------------ theme */
const root = document.documentElement;

// localStorage throws on some file:// origins and in private mode. A theme
// preference is not worth breaking the page for, so every access is guarded.
const store = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch { /* ignore */ } },
};

root.dataset.theme = store.get('psf-theme')
  || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

document.getElementById('themeToggle').addEventListener('click', () => {
  root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
  store.set('psf-theme', root.dataset.theme);
});

/* --------------------------------------------------------------- branding */
document.getElementById('subscribeBtn').href = CHANNEL.subscribeUrl;
document.getElementById('channelLink').href = CHANNEL.channelUrl;
document.getElementById('channelLink').textContent = CHANNEL.handle;
if (CHANNEL.walkthroughUrl) {
  const w = document.getElementById('walkthroughLink');
  w.href = CHANNEL.walkthroughUrl;
  w.hidden = false;
}

function paintShareLinks() {
  const s = shareLinks(location.href);
  document.getElementById('shareWhatsapp').href = s.whatsapp;
  document.getElementById('shareTelegram').href = s.telegram;
}

/* ------------------------------------------------------------- deep links */
/**
 * A video description must be able to open the exact tool and preset, e.g.
 *   /?preset=ssc-signature-200
 * Without this the viewer lands on a default and has to work out which
 * requirement they need, which is where they leave.
 */
const presetFromUrl = () => new URL(location.href).searchParams.get('preset');

function syncUrl(specId) {
  const url = new URL(location.href);
  if (specId && specId !== 'custom') url.searchParams.set('preset', specId);
  else url.searchParams.delete('preset');
  history.replaceState(null, '', url.toString());
  paintShareLinks();
}

/* ------------------------------------------------------------------- refs */
const els = {
  preset: document.getElementById('presetSelect'),
  provenance: document.getElementById('provenance'),
  customFields: document.getElementById('customFields'),
  cw: document.getElementById('cw'), ch: document.getElementById('ch'),
  cmin: document.getElementById('cmin'), cmax: document.getElementById('cmax'),
  file: document.getElementById('fileInput'),
  fileInfo: document.getElementById('fileInfo'),
  cropCard: document.getElementById('cropCard'),
  processCard: document.getElementById('processCard'),
  stage: document.getElementById('stage'),
  stageImg: document.getElementById('stageImg'),
  cropBox: document.getElementById('cropBox'),
  zoom: document.getElementById('zoom'),
  resetCrop: document.getElementById('resetCrop'),
  cropReadout: document.getElementById('cropReadout'),
  preview: document.getElementById('preview'),
  processBtn: document.getElementById('processBtn'),
  status: document.getElementById('status'),
  report: document.getElementById('report'),
  rDims: document.getElementById('rDims'), rSize: document.getElementById('rSize'),
  rFormat: document.getElementById('rFormat'), rQuality: document.getElementById('rQuality'),
  rEncodes: document.getElementById('rEncodes'),
  download: document.getElementById('downloadBtn'),
  presetNote: document.getElementById('presetNote'),
  liveCaptureWarn: document.getElementById('liveCaptureWarn'),
  presetWarning: document.getElementById('presetWarning'),
  preferLargerRow: document.getElementById('preferLargerRow'),
  preferLargerBtn: document.getElementById('preferLargerBtn'),
  presetRules: document.getElementById('presetRules'),
  presetRulesList: document.getElementById('presetRulesList'),
  declarationBox: document.getElementById('declarationBox'),
  declarationText: document.getElementById('declarationText'),
  copyLink: document.getElementById('copyLink'),
  copyStatus: document.getElementById('copyStatus'),
};

const state = { spec: null, img: null, imgW: 0, imgH: 0, crop: null, result: null, displayScale: 1, busy: false };

/* ------------------------------------------------------- requirement pick */
function populatePresets() {
  const groups = new Map();
  for (const s of SPECS) {
    if (!groups.has(s.group)) groups.set(s.group, []);
    groups.get(s.group).push(s);
  }
  for (const [group, items] of groups) {
    const og = document.createElement('optgroup');
    og.label = group;
    for (const s of items) {
      const o = document.createElement('option');
      o.value = s.id;
      o.textContent = s.label;
      og.appendChild(o);
    }
    els.preset.appendChild(og);
  }
}

function resolveSpec() {
  const base = getSpec(els.preset.value);
  if (base.id !== 'custom') return base;
  return {
    ...base,
    label: 'Custom requirement',
    width: clampInt(els.cw.value, 1, 10000, 600),
    height: clampInt(els.ch.value, 1, 10000, 600),
    minKB: clampInt(els.cmin.value, 1, 20000, 10),
    maxKB: clampInt(els.cmax.value, 1, 20000, 100),
  };
}
const clampInt = (v, lo, hi, fallback) => {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(lo, Math.min(hi, n));
};

function applySpec() {
  state.spec = resolveSpec();
  const isCustom = state.spec.id === 'custom';
  els.customFields.hidden = !isCustom;

  if (isCustom) {
    els.provenance.className = 'provenance';
    els.provenance.innerHTML =
      '<b>Custom requirement</b>Only the numbers you entered are checked. ' +
      'This tool cannot confirm that they match any real portal.';
  } else if (state.spec.status === 'DERIVED') {
    // 'derived' is a third visual level, not a synonym for either neighbour. The
    // wording was always distinct from VERIFIED, but the styling was not, so the
    // two rendered identically and the distinction lived only in a paragraph.
    els.provenance.className = 'provenance derived';
    // Deliberately NOT worded like the VERIFIED path. The requirement is official
    // and the pixels are not, and a user who cannot tell those apart is being
    // misled by the interface rather than by the registry.
    els.provenance.innerHTML =
      `<b>Requirement read from the official source document on ${state.spec.verifiedOn}</b>` +
      `Source: ${state.spec.source}` +
      `<br><b>The pixel box is not a quotation.</b> The document states this requirement as a ` +
      `printed size or a range rather than as pixels, so ${state.spec.width} &times; ` +
      `${state.spec.height} px is that figure read at ${state.spec.dpi} dpi — a resolution this ` +
      `tool chose, not one the document states.` +
      (state.spec.note ? `<br>${state.spec.note}` : '');
  } else if (state.spec.status === 'VERIFIED') {
    els.provenance.className = 'provenance';
    // The note is shown here too, not only on the unverified path. It is where the
    // registry records what the source document actually says — including the two
    // places where an official document contradicts itself (the RRB 140x60 box
    // against its own 30 KB floor, and the MPSC signature section headed
    // "Photograph size"). That analysis is the point of the entry; leaving it in a
    // field nothing renders would be doing the work and throwing it away.
    els.provenance.innerHTML =
      `<b>Read from the official source document on ${state.spec.verifiedOn}</b>` +
      `Source: ${state.spec.source}` +
      (state.spec.note ? `<br>${state.spec.note}` : '');
  } else {
    els.provenance.className = 'provenance warn';
    els.provenance.innerHTML =
      '<b>This preset is not yet verified against a live portal</b>' +
      `Source: ${state.spec.source}.<br>${state.spec.note}`;
  }

  els.presetNote.textContent =
    `${state.spec.label} — ${state.spec.width}x${state.spec.height} px, ${describeWindow(state.spec)}, ` +
    `JPEG. Status: ${state.spec.status}. ` +
    (state.spec.feasibility
      ? `Measured fit: ${state.spec.feasibility}${state.spec.measuredOn ? ` (${state.spec.measuredOn})` : ''}.`
      : 'Measured fit: not classified.');

  /* ------------------------------------------------- warnings the user must see */
  // Two different things belong here: the preset's own provenance caveat, and the
  // measured fact that this pixel box is tight for this size window. Both are
  // things the user would otherwise only discover at the upload screen.
  const warns = [];
  if (state.spec.warning) warns.push(state.spec.warning);

  if (state.spec.feasibility === 'marginal') {
    warns.push(
      `This pixel box and this size window do not agree. Measured over a grid of realistic ` +
      `documents, the largest file this tool can produce at ${state.spec.width}x${state.spec.height} ` +
      `sometimes clears the ${state.spec.minKB} KB minimum and sometimes does not. The usual risk ` +
      `is being too SMALL, not too large — so never shrink this file further.`
    );
  }
  if (state.spec.feasibility === 'unreachable') {
    warns.push(
      `Measured: no document can reach ${state.spec.minKB} KB at ` +
      `${state.spec.width}x${state.spec.height}. This preset cannot produce a valid file.`
    );
  }
  // riskNote is mandatory for a marginal box and says WHICH inputs fail, which is
  // the part the user cannot work out for themselves.
  if (state.spec.riskNote) warns.push(state.spec.riskNote);

  if (warns.length) {
    els.presetWarning.hidden = false;
    els.presetWarning.className = 'banner-warn caution';
    els.presetWarning.innerHTML =
      '<b>Read this before you rely on this preset</b>' + warns.join('<br><br>');
  } else {
    els.presetWarning.hidden = true;
  }

  /* ------------------------------------------- the documented larger reading */
  const larger = state.spec.preferLarger ? getSpec(state.spec.preferLarger) : null;
  if (larger) {
    els.preferLargerRow.hidden = false;
    els.preferLargerBtn.textContent = state.spec.feasibility === 'marginal'
      ? `This box may fail — use the larger box instead: ${larger.width}x${larger.height} px`
      : `Tight? Switch to the larger box: ${larger.width}x${larger.height} px`;
  } else {
    els.preferLargerRow.hidden = true;
  }

  /* --------------------------------------------- rules from the source document */
  const rules = state.spec.rules || [];
  els.presetRules.hidden = rules.length === 0;
  els.presetRulesList.innerHTML = '';
  for (const r of rules) {
    const li = document.createElement('li');
    li.textContent = r;
    els.presetRulesList.appendChild(li);
  }

  /* ------------------------------------------------ the declaration, verbatim */
  // Keyed off the entry's own declarationText rather than its status. It used to be
  // `document === 'Declaration' && status === 'VERIFIED'`, which was fine while SSC
  // was the only verified declaration — but the IBPS guideline gives a DIFFERENT
  // wording, so the moment ibps-declaration became VERIFIED that gate would have
  // printed the SSC text under an IBPS heading. Which wording is right is a fact
  // about the requirement, so it belongs on the requirement.
  const declText = state.spec.declarationText || null;
  els.declarationBox.hidden = !declText;
  if (declText) els.declarationText.textContent = `\u201C${declText}\u201D`;

  // A live-capture requirement cannot be satisfied by any file we could produce.
  // Refuse before the user invests any effort, rather than after.
  // The exam name and the mechanism both come from the entry. This block used to
  // hardcode "SSC ... webcam ... QR code", which (a) contradicted the entry's own
  // `rules`, and (b) would have printed "SSC" under any other exam that needs a
  // live capture. A refusal that names the wrong body is worse than no refusal.
  if (state.spec.liveCaptureOnly) {
    els.liveCaptureWarn.hidden = false;
    els.liveCaptureWarn.innerHTML =
      '<b>This requirement cannot be met with a prepared file</b>' +
      `${state.spec.group} ${state.spec.liveCaptureNote}`;
  } else {
    els.liveCaptureWarn.hidden = true;
  }
  if (!state.busy) els.processBtn.disabled = Boolean(state.spec.liveCaptureOnly);

  syncUrl(state.spec.id);

  if (state.img) {
    resetCrop();
    refresh();
  }

  // Changing the requirement invalidates any previous result. A stale
  // "matches these requirements" banner next to a different spec would be a lie.
  state.result = null;
  els.status.hidden = true;
  els.report.hidden = true;
  els.download.hidden = true;
}

/* ------------------------------------------------------------ image load */
els.file.addEventListener('change', async (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  els.fileInfo.textContent = `Reading ${file.name} (${(file.size / 1024).toFixed(0)} KB)...`;
  try {
    state.img = await loadBitmap(file);
    state.imgW = state.img.width;
    state.imgH = state.img.height;
    els.stageImg.src = state.img instanceof HTMLImageElement ? state.img.src : '';
    if (!(state.img instanceof HTMLImageElement)) {
      // ImageBitmap cannot be a src; draw once into an offscreen canvas and reuse that.
      const oc = document.createElement('canvas');
      oc.width = state.imgW; oc.height = state.imgH;
      oc.getContext('2d').drawImage(state.img, 0, 0);
      state.img = oc;
      els.stageImg.src = oc.toDataURL('image/jpeg', 0.9);
    }
    els.fileInfo.textContent = `${file.name} — ${state.imgW}x${state.imgH} px, ${(file.size / 1024).toFixed(0)} KB.`;
    els.cropCard.hidden = false;
    els.processCard.hidden = false;
    els.report.hidden = true;
    els.download.hidden = true;
    els.status.hidden = true;
    resetCrop();
    refresh();
  } catch (err) {
    // A file the browser cannot decode is an EXPECTED input — HEIC, a truncated
    // download, a renamed file — not an application error. Logging it at error
    // level made "the console is clean" impossible to test, and told anyone who
    // opened devtools that something was broken when nothing was. Warn instead:
    // the diagnostic detail is still there, classified correctly.
    console.warn('Could not decode the chosen file:', (err && err.message) || err);
    els.fileInfo.textContent = '';
    showStatus('bad', 'That file could not be opened',
      'This tool reads JPEG and PNG. iPhone photos are usually HEIC, which browsers other than Safari cannot open — convert it to JPEG first. A truncated or renamed file gives this same message.');
  }
});

/**
 * Decode with EXIF orientation applied. This is the single most common cause of
 * "my photo came out sideways" on phones.
 */
async function loadBitmap(file) {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch { /* fall through */ }
  }
  return await new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => { URL.revokeObjectURL(url); resolve(im); };
    im.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode failed')); };
    im.src = url;
  });
}

/* ---------------------------------------------------------------- framing */
function maxCrop() {
  const r = coverRect(state.imgW, state.imgH, state.spec.width, state.spec.height);
  return { w: r.width, h: r.height };
}

function resetCrop() {
  const m = maxCrop();
  const r = coverRect(state.imgW, state.imgH, state.spec.width, state.spec.height);
  state.crop = { x: r.x, y: r.y, width: m.w, height: m.h };
  els.zoom.value = 100;
}

function applyZoom() {
  const m = maxCrop();
  const f = Math.max(0.15, Number(els.zoom.value) / 100);
  const cx = state.crop.x + state.crop.width / 2;
  const cy = state.crop.y + state.crop.height / 2;
  const width = m.w * f;
  const height = m.h * f;
  state.crop = clampCrop({ x: cx - width / 2, y: cy - height / 2, width, height }, state.imgW, state.imgH);
}

function layout() {
  const availW = els.stage.clientWidth || 320;
  const availH = Math.max(200, Math.min(window.innerHeight * 0.5, 460));
  state.displayScale = Math.min(availW / state.imgW, availH / state.imgH, 3);
  els.stageImg.style.width = Math.round(state.imgW * state.displayScale) + 'px';
  els.stageImg.style.height = Math.round(state.imgH * state.displayScale) + 'px';
}

function paintCropBox() {
  const s = state.displayScale;
  const ox = els.stageImg.offsetLeft;
  const oy = els.stageImg.offsetTop;
  const b = els.cropBox;
  b.style.left = Math.round(ox + state.crop.x * s) + 'px';
  b.style.top = Math.round(oy + state.crop.y * s) + 'px';
  b.style.width = Math.round(state.crop.width * s) + 'px';
  b.style.height = Math.round(state.crop.height * s) + 'px';
  els.cropReadout.textContent = `source crop ${Math.round(state.crop.width)}x${Math.round(state.crop.height)} px`;
}

function refresh() {
  if (!state.img) return;
  layout();
  paintCropBox();
  renderPreview();
}

function renderPreview() {
  const c = els.preview;
  c.width = state.spec.width;
  c.height = state.spec.height;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, c.width, c.height);
  g.drawImage(state.img, state.crop.x, state.crop.y, state.crop.width, state.crop.height, 0, 0, c.width, c.height);
}

/* ------------------------------------------------------------ drag + keys */
let drag = null;
els.cropBox.addEventListener('pointerdown', (e) => {
  drag = { x: e.clientX, y: e.clientY, cx: state.crop.x, cy: state.crop.y };
  els.cropBox.setPointerCapture(e.pointerId);
});
els.cropBox.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const dx = (e.clientX - drag.x) / state.displayScale;
  const dy = (e.clientY - drag.y) / state.displayScale;
  state.crop = clampCrop({ ...state.crop, x: drag.cx + dx, y: drag.cy + dy }, state.imgW, state.imgH);
  paintCropBox();
  renderPreview();
});
const endDrag = () => { drag = null; };
els.cropBox.addEventListener('pointerup', endDrag);
els.cropBox.addEventListener('pointercancel', endDrag);

els.cropBox.addEventListener('keydown', (e) => {
  const step = Math.max(1, Math.round(state.crop.width * 0.02));
  const map = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
  const d = map[e.key];
  if (!d) return;
  e.preventDefault();
  state.crop = clampCrop({ ...state.crop, x: state.crop.x + d[0], y: state.crop.y + d[1] }, state.imgW, state.imgH);
  paintCropBox();
  renderPreview();
});

els.zoom.addEventListener('input', () => { applyZoom(); paintCropBox(); renderPreview(); });
els.resetCrop.addEventListener('click', () => { resetCrop(); refresh(); });
window.addEventListener('resize', refresh);

/* ---------------------------------------------------------------- process */
function showStatus(kind, title, body) {
  els.status.hidden = false;
  els.status.className = 'status ' + kind;
  els.status.innerHTML = '';
  const b = document.createElement('b');
  b.textContent = title;
  els.status.append(b, document.createTextNode(body));
}

const toBlob = (canvas, q) =>
  new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', q));

els.processBtn.addEventListener('click', async () => {
  const spec = state.spec;
  if (!state.img || !spec) return;
  if (spec.liveCaptureOnly) {
    showStatus('bad', 'Not produced',
      'This requirement needs a live webcam capture on the portal. No prepared file can satisfy it.');
    return;
  }

  state.busy = true;
  els.processBtn.disabled = true;
  els.download.hidden = true;
  els.report.hidden = true;
  showStatus('', 'Fitting...', 'Measuring candidate qualities.');

  try {
    renderPreview(); // guarantees the canvas holds the current crop at exact spec dimensions

    const minBytes = spec.minKB * 1024;
    const maxBytes = spec.maxKB * 1024;

    const result = await searchQuality({
      measure: async (q) => {
        const b = await toBlob(els.preview, q);
        return b ? b.size : Number.MAX_SAFE_INTEGER;
      },
      minBytes,
      maxBytes,
    });

    state.result = null;

    if (!result.ok) {
      const largerSpec = spec.preferLarger ? getSpec(spec.preferLarger) : null;
      showStatus('bad', 'Not produced', explainFailure(result, spec, largerSpec));
      return;
    }

    const blob = await toBlob(els.preview, result.quality);
    if (!blob) throw new Error('encoder returned nothing');

    // Defence in depth: never trust the pipeline, re-check the artefact.
    const check = verify(spec, {
      width: els.preview.width,
      height: els.preview.height,
      bytes: blob.size,
      mime: blob.type,
    });

    els.rDims.textContent = `${els.preview.width} x ${els.preview.height} px`;
    els.rSize.textContent = `${(blob.size / 1024).toFixed(2)} KB`;
    els.rFormat.textContent = blob.type;
    els.rQuality.textContent = `JPEG quality ${(result.quality * 100).toFixed(1)}`;
    els.rEncodes.textContent = `${result.encodes} encode(s) measured`;
    els.report.hidden = false;

    if (!check.pass) {
      showStatus('bad', 'Produced, but it failed its own check', check.problems.join('; '));
      return;
    }

    state.result = { blob, spec };
    showStatus(
      'ok',
      'Matches these file requirements',
      ` ${els.preview.width}x${els.preview.height} px, ${(blob.size / 1024).toFixed(2)} KB, within the ` +
      `${describeWindow(spec)} window. Still confirm on the official upload page.`
    );
    els.download.hidden = false;
  } catch (err) {
    console.error(err);
    showStatus('bad', 'Something went wrong', err.message || 'Unknown error.');
  } finally {
    state.busy = false;
    els.processBtn.disabled = Boolean(state.spec && state.spec.liveCaptureOnly);
  }
});

els.download.addEventListener('click', () => {
  if (!state.result) return;
  const { blob, spec } = state.result;
  const name = `${spec.id}_${spec.width}x${spec.height}.jpg`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

/* -------------------------------------------------------------- copy link */
els.copyLink.addEventListener('click', async () => {
  const url = location.href;
  try {
    await navigator.clipboard.writeText(url);
    els.copyStatus.textContent = 'Copied. Paste this into the video description.';
  } catch {
    // Clipboard access is blocked on file:// in some browsers, and on http origins.
    els.copyStatus.textContent = url;
  }
  setTimeout(() => { els.copyStatus.textContent = ''; }, 6000);
});

/* ------------------------------------------------------------------ start */
els.preset.addEventListener('change', applySpec);
[els.cw, els.ch, els.cmin, els.cmax].forEach((el) => el.addEventListener('input', applySpec));

// Switching to the documented larger reading of the same requirement. Offered
// when the official pixel box is too tight to hold the official size window.
els.preferLargerBtn.addEventListener('click', () => {
  const next = state.spec && state.spec.preferLarger;
  if (!next || !getSpec(next)) return;
  els.preset.value = next;
  applySpec();
});

populatePresets();

// A link from a video description should open the exact requirement, not a default.
const requested = presetFromUrl();
els.preset.value = requested && getSpec(requested) ? requested : 'ssc-signature';
applySpec();
paintShareLinks();
