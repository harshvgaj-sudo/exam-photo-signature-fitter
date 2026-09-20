# Exam Document Tools

Small, single-file browser tools that prepare documents for Indian government exam portals — and
**verify their own output** before offering it to you. Nothing is uploaded. There is no server.

## Tools

| Tool | File | What it does |
|---|---|---|
| **Photo & Signature Fitter** | `dist/photo-signature-fitter.html` | Resizes a photograph or signature to the **exact pixel dimensions** *and* the **exact file-size window** a portal requires, then re-reads the result from the file's own JPEG header. |
| **Certificate to PDF** | `dist/certificate-to-pdf.html` | Turns certificate photos into a **PDF, A4, under a size ceiling** — the format SSC requires for the 10th standard certificate. Embeds the JPEG without re-encoding, so small print stays sharp. |

Each is one self-contained file. Double-click it, or host it anywhere. No install, no build step to
use, and no network access at runtime.

## Quick start

Open `index.html` for the front page, or open the file you need directly from `dist/`.
Each tool is one self-contained file — that file *is* the whole tool. The front page is
one file too: no build step, no dependencies, no network requests.

## Why these exist

Most "compress your photo" tools enforce a **maximum** size. Government exam requirements are a
**window** — for example the SSC signature must be **between 10 KB and 20 KB**, at **exactly
140 × 60 pixels**.

Those two constraints fight each other:

- Pixel dimensions are a **hard constraint**. They cannot be traded away.
- File size is a **searchable window** with both a floor and a ceiling.

A tool that only caps the maximum will happily produce a 6 KB file for a 10 KB floor and report
success. That file is rejected by the portal, and the candidate has no idea why.

The certificate tool is the same idea in the other direction. SSC requires the 10th certificate as a
**PDF on an A4 page, not exceeding 500 KB** — and a phone produces a 3–5 MB JPEG that satisfies none
of those three. There, the pixel dimensions are *not* specified, so resolution is a free variable and
the tool spends it: it keeps the highest resolution that fits and only lowers JPEG quality when it
must.

So this tool does two things most do not:

1. It searches for a JPEG quality that lands **inside** the window — and **refuses, with a reason**,
   when no quality can.
2. It re-reads the finished file's dimensions from its own SOF marker before offering it, rather
   than trusting its own report.

## Presets

17 presets, each carrying its own provenance. The registry is deliberately honest about what has
been verified against a primary source and what has not:

| Status | Count | Meaning |
|---|---|---|
| `VERIFIED` | 13 | The document states these pixels and this window |
| `DERIVED` | 2 | The document states a **printed size**; the pixel box is that figure converted at a DPI this tool chose |
| `UNVERIFIED` | 1 | Relayed second-hand and never seen in a document — treat as a starting point |
| `CUSTOM` | 1 | You supply the dimensions and the size window |

`DERIVED` exists because the old two-value model was wrong in both directions. It called a box
"unverified" when the *requirement* was official and only the conversion was ours, which told a user
to distrust a number the government had actually published. The guard now requires a `dpi` and a note
from any `DERIVED` entry, so the part the document does not state is disclosed rather than buried.

SSC, IBPS, UPSC, RRB and MPSC presets are included, plus a custom requirement. Each preset supports
a deep link (`?preset=ssc-signature`) so a specific requirement can be linked directly.

Five government documents were read in full rather than summarised:

| Exam | Document | Read |
|---|---|---|
| SSC | "Guidelines for scanning and Upload of Documents" (4 pp) | 2026-09-14 |
| IBPS | "Guidelines for scanning and Upload of Photograph, Signature, Left-Hand Thumb Impression & Hand-Written Declaration" — Annexure-II (3 pp) | 2026-09-20 |
| UPSC | "Instructions for Uploading the Photo & Signature" (7 pp), plus OTR FAQ Q44 | 2026-09-20 |
| RRB | CEN No. 09/2025 (Level-1), para 16.5.1 (74 pp) | 2026-09-20 |
| MPSC | "Instructions for Filling the Application Form" (3 pp) | 2026-09-20 |

Searching for these numbers returns dozens of "photo resizer" pages, and they contradict each other
and the government PDFs. Every number above was read out of the PDF itself.

### IBPS publishes the same numbers as SSC

Four IBPS entries used to be `UNVERIFIED`, each carrying a warning that the figure was *"identical to
the SSC spec, which suggests the note copied the SSC template"*. That suspicion was reasonable and it
was **wrong**: the IBPS guideline states exactly the same four numbers, deliberately.

