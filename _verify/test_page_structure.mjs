/*
 * test_page_structure.mjs — the three pages must have a sane heading outline.
 *
 * Why this exists: BOTH tool pages had no h1 at all. The page title was a <strong>
 * inside the brand block, so the document outline began at the first <h2> step —
 * "1 Choose the requirement" — with no level-1 heading anywhere. A screen-reader
 * user navigating by heading could not identify the page, and every step heading
 * was one level deeper than it should have been. The landing page had an h1; the
 * two pages people actually use did not.
 *
 * Nobody noticed because nothing looked wrong. An h2 that should be an h1 renders
 * identically, and the browser does not care. That is exactly the class of defect
 * that needs a machine to check it.
 *
 * Also validates every aria-labelledby / aria-describedby / label-for target, since
 * each section here is labelled by an id reference and a typo in one is silent:
 * the section simply becomes unlabelled to assistive tech.
 *
 * Static — reads the HTML, no browser, no fixtures.
 *
 *   node _verify/test_page_structure.mjs
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './server.mjs';

let failures = 0;
const assert = (label, cond, detail = '') => {
  if (!cond) failures++;
  console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${label}${detail ? '  — ' + detail : ''}`);
};

const PAGES = [
  ['landing page', 'index.html'],
  ['photo & signature tool', join('reference-tool', 'index.html')],
  ['certificate tool', join('tools', 'certificate-pdf', 'index.html')],
];

console.log('='.repeat(100));
console.log('PAGE STRUCTURE — heading outline and id references');
console.log('='.repeat(100));

for (const [name, rel] of PAGES) {
  const html = readFileSync(join(ROOT, rel), 'utf8');
  console.log(`\n${name}  (${rel})`);

  // Headings in document order. These are hand-written pages, so a tag scan is
  // sufficient and does not need a parser.
  const heads = [...html.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/g)].map((m) => ({
    level: Number(m[1]),
    text: m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 48),
  }));

  assert('has at least one heading', heads.length > 0, `${heads.length} found`);

  const h1s = heads.filter((h) => h.level === 1);
  assert('has exactly one h1', h1s.length === 1,
    h1s.length ? `"${h1s[0].text}"` : `found ${h1s.length} h1 elements — the outline starts at h${heads[0] ? heads[0].level : '?'}`);

  if (heads.length) {
    assert('the first heading is the h1', heads[0].level === 1, `first is h${heads[0].level}`);
  }

  // No skipped levels: you may go deeper by one, or back up by any amount.
  const skips = [];
  for (let i = 1; i < heads.length; i++) {
    if (heads[i].level > heads[i - 1].level + 1) {
      skips.push(`h${heads[i - 1].level} -> h${heads[i].level} at "${heads[i].text}"`);
    }
  }
  assert('no heading level is skipped', skips.length === 0, skips.join('; '));

  console.log('    outline: ' + heads.map((h) => `h${h.level}`).join(' '));

  // Every id reference must resolve. An unresolvable aria-labelledby leaves the
  // region unlabelled to assistive tech, with no visible symptom.
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
  const refs = [
    ...[...html.matchAll(/aria-labelledby="([^"]+)"/g)].flatMap((m) => m[1].split(/\s+/).map((r) => ['aria-labelledby', r])),
    ...[...html.matchAll(/aria-describedby="([^"]+)"/g)].flatMap((m) => m[1].split(/\s+/).map((r) => ['aria-describedby', r])),
    ...[...html.matchAll(/<label[^>]*\bfor="([^"]+)"/g)].map((m) => ['label for', m[1]]),
  ];
  const dangling = refs.filter(([, r]) => !ids.has(r));
  assert('every id reference resolves', dangling.length === 0,
    dangling.map(([a, r]) => `${a}="${r}"`).join(', '));
  if (refs.length) console.log(`    ${refs.length} id references checked`);
}

console.log('\n' + '='.repeat(100));
console.log(failures ? `  ${failures} FAILED` : '  Every page has one h1, no skipped levels, and no dangling id references.');
console.log('='.repeat(100));
process.exit(failures ? 1 : 0);
