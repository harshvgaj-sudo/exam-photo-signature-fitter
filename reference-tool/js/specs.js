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
 *                  The document states these pixels and this window.
 *   'DERIVED'    — the source document states the requirement, but as a PRINTED
 *                  SIZE or a RANGE rather than as a pixel box. The pixel box is that
 *                  figure converted at a scan resolution THIS TOOL chose, so the
 *                  requirement is official and the resolution is ours. `dpi` records
 *                  the choice and the note must say so out loud. This is a weaker
 *                  claim than VERIFIED and must never be presented as one — the
 *                  distinction is the whole point of having the status.
 *   'UNVERIFIED' — taken from secondary sources / notes, or relayed second-hand and
 *                  never seen in a document. The UI must say so and must not tell
 *                  the user the file is "approved".
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
 *   IBPS — "Guidelines for scanning and Upload of Photograph, Signature, Left-Hand
 *          Thumb Impression & Hand-Written Declaration" (Annexure-II), official PDF,
 *          3 pages, read at ibpsreg.ibps.in, 2026-09-20. Corroborated by the
 *          separate "Guidelines for Scanning and Upload of Documents", 4 pages, on
 *          the same portal — two independent recruitments' guidelines agreeing.
 *   UPSC — "Instructions for Uploading the Photo & Signature", official PDF, 7
 *          pages, read at upsconline.nic.in, 2026-09-20; plus the OTR FAQ at
 *          upsconline.gov.in. THE TWO DISAGREE, and both are quoted below.
 *   RRB  — CEN No. 09/2025 (Level-1), para 16.5 / 16.5.1, official PDF, 74 pages,
 *          read at rrbajmer.gov.in, 2026-09-20.
 *   MPSC — "Instructions for Filling the Application Form", official PDF, 3 pages,
 *          read at mpsconline.gov.in, 2026-09-20.
 *
 * SECONDARY SOURCES (still UNVERIFIED):
 *   gov_portals_master_research.txt            Part B — exam photo/signature specs
 *   ssc_live_photo_signature_battle_sheet.txt  [0:45-2:00] — SSC scrutiny rules
 *   The ssc.gov.in OTR portal figure for the larger signature box, relayed by the
 *   channel owner. It is second-hand: the portal needs a login, so it was never
 *   read directly. That is why ssc-signature-large is still UNVERIFIED while its
 *   sibling ssc-photo-large is DERIVED — not because one is more useful, but
 *   because one figure was seen in a document and the other was not.
 *
 * WHY THE SECONDARY SOURCES ARE NOT TRUSTED FOR THE NEW ENTRIES
 * Searching for "RRB signature size" and "MPSC photo size" returns dozens of
 * "photo resizer" sites, and they contradict each other on every exam: RRB is
 * quoted as 30-49 KB by one and 10-20 KB (the SSC numbers) by another; MPSC is
 * quoted as "max 50 KB", "20-50 KB" and "125-130 px wide" across three pages; UPSC
 * is quoted as 20-300 KB and, for the signature, as both 350x350 and 140x60. Those
 * sites are the thing this project exists to beat, so every number added below was
 * read out of the government document itself, and every place where the official
 * documents contradict THEMSELVES or EACH OTHER is recorded rather than smoothed
 * over.
 *
 * WHAT THE IBPS READING CHANGED
 * The four IBPS entries were UNVERIFIED and each carried a warning saying the
 * figure was "IDENTICAL to the SSC spec, which suggests the note copied the SSC
 * template". That suspicion was reasonable, and it was WRONG: IBPS genuinely
 * publishes the same numbers, deliberately. So the warnings are gone, and the
 * finding is the opposite of the one the notes expected — learn one set of numbers,
 * use it on both. Two things the notes missed entirely: IBPS ALSO requires a live
 * photograph in addition to the scanned one, and it sets a 200 dpi scanning floor.
 */

