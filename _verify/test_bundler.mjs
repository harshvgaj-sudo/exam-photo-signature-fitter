/*
 * test_bundler.mjs — the module-syntax stripper, and the safety net beneath it.
 *
 * WHY THIS EXISTS
 * build_single_file.mjs used to carry its own copy of stripModuleSyntax, and the
 * two copies drifted. In the local copy the safety check was anchored the same
 * way as the strip regex, so a declaration sharing a line with the doc comment
 * above it slipped past BOTH: the build printed BUILD OK, and the single-file
 * suite found the corpse later, with the page dying on "Unexpected token
 * 'export'". The duplicate is gone; this is the test whose absence allowed it.
 *
 * THE INVARIANT THAT MATTERS is not any single case. It is that stripping every
 * module the builds actually inline leaves no module syntax behind and reports no
 * problem — checked against the real source files, so it cannot drift away from
 * what ships.
 *
 * Run: node test_bundler.mjs
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripModuleSyntax } from '../bundler.mjs';
import { ROOT } from './server.mjs';

let pass = 0;
let fail = 0;
const ok = (label) => { pass++; console.log('  ok    ' + label); };
const no = (label, detail) => { fail++; console.log('  FAIL  ' + label + '\n        ' + detail); };

const strip = (code) => {
  const problems = [];
  return { out: stripModuleSyntax(code, 'unit', problems), problems };
};

/** Every module either build inlines, relative to the repo root. */
const BUNDLED = [
  'reference-tool/js/config.js',
  'reference-tool/js/specs.js',
  'reference-tool/js/core.js',
  'reference-tool/js/app.js',
  'tools/certificate-pdf/js/pdf.js',
  'tools/certificate-pdf/js/app.js',
];

/** A leftover keyword that would make the inline script a syntax error. */
const LEFTOVER = /(^|[^\w$.'"`])(export|import)\s+(const|let|var|function|class|async\s+function|\{|default|\*|['"])/m;

const bar = (c = '=') => console.log(c.repeat(96));

bar();
console.log('BUNDLER — module syntax must not survive into the single-file build');
bar();

console.log('\nThe forms the stripper must handle:');
const handled = [
  ['line-anchored const', 'export const A = 1;', 'const A = 1;'],
  ['line-anchored function', 'export function f() {}', 'function f() {}'],
  ['async function', 'export async function g() {}', 'async function g() {}'],
  ['bare export braces', 'export { a, b };', ''],
  ['single-line import', "import { x } from './y.js';", ''],
  // The exact shape that shipped broken: a doc comment and the keyword on one line.
  ['doc comment sharing the line', '/** doc */export function h() {}', '/** doc */\nfunction h() {}'],
];
for (const [label, input, expected] of handled) {
  const { out, problems } = strip(input);
  if (out === expected && problems.length === 0) ok(label);
  else no(label, `expected ${JSON.stringify(expected)} with no problems, got ${JSON.stringify(out)} ${JSON.stringify(problems)}`);
}

console.log('\nThe safety net must fire on what the stripper cannot inline:');
const refused = [
  ['export default, which has no name to bind', 'export default function () {}'],
  ['export *, which re-exports another module', "export * from './z.js';"],
  ['a multi-line import the strip cannot match', "import {\n  a,\n  b\n} from './y.js';"],
];
for (const [label, input] of refused) {
  const { problems } = strip(input);
  if (problems.length) ok(`${label} — ${problems[0]}`);
  else no(label, 'the stripper accepted it silently; the bundle would be broken');
}

console.log('\nAnd it must stay silent on code that only mentions the words:');
const innocuous = [
  ['a string containing the keyword', 'const s = "export const x";'],
  ['a word that merely starts with it', 'const exported = 1;'],
];
for (const [label, input] of innocuous) {
  const { problems } = strip(input);
  if (problems.length === 0) ok(label);
  else no(label, `false positive: ${problems.join('; ')}`);
}

console.log('\nTHE INVARIANT — every module the builds inline, stripped clean:');
for (const rel of BUNDLED) {
  let code;
  try {
    code = readFileSync(join(ROOT, rel), 'utf8');
  } catch (e) {
    no(rel, `could not read: ${e.message}`);
    continue;
  }
  const { out, problems } = strip(code);
  const leftover = out.match(LEFTOVER);
  if (problems.length) no(rel, `the stripper reported: ${problems.join('; ')}`);
  else if (leftover) no(rel, `module syntax survived: "${leftover[0].trim()}"`);
  else ok(`${rel} — no module syntax survives`);
}

console.log('');
bar();
if (fail === 0) {
  console.log('THE BUNDLER IS SOUND: every inlineable form is stripped, and the net catches the rest.');
} else {
  console.log(`${fail} FAILURE(S). A broken single-file build could ship without the build noticing.`);
}
bar();

process.exit(fail === 0 ? 0 : 1);
