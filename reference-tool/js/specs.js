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
 * PRIMARY SOURCES:
 *   SSC  — "Guidelines for scanning and Upload of Documents", official PDF, 4 pages.
 *          Supplied by the channel owner, 2026-09-14.
 *   RRB  — CEN No. 09/2025 (Level-1), para 16.5 / 16.5.1, official PDF, 74 pages,
 *          read at rrbajmer.gov.in, 2026-09-20.
 *   MPSC — "Instructions for Filling the Application Form", official PDF, 3 pages,
 *          read at mpsconline.gov.in, 2026-09-20.
 *
 * SECONDARY SOURCES (still UNVERIFIED):
 *   gov_portals_master_research.txt            Part B — exam photo/signature specs
 *   ssc_live_photo_signature_battle_sheet.txt  [0:45-2:00] — SSC scrutiny rules
 *
 * WHY THE SECONDARY SOURCES ARE NOT TRUSTED FOR THE NEW ENTRIES
 * Searching for "RRB signature size" and "MPSC photo size" returns dozens of
 * "photo resizer" sites, and they contradict each other on both exams: RRB is
 * quoted as 140x60 / 30-49 KB by one and 140x60 / 30-49 KB by another but as
 * 140x60 / 10-20 KB (the SSC numbers) by a third; MPSC is quoted as "max 50 KB",
 * "20-50 KB" and "125-130 px wide" across three pages. Those sites are the thing
 * this project exists to beat, so every number added below was read out of the
 * government PDF itself, and the two places where the official documents
 * contradict THEMSELVES are recorded rather than smoothed over.
 */

/** Pixel dimensions derived from a printed size, given an assumed scan resolution. */
export function pxFromCm(cm, dpi) {
  return Math.round((cm / 2.54) * dpi);
}

const SSC_PDF = 'SSC "Guidelines for scanning and Upload of Documents" (official PDF, 4 pages)';
const SSC_PDF_DATE = '2026-09-14';
const RRB_CEN = 'RRB CEN No. 09/2025 (Level-1), para 16.5.1 — official PDF, rrbajmer.gov.in';
const RRB_CEN_DATE = '2026-09-20';
const MPSC_PDF = 'MPSC "Instructions for Filling the Application Form" — official PDF, mpsconline.gov.in';
const MPSC_PDF_DATE = '2026-09-20';
const MEASURED_ON = '2026-09-20';
const MEASURED_WITH = 'Chrome 152, _verify/browser_truth.mjs';

/**
 * The minimum to use when the source states a CEILING ONLY and no floor.
 *
 * The tool needs a window with two bounds, and every downstream check is written
 * against a floor. MPSC is the first requirement here that has no floor at all —
 * it says "Maximum size 50KB" and stops. Rather than invent a plausible-looking
 * minimum (the secondary sites all invent "20 KB", which the official document
 * does not say), such an entry declares `noMinimum: true` and sets minKB to this
 * sentinel, which is below any real JPEG. The guard pins the two together so the
 * sentinel cannot quietly turn into a claim, and the UI reads `noMinimum` and
 * prints "under 50 KB" instead of a "1-50 KB" range that would imply a floor.
 */
