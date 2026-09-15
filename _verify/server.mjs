/*
 * server.mjs — the static server the browser suites run against.
 *
 * Extracted from run_all.mjs so that check_specs.mjs and test_browser.mjs serve
 * the app under EXACTLY the same policy. If the two servers drifted apart, one
 * suite could pass under headers the real deployment never sends.
 *
 * The CSP string must stay identical to the [[headers]] block in
 * reference-tool/netlify.toml.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(HERE, '..');
export const TOOL = join(ROOT, 'reference-tool');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
};

export const CSP = "default-src 'none'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; "
  + "script-src 'self' 'unsafe-inline'; manifest-src 'self' data:; connect-src 'none'; "
  + "form-action 'none'; base-uri 'none'; frame-ancestors 'none'";

const SECURITY_HEADERS = {
  'Content-Security-Policy': CSP,
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};

/**
 * Serve `dir` on an ephemeral port. Pass dirs to serve extra roots, e.g.
 * { '/fx': join(HERE, 'fixtures') } so a page can load a fixture file.
 */
export function serve(dir, extraRoots = {}) {
  return new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';

      let file = join(dir, rel);
      let ok = file.startsWith(dir) && existsSync(file);

      if (!ok) {
        for (const [prefix, target] of Object.entries(extraRoots)) {
          const p = '/' + prefix.replace(/^\/+|\/+$/g, '') + '/';
          if (req.url.startsWith(p)) {
            const sub = rel.slice(p.length - 1).replace(/^\/+/, '');
            const cand = join(target, sub);
            if (cand.startsWith(target) && existsSync(cand)) { file = cand; ok = true; break; }
          }
        }
      }

      if (!ok) { res.writeHead(404, SECURITY_HEADERS); res.end('not found'); return; }
      try {
        const body = await readFile(file);
        res.writeHead(200, {
          'Content-Type': MIME[extname(file)] || 'application/octet-stream',
          ...SECURITY_HEADERS,
        });
        res.end(body);
      } catch { res.writeHead(500, SECURITY_HEADERS); res.end('error'); }
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}
