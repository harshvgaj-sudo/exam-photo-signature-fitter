/*
 * probe_signature_density.mjs — can ANY realistic signature reach 10 KB at 140x60?
 *
 * The grain sweep alone said no: across seven input qualities the best achievable
 * file was 8.3-9.2 KB, every one below the 10 KB floor. That would make the box
 * 'unreachable' rather than 'marginal'.
 *
 * But grain is only one axis. The other is how much INK is on the page: a large,
 * elaborate signature puts far more high-frequency edge into the frame than a
 * small compact one. If a dense signature reaches 10 KB, the honest label is
 * 'marginal' — input-dependent — and the tool should say "your signature may or
 * may not fit, here is the larger box". If even an extreme signature cannot reach
 * it, 'unreachable' is the correct label and the preset must lead with the larger
 * box instead of pretending.
 *
 * Density 6 is deliberately beyond anything a person writes: it bounds the answer
 * from above. If the box fails at density 6 it fails for everybody.
 */
import { runInBrowser, GRAIN_SWEEP } from './browser_truth.mjs';
import { makeScan, writeJpeg, resetSeed, SEEDS } from './fixtures.mjs';

const W = 140, H = 60, MIN = 10 * 1024, MAX = 20 * 1024;

const GRAINS = [0, 16, 32];
const DENSITIES = [1, 2, 4, 6];

const fixtures = {};
const jobs = [];
for (const g of GRAINS) {
  for (const dn of DENSITIES) {
    const key = `scan@g${g}d${dn}`;
    resetSeed(SEEDS.scan);
    fixtures[key] = writeJpeg(null, makeScan(2400, 1400, g, dn), 90);
    jobs.push({
      key: { grain: g, density: dn },
      fixtureKey: key,
      width: W, height: H, minBytes: MIN, maxBytes: MAX,
    });
  }
}

console.log('='.repeat(100));
console.log('CAN A DENSE SIGNATURE REACH 10 KB AT 140x60?');
console.log(`box 140x60 = ${W * H} pixels. Floor 10 KB demands ${(MIN / (W * H)).toFixed(2)} bytes per pixel.`);
console.log('='.repeat(100));

const { records, meta } = await runInBrowser(fixtures, jobs, { log: (m) => console.log(m) });
console.log(`browser: ${meta.chrome}\n`);

console.log('        ' + DENSITIES.map((d) => `density ${d}`.padStart(13)).join(''));
console.log('        ' + DENSITIES.map(() => '------------'.padStart(13)).join(''));
const grid = {};
for (const g of GRAINS) {
  const cells = DENSITIES.map((dn) => {
    const r = records.find((x) => x.grain === g && x.density === dn);
    grid[`${g}|${dn}`] = r.atMax;
    return ((r.atMax / 1024).toFixed(2) + ' KB').padStart(13);
  });
  console.log(`grain ${String(g).padEnd(3)}` + cells.join(''));
}
console.log('');

const all = Object.values(grid);
const best = Math.max(...all);
const bestRatio = best / MIN;
const above = all.filter((b) => b >= MIN).length;

console.log(`best achievable anywhere in the grid : ${(best / 1024).toFixed(2)} KB  (ratio ${bestRatio.toFixed(3)}x the floor)`);
console.log(`cells at or above the 10 KB floor    : ${above} of ${all.length}`);
console.log('');

if (above === 0) {
  console.log('VERDICT: UNREACHABLE.');
  console.log(`  Even at density 6 — more ink than a person writes — the box tops out at`);
  console.log(`  ${(best / 1024).toFixed(2)} KB, still ${((MIN - best) / 1024).toFixed(2)} KB short of the floor.`);
  console.log('  No signature can satisfy 140x60 with a 10 KB minimum through this tool.');
  console.log('  The registry must say so, and the preset must lead with the larger box.');
} else if (above < all.length) {
  console.log('VERDICT: MARGINAL — input-dependent.');
  console.log(`  ${above} of ${all.length} realistic signatures reach the floor; the rest do not.`);
  console.log('  The registry must warn, and the preset must offer the larger box.');
} else {
  console.log('VERDICT: COMFORTABLE. The earlier "unreachable" reading was an artefact of');
  console.log('  varying only grain. Re-check: this contradicts the grain sweep.');
}
console.log('='.repeat(100));
