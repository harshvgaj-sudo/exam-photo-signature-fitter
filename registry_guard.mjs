/*
 * registry_guard.mjs — the rules a requirement entry must satisfy to ship.
 *
 * Extracted from the build script so it can be TESTED. A guard that is only ever
 * run against a correct registry proves nothing; the only way to know it works is
 * to feed it deliberately broken entries and check that it objects. See
 * _verify/test_registry_guard.mjs.
 *
 * This is the STATIC half of the verification:
 *   - shape and provenance (every claim has a source and a date)
 *   - referential integrity (preferLarger points at something real)
 *   - cheap arithmetic that catches a self-contradictory box/window pair
 *   - the presence of the evidence a behavioural claim depends on
 *
 * The BEHAVIOURAL half lives in _verify/check_specs.mjs, which measures every
 * entry in a real browser. Both must pass before a release.
 */

/** Bytes per pixel the minimum size demands. Above ~1.0 is at the JPEG limit. */
export const BYTES_PER_PIXEL_LIMIT = 1.0;

export const KNOWN_FEASIBILITY = ['comfortable', 'marginal', 'unreachable'];

/**
 * @param {Array<object>} specs
 * @returns {string[]} problems — empty means the registry may ship
 */
export function checkRegistry(specs) {
  const problems = [];
  const bad = (m) => problems.push(m);

  if (!Array.isArray(specs) || specs.length === 0) {
    return ['registry: no specs at all'];
  }

  const ids = new Set(specs.map((s) => s.id));
  if (ids.size !== specs.length) bad('registry: duplicate spec ids');

  for (const s of specs) {
    const at = `registry: ${s.id || '<missing id>'}`;

    if (!s.id) bad('registry: an entry has no id');

    if (s.status === 'VERIFIED') {
      if (!s.source) bad(`${at} is VERIFIED but has no source`);
      if (!s.verifiedOn) bad(`${at} is VERIFIED but has no verifiedOn date`);
    }

    if (s.status === 'CUSTOM') continue;

    /* ---------------------------------------------------- the claim itself */
    if (!s.feasibility) bad(`${at} declares no feasibility`);
    else if (!KNOWN_FEASIBILITY.includes(s.feasibility)) {
      bad(`${at} has an unknown feasibility "${s.feasibility}"`);
    }

    /* ------------------------------- the evidence the claim is based on */
    // A feasibility number with no declared sweep and no date is an assertion,
    // not a measurement. The sweep matters because a single fixture cannot tell
    // 'marginal' from 'comfortable' — input variation is the whole question.
    if (!s.measuredOver || typeof s.measuredOver !== 'object') {
      bad(`${at} declares no measuredOver sweep, so its feasibility is unevidenced`);
    } else {
      if (!s.measuredOver.fixture) bad(`${at} has a measuredOver with no fixture`);
      if (!Array.isArray(s.measuredOver.grain) || s.measuredOver.grain.length === 0) {
        bad(`${at} has a measuredOver with no grain levels`);
      }
      if (s.measuredOver.density !== undefined && !Array.isArray(s.measuredOver.density)) {
        bad(`${at} has a measuredOver.density that is not an array`);
      }
    }
    if (!s.measuredOn) bad(`${at} declares no measuredOn date`);
    if (!s.measuredWith) bad(`${at} declares no measuredWith method`);

    /* ------------------------------------------------------- the escape hatch */
    if (!Array.isArray(s.rules)) bad(`${at} has no rules array`);

    if (s.preferLarger && !ids.has(s.preferLarger)) {
      bad(`${at} points at a missing preferLarger "${s.preferLarger}"`);
    }
    if (s.preferLarger && s.noLargerReading) {
      bad(`${at} declares both preferLarger and noLargerReading, which contradict`);
    }
    // Anything that is not comfortably reachable must give the user a way out, or
    // an explicit statement that no documented alternative exists. A dead end with
    // no explanation is the thing that makes a viewer leave.
    if (['marginal', 'unreachable'].includes(s.feasibility) && !s.preferLarger && !s.noLargerReading) {
      bad(`${at} is ${s.feasibility} but offers no alternative and no stated reason`);
    }

    /* --------------------------------------------------- riskNote coupling */
    // 'marginal' MEANS input-dependent, so the entry must say which inputs fail.
    // Conversely a comfortable box has no input that fails, so a riskNote there is
    // a contradiction.
    if (s.feasibility === 'marginal' && !s.riskNote) {
      bad(`${at} is marginal but has no riskNote saying which inputs fall short`);
    }
    if (s.feasibility === 'comfortable' && s.riskNote) {
      bad(`${at} declares a riskNote but its feasibility is "comfortable"`);
    }

    /* ------------------------- cheap independent arithmetic cross-check */
    // This is the rule that catches the original bug class: a pixel box too small
    // to hold its own size window, marked as if it were fine.
    if (Number.isFinite(s.minKB) && Number.isFinite(s.width) && Number.isFinite(s.height)) {
      const bytesPerPixel = (s.minKB * 1024) / (s.width * s.height);
      if (bytesPerPixel > BYTES_PER_PIXEL_LIMIT && s.feasibility === 'comfortable') {
        bad(
          `${at} needs ${bytesPerPixel.toFixed(2)} bytes/px to reach its ${s.minKB} KB floor at ` +
          `${s.width}x${s.height} — at the JPEG limit — but declares "comfortable"`
        );
      }
    }

    /* ------------------------------------------------------------ sanity */
    if (!(s.minKB > 0) || !(s.maxKB > 0) || s.minKB > s.maxKB) {
      bad(`${at} has an invalid size window (${s.minKB}-${s.maxKB} KB)`);
    }
    if (!(s.width > 0) || !(s.height > 0)) {
      bad(`${at} has invalid dimensions (${s.width}x${s.height})`);
    }
  }

  return problems;
}