export const NO_MINIMUM_KB = 1;

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
    //   best achievable at q=1.0 ranges from 6.1 KB to 13.4 KB.
    // 7 of the 28 combinations reached the 10 KB floor; the other 21 fell short.
    // The ink axis is NOT monotonic — see the riskNote, and probe_ink_axis.mjs.
    feasibility: 'marginal',
    preferLarger: 'ssc-signature-large',
    riskNote:
      'Measured over 28 scan-noise x ink-density combinations: the best this box can do spans ' +
      '6.1-13.4 KB, and only 7 of the 28 reach the 10 KB floor. The spread is wide and it is NOT ' +
      'monotonic in ink — the largest files came from a moderately elaborate signature (about ' +
      '13.4 KB) while the densest one measured SMALLEST (about 6.1 KB), because at 140x60 a heavy ' +
      'signature downscales towards a solid block and JPEG encodes flat areas cheaply. So there is ' +
      'no reliable "add more ink" fix at this box. The reliable fix is the larger box, which ' +
      'passes on all 28 combinations.',
    rules: [
      'Sign on plain white paper with a BLACK ink pen.',
      'NOT in capital letters — block capitals are rejected.',
      'Must be your own signature, and must match the one you sign at the exam.',
    ],
    note:
      'The official pixel box is 140 x 60 and the official window is 10-20 KB. These two pull ' +
      'against each other: at 8,400 pixels the floor demands 1.22 bytes per pixel, and only some ' +
      'signatures reach it. The practical risk here is being UNDER 10 KB, not over 20 KB — ' +
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
    // 13.4-69.9 KB at q=1.0 over the same 28 combinations — the worst input clears
    // the 10 KB floor by 1.34x, and the search only needs quality 0.875-1.000 to
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
    // Identical box and window to the SSC signature, so near-identical measurement:
    // 6.4-13.5 KB across 28 combinations, 7 above the floor and 21 below.
    feasibility: 'marginal',
    // No larger reading is documented for IBPS, so none is offered. Saying so
    // explicitly is required, rather than inventing a dimension to satisfy a
    // check. See _verify/check_specs.mjs.
    noLargerReading:
      'The research note records only the 140x60 pixel box for IBPS. No printed size is given, ' +
      'so there is no documented larger reading to offer. If the IBPS portal states one, add it ' +
      'here and link it with preferLarger.',
    riskNote:
      'Identical pixel box and size window to the SSC signature, and therefore the same measured ' +
      'problem: 6.4-13.5 KB across 28 combinations, and only 7 reach the 10 KB floor. Unlike SSC, ' +
      'no larger reading is documented for IBPS, so there is no box to switch to — if your ' +
      'signature falls short at 140x60, no further adjustment inside this tool will fix it. Never ' +
      'shrink the file further: the risk here is being under 10 KB, not over 20 KB.',
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

  /* ------------------------------------------------------------------- RRB */
  {
    id: 'rrb-signature',
    label: 'RRB — Signature (CEN 09/2025)',
    group: 'RRB',
    document: 'Signature',
    width: pxFromCm(3.5, 400), // 551 — the CEN's own 35 mm scan box at 400 dpi
    height: pxFromCm(2.0, 400), // 315 — the CEN's own 20 mm scan box at 400 dpi
    minKB: 30,
    maxKB: 49,
    format: 'image/jpeg',
    status: 'VERIFIED',
    source: RRB_CEN,
    verifiedOn: RRB_CEN_DATE,
    measuredOver: SCAN_SWEEP,
    measuredOn: MEASURED_ON,
    measuredWith: MEASURED_WITH,
    // MEASURED, over the 28-combination scan sweep, at every resolution the CEN
    // permits (100 DPI is its stated minimum). See _verify/probe_rrb_box.mjs:
    //   100 dpi  138x79    7.2- 14.7 KB   0/28 pass   0.24x  unreachable
    //   200 dpi  276x157  16.0- 43.4 KB   9/28 pass   0.53x  marginal
    //   300 dpi  413x236  25.4- 86.2 KB  27/28 pass   0.85x  marginal
    //   400 dpi  551x315  35.2-127.1 KB  28/28 pass   1.17x  comfortable  <- chosen
    //   500 dpi  689x394  47.1-199.5 KB  28/28 pass   1.57x  comfortable
    //   600 dpi  827x472  58.9-277.1 KB  28/28 pass   1.96x  comfortable
    // 400 dpi is the smallest reading that clears the floor on EVERY input, and it
    // still needs only quality 0.935-1.000 to fit the 49 KB ceiling, so nothing is
    // crushed to get there. The first attempt at this entry used 300 dpi on a hand
    // extrapolation of bytes-per-pixel, which predicted 'comfortable' and measured
    // 'marginal' — the ratio is not constant across box sizes, because JPEG table
    // overhead dominates small images. That is why this one is measured.
    feasibility: 'comfortable',
    rules: [
      'Written by you, in black ink on white paper.',
      'Running handwriting (cursive / joined letters) — NOT block, capital or disjointed letters.',
      'Scanned at a minimum resolution of 100 DPI.',
      'Must match the signature you give at the exam, document verification, medical and appointment.',
      'A non-white background, non-black ink, a blank image, or a thumb impression in place of ' +
        'the signature is a stated ground for rejecting the application.',
    ],
    note:
      'The CEN gives the file size as 30-49 KB and the dimensions as "Minimum 140 pixels (width) ' +
      'x 60 pixels (height)", and it also fixes a scan box (35 mm x 20 mm) and a MINIMUM scan ' +
      'resolution of 100 DPI. Read together, those three rules contradict each other, and it was ' +
      'measured rather than argued: ' +
      '(1) 140 x 60 is 8,400 pixels, so a 30 KB floor demands 3.66 bytes per pixel — past what ' +
      'JPEG can produce. The identical box, measured on the SSC signature, tops out near 13.4 KB: ' +
      'under half the floor. So no file at the CEN\'s own minimum dimensions can meet its own ' +
      'minimum size. ' +
      '(2) At the CEN\'s own minimum scan resolution of 100 DPI, its own 35 mm box is 137.8 px ' +
      'wide — two pixels UNDER its own 140 px minimum — and the resulting 138 x 79 image tops out ' +
      'at 14.7 KB across the sweep, still under half the floor. ' +
      '(3) The box only becomes reliable at 400 DPI: 551 x 315 px, every one of 28 realistic ' +
      'inputs clearing the 30 KB floor (worst case 35.2 KB), needing only JPEG quality 0.935-1.000 ' +
      'to stay under 49 KB. That is the reading this preset uses. See _verify/probe_rrb_box.mjs ' +
      'for all six resolutions the CEN permits, measured. ' +
      'Separately, para 16.5 lists only the signature and the SC/ST certificate as documents to ' +
      'be uploaded. The RRB photograph is not uploaded at all — the portal captures it live ' +
      'through the application module, and an application carrying a photograph of a printed or ' +
      'screen image is "summarily rejected".',
  },

  /* ------------------------------------------------------------------ MPSC */
  {
    id: 'mpsc-photo',
    label: 'MPSC — Photograph',
    group: 'MPSC',
    document: 'Photo',
    width: pxFromCm(3.5, 200), // 276 — the stated 3.5 cm breadth at 200 dpi
    height: pxFromCm(4.5, 200), // 354 — the stated 4.5 cm height at 200 dpi
    minKB: NO_MINIMUM_KB,
    maxKB: 50,
    noMinimum: true,
    format: 'image/jpeg',
    status: 'VERIFIED',
    source: MPSC_PDF,
    verifiedOn: MPSC_PDF_DATE,
    measuredOver: PHOTO_SWEEP,
    measuredOn: MEASURED_ON,
    measuredWith: MEASURED_WITH,
    // A ceiling with no floor. There is no lower bound to fall under, so the only
    // real risk is legibility, which PART 3 of check_specs.mjs measures separately.
    feasibility: 'comfortable',
    rules: [
      'Passport-size colour photograph, in formals, full face view directly facing the camera.',
      'Solid-colour background — preferably blue, green or red.',
      'No shadows and no red-eye.',
      'No watermark, stamp, or the name of the scanning app anywhere on the image.',
      'The file name must be 10 characters or fewer.',
    ],
    note:
      'MPSC states the printed size (breadth 3.5 cm x height 4.5 cm) and "Maximum size 50KB", and ' +
      'no pixel dimensions and no scan resolution at all. So the pixel box here is the stated ' +
      'printed size read at 200 dpi — a conventional document-scan resolution, and an assumption ' +
      'this preset is labelled with rather than a figure the source gives. The portal appears to ' +
      'check only the format and the size, so the box is chosen to keep the file printable and ' +
      'sharp while staying inside 50 KB. Note the ceiling-only window: the source states no ' +
      'minimum, and the secondary sites that quote "20-50 KB" have invented the 20.',
  },
  {
    id: 'mpsc-signature',
    label: 'MPSC — Signature',
    group: 'MPSC',
    document: 'Signature',
    width: pxFromCm(3.5, 200), // 276 — the stated 3.5 cm breadth at 200 dpi
    height: pxFromCm(1.5, 200), // 118 — the stated 1.5 cm height at 200 dpi
    minKB: NO_MINIMUM_KB,
    maxKB: 50,
    noMinimum: true,
    format: 'image/jpeg',
    status: 'VERIFIED',
    source: MPSC_PDF,
    verifiedOn: MPSC_PDF_DATE,
    measuredOver: SCAN_SWEEP,
    measuredOn: MEASURED_ON,
    measuredWith: MEASURED_WITH,
    // Ceiling only, and a signature scan at this box reaches well under 50 KB at
    // maximum quality, so the search never has to compress it at all.
    feasibility: 'comfortable',
    rules: [
      'Sign in black ink on blank white paper, then scan it.',
      'Signed by you only — not by any other person.',
      'No watermark, stamp, or the name of the scanning app anywhere on the image.',
      'The file name must be 10 characters or fewer.',
    ],
    note:
      'Same ceiling-only window as the MPSC photograph: "Maximum size 50kb", with no minimum. ' +
      'The pixel box is the stated printed size (breadth 3.5 cm x height 1.5 cm) read at 200 dpi. ' +
      'The source document has a copy-paste error here — the signature section is headed ' +
      '"Photograph size (breadth 3.5 cm* height 1.5 cm)", reusing the photograph wording. The ' +
      'dimensions themselves are clearly the signature box, and are quoted as printed above. ' +
      'Two official documents, two different internal inconsistencies, neither one acknowledged ' +
      'in the document itself.',
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