/** Pixel dimensions derived from a printed size, given an assumed scan resolution. */
export function pxFromCm(cm, dpi) {
  return Math.round((cm / 2.54) * dpi);
}

const SSC_PDF = 'SSC "Guidelines for scanning and Upload of Documents" (official PDF, 4 pages)';
const SSC_PDF_DATE = '2026-09-14';
const IBPS_PDF =
  'IBPS "Guidelines for scanning and Upload of Photograph, Signature, Left-Hand Thumb Impression ' +
  '& Hand-Written Declaration" (Annexure-II, official PDF, 3 pages), ibpsreg.ibps.in';
const IBPS_PDF_DATE = '2026-09-20';
const UPSC_INSTR =
  'UPSC "Instructions for Uploading the Photo & Signature" (official PDF, 7 pages), upsconline.nic.in';
const UPSC_INSTR_DATE = '2026-09-20';
const UPSC_FAQ = 'UPSC OTR FAQ Q44 — upsconline.gov.in';
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
 * The sweep grids. `grain` is capture quality (0 = clean, 32 = noisy phone photo);
 * `density` is how much ink is on the page. Two independent axes, because a dense
 * signature on clean paper and a sparse one on noisy paper are both ordinary
 * documents and they land at opposite ends of the size range.
 *
 * PHOTO_SWEEP used to be a single point — `grain: [12]` — because makePhoto had no
 * grain parameter, so several levels would have produced the same image several
 * times over. classifySweep() states the rule that violated: one measurement cannot
 * separate 'marginal' from 'comfortable', because input variation is the whole
 * question. A photograph is the case where that matters most, since capture quality
 * directly controls the file size, so the fixture now takes the axis and all five
 * photo entries are measured over it. See _verify/probe_photo_sweep.mjs.
 */
