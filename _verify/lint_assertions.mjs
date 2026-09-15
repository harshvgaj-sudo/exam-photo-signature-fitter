/*
 * lint_assertions.mjs — static scan of the suites for assertions that cannot fail.
 *
 * Every defect found in this project has been an assertion that looked like
 * evidence and was not. Three shapes recur, and all three are detectable by
 * reading the source. This suite reads it, so a future edit cannot quietly
 * reintroduce one.
 *
 *   LINT 1  assert(<label>, true)          — a literal-true assertion, unreachable
 *   LINT 2  if (x) { ...assert... }        — no `else`, so the asserts VANISH when
 *                                           x is falsy and the suite still passes
 *   LINT 3  waitForEvent('download')       — the promise is orphaned if the click
 *                                           throws, then rejects as an UNHANDLED
 *                                           rejection and kills the process
 *
 * Static only: no browser, no fixtures, milliseconds to run.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));

let failures = 0;
const assert = (label, cond, detail = '') => {
  if (!cond) failures++;
  console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${label}${detail ? '  — ' + detail : ''}`);
};

// Strip string and template-literal bodies so brace counting is not confused by
// punctuation inside a message. `${...}` interpolation stays balanced either way.
const strip = (s) => s.replace(/'[^']*'/g, "''").replace(/`[^`]*`/g, '``').replace(/"[^"]*"/g, '""');

/* LINT 1 — a literal `true` as the condition. */
function literalTrueAsserts(lines) {
  const out = [];
  lines.forEach((ln, i) => {
    if (/assert\(/.test(ln) && /,\s*true\s*\)\s*;?\s*$/.test(ln)) out.push(i + 1);
  });
  return out;
}

/* LINT 2 — an `if (x) { ... assert ... }` with no `else`. */
function conditionalAsserts(lines) {
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(\s*)if \(([^)]*)\) \{\s*$/);
    if (!m) continue;

    let depth = 0, hasAssert = false, j = i, closed = false;
    for (; j < lines.length; j++) {
      for (const ch of strip(lines[j])) {
        if (ch === '{') depth++;
        else if (ch === '}') { depth--; if (depth === 0) closed = true; }
      }
      if (j > i && /assert\(/.test(lines[j])) hasAssert = true;
      if (closed) break;
    }
    if (!hasAssert || !closed) continue;

    // `} else {` on the closing line, or `else` on the next non-blank line.
    let hasElse = /\belse\b/.test(lines[j] || '');
    if (!hasElse) {
      let k = j + 1;
      while (k < lines.length && lines[k].trim() === '') k++;
      hasElse = k < lines.length && /^\s*\}?\s*else\b/.test(lines[k]);
    }
    if (!hasElse) out.push({ line: i + 1, cond: m[2].trim() });
  }
  return out;
}

/* LINT 3 — a download wait whose promise is never guarded. */
function orphanedDownloadWaits(lines) {
  const out = [];
  lines.forEach((ln, i) => {
    if (!/waitForEvent\(\s*'download'/.test(ln)) return;
    // Strip comments before looking ahead: a multi-line explanatory comment
    // between the wait and its guard is normal, and must not push the guard out
    // of the window (that made this lint report a false positive on its own fix).
    const window = lines.slice(i, i + 6).map((l) => l.replace(/\/\/.*$/, '')).join('\n');
    // Either the promise is awaited on the same statement, or it carries a .catch().
    if (!/\.catch\(/.test(window)) out.push(i + 1);
  });
  return out;
}

const FILES = readdirSync(HERE).filter((f) => /^test_.*\.mjs$/.test(f)).sort();

console.log('=== ASSERTION LINT — can any of these assertions fail? ===\n');
console.log(`files: ${FILES.join(', ')}\n`);

const allTrue = [];
const allCond = [];
const allOrphan = [];

for (const f of FILES) {
  const lines = readFileSync(join(HERE, f), 'utf8').split(/\r?\n/);
  literalTrueAsserts(lines).forEach((n) => allTrue.push(`${f}:${n}`));
  conditionalAsserts(lines).forEach((c) => allCond.push(`${f}:${c.line} (if (${c.cond}))`));
  orphanedDownloadWaits(lines).forEach((n) => allOrphan.push(`${f}:${n}`));
}

assert('LINT 1: no assertion is a literal `true`', allTrue.length === 0,
  allTrue.join(', ') || 'none');
assert('LINT 2: no conditional assertion can silently vanish', allCond.length === 0,
  allCond.join(', ') || 'every assert block has an else');
assert('LINT 3: no download wait can become an unhandled rejection', allOrphan.length === 0,
  allOrphan.join(', ') || 'every wait is guarded');

// The lint must be able to FAIL, or it is itself decoration. Feed it the exact
// shapes it exists to catch and require a hit on each.
console.log('\nself-test — the lint must detect its own defect shapes:');
const poisoned = [
  "  assert('both halves were observed', true);",
  "  if (d) {",
  "    assert('the file is 140x60', d.w === 140);",
  "  }",
  "  const p = page.waitForEvent('download', { timeout: 20000 });",
];
assert('the lint catches a literal-true assertion',
  literalTrueAsserts(poisoned).length === 1, `${literalTrueAsserts(poisoned).length} hit(s)`);
assert('the lint catches an else-less assert block',
  conditionalAsserts(poisoned).length === 1, `${conditionalAsserts(poisoned).length} hit(s)`);
assert('the lint catches an orphaned download wait',
  orphanedDownloadWaits(poisoned).length === 1, `${orphanedDownloadWaits(poisoned).length} hit(s)`);

// And must NOT fire on the corrected shapes.
const clean = [
  "  assert('both halves were observed', refused && accepted, `r=${refused}`);",
  "  if (d) {",
  "    assert('the file is 140x60', d.w === 140);",
  "  } else {",
  "    assert('the download fired', false);",
  "  }",
  "  const p = page.waitForEvent('download', { timeout: 20000 });",
  "  p.catch(() => {});",
];
assert('the lint does not fire on the corrected shapes',
  literalTrueAsserts(clean).length === 0 &&
  conditionalAsserts(clean).length === 0 &&
  orphanedDownloadWaits(clean).length === 0,
  'clean sample reports no findings');

console.log('\n' + '='.repeat(60));
console.log(failures ? `${failures} lint failure(s)` : 'assertion lint clean — no unreachable assertions');
console.log('='.repeat(60));
process.exit(failures === 0 ? 0 : 1);