| | IBPS official | SSC official |
|---|---|---|
| Photograph | 200 × 230 px, 20–50 KB | 200 × 230 px, 20–50 KB |
| Signature | 140 × 60 px, 10–20 KB | 140 × 60 px, 10–20 KB |
| Thumb impression | 240 × 240 px @200 DPI, 20–50 KB | 240 × 240 px, 20–50 KB |
| Declaration | 800 × 400 px @200 DPI, 50–100 KB | 800 × 400 px @200 DPI, 50–100 KB |

Two things the notes missed entirely: IBPS requires a **live** photograph captured by webcam or QR
code **in addition to** the scanned one (unlike SSC, where the photograph is live-capture only and
there is nothing to prepare), and it sets a **200 DPI** minimum scan resolution.

### UPSC's two official documents disagree

| | Instructions PDF | OTR FAQ Q44 |
|---|---|---|
| Photograph | 20–200 KB | 20–300 KB |
| Signature | 20–100 KB | 20–300 KB |
| Dimensions | 350–500 px | 350–1000 px |

Where they conflict the presets ship the **intersection**, so a file produced here cannot be refused
for size by either document. The UPSC signature is also unlike any other requirement here: it is the
same signature written **three times**, stacked vertically, scanned as a single image — which is why
it is measured on a fixture that actually draws three signatures rather than one.

One rule was **removed** rather than verified: the old `upsc-photo` rule "Name and date of the
photograph must be printed at the bottom of the photo". Neither official document says it, the
instructions' own DOs and DON'Ts list does not mention it, and the secondary sites contradict each
other about it in both directions. It was an unsourced claim in a rules list.

### A requirement with a ceiling and no floor

MPSC says "Maximum size 50KB" and stops — there is no minimum. The tool needs a two-sided window, so
such an entry carries a sentinel and a `noMinimum` flag that the registry guard pins together, and
the interface prints **"under 50 KB (no minimum is stated)"** rather than a "1–50 KB" range. The
secondary sites that quote "20–50 KB" have invented the 20.

## Findings worth knowing

Every one of these was measured, not reasoned about, and each is reproducible from `_verify/`.

### The SSC signature box cannot hold its own minimum

The official SSC signature box is **140 × 60 px with a 10–20 KB window**. Measured across a sweep of
realistic signature scans, only **7 of 28** inputs could reach the 10 KB floor at all.

The risk for this preset is being **under** 10 KB, not over 20 KB. Telling a candidate to "shrink the
signature" is exactly the wrong advice there — so the preset carries a caution, and offers the
larger documented box (472 × 157) when the compact one cannot hold the window.

A second, less intuitive result came out of the same sweep: the size is **not monotonic in ink**. The
largest files came from a moderately elaborate signature (~13.4 KB), while the *densest* one measured
**smallest** (~6.1 KB) — at 140 × 60 a heavy signature downscales towards a solid block, and JPEG
encodes flat areas cheaply. So "write a denser signature" is not a reliable fix at that box, and the
preset no longer says so. See `_verify/probe_ink_axis.mjs`.

### RRB's stated minimum box contradicts RRB's stated minimum file size

CEN No. 09/2025, para 16.5.1 asks for a signature of **30–49 KB** with dimensions of **"Minimum 140
pixels (width) × 60 pixels (height)"**, a **minimum scan resolution of 100 DPI**, and a scan box of
**35 mm × 20 mm**. Those do not agree, and the disagreement is measurable:

| Scan resolution | Box | Best achievable over 28 inputs | Verdict |
|---|---|---|---|
| 100 DPI (the stated minimum) | 138 × 79 | 7.2 – 14.7 KB | **unreachable** |
| 200 DPI | 276 × 157 | 16.0 – 43.4 KB | marginal |
| 300 DPI | 413 × 236 | 25.4 – 86.2 KB | marginal |
| **400 DPI** | **551 × 315** | **35.2 – 127.1 KB** | **comfortable** |
| 500 DPI | 689 × 394 | 47.1 – 199.5 KB | comfortable |
| 600 DPI | 827 × 472 | 58.9 – 277.1 KB | comfortable |

At 140 × 60 the box is 8,400 pixels, so a 30 KB floor demands **3.66 bytes per pixel** — past what
JPEG can produce. The same box tops out near 13.4 KB on the SSC sweep, under half the floor. And at
the CEN's own minimum of 100 DPI its own 35 mm box is **137.8 px** wide — two pixels under its own
140 px minimum — producing at most 14.7 KB.

So the preset ships the reading that actually works: the CEN's own scan box at **400 DPI**, the
smallest resolution at which every one of 28 realistic inputs clears 30 KB (worst case 35.2 KB),
needing only JPEG quality 0.935–1.000 to stay under 49 KB. `_verify/probe_rrb_box.mjs` prints the
whole table above.