const SCAN_SWEEP = { fixture: 'scan', grain: [0, 4, 8, 12, 16, 24, 32], density: [1, 2, 4, 6] };
const THUMB_SWEEP = { fixture: 'thumb', grain: [0, 4, 8, 12, 16, 24, 32] };
const TEXT_SWEEP = { fixture: 'text', grain: [0, 4, 8, 12, 16, 24, 32] };
const PHOTO_SWEEP = { fixture: 'photo', grain: [0, 6, 12, 20, 32] };
const TRIPLE_SWEEP = { fixture: 'triple', grain: [0, 4, 8, 12, 16, 24, 32], density: [1, 2, 4, 6] };

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
    // MEASURED over the 5-point capture-quality sweep: 24.2-28.4 KB, worst input
    // 1.21x the 20 KB floor. The worst input is grain 0 — the CLEAN capture —
    // because smooth areas are what JPEG encodes most cheaply, so a pristine phone
    // photo is the case closest to the floor. Comfortable, but only just.
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
    // DERIVED, not UNVERIFIED: the printed size 4.5 x 3.5 cm IS in the official
    // PDF, next to the 200 x 230 pixel box. What the PDF does not state is a scan
    // resolution, so the pixel box is that printed size read at a resolution this
    // tool chose.
    status: 'DERIVED',
    source: SSC_PDF,
    verifiedOn: SSC_PDF_DATE,
    dpi: 300,
    measuredOver: PHOTO_SWEEP,
    measuredOn: MEASURED_ON,
    measuredWith: MEASURED_WITH,
    // MEASURED over the 5-point capture-quality sweep: 145.9-165.8 KB against a
    // 20-50 KB window. Clears the floor by 7.30x, and reaches the ceiling at
    // quality 0.935-0.955, so nothing is crushed to get there.
    feasibility: 'comfortable',
    rules: ['Print quality only — the portal still requires a LIVE capture.'],
    note:
      'The printed-size reading of the photograph requirement: the PDF states 4.5 cm x 3.5 cm ' +
      'alongside "200 x 230 pixels (preferred)", and this entry is that printed size read at ' +
      '300 dpi. Two things are choices rather than quotations. The dpi is ours — the PDF states ' +
      'no scan resolution — and so is the orientation: the PDF writes the size as 4.5 x 3.5 cm, ' +
      'which is LANDSCAPE, while this entry renders it PORTRAIT to match the 200 x 230 pixel ' +
      'figure it sits beside. The two official figures disagree about orientation and this entry ' +
      'follows the pixel one. It is kept for print use and does NOT get around the live capture ' +
      'rule — see ssc-photo.',
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
    // The exact wording is a requirement, not decoration, so it lives on the entry
    // and the UI renders whatever the entry carries. IBPS uses different wording.
    declarationText: DECLARATION_TEXT,
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
    status: 'VERIFIED',
    source: IBPS_PDF,
    verifiedOn: IBPS_PDF_DATE,
    measuredOver: SCAN_SWEEP,
    measuredOn: MEASURED_ON,
    measuredWith: MEASURED_WITH,
    // MEASURED over the same 28-combination scan sweep: 6.4-13.5 KB, 7 of the 28
    // clearing the 10 KB floor. The SSC entry measures 6.1-13.4 KB over the same
    // grid — near-identical, because the box and the window are identical.
    feasibility: 'marginal',
    // IBPS states no printed size for the signature, so there is no larger
    // documented box to offer. Saying so explicitly is required, rather than
    // inventing a dimension to satisfy a check. See _verify/check_specs.mjs.
    noLargerReading:
      'The IBPS guideline states only "Dimensions 140 x 60 pixels (preferred)" and gives no ' +
      'printed size, so there is no documented larger box to switch to. If an IBPS notification ' +
      'states one, add it here and link it with preferLarger.',
    riskNote:
      'Identical pixel box and size window to the SSC signature, and therefore the same measured ' +
      'problem: only some of the 28 scan-noise x ink-density combinations reach the 10 KB floor. ' +
      'IBPS documents no larger box, so there is no alternative reading to offer. The risk here ' +
      'is being UNDER 10 KB, not over 20 KB, so never shrink the file further. Note also that the ' +
      'document marks the 140 x 60 box "(preferred)" while stating the 10-20 KB window as a hard ' +
      'gate — "Your Online Application will not be registered unless you upload your Photograph, ' +
      'Signature, ... as specified".',
    rules: [
      'Sign in black ink on white paper.',
      'Signed by you only — not by any other person.',
      'Signature in CAPITAL LETTERS shall NOT be accepted.',
      'Must match the signature you sign on the attendance sheet or call letter at the exam; a ' +
        'mismatch is stated grounds for disqualification.',
    ],
    note:
      'Same pixel box as the SSC signature, and the same measured problem: at 140 x 60 the 10 KB ' +
      'floor needs more ink than a compact signature puts on the page. Worth knowing that this is ' +
      'not a coincidence and not a copy-paste error in anyone\'s notes: IBPS and SSC genuinely ' +
      'publish the same four numbers, so learning one set covers both exams.',
  },
  {
    id: 'ibps-photo',
    label: 'IBPS — Photograph',
    group: 'IBPS',
    document: 'Photo',
    width: 200,
    height: 230,
    minKB: 20,
    maxKB: 50,
    format: 'image/jpeg',
    status: 'VERIFIED',
    source: IBPS_PDF,
    verifiedOn: IBPS_PDF_DATE,
    measuredOver: PHOTO_SWEEP,
    measuredOn: MEASURED_ON,
    measuredWith: MEASURED_WITH,
    // MEASURED over the 5-point capture-quality sweep: 24.2-28.4 KB, worst input
    // 1.21x the floor. The worst input is grain 0 — the CLEAN capture — because
    // smooth areas are what JPEG encodes most cheaply. Comfortable, but the
    // thinnest margin of any photo box here: the risk is the 20 KB floor, not the
    // 50 KB ceiling.
    feasibility: 'comfortable',
    preferLarger: 'ibps-photo-cm',
    rules: [
      'Recent passport-style COLOUR photograph.',
      'Light-coloured background, preferably white.',
      'Look straight at the camera with a relaxed face.',
      'Caps, hats and dark glasses are not acceptable. Religious headwear is allowed but must not ' +
        'cover the face.',
      'If you wear glasses, there must be no reflection and your eyes must be clearly visible.',
      'No "red-eye" if a flash was used.',
      'Scan at a MINIMUM of 200 dpi.',
    ],
    warning:
      'IBPS ALSO requires a live photograph — captured through the webcam on the portal, or by ' +
      'scanning a QR code to open the capture page on your phone — IN ADDITION to this scanned ' +
      'file. This is not the same arrangement as SSC, where the photograph is live-capture only. ' +
      'This preset prepares the scanned photograph; the live capture happens on the portal itself.',
    note:
      'The guideline states both "Photograph (4.5cm × 3.5cm)" and "Dimensions 200 x 230 pixels ' +
      '(preferred)". 4.5 x 3.5 cm is LANDSCAPE and 200 x 230 px is PORTRAIT, so the two cannot ' +
      'both be right — and the identical contradiction appears in the official SSC document, so ' +
      'this is shared template wording rather than a one-off typo. This entry is the pixel ' +
      'reading. Note the word "(preferred)": the pixel box is stated as a preference, while the ' +
      '20-50 KB window is enforced — "Your Online Application will not be registered unless you ' +
      'upload your Photograph, Signature, Left-Hand Thumb Impression & Hand-Written Declaration ' +
      'as specified".',
  },
  {
    id: 'ibps-photo-cm',
    label: 'IBPS — Photograph (cm reading, landscape)',
    group: 'IBPS',
    document: 'Photo',
    width: pxFromCm(4.5, 200), // 354 — the stated 4.5 cm width at 200 dpi
    height: pxFromCm(3.5, 200), // 276 — the stated 3.5 cm height at 200 dpi
    minKB: 20,
    maxKB: 50,
    format: 'image/jpeg',
    // DERIVED: "Photograph (4.5cm × 3.5cm)" IS in the official guideline. What it
    // does not state is a scan resolution, so the pixel box is that printed size at
    // a resolution this tool chose.
    status: 'DERIVED',
    source: IBPS_PDF,
    verifiedOn: IBPS_PDF_DATE,
    dpi: 200,
    measuredOver: PHOTO_SWEEP,
    measuredOn: MEASURED_ON,
    measuredWith: MEASURED_WITH,
    // MEASURED over the 5-point capture-quality sweep: 49.2-57.5 KB, worst input
    // 2.46x the floor. Comfortable on both bounds.
    feasibility: 'comfortable',
    rules: [
      'Landscape, matching the 4.5 x 3.5 cm reading the guideline states.',
      'Same photograph rules as the pixel reading: colour, light background, no cap or dark glasses.',
    ],
    warning:
      'The other reading of the same contradictory guideline. One of the two is the real ' +
      'requirement, and only the upload screen decides which — so if one is refused, try the other.',
    note:
      'Read as a printed size rather than a pixel box: the guideline\'s "4.5cm × 3.5cm", landscape, ' +
      'at 200 dpi. The resolution is a choice this tool made, and 200 dpi is chosen because it is ' +
      'IBPS\'s OWN convention — the same document sets the scanner to "a minimum of 200 dpi" and ' +
      'gives its thumb-impression and declaration boxes "in 200 DPI". It is a larger box than the ' +
      '200 x 230 pixel reading (97,704 pixels against 46,000), so it is the one to try when the ' +
      'preferred box will not hold the window.',
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
    status: 'VERIFIED',
    source: IBPS_PDF,
    verifiedOn: IBPS_PDF_DATE,
    measuredOver: THUMB_SWEEP,
    measuredOn: MEASURED_ON,
    measuredWith: MEASURED_WITH,
    // MEASURED over the 7-point capture-quality sweep: 26.2-34.7 KB, worst input
    // 1.31x the 20 KB floor. Comfortable. Identical to the SSC thumb entry, as
    // expected — the box and window are the same.
    feasibility: 'comfortable',
    rules: [
      'Left thumb impression on white paper, in black or blue ink.',
      '240 x 240 px at 200 DPI, i.e. 3 cm x 3 cm.',
      'No left thumb? Use the right. Both missing? One finger of the left hand from the ' +
        'forefinger. No left fingers? One from the right hand. No fingers at all? The left toe.',
      'In every case where the LEFT THUMB is not what you uploaded, write the name of the finger ' +
        'and which hand or toe it is on the uploaded document itself.',
    ],
    note:
      'This one is internally consistent, and it is the only one of the four IBPS figures that ' +
      'states its own resolution: "240 x 240 pixels in 200 DPI ... i.e 3 cm * 3 cm". 240 px at ' +
      '200 dpi is 3.05 cm, which matches the stated 3 cm. Square 1:1 crop.',
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
    status: 'VERIFIED',
    source: IBPS_PDF,
    verifiedOn: IBPS_PDF_DATE,
    // Which wording to show is a real question for IBPS: the two IBPS guideline
    // documents on the portal give DIFFERENT declaration texts. This is the wording
    // both of them share (and which SSC also uses); the other variant is quoted in
    // the note. So the box is driven by this field rather than by status, which is
    // what it used to be keyed off.
    declarationText: DECLARATION_TEXT,
    measuredOver: TEXT_SWEEP,
    measuredOn: MEASURED_ON,
    measuredWith: MEASURED_WITH,
    // MEASURED over the 7-point capture-quality sweep: 180.8-323.5 KB. Clears the
    // 50 KB floor by 3.6x and reaches the 100 KB ceiling at quality 0.915-0.985,
    // so the writing stays sharp. Same numbers as the SSC declaration.
    feasibility: 'comfortable',
    rules: [
      'Written by you, in ENGLISH, on white paper with black ink.',
      'NOT in capital letters — a declaration in capital letters shall NOT be accepted.',
      'If written by anybody else, or in any other language, the application will be ' +
        'considered INVALID.',
      '800 x 400 px in 200 DPI, i.e. 10 cm x 5 cm.',
      'Cannot write? Get the text typed, put your left-hand thumb impression below it, and ' +
        'upload that.',
    ],
    note:
      'Text must stay legible — check it by eye as well as by size. ' +
      'One caution worth knowing: IBPS is not consistent with itself here. The guideline this ' +
      'preset quotes gives the text shown below, while the other IBPS guideline on the same ' +
      'portal adds the candidate\'s date of birth and a closing sentence — "I, ____ (Name of the ' +
      'candidate), ____ (Date of Birth) hereby declare that all the information submitted by me ' +
      'in the application form is correct, true and valid. I will present the supporting documents ' +
      'as and when required. The signature, photograph and left-hand thumb impression is of ' +
      'mine." Copy the wording printed in your own notification, not a generic one.',
  },

  /* ------------------------------------------------------------------ UPSC */
  /*
   * READ FROM TWO OFFICIAL UPSC DOCUMENTS, 2026-09-20 — AND THEY DISAGREE.
   *
   *   "Instructions for Uploading the Photo & Signature" (upsconline.nic.in)
   *       Photograph      : jpg, 20 KB - 200 KB. No pixel dimensions at all;
   *                         instead a 3/4 FACE COVERAGE rule (face >= 75% of the
   *                         image), plain white background, "Photograph is NOT to
   *                         be signed".
   *       Live photograph : MANDATORY, webcam or QR-to-phone, and MATCHED against
   *                         the uploaded photograph. A mismatch stops the
   *                         application.
   *       Signature       : TRIPLE — sign the same signature three times vertically
   *                         on one sheet, scan all three as a SINGLE image,
   *                         20 KB - 100 KB, image dimensions 350 - 500 pixels.
   *
   *   OTR FAQ Q44 (upsconline.gov.in)
   *       "Each of the scanned images of the Photograph / Signature should not
   *        exceed 300 KB and must not be less than 20 KB in size. The resolution of
   *        Photograph and Signature are 350 pixel (Width) * 350 pixel (Height)
   *        minimum and 1000 pixel (Width) * 1000 pixel (Height) maximum."
   *
   * WHERE THE TWO CONFLICT, THE PRESETS SHIP THE INTERSECTION.
   * A file inside the intersection satisfies BOTH documents. A file inside only the
   * FAQ's range satisfies the FAQ and fails the instructions, which is the newer
   * document and the one describing the form candidates actually fill in.
   *   photograph : 20-200 KB   (FAQ allows up to 300; the instructions cap at 200)
   *   signature  : 20-100 KB   (FAQ allows up to 300; the instructions cap at 100)
   *   dimensions : 350-500 px  (FAQ allows up to 1000; the instructions cap at 500)
   * That is a deliberate, defensible choice rather than an average, and it is the
   * reason the signature box is 350x350: it is inside the range BOTH documents
   * state, and _verify/probe_upsc_sig_box.mjs measures every square in it.
   *
   * The FAQ also says something no other portal here says, and it is worth quoting
   * to a viewer: "UPSC is concerned with identification of a candidate at the Exam
   * Hall based on the images uploaded by the candidate and not to cancel the
   * candidature based on the size or color of ink used." So at UPSC the size window
   * is an upload constraint, NOT stated grounds for rejection — the opposite of
   * SSC, IBPS and RRB, where it is. The presets still enforce it, because the
   * upload will refuse the file regardless of why.
   *
   * WHAT WAS REMOVED: the previous upsc-photo rule read "Name and date of the
   * photograph must be printed at the bottom of the photo." Neither official
   * document says that, the instructions' own DOs and DON'Ts list does not mention
   * it, and the secondary sites contradict each other about it in both directions.
   * It was an unsourced claim in a rules list, which is exactly what this registry
   * exists to keep out.
   */
  {
    id: 'upsc-photo',
    label: 'UPSC — Photograph',
    group: 'UPSC',
    document: 'Photo',
    width: 500,
    height: 500,
    // The intersection of the two official documents — see the block comment.
    minKB: 20,
    maxKB: 200,
    format: 'image/jpeg',
    status: 'VERIFIED',
    source: UPSC_INSTR,
    verifiedOn: UPSC_INSTR_DATE,
    measuredOver: PHOTO_SWEEP,
    measuredOn: MEASURED_ON,
    measuredWith: MEASURED_WITH,
    // MEASURED over the 5-point capture-quality sweep: 159.1-182.5 KB, worst input
    // 7.95x the 20 KB floor, and it fits the 200 KB ceiling at quality 1.0 without
    // any compression at all. Comfortable on both bounds.
    feasibility: 'comfortable',
    rules: [
      'Colour photo in JPG format, saved with the filename "photo".',
      'The face must cover at least 75% of the image — three-quarters face coverage.',
      'Plain white background. Frontal view, head centred, both ears visible.',
      'Eyes open and the edges of the face clearly visible.',
      'Natural expression — no grinning, frowning or raised eyebrows.',
      'Photograph is NOT to be signed.',
      'No dark background, no uniform, no dark or coloured glasses, no shadow on the face or ' +
        'background, no hair over the eyes, no glare on eyeglasses.',
    ],
    warning:
      'UPSC ALSO requires a LIVE photograph, captured through the webcam or by scanning a QR code ' +
      'onto your phone, and it is MANDATORY for every examination. It is then MATCHED against the ' +
      'passport photo you uploaded here — a mismatch stops the application. This preset prepares ' +
      'the uploaded photo; the live capture happens on the portal.',
    note:
      'The two official UPSC documents disagree on the ceiling and this preset takes the tighter ' +
      'one. The "Instructions for Uploading the Photo & Signature" state 20 KB - 200 KB; OTR FAQ ' +
      'Q44 states "should not exceed 300 KB and must not be less than 20 KB". 20-200 KB is inside ' +
      'both, so a file this tool produces cannot be refused for size by either. The pixel box is ' +
      'a different story: the instructions state NO pixel dimensions at all and impose a 3/4 face ' +
      'coverage rule instead, while the FAQ gives 350x350 minimum to 1000x1000 maximum. 500x500 ' +
      'is inside the FAQ range and is a chosen box, NOT a stated requirement — any size in that ' +
      'range is valid. The face-coverage rule is a composition requirement this tool cannot check, ' +
      'so it is stated here rather than enforced.',
  },

  {
    id: 'upsc-signature',
    label: 'UPSC — Signature (triple, one image)',
    group: 'UPSC',
    document: 'Signature',
    // The smallest square inside the 350-500 px range BOTH official documents state.
    // Measured, not assumed: probe_upsc_sig_box.mjs measures every square in the
    // range, and 350 is the one that needs the LEAST compression (quality
    // 0.995-1.000) while still clearing the floor on all 28 inputs by 1.87x.
    width: 350,
    height: 350,
    minKB: 20,
    maxKB: 100,
    format: 'image/jpeg',
    status: 'VERIFIED',
    source: UPSC_INSTR,
    verifiedOn: UPSC_INSTR_DATE,
    measuredOver: TRIPLE_SWEEP,
    measuredOn: MEASURED_ON,
    measuredWith: MEASURED_WITH,
    // MEASURED over the 28-combination sweep on a fixture that actually draws THREE
    // signatures rather than one: 37.4-111.1 KB, every one of 28 inputs clearing the
    // 20 KB floor (worst 1.87x), needing only quality 0.995-1.000 to stay under
    // 100 KB. See _verify/probe_upsc_sig_box.mjs for all four permitted squares.
    feasibility: 'comfortable',
    rules: [
      'Sign your own signature THREE times vertically, one below the other, on plain white paper.',
      'Black ink. Leave an adequate gap between each of the three.',
      'Scan all three signatures in a SINGLE image — three separate files will not do.',
      'Plain white paper with no lines and no colour.',
      'Must contain exactly three signatures, arranged vertically, correctly oriented — not ' +
        'rotated and not upside down.',
      'Clear, sharp and well lit: not blurred and not dark.',
      'Save as jpg with the filename "signature".',
    ],
    note:
      'This is not a signature requirement like the others, and it catches people out. UPSC asks ' +
      'for the SAME signature written three times, stacked vertically with a gap between them, all ' +
      'three scanned as ONE image — not one signature, and not three files. The window is ' +
      '20-100 KB, which is the tighter of the two official figures: OTR FAQ Q44 allows up to ' +
      '300 KB, while the "Instructions for Uploading the Photo & Signature" cap it at 100 KB. ' +
      'The pixel range is 350-500 px in the instructions and 350-1000 px in the FAQ, so this ' +
      'preset uses 350x350, inside both. ' +
      'Because it is three signatures on one sheet, the risk here runs the opposite way to the ' +
      'SSC and IBPS signature boxes: the file is three times the size and the ceiling is what ' +
      'bites, not the floor. ' +
      'One further caution: the instructions state flatly that "applications with signature files ' +
      'that do not meet the prescribed specifications will be rejected", while FAQ Q42 says UPSC ' +
      '"is concerned with identification of a candidate at the Exam Hall ... and not to cancel the ' +
      'candidature based on the size or color of ink used". The two official documents do not agree ' +
      'on how strict the size check is, so meet it exactly.',
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
