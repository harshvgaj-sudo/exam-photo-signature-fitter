/*
 * test_docs_consistency.mjs — the numbers the DOCS state must equal the numbers
 * the REGISTRY holds.
 *
 * Why this exists: the registry has grown 13 -> 16 -> 17 entries, and every time
 * it did, the counts printed on the landing page and in the README were left
 * behind. Twice the landing page told visitors a figure that was simply false —
 * once claiming "8 from secondary sources" when the true number was 1, and once
 * "16 presets" after the registry held 17. Nobody noticed either time, because
 * nothing compared the prose to the data.
 *
 * A count is a claim about the code. This file makes the claim checkable, so a
 * registry change that forgets the copy fails here instead of shipping.
 *
 * It also pins the weaker version of the same bug: test_single_file.mjs asserted
 * `presets >= 13`, which passes for 13 and for 170 alike. A lower bound is not a
 * count. The exact total is asserted here.
 *
 * Pure text/file assertions — no browser, no fixtures, so it runs in well under a
 * second and can be run on its own after any registry edit.
 *
 *   node _verify/test_docs_consistency.mjs
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './server.mjs';
import { SPECS } from '../reference-tool/js/specs.js';

let failures = 0;
const assert = (label, cond, detail = '') => {
  if (!cond) failures++;
  console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${label}${detail ? '  — ' + detail : ''}`);
};

/* ------------------------------------------------ the truth, from the registry */
const counts = {};
for (const s of SPECS) counts[s.status] = (counts[s.status] || 0) + 1;
const total = SPECS.length;
const groups = [...new Set(SPECS.map((s) => s.group))];

console.log('='.repeat(100));
console.log('DOCS CONSISTENCY — every stated count must equal the registry');
console.log('='.repeat(100));
console.log(`\n  registry: ${total} entries  ` +
  Object.entries(counts).map(([k, v]) => `${k}=${v}`).join('  '));
console.log(`  groups  : ${groups.join(', ')}\n`);

const landing = readFileSync(join(ROOT, 'index.html'), 'utf8');
const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');

/* Which landing-page label corresponds to which registry status. Matching on a
   distinctive fragment rather than the whole string, so rewording the sentence
   does not break the test — but changing the NUMBER does. */
const LANDING_LABEL = {
  VERIFIED: /Verified against/i,
  DERIVED: /printed size/i,
  UNVERIFIED: /Relayed second-hand/i,
  CUSTOM: /Custom\b/i,
};

console.log('index.html — the landing page count cards');
const cards = [...landing.matchAll(/<li class="count[^"]*"><b>(\d+)<\/b><span>([\s\S]*?)<\/span><\/li>/g)]
  .map((m) => ({ n: Number(m[1]), label: m[2].replace(/&mdash;/g, '—').replace(/\s+/g, ' ').trim() }));

assert('the counts list is present and parseable', cards.length > 0, `${cards.length} cards`);

for (const [status, re] of Object.entries(LANDING_LABEL)) {
  const card = cards.find((c) => re.test(c.label));
  if (!card) {
    // A status with entries but no card is a claim that has gone missing entirely.
    assert(`landing page has a card for ${status}`, (counts[status] || 0) === 0,
      counts[status] ? `registry has ${counts[status]} ${status} but no card explains it` : '');
    continue;
  }
  assert(`landing page states ${status} = ${counts[status] || 0}`, card.n === (counts[status] || 0),
    `card says ${card.n}`);
}

// No card may claim a status the registry does not use — the reverse direction.
for (const c of cards) {
  const known = Object.entries(LANDING_LABEL).some(([, re]) => re.test(c.label));
  assert(`landing card "${c.label.slice(0, 40)}" maps to a real status`, known);
}

const totalClaim = landing.match(/<b>(\d+) presets<\/b>/);
assert('landing page states the exact total', totalClaim && Number(totalClaim[1]) === total,
  totalClaim ? `says ${totalClaim[1]}, registry holds ${total}` : 'no "<b>N presets</b>" found');

// The group list on the same line must mention every group the registry uses.
if (totalClaim) {
  const line = landing.slice(totalClaim.index, landing.indexOf('</p>', totalClaim.index));
  for (const g of groups) {
    assert(`landing page lists the ${g} group`, new RegExp(g, 'i').test(line));
  }
}

console.log('\nREADME.md — the provenance table');
const rows = [...readme.matchAll(/^\|\s*`([A-Z]+)`\s*\|\s*(\d+)\s*\|/gm)]
  .map((m) => ({ status: m[1], n: Number(m[2]) }));

assert('the provenance table is present and parseable', rows.length > 0, `${rows.length} rows`);

for (const r of rows) {
  assert(`README states ${r.status} = ${counts[r.status] || 0}`, r.n === (counts[r.status] || 0),
    `table says ${r.n}`);
}
// Every status the registry actually uses must appear as a row.
for (const status of Object.keys(counts)) {
  assert(`README has a row for ${status}`, rows.some((r) => r.status === status));
}

const readmeTotal = readme.match(/^(\d+) presets,/m);
assert('README states the exact total', readmeTotal && Number(readmeTotal[1]) === total,
  readmeTotal ? `says ${readmeTotal[1]}, registry holds ${total}` : 'no "^N presets," found');

console.log('\nThe weak-bound bug this also closes');
// test_single_file.mjs asserts `presets >= 13`. Show why a bound is not a count.
const singleFile = readFileSync(join(ROOT, '_verify', 'test_single_file.mjs'), 'utf8');
const bound = singleFile.match(/presetCount\s*>=\s*(\d+)/);
assert('test_single_file still uses a lower bound (documented, not a defect)', Boolean(bound),
  bound ? `>= ${bound[1]}` : 'no bound found');
if (bound) {
  assert('the exact total is asserted HERE, so the bound cannot hide a stale count',
    totalClaim !== null && Number(totalClaim[1]) === total);
}

console.log('\n' + '='.repeat(100));
if (failures) {
  console.log(`  ${failures} FAILED. The docs state something the registry does not.`);
  console.log('  Update index.html and README.md to match the registry above.');
} else {
  console.log('  Every stated count matches the registry.');
}
console.log('='.repeat(100));
process.exit(failures ? 1 : 0);
