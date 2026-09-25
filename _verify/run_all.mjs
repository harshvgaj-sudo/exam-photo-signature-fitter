/*
 * run_all.mjs — run every check with one command.
 *
 *   node run_all.mjs
 *
 * Starts its own static server for the browser suite, so nothing needs to be
 * running beforehand. Exits non-zero if anything fails.
 *
 * Order matters: check_specs.mjs measures the registry in a real browser and
 * writes the canonical fixtures to _verify/fixtures/. test_browser.mjs and
 * test_single_file.mjs upload those exact bytes, so check_specs must run first.
 * That is deliberate — it means the browser suites test the same documents the
 * feasibility claims were measured against, not lookalikes.
 */
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { serve, TOOL, HERE, ROOT } from './server.mjs';

const NODE = process.execPath;

function run(script, env = {}) {
  return new Promise((resolve) => {
    const p = spawn(NODE, [join(HERE, script)], { env: { ...process.env, ...env }, stdio: 'inherit' });
    p.on('close', (code) => resolve(code === 0));
  });
}

const SUITES = [
  ['test_registry_guard.mjs', 'the guard itself: every rule must fire on a deliberately broken entry'],
  ['test_bundler.mjs', 'the module-syntax stripper: no export/import survives, and the safety net fires'],
  ['check_specs.mjs', 'every registry claim measured in a REAL BROWSER, over each entry\'s declared sweep'],
  ['test_mutation.mjs', 'prove the chain can fail: a wrong registry must be caught, statically or by measurement'],
  ['test_core.mjs', 'the corrected core: crop geometry, size search, per-preset compliance'],
  ['test_old_algorithm.mjs', 'the OLD algorithm from the shipped build, measured against real specs'],
  ['test_verifier.mjs', 'the OLD link-verifier predicate, against real URLs'],
  ['test_certificate_pdf.mjs', 'the PDF writer: A4 pages, JPEG embedded byte-for-byte, predictable size'],
];

console.log('Photo & Signature Fitter — full verification\n');

// 1. Build first, so the single-file suites test current source.
console.log('> building single-file bundles');
for (const script of ['build_single_file.mjs', 'build_certificate_pdf.mjs']) {
  const built = await new Promise((resolve) => {
    const p = spawn(NODE, [join(ROOT, script)], { stdio: 'inherit' });
    p.on('close', (c) => resolve(c === 0));
  });
  if (!built) { console.error(`\n${script} failed. Stopping.`); process.exit(1); }
}

const results = [];
for (const [script, label] of SUITES) {
  console.log(`\n> ${script} — ${label}`);
  results.push([script, await run(script)]);
}

// 2. Browser suites need an HTTP origin for the modular version.
const { server, port } = await serve(TOOL, { fx: join(HERE, 'fixtures') });
try {
  console.log(`\n> test_browser.mjs — modular version over HTTP (port ${port})`);
  results.push(['test_browser.mjs', await run('test_browser.mjs', { BASE_URL: `http://127.0.0.1:${port}/` })]);
} finally {
  server.close();
}

console.log('\n> test_single_file.mjs — single-file build from file://, no server, responsive sweep');
results.push(['test_single_file.mjs', await run('test_single_file.mjs')]);

console.log('\n> test_certificate_tool.mjs — the second tool, end to end from file://');
results.push(['test_certificate_tool.mjs', await run('test_certificate_tool.mjs')]);

// The landing page is the front door to both tools, so it holds the same two
// promises they do: no network requests, and it works from file:// with no
// server. Runs after the builds so it links against current output.
console.log('\n> test_landing.mjs — the landing page: no network, file://, both themes, responsive');
results.push(['test_landing.mjs', await run('test_landing.mjs')]);

// 3. The report is a deliverable too, so it gets checked the same way: opened in a
// real browser, with every table-of-contents anchor and the captured output blocks
// verified. A report that renders broken is not evidence of anything.
console.log('\n> shot_report.mjs — the report itself renders, with no broken anchors or clipped output');
results.push(['shot_report.mjs', await run('shot_report.mjs')]);

// 4. The three provenance levels must be VISIBLY different, not just differently
// worded. DERIVED used to render in the same neutral box as VERIFIED, so the
// status model was invisible to anyone who did not read the paragraph.
console.log('\n> test_provenance_levels.mjs — VERIFIED / DERIVED / UNVERIFIED render as three distinct, legible levels');
results.push(['test_provenance_levels.mjs', await run('test_provenance_levels.mjs')]);

// 5. Static structural invariants of all three pages. Both TOOL pages had no h1 at
// all — the title was a <strong> — so the outline began at the h2 steps. An h2 that
// should be an h1 renders identically, so nothing looked wrong.
console.log('\n> test_page_structure.mjs — one h1 per page, no skipped heading levels, no dangling id refs');
results.push(['test_page_structure.mjs', await run('test_page_structure.mjs')]);

// 6. The crop drag is the whole reason the primary tool exists, and until now it
// had only ever been driven by a MOUSE. test_browser.mjs runs at a phone-width
// viewport, but in a context created WITHOUT `hasTouch`, so Playwright synthesises
// mouse input. The audience is on phones. This suite drives the drag with genuine
// CDP touch events — the only kind that exercises `touch-action: none` — on both
// the modular tool and the single-file build, and carries three negative controls.
console.log('\n> test_mobile_touch.mjs — the crop drag under real touch input, on a phone');
results.push(['test_mobile_touch.mjs', await run('test_mobile_touch.mjs')]);

// 7. A second photograph must be judged on its own contents. Found while checking
// the video script: a Fit pressed while a new photo was still decoding measured
// the PREVIOUS one, so the search reported a size for a file the user was no
// longer looking at. Every earlier suite missed it because they all wait ~250ms
// — roughly human reaction time — while the window is under 50ms on a fast
// machine and far wider on a phone decoding a multi-megapixel photo.
console.log('\n> test_image_swap.mjs — a second photograph is measured, not the first');
results.push(['test_image_swap.mjs', await run('test_image_swap.mjs')]);

// 8. The certificate tool had the same class of bug as the photo tool, and a
// worse outcome: changing the file selection while a build was running wiped the
// progress line, re-enabled Build for a second concurrent run, and left the user
// on an empty panel with no result and no error. A running build now owns its
// inputs. Found by asking whether the photo tool's race had a sibling here.
console.log('\n> test_certificate_swap.mjs — a running build owns its inputs');
results.push(['test_certificate_swap.mjs', await run('test_certificate_swap.mjs')]);

// 9. The prose states counts, and a count is a claim about the code. The registry
// has grown twice and the copy was left behind both times — once telling visitors
// "8 from secondary sources" when the true number was 1. Runs last because it is
// the cheapest, and it is the one that guards every number printed above.
console.log('\n> test_docs_consistency.mjs — every count in index.html and README.md equals the registry');
results.push(['test_docs_consistency.mjs', await run('test_docs_consistency.mjs')]);

console.log('\n' + '='.repeat(62));
console.log('SUMMARY');
console.log('='.repeat(62));
let failed = 0;
for (const [script, ok] of results) {
  if (!ok) failed++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${script}`);
}
console.log('='.repeat(62));
console.log(failed ? `${failed} suite(s) FAILED` : 'All suites passed.');
process.exit(failed ? 1 : 0);
