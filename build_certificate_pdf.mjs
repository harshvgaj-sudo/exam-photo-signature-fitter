/*
 * build_certificate_pdf.mjs — bundle tools/certificate-pdf/ into one HTML file.
 *
 *   node build_certificate_pdf.mjs
 *
 * Output: dist/certificate-to-pdf.html — opens by double-clicking, no server.
 *
 * Uses the same bundler as the Photo & Signature Fitter, so both tools fail the
 * same way on the same class of mistake rather than each having its own quirks.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundle } from './bundler.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, 'tools', 'certificate-pdf');
const DIST = join(HERE, 'dist');

// Dependency order: a module must appear after everything it references.
// config.js is shared with the sibling tool rather than copied, so the channel
// details stay in one place.
const MODULES = [
  join('..', '..', 'reference-tool', 'js', 'config.js'),
  join('js', 'pdf.js'),
  join('js', 'app.js'),
];

const manifest = {
  name: 'Certificate to PDF',
  short_name: 'Cert to PDF',
  start_url: '.',
  display: 'standalone',
  background_color: '#0e1116',
  theme_color: '#1f6feb',
};

const result = bundle({
  srcDir: SRC,
  modules: MODULES,
  cssFile: join('css', 'style.css'),
  indexPath: join(SRC, 'index.html'),
  manifest,
});

if (!result.ok) {
  console.error('BUILD FAILED');
  for (const p of result.problems) console.error('  - ' + p);
  process.exit(1);
}

mkdirSync(DIST, { recursive: true });
const outFile = join(DIST, 'certificate-to-pdf.html');
writeFileSync(outFile, result.html, 'utf8');

const kb = (Buffer.byteLength(result.html) / 1024).toFixed(1);
console.log('BUILD OK');
console.log('  output      : ' + outFile);
console.log('  size        : ' + kb + ' KB (one file, no dependencies)');
console.log('  modules     : ' + MODULES.join(', '));
console.log('  local refs  : none');
console.log('  opens from  : file:// (double-click) or any static host');
console.log('');
console.log('  Behavioural verification:');
console.log('    node _verify/test_certificate_pdf.mjs   (writer: A4, verbatim JPEG, size)');
