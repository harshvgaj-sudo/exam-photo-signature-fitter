/**
 * specs.js — the requirement registry.
 *
 * WHY THIS FILE EXISTS
 * The previous version hard-coded exam requirements as loose numbers in prose and
 * then never enforced most of them. Requirements are data, so they live in data,
 * and every entry carries its PROVENANCE.
 *
 * status meanings
 *   'VERIFIED'   — read directly from an official source document, with a date.
 *   'UNVERIFIED' — taken from secondary sources / notes. The UI must say so and
 *                  must not tell the user the file is "approved".
 *   'CUSTOM'     — numbers entered by the user; no preset claim is made.
 *
 * feasibility meanings — this is a claim about whether the pixel box can hold the
 * size window. _verify/check_specs.mjs MEASURES it in a real browser and fails if
 * the claim is wrong. Do not guess these.
 *
 *   'comfortable' — EVERY input on the declared sweep clears the minimum with
 *                   room to spare (>= 1.15x the floor).
 *   'marginal'    — SOME inputs clear it and some fall below. Input-dependent by
 *                   definition, so `riskNote` is mandatory: it must say which
 *                   inputs fail, and `preferLarger` must offer a way out.
 *   'unreachable' — NO input on the sweep reaches the minimum. Must not ship.
 *
 * WHY 'marginal' IS DECIDED BY A SWEEP AND NOT ONE IMAGE
 * A single measurement cannot separate 'marginal' from 'comfortable', because the
 * thing that actually breaks a preset is input variation: one viewer's signature
 * is compact, the next one's is elaborate. Measuring one fixture and calling the
 * answer the truth is the same mistake as claiming success for a file that fails
 * its own checks — it just moves the error one level up.
 *
 * WHY THE MEASUREMENT IS DONE IN A BROWSER
 * It was originally done in Node, with a re-implementation of the pipeline. That
 * model said the 140x60 box reached 10.22 KB; real Chrome, given the same
 * document, produced 8.88 KB and refused. The model overstated the achievable
 * size by 14% — see _verify/probe_gap_cause.mjs. At a boundary like 10 KB that
 * flips the answer, so the browser is the only acceptable authority.
 *
 * Other fields
 *   measuredOver — the exact grid of realistic inputs the feasibility claim was
 *     measured over. This is the evidence, so it is declared, not implied.
 *     _verify/browser_truth.mjs builds exactly this grid; check_specs.mjs fails
 *     if the claim drifts from what the grid measures.
 *   measuredOn / measuredWith — when and how, for reproducibility.
 *   riskNote — mandatory when feasibility is 'marginal'. Says which inputs fail.
 *   liveCaptureOnly: true — the portal requires a live webcam capture and no
 *     prepared file can satisfy it. The tool must refuse and explain, never
 *     produce a file that is guaranteed to be rejected.
 *   preferLarger — id of a documented larger-box reading of the same requirement,
 *     offered when this box cannot hold the window.
 *   noLargerReading — the explicit statement that no larger reading is documented.
 *     Accepted in place of preferLarger. Inventing a dimension just to satisfy a
 *     check would be worse than admitting the gap.
 *   warning — a caveat the UI must show prominently for this preset.
 *   rules — human rules from the source, shown next to the numbers.
 *
 * PRIMARY SOURCE (supplied by the channel owner, 2026-09-14):
 *   "Guidelines for scanning and Upload of Documents" — the official SSC guideline
 *   PDF, 4 pages. This SUPERSEDES the earlier secondary web sources and is the
 *   only entry here with status VERIFIED.
 *
 * SECONDARY SOURCES (still UNVERIFIED):
 *   gov_portals_master_research.txt            Part B — exam photo/signature specs
 *   ssc_live_photo_signature_battle_sheet.txt  [0:45-2:00] — SSC scrutiny rules
 */

/** Pixel dimensions derived from a printed size, given an assumed scan resolution. */
export function pxFromCm(cm, dpi) {
  return Math.round((cm / 2.54) * dpi);
}

const SSC_PDF = 'SSC "Guidelines for scanning and Upload of Documents" (official PDF, 4 pages)';
const SSC_PDF_DATE = '2026-09-14';
const MEASURED_ON = '2026-09-14';
const MEASURED_WITH = 'Chrome 152, _verify/browser_truth.mjs';

