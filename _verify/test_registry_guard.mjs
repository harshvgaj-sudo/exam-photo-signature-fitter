/*
 * test_registry_guard.mjs — prove the guard actually fires.
 *
 * A validation rule that is only ever run against a correct input proves nothing.
 * Every rule in registry_guard.mjs is exercised here with a deliberately broken
 * entry, and the test fails if the rule stays silent.
 *
 * The important cases are at the bottom: a pixel box too small to hold its own
 * size window, marked as if it were fine; and a feasibility claim with no declared
 * sweep behind it. Those are the bug classes this whole project exists to fix, so
 * the guard must catch them.
 */
import { checkRegistry } from '../registry_guard.mjs';
import { SPECS, NO_MINIMUM_KB } from '../reference-tool/js/specs.js';

let pass = 0;
let fail = 0;

function expect(label, specs, shouldFire, contains) {
  const problems = checkRegistry(specs);
  const fired = problems.length > 0;
  let good = fired === shouldFire;
  if (good && shouldFire && contains) good = problems.some((p) => p.includes(contains));

  if (good) {
    pass++;
    console.log('  ok    ' + label);
  } else {
    fail++;
    console.log('  FAIL  ' + label);
    console.log('        expected: ' + (shouldFire ? `a problem containing "${contains}"` : 'no problems'));
    console.log('        got     : ' + (problems.length ? problems.join('  |  ') : '(none)'));
  }
}

/** A minimal entry that satisfies every rule, so each test can break exactly one. */
const base = (over = {}) => ({
  id: 'x', label: 'X', group: 'G', document: 'Photo',
  width: 500, height: 500, minKB: 20, maxKB: 50, format: 'image/jpeg',
  status: 'UNVERIFIED', source: 'test source', verifiedOn: null,
  measuredOver: { fixture: 'photo', grain: [12] },
  measuredOn: '2026-01-01', measuredWith: 'test harness',
  feasibility: 'comfortable', rules: [],
  ...over,
});

console.log('='.repeat(100));
console.log('REGISTRY GUARD — negative tests. Every rule must fire on a broken entry.');
console.log('='.repeat(100));

console.log('\nThe real registry must pass cleanly:');
expect('the shipped registry produces no problems', SPECS, false);

console.log('\nA minimal valid entry must pass, so the tests below isolate one fault each:');
expect('minimal valid entry', [base()], false);

console.log('\nProvenance rules:');
expect('VERIFIED with no source', [base({ status: 'VERIFIED', source: '', verifiedOn: '2026-01-01' })], true, 'no source');
expect('VERIFIED with no verifiedOn', [base({ status: 'VERIFIED', verifiedOn: null })], true, 'no verifiedOn');
expect('an unknown status value', [base({ status: 'PROBABLY_FINE' })], true, 'unknown status');

console.log('\nA box derived from a printed size rather than stated in pixels:');
// DERIVED claims less than VERIFIED: the requirement is from a document, the pixel
// box is not. The two fields that keep that honest are the source and the dpi, so
// both are tested in both directions.
expect(
  'DERIVED with no source',
  [base({ status: 'DERIVED', source: '', verifiedOn: '2026-01-01', dpi: 200, note: 'derived' })],
  true,
  'no source'
);
expect(
  'DERIVED with no verifiedOn',
  [base({ status: 'DERIVED', verifiedOn: null, dpi: 200, note: 'derived' })],
  true,
  'no verifiedOn'
);
// The dpi is the one part of a DERIVED entry the source does NOT state. An entry
// without it is asserting a pixel box it cannot account for, which is the exact
// thing the status exists to prevent.
expect(
  'DERIVED with no dpi, hiding the fact that the resolution is ours',
  [base({ status: 'DERIVED', verifiedOn: '2026-01-01', note: 'derived' })],
  true,
  'no dpi'
);
expect(
  'DERIVED with a non-numeric dpi',
  [base({ status: 'DERIVED', verifiedOn: '2026-01-01', dpi: 'high', note: 'derived' })],
  true,
  'no dpi'
);
expect(
  'DERIVED with no note, so the dpi choice is never disclosed',
  [base({ status: 'DERIVED', verifiedOn: '2026-01-01', dpi: 200 })],
  true,
  'no note'
);
expect(
  'a correctly declared DERIVED entry passes',
  [base({ status: 'DERIVED', verifiedOn: '2026-01-01', dpi: 200, note: 'the source states a printed size, not pixels' })],
  false
);
// VERIFIED must not be reachable by simply dropping the dpi: if the pixels were
// really stated by the document it is VERIFIED, and if they were not it is DERIVED.
expect(
  'a VERIFIED entry carrying a dpi is still fine, it just does not need one',
  [base({ status: 'VERIFIED', verifiedOn: '2026-01-01', dpi: 200 })],
  false
);

console.log('\nThe claim must carry its evidence:');
expect('no feasibility declared', [base({ feasibility: undefined })], true, 'no feasibility');
expect('unknown feasibility value', [base({ feasibility: 'probably-fine' })], true, 'unknown feasibility');
expect('no measuredOver sweep', [base({ measuredOver: undefined })], true, 'unevidenced');
expect('measuredOver with no fixture', [base({ measuredOver: { grain: [12] } })], true, 'no fixture');
expect('measuredOver with no grain levels', [base({ measuredOver: { fixture: 'photo', grain: [] } })], true, 'no grain levels');
expect('measuredOver.density not an array', [base({ measuredOver: { fixture: 'scan', grain: [12], density: 2 } })], true, 'not an array');
expect('no measuredOn date', [base({ measuredOn: undefined })], true, 'no measuredOn');
expect('no measuredWith method', [base({ measuredWith: undefined })], true, 'no measuredWith');
expect('rules not an array', [base({ rules: 'black ink' })], true, 'rules');

