/*
 * probe_csp.mjs — is the CSP actually ENFORCED, and does netlify.toml still match
 * the server the suites run against?
 *
 * server.mjs says "The CSP string must stay identical to the [[headers]] block in
 * reference-tool/netlify.toml" — in a comment. A comment is not a check. And a
 * Content-Security-Policy header that is present but malformed blocks nothing
 * while looking exactly like protection.
 *
 * This measures both, instead of assuming either.
 */
import { chromium } from 'file:///C:/Users/harsh/.workbuddy-ai/binaries/node/workspace/node_modules/playwright-core/index.mjs';
import { readFileSync } from 'node:fs';
import { serve, TOOL, ROOT, CSP } from './server.mjs';
import { join } from 'node:path';

/* ---- 1. does the deployed policy match the policy the suites run under? ---- */
const toml = readFileSync(join(ROOT, 'reference-tool', 'netlify.toml'), 'utf8');
const m = toml.match(/Content-Security-Policy\s*=\s*"([^"]+)"/);
const deployed = m ? m[1] : null;

const directives = (s) =>
  new Set((s || '').split(';').map((d) => d.trim()).filter(Boolean));

const a = directives(CSP);
const b = directives(deployed);
const onlyServer = [...a].filter((d) => !b.has(d));
const onlyDeploy = [...b].filter((d) => !a.has(d));

console.log('=== CSP PARITY: server.mjs vs netlify.toml ===');
console.log('server   :', CSP.length, 'chars,', a.size, 'directives');
console.log('deployed :', deployed ? `${deployed.length} chars, ${b.size} directives` : 'NOT FOUND');
console.log('only in server  :', onlyServer.length ? onlyServer : 'none');
console.log('only in deployed:', onlyDeploy.length ? onlyDeploy : 'none');
console.log('VERDICT:', onlyServer.length === 0 && onlyDeploy.length === 0 ? 'IDENTICAL' : 'DRIFTED');

/* ---- 2. is the policy ENFORCED, or just present? ---- */
console.log('\n=== CSP ENFORCEMENT (live, in Chrome) ===');
const { server, port } = await serve(TOOL, { fx: join(ROOT, '_verify', 'fixtures') });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage();
  const violations = [];
  await page.exposeFunction('__reportViolation', (v) => violations.push(v));
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      window.__reportViolation(`${e.violatedDirective} <- ${e.blockedURI}`);
    });
  });

  const resp = await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
  const header = resp.headers()['content-security-policy'];
  console.log('header received :', header ? 'yes' : 'NO — nothing is being enforced');
  console.log('header matches  :', header === CSP);

  // connect-src 'none' must block a same-origin fetch.
  const fetchResult = await page.evaluate(async () => {
    try {
      const r = await fetch('/index.html');
      return { blocked: false, status: r.status };
    } catch (e) {
      return { blocked: true, error: e.name + ': ' + e.message };
    }
  });
  console.log('same-origin fetch :', fetchResult.blocked
    ? `BLOCKED (${fetchResult.error})`
    : `ALLOWED (status ${fetchResult.status}) — connect-src 'none' is NOT being enforced`);

  // default-src 'none' must block a cross-origin script.
  const scriptResult = await page.evaluate(() => new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = 'https://example.com/evil.js';
    s.onload = () => resolve('ALLOWED');
    s.onerror = () => resolve('BLOCKED');
    document.head.appendChild(s);
    setTimeout(() => resolve('BLOCKED (timeout/no load)'), 2500);
  }));
  console.log('cross-origin script:', scriptResult);

  await page.waitForTimeout(400);
  console.log('violations seen  :', violations.length ? violations : 'none');
  console.log('VERDICT:', fetchResult.blocked ? 'ENFORCED' : 'NOT ENFORCED');
} finally {
  await browser.close();
  server.close();
}