/*
 * The sweep grids. `grain` is scan noise (0 = flat perfect scan, 32 = noisy phone
 * photo); `density` is how much ink is on the page. Two independent axes, because
 * a dense signature on clean paper and a sparse one on noisy paper are both
 * ordinary documents and they land at opposite ends of the size range.
 */
const SCAN_SWEEP = { fixture: 'scan', grain: [0, 4, 8, 12, 16, 24, 32], density: [1, 2, 4, 6] };
const THUMB_SWEEP = { fixture: 'thumb', grain: [0, 4, 8, 12, 16, 24, 32] };
const TEXT_SWEEP = { fixture: 'text', grain: [0, 4, 8, 12, 16, 24, 32] };
const PHOTO_SWEEP = { fixture: 'photo', grain: [12] };

/** Shown verbatim for the declaration preset — candidates must copy it by hand. */
export const DECLARATION_TEXT =
  'I, __________ (Name of the candidate), hereby declare that all the information ' +
  'submitted by me in the application form is correct, true and valid. I will present ' +
  'the supporting documents as and when required.';

export const SPECS = [
  /* ------------------------------------------------------------------- SSC */
  {
    id: 'ssc-signature',
    label: 'SSC — Signature',
    group: 'SSC',
    document: 'Signature',
    width: 140,
    height: 60,
    minKB: 10,
    maxKB: 20,
    format: 'image/jpeg',
    status: 'VERIFIED',
    source: SSC_PDF,
    verifiedOn: SSC_PDF_DATE,
    measuredOver: SCAN_SWEEP,
    measuredOn: MEASURED_ON,
    measuredWith: MEASURED_WITH,
    // MEASURED, not assumed. 28 combinations of scan noise x ink density, in real
    // Chrome, through the shipped pipeline:
    //   best achievable at q=1.0 ranges from 8.3 KB (compact signature, clean
    //   scan) to 13.4 KB (large elaborate signature, density 2).
    // 3 of 12 sampled combinations reached the 10 KB floor; the rest fell short.
    feasibility: 'marginal',
    preferLarger: 'ssc-signature-large',
    riskNote:
      'Measured over 28 scan-noise x ink-density combinations: a large, elaborate signature ' +
      'reaches about 13.4 KB and passes, while a compact signature on clean paper reaches about ' +
      '8.8 KB and falls under the 10 KB minimum. The deciding factor is how much INK is on the ' +
      'page — not how clean the scan is. So if this preset refuses, the fix is a larger box or a ' +
      'denser signature, never a further size reduction.',
    rules: [
      'Sign on plain white paper with a BLACK ink pen.',
      'NOT in capital letters — block capitals are rejected.',
      'Must be your own signature, and must match the one you sign at the exam.',
    ],
    note:
      'The official pixel box is 140 x 60 and the official window is 10-20 KB. These two pull ' +
      'against each other: at 8,400 pixels the floor demands 1.22 bytes per pixel, which only a ' +
      'dense signature reaches. The practical risk here is being UNDER 10 KB, not over 20 KB — ' +
      'every "reduce your file size" tutorial has this backwards.',
  },
  {
    id: 'ssc-signature-large',
    label: 'SSC — Signature (larger box, 6.0 x 2.0 cm)',
    group: 'SSC',
    document: 'Signature',
    width: pxFromCm(6.0, 200), // 472
    height: pxFromCm(2.0, 200), // 157
    minKB: 10,
    maxKB: 20,
    format: 'image/jpeg',
    status: 'UNVERIFIED',
    source: 'ssc.gov.in candidate portal (OTR), via the channel owner — not in the official PDF',
    verifiedOn: null,
    measuredOver: SCAN_SWEEP,
    measuredOn: MEASURED_ON,
    measuredWith: MEASURED_WITH,
    // 33.0-55.9 KB at q=1.0 over the same 28 combinations — every input clears the
    // 10 KB floor by at least 3.3x, and the search only needs quality 0.93-1.00 to
    // bring the result under the 20 KB ceiling. Comfortable on both bounds.
    feasibility: 'comfortable',
    rules: [
      'Sign on plain white paper with a BLACK ink pen.',
      'NOT in capital letters — block capitals are rejected.',
    ],
    note:
      'The official PDF gives NO printed size for the signature, only 140 x 60 pixels. This ' +
      'entry is the 6.0 cm x 2.0 cm figure quoted on the portal, read at a 200 dpi scan. Note ' +
      'the aspect ratio differs from the official box (3.0:1 against 2.33:1), so the crop is not ' +
      'identical. This is the preset to use when the official box cannot hold 10 KB.',
  },
  {
    id: 'ssc-photo',
    label: 'SSC — Photograph',
    group: 'SSC',
    document: 'Photo',
    width: 200,
    height: 230,
    minKB: 20,
    maxKB: 50,
    format: 'image/jpeg',
    status: 'VERIFIED',
    source: SSC_PDF,
    verifiedOn: SSC_PDF_DATE,
    measuredOver: PHOTO_SWEEP,
    measuredOn: MEASURED_ON,
    measuredWith: MEASURED_WITH,
    // 25.7 KB at q=1.0, i.e. 1.29x the 20 KB floor. Comfortable.
    feasibility: 'comfortable',
    preferLarger: 'ssc-photo-large',
    // SSC requires the photograph to be captured live through a webcam or the
    // MySSC app. No prepared file can satisfy that, so the tool must refuse
    // rather than quietly produce something that will be rejected.
    liveCaptureOnly: true,
    rules: [
      'Plain light-coloured background, preferably white.',
      'No caps, no masks, and no spectacles — even if you wear them daily.',
      'Captured LIVE through the portal webcam, or the MySSC mobile app.',
    ],
    note:
      'The official PDF states 4.5 cm x 3.5 cm AND "200 x 230 pixels (preferred)". ' +
      '4.5 x 3.5 cm is landscape and 200 x 230 px is portrait, so the two figures disagree — the ' +
      'same contradiction appears in the IBPS notes. Both pixel figures in the PDF carry the word ' +
      '"(preferred)". Separately, the PDF mandates a LIVE capture for the photograph, so this ' +
      'preset exists to tell the truth about that requirement, not to produce a file.',
  },
  {
    id: 'ssc-photo-large',
    label: 'SSC — Photograph (larger box, 3.5 x 4.5 cm)',
    group: 'SSC',
    document: 'Photo',
    width: pxFromCm(3.5, 300), // 413
    height: pxFromCm(4.5, 300), // 531
    minKB: 20,
    maxKB: 50,
    format: 'image/jpeg',
    status: 'UNVERIFIED',
    source: 'the same PDF figure read as a printed size at 300 dpi',
    verifiedOn: null,
    measuredOver: PHOTO_SWEEP,
    measuredOn: MEASURED_ON,
    measuredWith: MEASURED_WITH,
    // 151.2 KB at q=1.0 against a 20-50 KB window: clears the floor by 7.6x, and
    // reaches the ceiling at quality 0.945, so legibility is not at risk.
    feasibility: 'comfortable',
    rules: ['Print quality only — the portal still requires a LIVE capture.'],
    note:
      'The printed-size reading of the photograph requirement. Portrait, matching the 200 x 230 ' +
      'orientation. Kept for completeness and for print use; it does NOT get around the live ' +
      'capture rule.',
  },
  {
    id: 'ssc-lti',
    label: 'SSC — Left thumb impression',
    group: 'SSC',
    document: 'Thumb impression',
    width: 240,
    height: 240,
    minKB: 20,
    maxKB: 50,
    format: 'image/jpeg',
    status: 'VERIFIED',
    source: SSC_PDF,
    verifiedOn: SSC_PDF_DATE,
    measuredOver: THUMB_SWEEP,
    measuredOn: MEASURED_ON,
    measuredWith: MEASURED_WITH,
    // 26.2-34.7 KB at q=1.0, i.e. 1.31x-1.74x the 20 KB floor. Comfortable.
    feasibility: 'comfortable',
    rules: [
      'Left thumb, on white paper, black or blue ink.',
      '240 x 240 px at 200 dpi, i.e. 3 cm x 3 cm.',
      'No left thumb? Use the right. No thumbs? A left-hand finger from the forefinger. ' +
        'No fingers? A left toe. In every such case write the finger and hand on the document.',
    ],
    note:
      'This one is internally consistent: 240 px at 200 dpi is 3.05 cm, which matches the stated ' +
      '3 cm x 3 cm. Square 1:1 crop.',
  },
  {
    id: 'ssc-declaration',
    label: 'SSC — Handwritten declaration',
    group: 'SSC',
    document: 'Declaration',
    width: 800,
    height: 400,
    minKB: 50,
    maxKB: 100,
    format: 'image/jpeg',
    status: 'VERIFIED',
    source: SSC_PDF,
    verifiedOn: SSC_PDF_DATE,
    measuredOver: TEXT_SWEEP,
    measuredOn: MEASURED_ON,
    measuredWith: MEASURED_WITH,
    // 180.8-323.5 KB at q=1.0. Clears the 50 KB floor by 3.6x; reaches the 100 KB
    // ceiling at quality 0.915-0.985, so the writing stays sharp.
    feasibility: 'comfortable',
    rules: [
      'Written in ENGLISH, in your own handwriting, with black ink.',
      'NOT in capital letters.',
      'If written by anybody else, or in any other language, the application is INVALID.',
      'Cannot write? Get it typed, put your left thumb impression below it, then upload.',
    ],
    note:
      'This one is also internally consistent: 800 x 400 px at 200 dpi is 10.16 x 5.08 cm, ' +
      'matching the stated 10 cm x 5 cm. Text must stay legible, so check it by eye as well as ' +
      'by size. The tool copies the exact wording into the page so you can copy it by hand.',
  },

  /* ------------------------------------------------------------------ IBPS */
  {
    id: 'ibps-signature',
    label: 'IBPS — Signature',
    group: 'IBPS',
    document: 'Signature',
    width: 140,
    height: 60,
    minKB: 10,
    maxKB: 20,
    format: 'image/jpeg',
    status: 'UNVERIFIED',
    source: 'gov_portals_master_research.txt (Part B)',
    verifiedOn: null,
    measuredOver: SCAN_SWEEP,
    measuredOn: MEASURED_ON,
    measuredWith: MEASURED_WITH,
    // Identical box and window to the SSC signature, so identical measurement:
    // 8.3-13.4 KB across 28 combinations, some above the floor and some below.
    feasibility: 'marginal',
    // No larger reading is documented for IBPS, so none is offered. Saying so
    // explicitly is required, rather than inventing a dimension to satisfy a
    // check. See _verify/check_specs.mjs.
    noLargerReading:
      'The research note records only the 140x60 pixel box for IBPS. No printed size is given, ' +
      'so there is no documented larger reading to offer. If the IBPS portal states one, add it ' +
      'here and link it with preferLarger.',
    riskNote:
      'Identical pixel box and size window to the SSC signature, and therefore the identical ' +
      'measured problem: an elaborate signature clears 10 KB, a compact one does not. There is ' +
      'no documented larger reading for IBPS, so the only lever here is a denser signature.',
    rules: ['Black ink only.', 'Block capitals are rejected.'],
    warning:
      'This figure comes from your own research notes, not from an official IBPS document. It is ' +
      'IDENTICAL to the SSC signature spec, which suggests the note copied the SSC template. ' +
      'Check the live IBPS upload screen before presenting this as fact.',
    note:
      'Same pixel box as the SSC signature, and the same measured problem: at 140 x 60 the 10 KB ' +
      'floor needs more ink than a compact signature puts on the page.',
  },
  {
    id: 'ibps-photo',
    label: 'IBPS — Photograph (as stated in the notes)',
    group: 'IBPS',
    document: 'Photo',
    width: 200,
    height: 230,
    minKB: 20,
    maxKB: 50,
    format: 'image/jpeg',
    status: 'UNVERIFIED',
    source: 'gov_portals_master_research.txt (Part B4)',
    verifiedOn: null,
    measuredOver: PHOTO_SWEEP,
    measuredOn: MEASURED_ON,
    measuredWith: MEASURED_WITH,
    // 25.7 KB at q=1.0, 1.29x the floor. Comfortable.
    feasibility: 'comfortable',
    preferLarger: 'ibps-photo-cm',
    rules: ['Passport-style colour photograph.', 'Beyond the size, the notes carry no detail — check the portal.'],
    warning:
      'The note states "4.5cm x 3.5cm, 20-50 KB, 200x230 pixels". 4.5 x 3.5 cm is LANDSCAPE and ' +
      '200 x 230 px is PORTRAIT. They cannot both be right. This entry is the pixel reading.',
    note:
      'The identical contradiction appears in the official SSC PDF, so this is standard ' +
      'boilerplate confusion rather than a one-off typo. See the cm reading below.',
  },
  {
    id: 'ibps-photo-cm',
    label: 'IBPS — Photograph (cm reading)',
    group: 'IBPS',
    document: 'Photo',
    width: pxFromCm(4.5, 300), // 531
    height: pxFromCm(3.5, 300), // 413
    minKB: 20,
    maxKB: 50,
    format: 'image/jpeg',
    status: 'UNVERIFIED',
    source: 'same note, 4.5 cm x 3.5 cm interpreted at 300 dpi',
    verifiedOn: null,
    measuredOver: PHOTO_SWEEP,
    measuredOn: MEASURED_ON,
    measuredWith: MEASURED_WITH,
    // 127.3 KB at q=1.0 against a 20-50 KB window; reaches the ceiling at 0.965.
    feasibility: 'comfortable',
    rules: ['Landscape, matching the 4.5 x 3.5 cm reading.', 'Beyond the size, the notes carry no detail — check the portal.'],
    warning:
      'The other reading of the same contradictory note. One of the two is the real requirement.',
    note:
      'Read as a printed size rather than a pixel box. This is landscape, matching 4.5 x 3.5 cm. ' +
      'The upload screen decides which reading is correct.',
  },
  {
    id: 'ibps-lti',
    label: 'IBPS — Left thumb impression',
    group: 'IBPS',
    document: 'Thumb impression',
    width: 240,
    height: 240,
    minKB: 20,
    maxKB: 50,
    format: 'image/jpeg',
    status: 'UNVERIFIED',
    source: 'gov_portals_master_research.txt (Part B)',
    verifiedOn: null,
    measuredOver: THUMB_SWEEP,
    measuredOn: MEASURED_ON,
    measuredWith: MEASURED_WITH,
    // 26.2-34.7 KB at q=1.0, 1.31x-1.74x the floor. Comfortable.
    feasibility: 'comfortable',
    rules: ['Left thumb impression on white paper.', 'Beyond the size, the notes carry no detail — check the portal.'],
    warning:
      'This figure is identical to the SSC thumb-impression spec in the official PDF, which ' +
      'suggests the note copied the SSC template. Verify independently.',
    note: 'Square 1:1 crop.',
  },
  {
    id: 'ibps-declaration',
    label: 'IBPS — Handwritten declaration',
    group: 'IBPS',
    document: 'Declaration',
    width: 800,
    height: 400,
    minKB: 50,
    maxKB: 100,
    format: 'image/jpeg',
    status: 'UNVERIFIED',
    source: 'gov_portals_master_research.txt (Part B)',
    verifiedOn: null,
    measuredOver: TEXT_SWEEP,
    measuredOn: MEASURED_ON,
    measuredWith: MEASURED_WITH,
    // 180.8-323.5 KB at q=1.0; reaches the 100 KB ceiling at 0.915-0.985.
    feasibility: 'comfortable',
    rules: ['Handwritten, in English, NOT in capital letters.', 'Beyond the size, the notes carry no detail — check the portal.'],
    warning:
      'Identical to the SSC declaration spec in the official PDF. Verify independently.',
    note: 'Text must stay legible — check by eye as well as by size.',
  },

  /* ------------------------------------------------------------------ UPSC */
  {
    id: 'upsc-photo',
    label: 'UPSC — Photograph',
    group: 'UPSC',
    document: 'Photo',
    width: 500,
    height: 500,
    minKB: 20,
    maxKB: 300,
    format: 'image/jpeg',
    status: 'UNVERIFIED',
    source: 'gov_portals_master_research.txt (Part B2)',
    verifiedOn: null,
    measuredOver: PHOTO_SWEEP,
    measuredOn: MEASURED_ON,
    measuredWith: MEASURED_WITH,
    // 165.2 KB at q=1.0, inside the 20-300 KB window at quality 1.0.
    feasibility: 'comfortable',
    rules: ['Name and date of the photograph must be printed at the bottom of the photo.'],
    note:
      'The source gives 20-300 KB and a 350x350 to 1000x1000 range. 500x500 is a chosen ' +
      'mid-point inside that range, NOT a requirement — any size in the stated range is valid. ' +
      'The name-and-date overlay is not implemented in this tool yet.',
  },

  /* ---------------------------------------------------------------- Custom */
  {
    id: 'custom',
    label: 'Custom requirement',
    group: 'Custom',
    document: 'Any',
    width: 600,
    height: 600,
    minKB: 10,
    maxKB: 100,
    format: 'image/jpeg',
    status: 'CUSTOM',
    source: 'entered by the user',
    verifiedOn: null,
    rules: [],
    note: 'No preset claims. The tool only checks the numbers the user supplies.',
  },
];

export const getSpec = (id) => SPECS.find((s) => s.id === id);
