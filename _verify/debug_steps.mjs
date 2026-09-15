/*
 * debug_steps.mjs — reproduce the step 4 -> step 5 transition and log every state
 * change, so the fitAndWait timeout can be explained rather than guessed at.
 */
import { chromium } from 'file:///C:/Users/harsh/.workbuddy-ai/binaries/node/workspace/node_modules/playwright-core/index.mjs';
import { serve, TOOL, ROOT } from './server.mjs';
import { join } from 'node:path';

const FX = join(ROOT, '_verify', 'fixtures');
const PHOTO = `${FX}/photo_g12.jpg`;
const SPARSE = `${FX}/scan_g12_d1.jpg`;

const { server, port } = await serve(TOOL, { fx: FX });
const browser = await chromium.launch({ channel: 'chrome', headless: true });

const snap = (p) => p.evaluate(() => {
  const s = document.querySelector('#status');
  return {
    cls: (s && s.className) || '',
    kind: ((s && s.className) || '').replace(/^status\s*/, '').trim(),
    txt: ((s && s.textContent) || '').slice(0, 60),
    hidden: s ? s.hidden : null,
    info: ((document.querySelector('#fileInfo') || {}).textContent || '').slice(0, 60),
    disabled: document.querySelector('#processBtn')?.disabled,
    preset: document.querySelector('#presetSelect')?.value,
  };
});

try {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
  console.log('boot      :', JSON.stringify(await snap(page)));

  // step 2: load the photo
  await page.locator('#fileInput').setInputFiles(PHOTO);
  await page.waitForTimeout(1200);
  console.log('photo     :', JSON.stringify(await snap(page)));

  // step 4: click process
  await page.locator('#processBtn').click();
  await page.waitForTimeout(1500);
  console.log('after fit :', JSON.stringify(await snap(page)));

  // step 5 via runPreset's order: selectOption FIRST, then the file
  await page.selectOption('#presetSelect', 'ssc-signature');
  console.log('selOpt    :', JSON.stringify(await snap(page)));

  await page.locator('#fileInput').setInputFiles(SPARSE);
  // poll fileInfo for 3s and record when it changes
  const t0 = Date.now();
  let prev = '';
  for (let i = 0; i < 30; i++) {
    const s = await snap(page);
    if (s.info !== prev) { console.log(`  +${Date.now() - t0}ms fileInfo -> ${s.info}`); prev = s.info; }
    if (/\d+\s*x\s*\d+/.test(s.info) && i > 0) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  console.log('after load:', JSON.stringify(await snap(page)));

  // Now click and watch the status closely
  const beforeTxt = (await snap(page)).txt;
  console.log('\n--- clicking processBtn (prev text starts: ' + JSON.stringify(beforeTxt.slice(0, 40)) + ') ---');
  await page.locator('#processBtn').click();
  const seen = [];
  for (let i = 0; i < 60; i++) {
    const s = await snap(page);
    const line = `+${(i * 25).toString().padStart(4)}ms kind=${JSON.stringify(s.kind).padEnd(6)} hidden=${s.hidden} txt=${JSON.stringify(s.txt.slice(0, 34))}`;
    if (!seen.length || seen[seen.length - 1].line !== line) { seen.push({ line }); console.log('  ' + line); }
    await new Promise((r) => setTimeout(r, 25));
  }
  console.log('\n  distinct states observed:', seen.length);
} finally {
  await browser.close();
  server.close();
}
