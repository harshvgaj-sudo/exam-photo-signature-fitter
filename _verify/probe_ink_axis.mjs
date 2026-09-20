/*
 * probe_ink_axis.mjs — does more ink make the file BIGGER or SMALLER?
 *
 * WHY THIS EXISTS
 * The riskNote on ssc-signature tells the user: "The deciding factor is how much
 * INK is on the page — not how clean the scan is. So if this preset refuses, the
 * fix is a larger box or a denser signature, never a further size reduction."
 *
 * check_specs.mjs now reports the WORST input per entry, and for ssc-signature it
 * is `grain 4, density 6` — the DENSEST ink on the sweep. That is the opposite of
 * what that sentence predicts. If denser ink really produces a smaller file, the
 * advice in a user-facing warning is backwards, which is worse than having no
 * advice at all.
 *
 * The mechanism, if it is real: makeScan thickens the strokes as `density` rises,
 * so at 140x60 a dense signature downscales to a near-uniform blob — few edges,
 * cheap to encode — while a sparse one keeps high-frequency edge detail. That
 * would be a property of the FIXTURE as much as of reality, so it needs measuring
 * before any sentence is written from it.
 *
 * This prints the whole sweep for both signature boxes, so the direction of the
 * effect is visible per axis rather than inferred from one extreme.
 *
 * Run: node _verify/probe_ink_axis.mjs
 */
import { measureBrowserTruth } from './browser_truth.mjs';

const { records, meta } = await measureBrowserTruth({ log: (m) => console.log('  ' + m) });
console.log(`browser : ${meta.chrome}\n`);

for (const id of ['ssc-signature', 'ssc-signature-large']) {
  const rs = records.filter((r) => r.id === id);
  const density = rs[0].density === null ? [] : [...new Set(rs.map((r) => r.density))].sort((a, b) => a - b);
  const grain = [...new Set(rs.map((r) => r.grain))].sort((a, b) => a - b);

  console.log('='.repeat(96));
  console.log(`${id} — ${rs[0].specWidth}x${rs[0].specHeight} px, ` +
    `${rs[0].minBytes / 1024}-${rs[0].maxBytes / 1024} KB.  Best achievable KB at q=1.0.`);
  console.log('='.repeat(96));
  console.log('grain \\ density'.padEnd(16) + density.map((d) => `d=${d}`.padEnd(10)).join(''));
  console.log('-'.repeat(16 + density.length * 10));
  for (const g of grain) {
    const cells = density.map((d) => {
      const r = rs.find((x) => x.grain === g && x.density === d);
      return (r ? (r.atMax / 1024).toFixed(1) : '-').padEnd(10);
    });
    console.log(`grain ${g}`.padEnd(16) + cells.join(''));
  }

  // Per-axis means, which is what decides whether the sentence can be written at all.
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const kb = (r) => r.atMax / 1024;
  console.log('-'.repeat(16 + density.length * 10));
  console.log('MEAN by density  ' + density.map((d) =>
    mean(rs.filter((r) => r.density === d).map(kb)).toFixed(1).padEnd(10)).join(''));
  console.log('MEAN by grain    ' + grain.map((g) =>
    mean(rs.filter((r) => r.grain === g).map(kb)).toFixed(1).padEnd(10)).join(''));
  console.log('');
}
