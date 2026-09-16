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

// 3. The report is a deliverable too, so it gets checked the same way: opened in a
// real browser, with every table-of-contents anchor and the captured output blocks
// verified. A report that renders broken is not evidence of anything.
console.log('\n> shot_report.mjs — the report itself renders, with no broken anchors or clipped output');
results.push(['shot_report.mjs', await run('shot_report.mjs')]);

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
