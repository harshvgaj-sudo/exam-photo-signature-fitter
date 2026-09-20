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

13 presets, each carrying its own provenance. The registry is deliberately honest about what has
been verified against a primary source and what has not:

| Status | Count | Meaning |
|---|---|---|
| `VERIFIED` | 4 | Checked against the official document |
| `UNVERIFIED` | 8 | From secondary sources — treat the numbers as a starting point |
| `CUSTOM` | 1 | You supply the dimensions and the size window |

SSC, IBPS and UPSC presets are included, plus a custom requirement. Each preset supports a deep
link (`?preset=ssc-signature`) so a specific requirement can be linked directly.

## One finding worth knowing

The official SSC signature box is **140 × 60 px with a 10–20 KB window**. Measured across a sweep of
realistic signature scans, only **7 of 28** inputs could reach the 10 KB floor at all.

The risk for this preset is being **under** 10 KB, not over 20 KB. Telling a candidate to "shrink the
signature" is exactly the wrong advice there — so the preset carries a caution, and offers the
larger documented box (472 × 157) when the compact one cannot hold the window.

## What this tool does not claim

It confirms that a file **meets the stated requirements**. It does **not** claim the portal will
accept it — that depends on the live portal, and only you can confirm it.

Some requirements cannot be met by uploading a file at all. SSC requires a **live photograph**
captured on the portal or via its app; for those presets the tool explains the rule and disables
the upload rather than producing a file that cannot be used.

## Development

```
index.html                 the landing page — one self-contained file, links into dist/
reference-tool/            the photo & signature tool (index.html, css/, js/core.js, js/specs.js, js/app.js)
tools/certificate-pdf/     the certificate tool (index.html, css/, js/pdf.js, js/app.js)
dist/                      the built single-file versions
bundler.mjs                the shared single-file bundler
build_single_file.mjs      builds dist/photo-signature-fitter.html
build_certificate_pdf.mjs  builds dist/certificate-to-pdf.html
_verify/                   the test suites
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

Twelve suites, including one that measures every registry claim **in a real browser** and fails if a
declared feasibility does not match the measurement. `_verify/full_run.txt` is the captured
transcript.

The landing page has its own suite (`_verify/test_landing.mjs`). It opens the page from `file://`
with no server, asserts that it makes **zero external requests**, then re-loads it under the exact
CSP from `netlify.toml` to prove the deployment does not break it. It also checks both themes
render, measures text contrast against WCAG AA, and asserts no horizontal overflow at 375 / 768 /
1024 / 1440 px. It carries a negative control: it plants an external request and requires the
detector to fire, so the check cannot silently become a no-op.

Note that `check_specs.mjs` regenerates its fixtures on every run (~90 MB of generated images, all
gitignored). If you want the working tree to stay small, run the suites only when you are changing
behaviour.

## Requirements

Any current Chrome, Edge, Firefox or Safari. The tool reads **JPEG and PNG**.

**Not HEIC.** iPhone photos are usually HEIC by default, and no browser other than Safari can decode
it — convert to JPEG first. The tool says so rather than failing silently.

## Licence and attribution

Not affiliated with SSC, IBPS, UPSC or any government body. Requirements are transcribed from the
official guidelines where a primary source was available, and marked otherwise. Always confirm the
current requirement on the official portal before uploading.
