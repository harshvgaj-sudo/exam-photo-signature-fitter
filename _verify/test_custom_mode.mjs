/*
 * test_custom_mode.mjs — the escape hatch must actually work.
 *
 * The registry covers SSC, IBPS, UPSC, RRB and MPSC. Everything else has to go
 * through "Custom requirement", where the user types the pixel box and the size
 * window themselves. The battle sheet tells the presenter to say the tool covers
 * "17 requirements ... plus a custom mode for anything else", so that mode is a
 * claim in the script, not just a feature.
 *
 * It is also the one path where the numbers are the USER'S, not a government
 * document's — so the tool has nothing to verify them against, and the risk is
 * that it quietly produces something that does not match what was typed.
 *
 * Checks that:
 *   - the custom fields appear only when Custom is selected;
 *   - a custom box and window are honoured exactly, in the file's own header;
 *   - an impossible custom window is REFUSED rather than fudged;
 *   - a nonsense value (0 px) cannot produce a zero-width image.
 *
 * Runs offline against the modular tool over HTTP.
 *
 *   node _verify/test_custom_mode.mjs
 */
import { chromium } from 'file:///C:/Users/harsh/.workbuddy-ai/binaries/node/workspace/node_modules/playwright-core/index.mjs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { serve, TOOL, HERE } from './server.mjs';

const FX = join(HERE, 'fixtures', 'scan_g0_d2.jpg');   // a dense scan: produces plenty of bytes

let failures = 0;
const assert = (label, cond, detail = '', note = '') => {
  if (!cond) failures++;
  console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${label}${cond ? (note ? '  — ' + note : '') : (detail ? '  — ' + detail : '')}`);
};

/** Dimensions from the JPEG's own SOF marker — the authoritative answer. */
const jpegSize = (buf) => {
  let i = 2;
  while (i < buf.length - 1) {
    if (buf[i] !== 0xff) { i++; continue; }
    const m = buf[i + 1];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return null;
};

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const { server, port } = await serve(TOOL, { fx: join(HERE, 'fixtures') });

try {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 }, acceptDownloads: true });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  console.log('='.repeat(100));
  console.log('CUSTOM MODE — the escape hatch for any exam not in the registry');
  console.log('='.repeat(100));

  await p.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });

  /** Run a fit and return the verdict plus the produced file, if any. */
  async function fit() {
    await p.setInputFiles('#fileInput', FX);
    await p.waitForFunction(() => {
      const el = document.querySelector('#cropBox');
      return el && el.offsetWidth > 0;
    }, null, { timeout: 30000 });
    await p.waitForSelector('#processBtn:not([disabled])', { timeout: 30000 });
    await p.click('#processBtn');
    await p.waitForFunction(() => {
      const el = document.querySelector('#status');
      if (!el || el.hidden) return false;
      const k = (el.className || '').replace(/^status\s*/, '').trim();
      return k === 'ok' || k === 'bad';
    }, null, { timeout: 90000 });
    const text = (await p.locator('#status').innerText()).replace(/\s+/g, ' ').trim();
    if (await p.locator('#downloadBtn').isHidden()) return { produced: false, text };
    const [dl] = await Promise.all([
      p.waitForEvent('download', { timeout: 30000 }),
      p.click('#downloadBtn'),
    ]);
    return { produced: true, text, name: dl.suggestedFilename(), buf: readFileSync(await dl.path()) };
  }

  /* --------------------------- 1. the fields appear only for the custom preset */
  console.log('\n--- 1. the custom fields appear only when Custom is selected ---');
  await p.selectOption('#presetSelect', 'ssc-signature');
  await p.waitForTimeout(200);
  assert('the custom fields are hidden for a registry preset',
    await p.locator('#customFields').isHidden(), 'they are visible for ssc-signature');

  await p.selectOption('#presetSelect', 'custom');
  await p.waitForTimeout(200);
  assert('the custom fields appear for the Custom preset',
    await p.locator('#customFields').isVisible(), 'the fieldset stayed hidden');

  /* ------------------------------------ 2. a custom box and window are honoured */
  console.log('\n--- 2. a custom 300x400 / 20-50 KB requirement is honoured exactly ---');
  await p.fill('#cw', '300');
  await p.fill('#ch', '400');
  await p.fill('#cmin', '20');
  await p.fill('#cmax', '50');
  await p.waitForTimeout(200);

  const r = await fit();
  console.log(`  status: ${r.text.slice(0, 130)}`);
  assert('the tool produced a file for the custom requirement', r.produced,
    `it refused. Tool said: ${r.text.slice(0, 180)}`);

  if (r.produced) {
    const dims = jpegSize(r.buf);
    const kb = r.buf.length / 1024;
    console.log(`  downloaded: ${r.name}  (${kb.toFixed(2)} KB)  header: ${dims ? `${dims.width}x${dims.height}` : 'unreadable'}`);
    assert('the pixels are the box the user typed', dims && dims.width === 300 && dims.height === 400,
      `measured ${dims ? `${dims.width}x${dims.height}` : 'nothing'}, typed 300x400`);
    assert('the size is inside the window the user typed', kb >= 20 && kb <= 50,
      `${kb.toFixed(2)} KB is outside 20-50 KB`);
    assert('the filename states the dimensions the file has',
      r.name === 'custom_300x400.jpg', `filename was "${r.name}"`);
  }

  /* -------------------------- 3. an impossible custom window must be refused */
  console.log('\n--- 3. an impossible custom window is refused, not fudged ---');
  // 300x400 is 120,000 px; a JPEG there is tens of KB, nowhere near 300 KB.
  await p.fill('#cmin', '300');
  await p.fill('#cmax', '310');
  await p.waitForTimeout(200);

  const imp = await fit();
  console.log(`  status: ${imp.text.slice(0, 150)}`);
  assert('the impossible window is refused', !imp.produced,
    'it offered a download for a window it cannot satisfy');
  assert('the refusal states what it could reach', /best|comes to|KB/i.test(imp.text),
    `no figure given: ${imp.text.slice(0, 180)}`);

  /* --------------------------------- 4. a nonsense value cannot make a 0px image */
  console.log('\n--- 4. a zero width cannot produce a zero-width image ---');
  await p.fill('#cw', '0');
  await p.fill('#ch', '400');
  await p.fill('#cmin', '1');
  await p.fill('#cmax', '100');
  await p.waitForTimeout(200);

  const zero = await fit();
  console.log(`  status: ${zero.text.slice(0, 130)}`);
  if (zero.produced) {
    const dims = jpegSize(zero.buf);
    assert('a zero width is clamped, not honoured', dims && dims.width >= 1,
      `produced a ${dims ? `${dims.width}x${dims.height}` : 'unreadable'} image`);
    console.log(`  produced ${dims ? `${dims.width}x${dims.height}` : '?'} — the field is clamped to 1px minimum`);
  } else {
    assert('a zero width either clamps or refuses cleanly — never crashes', true, '', 'refused');
  }

  assert('no page or console errors throughout', errors.length === 0, errors.join(' | '), 'none');
  await ctx.close();
} finally {
  await browser.close();
  server.close();
}

console.log('\n' + '='.repeat(100));
console.log(failures
  ? `  ${failures} FAILED`
  : '  Custom mode honours what the user types, and refuses what it cannot do.');
console.log('='.repeat(100));
process.exit(failures ? 1 : 0);
