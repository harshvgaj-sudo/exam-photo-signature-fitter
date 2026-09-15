# Exam Photo & Signature Fitter

A single-page tool that resizes a photograph or signature to the **exact pixel dimensions** and the
**exact file-size window** that Indian government exam portals require — then verifies the result by
reading the dimensions back out of the file's own JPEG header.

Runs entirely in the browser. Nothing is uploaded. Works from a local file with no server.

## Quick start

Open **`dist/photo-signature-fitter.html`** — that is the whole tool, one self-contained file.

You can double-click it, email it, or host it. There is no build step to use it, no install, and no
network access at runtime.

## Why this exists

Most "compress your photo" tools enforce a **maximum** size. Government exam requirements are a
**window** — for example the SSC signature must be **between 10 KB and 20 KB**, at **exactly
140 × 60 pixels**.

Those two constraints fight each other:

- Pixel dimensions are a **hard constraint**. They cannot be traded away.
- File size is a **searchable window** with both a floor and a ceiling.

A tool that only caps the maximum will happily produce a 6 KB file for a 10 KB floor and report
success. That file is rejected by the portal, and the candidate has no idea why.

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
reference-tool/          the modular source (index.html, css/, js/core.js, js/specs.js, js/app.js)
dist/                    the built single-file version
build_single_file.mjs    inlines the modular source into dist/
_verify/                 the test suites
```

`js/core.js` holds the pure logic — crop geometry, the quality search, and per-preset compliance —
with the encoder injected, so the same module runs in the browser and under Node.

Run everything:

```bash
node _verify/run_all.mjs
```

Nine suites, including one that measures every registry claim **in a real browser** and fails if a
declared feasibility does not match the measurement. `_verify/full_run.txt` is the captured
transcript.

## Requirements

Any current Chrome, Edge, Firefox or Safari. The tool reads **JPEG and PNG**.

**Not HEIC.** iPhone photos are usually HEIC by default, and no browser other than Safari can decode
it — convert to JPEG first. The tool says so rather than failing silently.

## Licence and attribution

Not affiliated with SSC, IBPS, UPSC or any government body. Requirements are transcribed from the
official guidelines where a primary source was available, and marked otherwise. Always confirm the
current requirement on the official portal before uploading.
