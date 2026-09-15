# Photo & Signature Fitter

A single-purpose tool: prepare a photo or signature so that it **exactly matches
stated numeric requirements** — pixel dimensions, a size window in KB, and format.

Everything runs in the browser. No upload, no server, no account, and **no network
requests at all** (verified by a test, not asserted).

---

## Two ways to use it

### 1. As one file, with no server (recommended for testing and sharing)

`dist/photo-signature-fitter.html` — 66 KB, no dependencies.

- **Windows / macOS / Linux:** double-click it. It opens in the browser.
- **Android:** copy it to the phone and open it from Files.
- **Anywhere else:** upload that single file to any static host.

This is the only form that works from a `file://` origin, because browsers refuse
to load ES modules from the file system. That is why the bundle exists.

Rebuild it after changing anything in `js/` or `css/`:

```bash
node build_single_file.mjs
```

The build fails loudly rather than emitting a broken bundle. It refuses to write
output if any module syntax survives, if two modules declare the same name, if the
result still references a local file, **or if the requirement registry fails its
static guard** — see *Adding a requirement* below.

### 2. As a static site (for a real deployment)

Serve this folder with any static server:

```bash
python -m http.server 8099
# open http://127.0.0.1:8099/
```

Deploy by dragging this folder onto Netlify, or by pushing to GitHub and enabling
Pages. No build step. `netlify.toml` already carries the security headers, and
those exact headers are exercised by the test suite.

## Test it

```bash
cd ../_verify
node run_all.mjs
```

One command, no setup. It builds the bundle, runs the nine suites, starts its own
servers, and exits non-zero if anything fails. It launches your system Chrome; it
does not download a browser.

| Suite | What it proves |
|---|---|
| `test_registry_guard.mjs` | every guard rule fires on a deliberately broken entry |
| `check_specs.mjs` | every registry claim, **measured in a real browser** |
| `test_mutation.mjs` | the chain can fail: a wrong registry is caught, statically or by measurement |
| `test_core.mjs` | crop geometry, the size search, per-preset compliance |
| `test_old_algorithm.mjs` | the old build's algorithm, reproduced and measured |
| `test_verifier.mjs` | the old build's link verifier, reproduced and measured |
| `test_browser.mjs` | the real UI in Chrome: upload, crop, fit, download, refusal, CSP enforcement, EXIF orientation, PNG/HEIC/corrupt input |
| `test_single_file.mjs` | the bundle from `file://`, a seven-viewport layout sweep, and a coarse-pointer touch-target sweep |
| `shot_report.mjs` | the report itself renders: anchors resolve, no clipped output, no errors |

The suites are **idempotent and delete nothing, ever**. Fixtures are written in place
and overwritten. The host environment guards against bulk deletion and counts deletions
cumulatively for the session, so a harness that removes even a few files per run will
eventually be refused mid-run — a failure that looks like a broken test but is not. A
leftover fixture is inert: nothing requests a file that is not in a job list, and every
count is derived from the intended set rather than from a directory scan.

Waiting is also state-based rather than sleep-based. `fitAndWait()` counts writes to the
status element with a `MutationObserver` instead of comparing text, because two
consecutive fits can legitimately produce identical text — and a fixed sleep will
eventually read the app's in-progress message and call it a verdict.

---

## Layout

```
index.html          markup only
css/style.css       presentation only
js/core.js          pure logic: crop geometry, size search, classification, verification
js/specs.js         the requirement registry, with provenance and measured evidence
js/config.js        channel details — the only file to edit for branding
js/app.js           DOM wiring, deep links, branding
netlify.toml        deployment + security headers
```

`core.js` deliberately contains no browser APIs. That is what makes the algorithm
testable outside a browser — the same functions run under Node in the fast suites.

## Deep links

A video description should open the exact tool with the exact requirement already
selected. The URL carries the preset:

```
/?preset=ssc-signature          the official 140x60 box
/?preset=ssc-signature-large    the documented 472x157 reading
/?preset=ssc-lti                left thumb impression, 240x240
/?preset=ssc-declaration        the handwritten declaration, 800x400
/?preset=ibps-photo
/?preset=upsc-photo
```

The address bar updates as the user changes the preset, and **Copy link to this
tool** puts the current URL on the clipboard — so you can paste a working link
straight into a video description.

## Channel details

Edit `js/config.js`. Nothing else in the codebase hard-codes a handle.

```js
export const CHANNEL = {
  name: 'Tech Tips Dhanwala MH',
  subscribeUrl: '...',
  channelUrl: '...',
  walkthroughUrl: '',   // set this once the video exists; the link then appears
  shareText: '...',
};
```

## The three rules this tool follows

1. **Dimensions are a hard constraint. File size is a range.** Dimensions are
   fixed first; only JPEG quality is searched afterwards. Downscaling to satisfy a
   file-size limit silently breaks the requirement, so it is never done.
2. **Never report success for a file that fails its own checks.** The download
   button appears only after `verify()` passes. If the requirements cannot be met,
   the tool says why instead of producing a file that a portal will reject.
3. **Do not claim what cannot be established.** The interface distinguishes what
   was checked from what was assumed, and says which is which.

---

