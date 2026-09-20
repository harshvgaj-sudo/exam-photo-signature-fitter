/*
 * test_mutation.mjs — prove the verification chain can actually FAIL.
 *
 * A suite that passes on correct input has proven nothing. The only way to know
 * the chain works is to feed it a deliberately wrong registry and check that it
 * objects — which is what test_registry_guard.mjs does for the STATIC rules.
 *
 * This suite does the same at the INTEGRATION level, and it matters because the
 * static rules and the measured rules catch different things:
 *
 *   - a box too small for its window          -> caught statically (bytes/px)
 *   - a well-formed but FALSE feasibility     -> only the browser can catch it
 *
 * The second case is the dangerous one. An entry with a plausible feasibility, a
 * riskNote, an alternative box and a declared sweep passes every static rule while
 * telling the user something untrue. Only measurement finds it.
 *
 * Mutations are applied IN MEMORY to copies of the real entries, so nothing on
 * disk is touched and the fixtures the other suites depend on are left alone.
 */
import { SPECS } from '../reference-tool/js/specs.js';
import { classifySweep } from '../reference-tool/js/core.js';
import { checkRegistry } from '../registry_guard.mjs';
import { runInBrowser, buildFixturesFromRegistry, buildJobsFromRegistry } from './browser_truth.mjs';
import { join } from 'node:path';
import { HERE } from './server.mjs';

// Reused in place, never wiped — see syncFixtures() in browser_truth.mjs for why
// a test harness must not bulk-delete.
const TEMP_FIXTURES = join(HERE, '.mutation-fixtures');

let pass = 0;
let fail = 0;
const record = (label, caught, detail) => {
  if (caught) { pass++; console.log(`  ok    ${label}\n        caught: ${detail}`); }
  else { fail++; console.log(`  FAIL  ${label}\n        NOT CAUGHT — this is a hole in the chain`); }
};

const get = (id) => SPECS.find((s) => s.id === id);
const withId = (spec) => ({ ...spec });

console.log('='.repeat(104));
console.log('MUTATION TESTS — the chain must object to a deliberately wrong registry');
console.log('='.repeat(104));

/* ================================================== static mutations */
console.log('\nSTATIC RULES (registry_guard.mjs, enforced by the build)');
console.log('-'.repeat(104));

const staticMutations = [
  {
    label: 'the original bug: a 140x60 box with a 10 KB floor marked "comfortable"',
    mutate: () => ({ ...get('ssc-signature'), feasibility: 'comfortable', riskNote: undefined, preferLarger: undefined }),
    expect: 'bytes/px',
  },
  {
    label: 'a feasibility claim with the evidence deleted',
    mutate: () => ({ ...get('ssc-lti'), measuredOver: undefined }),
    expect: 'unevidenced',
  },
  {
    label: 'a marginal claim with no statement of which inputs fail',
    mutate: () => ({ ...get('ssc-signature'), riskNote: undefined }),
    expect: 'no riskNote',
  },
  {
    label: 'a comfortable claim carrying a riskNote it cannot have',
    mutate: () => ({ ...get('ssc-lti'), riskNote: 'sometimes fails' }),
    expect: 'riskNote',
  },
  {
    label: 'a dead end: unreachable with no alternative and no explanation',
    mutate: () => ({ ...get('ssc-signature'), feasibility: 'unreachable', riskNote: undefined, preferLarger: undefined, noLargerReading: undefined }),
    expect: 'no alternative',
  },
  {
    label: 'a VERIFIED entry with its source stripped',
    mutate: () => ({ ...get('ssc-lti'), source: '' }),
    expect: 'no source',
  },
  {
    label: 'preferLarger pointing at a requirement that does not exist',
    mutate: () => ({ ...get('ssc-signature'), preferLarger: 'ssc-signature-does-not-exist' }),
    expect: 'missing preferLarger',
  },
  {
    label: 'a ceiling-only requirement carrying an invented minimum',
    mutate: () => ({ ...get('mpsc-photo'), minKB: 20, noMinimum: true }),
    expect: 'sentinel',
  },
  {
    label: 'the no-minimum sentinel used without declaring why',
    mutate: () => ({ ...get('mpsc-signature'), noMinimum: undefined }),
    expect: 'noMinimum: true',
  },
];

for (const m of staticMutations) {
  const mutated = SPECS.map((s) => (s.id === m.mutate().id ? m.mutate() : s));
  const problems = checkRegistry(mutated);
  const hit = problems.find((p) => p.includes(m.expect));
  record(m.label, Boolean(hit), hit || (problems[0] || '(nothing)'));
}

/* ============================================ behavioural mutations */
console.log('\nMEASURED RULES (check_specs.mjs, enforced by the browser)');
console.log('These mutations satisfy every static rule. Only measurement can find them.');
console.log('-'.repeat(104));

const behaviouralMutations = [
  {
    // Everything about this entry is well-formed. It is simply not true.
    label: 'a comfortable box declared "marginal", fully documented and plausible',
    mutate: () => ({
      ...get('ssc-lti'),
      feasibility: 'marginal',
      riskNote: 'a compact thumb impression falls short',
      noLargerReading: 'no larger reading is documented',
    }),
    declared: 'marginal',
  },
  {
    label: 'a comfortable box declared "unreachable", with a stated reason',
    mutate: () => ({
      ...get('ssc-declaration'),
      feasibility: 'unreachable',
      riskNote: undefined,
      noLargerReading: 'no larger reading is documented',
    }),
    declared: 'unreachable',
  },
  {
    // This one the static bytes/px rule also catches — included to show both layers fire.
    label: 'a genuinely marginal box declared "comfortable"',
    mutate: () => ({ ...get('ssc-signature'), feasibility: 'comfortable', riskNote: undefined }),
    declared: 'comfortable',
  },
];

for (const m of behaviouralMutations) {
  const spec = withId(m.mutate());

  const staticProblems = checkRegistry(SPECS.map((s) => (s.id === spec.id ? spec : s)));
  const fixtures = buildFixturesFromRegistry([spec]);
  const jobs = buildJobsFromRegistry([spec]);

  const { records } = await runInBrowser(fixtures, jobs, { fixtureDir: TEMP_FIXTURES });
  const samples = records.map((r) => r.atMax);
  const measured = classifySweep(samples, spec.minKB * 1024);
  const mismatch = measured !== spec.feasibility;

  const detail = `declared ${spec.feasibility}, browser measured ${measured} ` +
    `(${(Math.min(...samples) / 1024).toFixed(1)}-${(Math.max(...samples) / 1024).toFixed(1)} KB, ` +
    `${records.filter((r) => r.ok).length}/${records.length} pass)` +
    (staticProblems.length ? `; static rules also fired ${staticProblems.length}` : '; static rules stayed silent');

  record(m.label, mismatch, detail);
}

// The mutation fixtures are left on disk deliberately. They are overwritten on
// the next run, and the directory is inert — nothing outside this suite reads it.
// Deleting them would mean the suite could not run at all once the host's
// cumulative delete guard is exhausted, which is a worse failure than a few
// stale JPEGs.

/* =============================================================== summary */
console.log('\n' + '='.repeat(104));
console.log(`  mutations caught: ${pass}    mutations missed: ${fail}`);
if (fail === 0) {
  console.log('  Every deliberate defect was caught, by the static rules or by measurement.');
  console.log('  The chain can fail, so a green run means something.');
} else {
  console.log('  A defect got through. The verification chain has a hole.');
}
console.log('='.repeat(104));

process.exit(fail === 0 ? 0 : 1);
