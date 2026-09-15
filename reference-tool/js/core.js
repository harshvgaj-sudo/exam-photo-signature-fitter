/**
 * core.js — pure processing logic. No DOM access, no globals.
 *
 * Kept free of browser APIs on purpose: every function here can be run under
 * Node in a test harness, so the algorithm is verified by execution rather than
 * by inspection. See ../../_verify/test_core.mjs.
 *
 * Design rule that the previous implementation broke:
 *   DIMENSIONS ARE A HARD CONSTRAINT. FILE SIZE IS A RANGE.
 * Dimensions are fixed first; only JPEG quality is searched afterwards.
 */

/** Aspect-preserving crop rectangle (centre-anchored) that exactly covers target dims.
 *  Returns exact floats. Rounding here would reintroduce a small stretch when the
 *  crop is resampled to the target size, so rounding happens only for display. */
export function coverRect(srcW, srcH, dstW, dstH) {
  const srcAspect = srcW / srcH;
  const dstAspect = dstW / dstH;
  let w, h;
  if (srcAspect > dstAspect) {
    h = srcH;
    w = srcH * dstAspect;
  } else {
    w = srcW;
    h = srcW / dstAspect;
  }
  return { x: (srcW - w) / 2, y: (srcH - h) / 2, width: w, height: h };
}

/** Clamp a crop rectangle so it always stays inside the source image. */
export function clampCrop(crop, srcW, srcH) {
  const width = Math.min(crop.width, srcW);
  const height = Math.min(crop.height, srcH);
  return {
    x: Math.max(0, Math.min(srcW - width, crop.x)),
    y: Math.max(0, Math.min(srcH - height, crop.y)),
    width,
    height,
  };
}

/**
 * Largest JPEG quality whose encoded size stays within [minBytes, maxBytes].
 *
 * @param {(q:number) => Promise<number>} measure  resolves to encoded byte length
 * @param {number} minBytes  inclusive lower bound (spec minimum)
 * @param {number} maxBytes  inclusive upper bound (spec maximum)
 * @param {number} maxIterations hard cap — guarantees termination
 *
 * Never reports success for a file that fails the stated checks.
 */
export async function searchQuality({ measure, minBytes, maxBytes, maxIterations = 12 }) {
  if (!(maxBytes > 0) || !(minBytes > 0) || minBytes > maxBytes) {
    return { ok: false, reason: 'INVALID_WINDOW', encodes: 0 };
  }

  let lo = 0.05;
  let hi = 1.0;
  let bestBytes = null;
  let bestQuality = null;
  let encodes = 0;

  const atMax = await measure(1.0);
  encodes++;
  if (atMax <= maxBytes) {
    bestBytes = atMax;
    bestQuality = 1.0;
  } else {
    for (let i = 0; i < maxIterations; i++) {
      const mid = (lo + hi) / 2;
      const bytes = await measure(mid);
      encodes++;
      if (bytes <= maxBytes) {
        bestBytes = bytes;
        bestQuality = mid;
        lo = mid;
      } else {
        hi = mid;
      }
    }
  }

  if (bestBytes === null) {
    return { ok: false, reason: 'CANNOT_REACH_MAX', encodes };
  }
  if (bestBytes < minBytes) {
    // Physically impossible without altering the document. Say so.
    return { ok: false, reason: 'BELOW_MINIMUM', bytes: bestBytes, quality: bestQuality, encodes };
  }
  return { ok: true, reason: 'MEETS_SPEC', bytes: bestBytes, quality: bestQuality, encodes };
}

/**
 * How much room does a pixel box have above the minimum size?
 *
 * This exists because "it fits the window" is not the same as "it will keep
 * fitting". JPEG quality 1.0 uses near-lossless quantisation tables, so almost
 * any pixel box can be forced into almost any window at maximum quality. A box
 * that only clears the floor at quality 1.000 has no headroom: the next image,
 * from a cleaner scan, will fall under it.
 *
 * The floor is the only real risk, because lowering quality only makes a file
 * smaller. So the test is: how far above the minimum does the BEST achievable
 * file sit?
 *
 * @param {number} bestBytes best achievable encoded size (measured at quality 1.0)
 * @param {number} minBytes  spec minimum
 * @returns {'comfortable'|'marginal'|'unreachable'|'unknown'}
 */