## Adding a requirement

Add an entry to `SPECS` in `js/specs.js`. The build will refuse to ship an entry
that is missing any of the required fields, so the table below is enforced, not
advisory.

| Field | Meaning |
|---|---|
| `width`, `height` | exact pixels the portal expects |
| `minKB`, `maxKB` | the size window, both bounds |
| `format` | MIME type |
| `status` | `VERIFIED`, `UNVERIFIED` or `CUSTOM` |
| `source` | where the numbers came from |
| `verifiedOn` | the date someone read them from the official document |
| `measuredOver` | **the grid of inputs the feasibility claim is measured over** |
| `measuredOn`, `measuredWith` | when and how the measurement was taken |
| `feasibility` | `comfortable`, `marginal` or `unreachable` — see below |
| `riskNote` | **mandatory when marginal**; says which inputs fall short |
| `preferLarger` / `noLargerReading` | the way out of a tight box, or why there isn't one |
| `rules` | human rules from the source, shown next to the numbers |
| `note` | what is assumed, and what is still unknown |
| `liveCaptureOnly` | optional; `true` if no prepared file can satisfy it |

**Do not set `status: 'VERIFIED'` without recording who checked it and when.**
An unverified preset is labelled as such in the interface, on purpose.

`liveCaptureOnly` exists for requirements like the SSC photograph, which must be
captured live through the portal's webcam or the official app. For those, the tool
refuses and explains, because producing a file would guarantee rejection.

### `feasibility` is measured, not guessed

A pixel box and a KB window can contradict each other. When they do, the tool
either refuses a valid image or claims success on an impossible one — and neither
is visible from reading the two numbers. So each entry declares a feasibility and
`_verify/check_specs.mjs` **measures** it and fails on any mismatch.

| Value | Meaning |
|---|---|
| `comfortable` | every input on the declared sweep clears the floor by ≥ 1.15× |
| `marginal` | some inputs clear it and some do not — input-dependent by definition |
| `unreachable` | no input on the sweep reaches the floor |

`marginal` and `unreachable` must offer `preferLarger` (a documented larger box)
or `noLargerReading` (an explicit statement that none is documented). Inventing a
dimension just to satisfy the check would be worse than admitting the gap.

### The measurement is taken in a browser, and that is deliberate

The first version of `check_specs.mjs` predicted feasibility with a Node
re-implementation of the pipeline. That model claimed the 140×60 SSC signature box
reached **10.22 KB**; real Chrome, given the same document, produced **8.88 KB** and
correctly refused. `_verify/probe_gap_cause.mjs` traced the difference:

```
raw pixels -> box filter -> jpeg-js                10.14 KB   (the model)
+ the JPEG round trip a real file imposes           9.30 KB
+ Chrome's resampler instead of a box filter        8.88 KB   (the truth)
```

The model is optimistic by ~20%, which at a 10 KB boundary is the difference
between *passes* and *refuses*. A model is not evidence about the thing it models,
so the browser is the authority. The model is still run in `check_specs.mjs` PART 4,
purely so its error stays visible.

### Why the sweep, and not one test image

A single measurement cannot separate `marginal` from `comfortable`, because the
thing that actually breaks a preset is **input variation**. The SSC signature sweep
covers two independent axes — scan noise (7 levels) and ink density (4 levels) —
because a dense signature on clean paper and a sparse one on noisy paper are both
ordinary documents, and they land at opposite ends of the size range. Measuring one
fixture and calling the answer the truth is the same mistake as claiming success
for a file that fails its own checks; it just moves the error one level up.

---

## A note on the requirements in the registry

`ssc-signature`, `ssc-photo`, `ssc-lti` and `ssc-declaration` are `VERIFIED`
against the official SSC document *"Guidelines for scanning and Upload of
Documents"* (4 pages, read 2026-09-14). Everything else is `UNVERIFIED` and
labelled as such in the interface.

Three things are worth knowing before you promote this on camera:

- **The official SSC signature box cannot reliably hold the official SSC size
  window.** 140 × 60 px is 8,400 pixels; a 10 KB floor therefore demands 1.22
  bytes per pixel. Measured over 28 realistic signatures, the best achievable file
  ranges from **6.1 KB to 13.4 KB**, and only **7 of 28** reach the floor. The
  deciding factor is how much ink is on the page, not how clean the scan is. So the
  practical risk is being **under** 10 KB, not over 20 KB — which is the opposite of
  what every "reduce your file size" tutorial says. The preset warns, and offers the
  documented larger box (472 × 157), where all 28 inputs pass comfortably.

- **The PDF's own figures disagree with each other.** It states the photograph as
  both 4.5 × 3.5 cm and "200 × 230 pixels (preferred)" — the first is landscape, the
  second portrait. The same contradiction appears in the IBPS notes, so this is
  standard boilerplate confusion rather than a one-off typo. Both readings are in
  the registry, both flagged.

- **The portal enforces size and format, not dimensions.** The PDF says an error is
  shown when *"the file size and format are not as prescribed"*, and both pixel
  figures carry the word *"(preferred)"*. That is why the larger-box presets exist:
  if the official box cannot hold the window, a larger documented box is the way out.
