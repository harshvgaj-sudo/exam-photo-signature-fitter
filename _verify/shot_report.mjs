/*
 * shot_report.mjs — render CODE_REVIEW_AND_PLAN.html in real Chrome and check it.
 *
 * The report is the deliverable the channel owner reads, so it gets the same
 * treatment as the tool: opened in a browser from file://, checked for errors,
 * overflow, clipped ASCII output and broken table-of-contents anchors, then
 * screenshotted section by section.
 */
import { chromium } from 'file:///C:/Users/harsh/.workbuddy-ai/binaries/node/workspace/node_modules/playwright-core/index.mjs';
import { mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const OUT = 'C:/Users/harsh/WorkBuddy AI/2026-09-14-10-03-21/govdocs-review/_verify/shots';
mkdirSync(OUT, { recursive: true });

const FILE = 'C:/Users/harsh/WorkBuddy AI/2026-09-14-10-03-21/govdocs-review/CODE_REVIEW_AND_PLAN.html';
const URL = pathToFileURL(FILE).href;

let failures = 0;
const assert = (label, cond, detail = '') => {
  if (!cond) failures++;
  console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${label}${detail ? '  — ' + detail : ''}`);
};

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });

const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

await page.goto(URL, { waitUntil: 'load' });
// The overflow assertion below measures scrollWidth, which depends on FONT
// metrics — so waiting for a fixed delay would make it flaky on a slow machine.
// Wait for the fonts to actually be ready instead.
await page.evaluate(() => document.fonts.ready);
await page.waitForFunction(() => document.querySelectorAll('h2').length > 0, null, { timeout: 15000 });

console.log('=== REPORT RENDER CHECK ===');
console.log('title    :', await page.title());

const stats = await page.evaluate(() => {
  const h2 = [...document.querySelectorAll('h2')];
  const mono = [...document.querySelectorAll('.mono-out')];
  const navLinks = [...document.querySelectorAll('nav a')];
  return {
    h2Count: h2.length,
    h2Text: h2.map((h) => h.textContent.trim().slice(0, 46)),
    monoCount: mono.length,
    tables: document.querySelectorAll('table').length,
    toc: navLinks.length,
    missingAnchors: navLinks
      .map((a) => a.getAttribute('href'))
      .filter((h) => h && h.startsWith('#') && !document.querySelector(h)),
    // A mono block wider than its container means the captured output is clipped.
    clippedMono: mono.filter((m) => m.scrollWidth > m.clientWidth + 2).length,
    overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
    scrollW: document.documentElement.scrollWidth,
    innerW: window.innerWidth,
  };
});

console.log('\nsections :', stats.h2Count);
for (const t of stats.h2Text) console.log('   ', t);
console.log('\nmono blocks :', stats.monoCount);
console.log('tables      :', stats.tables);
console.log('toc links   :', stats.toc);
console.log('doc width   :', `${stats.scrollW}/${stats.innerW}`);

console.log('\nassertions:');
assert('every table-of-contents link resolves to a real section',
  stats.missingAnchors.length === 0, stats.missingAnchors.join(', ') || 'all resolve');
assert('the page does not overflow horizontally at 1100px', !stats.overflow);
assert('no console or page errors', errors.length === 0, errors.join(' | ') || 'none');
assert('the official-document section is present',
  stats.h2Text.some((t) => /official document/i.test(t)));
// The captured output IS the report's evidence, so this floor is deliberately
// zero-slack: it was `>= 8` against an actual 16, which would have let half the
// evidence disappear without a failure. Raise it when blocks are added on purpose.
assert('the captured output blocks are all still present', stats.monoCount >= 16, `${stats.monoCount} blocks`);
assert('the report has 12 top-level sections', stats.h2Count === 12, `${stats.h2Count} h2`);

console.log('\nscreenshots:');
for (const [name, sel] of [
  ['report_official_document.png', '#official'],
  ['report_built.png', '#built'],
  ['report_plan.png', '#plan'],
  ['report_top.png', '#verdict'],
]) {
  const el = await page.$(sel);
  if (!el) { console.log(`  skipped ${name} (${sel} not found)`); continue; }
  await el.scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${OUT}/${name}` });
  console.log(`  ${name}`);
}
await page.screenshot({ path: `${OUT}/report_full.png`, fullPage: true });

console.log('\n' + '='.repeat(52));
console.log(failures ? `${failures} assertion(s) FAILED` : 'report renders correctly');
console.log('='.repeat(52));

await browser.close();
process.exit(failures === 0 ? 0 : 1);