export const HEADROOM_COMFORTABLE = 1.15;

export function classifyHeadroom(bestBytes, minBytes) {
  if (!(bestBytes > 0) || !(minBytes > 0)) return 'unknown';
  const ratio = bestBytes / minBytes;
  if (ratio < 1) return 'unreachable';
  if (ratio < HEADROOM_COMFORTABLE) return 'marginal';
  return 'comfortable';
}

/**
 * Classify a box+window from a SWEEP of realistic inputs rather than one image.
 *
 * A single measurement cannot separate 'marginal' from 'comfortable', because the
 * thing that actually breaks a preset is input variation: one viewer's phone
 * produces a cleaner, more compressible scan than the next. Measuring one fixture
 * and calling the answer the truth is the same mistake as claiming success for a
 * file that fails its own checks — it just moves the error one level up.
 *
 * So the sweep is the basis:
 *   every sample below the floor          -> unreachable (never a valid box)
 *   some samples below, or some within    -> marginal    (input-dependent; warn)
 *   every sample clears the floor by 1.15x -> comfortable
 *
 * @param {number[]} samples  best achievable bytes at q=1.0, one per realistic input
 * @param {number} minBytes   spec minimum
 */
export function classifySweep(samples, minBytes) {
  const usable = (samples || []).filter((b) => Number.isFinite(b) && b > 0);
  if (!usable.length || !(minBytes > 0)) return 'unknown';
  const floor = minBytes * HEADROOM_COMFORTABLE;
  const below = usable.filter((b) => b < minBytes).length;
  const tight = usable.filter((b) => b >= minBytes && b < floor).length;
  if (below === usable.length) return 'unreachable';
  if (below > 0 || tight > 0) return 'marginal';
  return 'comfortable';
}

/** Re-check a finished file against the spec. The UI must call this before claiming success. */
export function verify(spec, actual) {
  const problems = [];
  if (actual.width !== spec.width || actual.height !== spec.height) {
    problems.push(`dimensions ${actual.width}x${actual.height}, required ${spec.width}x${spec.height}`);
  }
  const kb = actual.bytes / 1024;
  if (kb < spec.minKB) problems.push(`size ${kb.toFixed(2)} KB is below the ${spec.minKB} KB minimum`);
  if (kb > spec.maxKB) problems.push(`size ${kb.toFixed(2)} KB exceeds the ${spec.maxKB} KB maximum`);
  if (spec.format && actual.mime !== spec.format) {
    problems.push(`format ${actual.mime}, required ${spec.format}`);
  }
  return { pass: problems.length === 0, problems };
}

/** Human-readable failure text. Never a bare "Success!". */
export function explainFailure(result, spec, largerSpec) {
  switch (result.reason) {
    case 'BELOW_MINIMUM': {
      const base =
        `This image cannot reach ${spec.minKB} KB at ${spec.width}x${spec.height} ` +
        `even at maximum quality (best achieved: ${(result.bytes / 1024).toFixed(2)} KB). ` +
        `The picture content is too simple to compress into that window. ` +
        `Try a sharper, higher-contrast capture, or a larger allowed dimension if the ` +
        `requirement permits one.`;
      if (largerSpec) {
        return (
          base +
          ` The source document also gives a larger reading of this same requirement — ` +
          `${largerSpec.width}x${largerSpec.height} px (${largerSpec.label}) — where the window ` +
          `is comfortable. Use the button below to switch to it.`
        );
      }
      return base;
    }
    case 'CANNOT_REACH_MAX':
      return `This image cannot be brought under ${spec.maxKB} KB at the required dimensions.`;
    case 'INVALID_WINDOW':
      return 'The size window is invalid: the minimum must be greater than zero and not exceed the maximum.';
    default:
      return 'The file did not meet the stated requirements.';
  }
}