console.log('\nReferential integrity:');
expect('preferLarger points at a missing id', [base({ preferLarger: 'does-not-exist' })], true, 'missing preferLarger');

console.log('\nConsistency between the declared fields:');
expect('marginal with no alternative and no reason', [base({ feasibility: 'marginal', riskNote: 'x' })], true, 'no alternative');
expect('unreachable with no alternative and no reason', [base({ feasibility: 'unreachable' })], true, 'no alternative');
expect(
  'marginal with a valid alternative passes',
  [base({ id: 'a', feasibility: 'marginal', riskNote: 'compact signatures fall short', preferLarger: 'b' }), base({ id: 'b' })],
  false
);
expect(
  'marginal with an explicit noLargerReading reason passes',
  [base({ feasibility: 'marginal', riskNote: 'compact signatures fall short', noLargerReading: 'no printed size is documented' })],
  false
);
expect(
  'both preferLarger and noLargerReading',
  [base({ id: 'a', feasibility: 'marginal', riskNote: 'x', preferLarger: 'b', noLargerReading: 'nope' }), base({ id: 'b' })],
  true,
  'contradict'
);
// 'marginal' means input-dependent, so the entry must say WHICH inputs fail.
expect('marginal with no riskNote', [base({ feasibility: 'marginal', noLargerReading: 'none documented' })], true, 'no riskNote');
// ...and a comfortable box has no failing input, so a riskNote there is a lie.
expect('comfortable with a riskNote', [base({ riskNote: 'sometimes fails' })], true, 'riskNote');
expect(
  'a riskNote on a marginal entry passes',
  [base({ feasibility: 'marginal', riskNote: 'a compact signature falls short', noLargerReading: 'none documented' })],
  false
);

// The refusal sentence is `group + liveCaptureNote`. Without the note the tool
// refuses to produce a file and never says why — the worst possible failure, since
// the user cannot tell a deliberate refusal from a broken page.
console.log('\nA requirement the tool must refuse to satisfy (live capture only):');
expect(
  'liveCaptureOnly with no liveCaptureNote, so the refusal prints "undefined"',
  [base({ liveCaptureOnly: true })],
  true,
  'no liveCaptureNote'
);
expect(
  'liveCaptureOnly with an empty liveCaptureNote',
  [base({ liveCaptureOnly: true, liveCaptureNote: '' })],
  true,
  'no liveCaptureNote'
);
expect(
  'a liveCaptureNote on an entry the tool does NOT refuse, so the note reads as a rule that is not enforced',
  [base({ liveCaptureNote: 'requires a live capture' })],
  true,
  'not liveCaptureOnly'
);
expect(
  'a correctly declared liveCaptureOnly entry passes',
  [base({ liveCaptureOnly: true, liveCaptureNote: 'requires the photograph to be captured live' })],
  false
);

console.log('\nA ceiling-only requirement (MPSC states a maximum and no minimum):');
expect(
  'noMinimum carrying a real floor, which would hide an invented minimum',
  [base({ minKB: 20, noMinimum: true, note: 'source states a maximum only' })],
  true,
  'sentinel'
);
expect(
  'noMinimum with no note explaining the missing floor',
  [base({ minKB: NO_MINIMUM_KB, noMinimum: true })],
  true,
  'ceiling only'
);
expect(
  'the no-minimum sentinel used without declaring noMinimum',
  [base({ minKB: NO_MINIMUM_KB })],
  true,
  'noMinimum: true'
);
expect(
  'a correctly declared ceiling-only entry passes',
  [base({ minKB: NO_MINIMUM_KB, noMinimum: true, note: 'the source states a maximum and no minimum' })],
  false
);

console.log('\nTHE HEADLINE CASE — the exact bug this project exists to fix:');
expect(
  '140x60 box with a 10 KB floor marked "comfortable"',
  [base({ id: 'tight', width: 140, height: 60, minKB: 10, maxKB: 20, feasibility: 'comfortable' })],
  true,
  'bytes/px'
);
expect(
  'the same box correctly marked "marginal" passes',
  [base({ id: 'tight', width: 140, height: 60, minKB: 10, maxKB: 20, feasibility: 'marginal', riskNote: 'compact signatures fall short', noLargerReading: 'none documented' })],
  false
);
expect(
  'the same box marked "unreachable" is allowed through as a warning',
  [base({ id: 'tight', width: 140, height: 60, minKB: 10, maxKB: 20, feasibility: 'unreachable', noLargerReading: 'none documented' })],
  false
);

console.log('\nArithmetic and shape:');
expect('minimum greater than maximum', [base({ minKB: 50, maxKB: 20 })], true, 'invalid size window');
expect('zero minimum', [base({ minKB: 0 })], true, 'invalid size window');
expect('zero dimensions', [base({ width: 0, height: 500 })], true, 'invalid dimensions');
expect('duplicate ids', [base({ id: 'same' }), base({ id: 'same' })], true, 'duplicate');
expect('empty registry', [], true, 'no specs at all');
expect('missing id', [base({ id: '' })], true, 'no id');

console.log('\n' + '='.repeat(100));
console.log(`  passed: ${pass}    failed: ${fail}`);
if (fail === 0) {
  console.log('  Every guard rule fires on a broken entry, and stays silent on a good one.');
} else {
  console.log('  A guard rule is not working. Do not ship until this is green.');
}
console.log('='.repeat(100));

process.exit(fail === 0 ? 0 : 1);
