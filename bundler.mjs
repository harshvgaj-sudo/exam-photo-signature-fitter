/*
 * bundler.mjs — turn a modular tool into ONE self-contained .html file.
 *
 * Why this exists: ES modules cannot be loaded from a file:// origin, so the
 * multi-file form of a tool cannot be opened by double-clicking, and cannot be
 * opened at all on a phone. For a tool that must work locally, one file is the
 * only form that reliably does.
 *
 * Extracted from build_single_file.mjs so a second tool can use the same
 * logic. The build is deliberately strict: if the module syntax changes in a way
 * this simple bundler cannot handle, it FAILS rather than emitting a broken
 * bundle that looks fine until it is opened.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Strip module syntax so the files can share one function scope. */
export function stripModuleSyntax(code, name, problems) {
  let out = code;

  // Single-line `import ... from '...';`
  out = out.replace(/^\s*import\s+[^;\n]*?from\s+['"][^'"]+['"]\s*;?\s*$/gm, '');

  // A declaration can share a line with the doc comment above it
  // (`/** ... */export function f()`), which is easy to introduce by accident when
  // editing. Every strip below is line-anchored, so the keyword would survive into
  // the bundle and the page would die with "Unexpected token 'export'". Put it back
  // at the start of a line first.
  out = out.replace(/\*\/([^\S\n]*)(export\b)/g, '*/\n$2');

  // `export const|let|var|function|class|async function`
  out = out.replace(/^(\s*)export\s+(const|let|var|function|class|async\s+function)\b/gm, '$1$2');

  // Bare `export { a, b };`
  out = out.replace(/^\s*export\s*\{[^}]*\}\s*;?\s*$/gm, '');

  // Anything left means the bundler would silently produce a broken file.
  if (/^\s*import\s/m.test(out)) problems.push(`${name}: unhandled import statement (is it multi-line?)`);
  // Deliberately NOT anchored to the line start, and deliberately WIDER than the
  // strip above. Anchoring it the same way as the strip is what let a same-line
  // `*/export function` through both at once: the bundle shipped with a live
  // `export` keyword and the page died with "Unexpected token 'export'" while the
  // build reported success. It also covers `export default` and `export *`, which
  // the strip cannot inline into a shared scope and therefore must refuse rather
  // than drop. A false positive here fails the build loudly, which is the safe
  // direction; a false negative ships a broken tool.
  if (/(^|[^\w$.'"`])export\s+(const|let|var|function|class|async\s+function|\{|default|\*)/m.test(out)) {
    problems.push(`${name}: unhandled export statement`);
  }

  return out;
}

/** Collisions between modules would silently overwrite one another in one scope. */
export function checkCollisions(units, problems) {
  const seen = new Map();
  for (const { name, code } of units) {
    for (const m of code.matchAll(/^(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/gm)) {
      const id = m[1];
      if (seen.has(id)) problems.push(`name collision on "${id}": ${seen.get(id)} and ${name}`);
      else seen.set(id, name);
    }
  }
}

/**
 * Bundle a tool into a single HTML string.
 *
 * @param {object} opts
 * @param {string} opts.srcDir      absolute path to the tool's source directory
 * @param {string[]} opts.modules   module paths relative to srcDir, in dependency order
 * @param {string} opts.cssFile     stylesheet path relative to srcDir
 * @param {string} opts.indexPath   the HTML entry point (absolute)
 * @param {object} opts.manifest    web-app manifest, inlined as a data: URL
 * @param {string} [opts.banner]    comment to place at the top of the bundled script
 * @returns {{ok: boolean, problems: string[], html: string}}
 */
export function bundle({ srcDir, modules, cssFile, indexPath, manifest, banner }) {
  const problems = [];

  const units = modules.map((rel) => {
    const code = readFileSync(join(srcDir, rel), 'utf8');
    return { name: rel, code: stripModuleSyntax(code, rel, problems) };
  });

  checkCollisions(units, problems);

  const css = readFileSync(join(srcDir, cssFile), 'utf8');

  // Defensive: an inline script must not contain a closing script tag.
  const safeJs = units.map((u) => u.code).join('\n\n').replace(/<\/script/gi, '<\\/script');
  const safeCss = css.replace(/<\/style/gi, '<\\/style');

  let html = readFileSync(indexPath, 'utf8');

  const cssLink = /<link rel="stylesheet" href="css\/style\.css">/;
  const jsTag = /<script type="module" src="js\/app\.js"><\/script>/;

  if (!cssLink.test(html)) problems.push('index.html: stylesheet link not found (expected exactly one)');
  if (!jsTag.test(html)) problems.push('index.html: module script tag not found (expected exactly one)');
  if (problems.length) return { ok: false, problems, html: '' };

  const js = [banner, "'use strict';", ...units.map((u) => u.code)].filter(Boolean).join('\n\n');
  const wrapped = `(function () {\n${js}\n})();`;

  html = html.replace(cssLink, `<style>\n${safeCss}\n</style>`);
  html = html.replace(jsTag, `<script>\n${wrapped.replace(/<\/script/gi, '<\\/script')}\n</script>`);

  // A data: URL manifest lets "Add to Home Screen" work on a hosted copy without
  // a second file. Harmless on file://.
  html = html.replace(
    '<title>',
    `<meta name="theme-color" content="#1f6feb">\n`
    + `<link rel="manifest" href="data:application/manifest+json,${encodeURIComponent(JSON.stringify(manifest))}">\n`
    + '<title>'
  );

  // Sanity: no local file references should survive.
  const leftovers = [...html.matchAll(/(?:src|href)="(?!#|data:|https?:)([^"]+)"/g)].map((m) => m[1]);
  if (leftovers.length) {
    problems.push('output still references local files: ' + [...new Set(leftovers)].join(', '));
    return { ok: false, problems, html: '' };
  }

  return { ok: true, problems, html };
}