### The RRB photograph is not uploaded at all

Para 16.5 lists only two documents to keep ready for upload: the signature, and the SC/ST
certificate. The photograph is **captured live** by the portal's application module, and an
application carrying a photograph of a printed or on-screen image is *"summarily rejected"*. There is
therefore no RRB photo preset — the tool cannot produce a file for a requirement that does not accept
one.

## What this tool does not claim

It confirms that a file **meets the stated requirements**. It does **not** claim the portal will
accept it — that depends on the live portal, and only you can confirm it.

Some requirements cannot be met by uploading a file at all. SSC requires a **live photograph**
captured on the portal or via its app, and RRB captures the photograph live in its application
module; for those the tool explains the rule and disables the upload rather than producing a file
that cannot be used.

## Development

```
index.html                 the landing page — one self-contained file, links into dist/
reference-tool/            the photo & signature tool (index.html, css/, js/core.js, js/specs.js, js/app.js)
tools/certificate-pdf/     the certificate tool (index.html, css/, js/pdf.js, js/app.js)
dist/                      the built single-file versions
bundler.mjs                the shared single-file bundler
build_single_file.mjs      builds dist/photo-signature-fitter.html
build_certificate_pdf.mjs  builds dist/certificate-to-pdf.html
_verify/                   the test suites, plus the standalone probes
_verify/fixtures.mjs       the deterministic fixture generators, shared by every suite
```

`reference-tool/js/core.js` holds the pure logic — crop geometry, the quality search, and per-preset
compliance — with the encoder injected, so the same module runs in the browser and under Node.
`tools/certificate-pdf/js/pdf.js` is a deliberately minimal PDF writer: it embeds a JPEG using the
DCTDecode filter, so the image goes in **byte-for-byte** rather than being decoded and re-compressed.
That keeps small print sharp and makes the output size predictable, which is what makes a size
ceiling something you can search for rather than guess at.

Run everything:

```bash
node _verify/run_all.mjs
```

Thirteen suites, including one that measures every registry claim **in a real browser** and fails if a
declared feasibility does not match the measurement. `_verify/full_run.txt` is the captured
transcript.

The landing page has its own suite (`_verify/test_landing.mjs`). It opens the page from `file://`
with no server, asserts that it makes **zero external requests**, then re-loads it under the exact
CSP from `netlify.toml` to prove the deployment does not break it. It also checks both themes
render, measures text contrast against WCAG AA, and asserts no horizontal overflow at 375 / 768 /
1024 / 1440 px. It carries a negative control: it plants an external request and requires the
detector to fire, so the check cannot silently become a no-op.

Note that `check_specs.mjs` regenerates its fixtures on every run (~65 MB of generated images, all
gitignored). If you want the working tree to stay small, run the suites only when you are changing
behaviour.

The suites assert the **verdict** for each preset (`comfortable` / `marginal`), not the prose that
describes it. To stop the prose drifting out of date, `check_specs.mjs` also prints a per-entry table
of the measured range, the JPEG quality needed to fit, and the worst input — paste from that rather
than from memory.

Four standalone probes print the raw grids behind the findings above:

| Probe | Answers |
|---|---|
| `_verify/probe_rrb_box.mjs` | Which scan resolution holds the RRB 30–49 KB window |
| `_verify/probe_ink_axis.mjs` | Whether "more ink" actually produces a larger signature file |
| `_verify/probe_upsc_sig_box.mjs` | Which square holds UPSC's triple-signature window |
| `_verify/probe_photo_sweep.mjs` | Whether the photo presets are comfortable on a real sweep or only on one fixture |

The last one exists because every photo preset declared a **one-point** sweep. `classifySweep()` says
in its own doc comment that "a single measurement cannot separate 'marginal' from 'comfortable'",
and the reason the sweep was one point was mechanical: `makePhoto()` had no grain parameter, so
asking for several grain levels produced the same image several times over. It has one now. Every
photo box turned out to be comfortable anyway — but it was an assertion before, and it is evidence now.

## Requirements

Any current Chrome, Edge, Firefox or Safari. The tool reads **JPEG and PNG**.

**Not HEIC.** iPhone photos are usually HEIC by default, and no browser other than Safari can decode
it — convert to JPEG first. The tool says so rather than failing silently.

## Licence and attribution

Not affiliated with SSC, IBPS, UPSC, RRB, MPSC or any government body. Requirements are transcribed
from the official guidelines where a primary source was available, and marked otherwise. Always
confirm the current requirement on the official portal before uploading.
