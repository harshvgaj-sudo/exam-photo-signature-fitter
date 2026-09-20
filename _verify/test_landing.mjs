/*
 * TEST L — the landing page (index.html at the repo root).
 *
 * This is the front door for the two tools, so it has to hold the same two
 * promises they do: it makes NO network requests, and it works when opened
 * straight from disk with no server. It also has to be reachable by the people
 * it is for — a phone, one-handed, on a slow connection.
 *
 * Asserts rather than narrates, and exits non-zero on any failure. A check that
 * cannot fail is not a check (see test_negative_controls.mjs for the same
 * reasoning applied to the tool suites).
 *
 *   node _verify/test_landing.mjs
 */
import { chromium } from 'file:///C:/Users/harsh/.workbuddy-ai/binaries/node/workspace/node_modules/playwright-core/index.mjs';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { serve, ROOT, HERE } from './server.mjs';

const OUT = join(HERE, 'shots');
mkdirSync(OUT, { recursive: true });

const PAGE = join(ROOT, 'index.html');
const PAGE_URL = 'file:///' + PAGE.replace(/\\/g, '/');

if (!existsSync(PAGE)) { console.error('landing page missing: ' + PAGE); process.exit(1); }

let failures = 0;
const assert = (label, cond, detail = '') => {
  if (!cond) failures++;
  console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${label}${detail ? '  — ' + detail : ''}`);
};

/* Two frames, so layout has settled before anything is measured. A viewport
   change that has not been laid out yet reports the PREVIOUS width's overflow. */
const settle = (page) => page.evaluate(
  () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));

/** Attach the three recorders every suite here uses. */
function record(page, requests, errors) {
  page.on('request', (r) => requests.push(r.url()));
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
}

/** Anything not file:// and not our own loopback server counts as external. */
const external = (urls, origin) => urls.filter((u) => {
  if (u.startsWith('file://')) return false;
  if (u.startsWith('data:') || u.startsWith('blob:') || u.startsWith('about:')) return false;
  if (origin && u.startsWith(origin)) return false;
  return true;
});

/* Emoji as a UI icon is a defect here: it renders differently on every OS and
   cannot inherit colour. The page uses inline SVG instead. Scan rendered text
   for emoji presentation ranges. */
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{1F000}-\u{1F2FF}\u{2600}-\u{27BF}\u{FE0F}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}]/u;

const browser = await chromium.launch({ channel: 'chrome', headless: true });
console.log('=== TEST L: landing page ===\n');

try {
  /* ================================================================ file:// */
  console.log('--- 1. opened from file://, no server ---');
  const requests = [], errors = [];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  record(page, requests, errors);
  await page.goto(PAGE_URL, { waitUntil: 'load' });
  await settle(page);

  const title = await page.title();
  assert('title is the real title, not a browser error page',
    title.startsWith('Exam Document Tools'), JSON.stringify(title.slice(0, 60)));
  assert('h1 rendered', (await page.locator('h1').innerText()).length > 20);
  assert('both tool cards present', (await page.locator('a.tool-card').count()) === 2);
  assert('no external request on load', external(requests, null).length === 0,
    external(requests, null).join(', ') || 'none');
  assert('no console error / page error', errors.length === 0, errors.join(' | ') || 'none');

  const badRefs = await page.evaluate(() =>
    [...document.querySelectorAll('[src],[href]')]
      .map((e) => e.getAttribute('src') || e.getAttribute('href'))
      .filter((u) => {
        if (!u || u.startsWith('#')) return false;
        // A relative path is fine — section 2 checks it resolves to a real file.
        // Only an unknown SCHEME is a defect (a CDN, a tracking pixel, a font host).
        return /^[a-z][a-z0-9+.-]*:/i.test(u) && !/^(file|data|blob|https?):/i.test(u);
      }));
  assert('no asset reference with an unknown scheme', badRefs.length === 0, badRefs.join(', ') || 'none');

  /* ============================================ 2. the links must be real */
  console.log('\n--- 2. every link points at something that exists ---');
  const hrefs = await page.evaluate(() =>
    [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')));
  const local = hrefs.filter((h) => !/^https?:/.test(h) && !h.startsWith('#'));
  assert('local links found', local.length >= 2, local.join(' '));
  for (const h of local) {
    const target = join(ROOT, h.split('?')[0]);
    assert(`  exists: ${h}`, existsSync(target));
  }
  const remote = hrefs.filter((h) => /^https?:/.test(h));
  assert('remote links all target the channel',
    remote.every((h) => h.includes('youtube.com') || h.includes('wa.me') || h.includes('t.me')),
    remote.join(' '));

  /* ================================================ 3. icons are SVG, no emoji */
  console.log('\n--- 3. icons: inline SVG, never emoji ---');
  const svgIcons = await page.locator('svg.ic').count();
  const symbolDefs = await page.locator('svg symbol').count();
  assert('inline SVG icons used', svgIcons >= 8, `${svgIcons} icons / ${symbolDefs} symbols defined`);
  assert('every <use> resolves to a defined symbol',
    await page.evaluate(() => {
      const ids = new Set([...document.querySelectorAll('symbol')].map((s) => s.id));
      return [...document.querySelectorAll('use')].every((u) => {
        const href = u.getAttribute('href') || u.getAttribute('xlink:href') || '';
        return ids.has(href.replace('#', ''));
      });
    }));
  assert('no emoji in the rendered text',
    !EMOJI.test(await page.locator('main').innerText()),
    (await page.locator('main').innerText()).match(EMOJI)?.[0] || 'none');

  /* ============================================================ 4. theme */
  console.log('\n--- 4. theme toggle ---');
  const before = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  const iconBefore = await page.evaluate(() => document.querySelector('#themeIcon use').getAttribute('href'));
  await page.locator('#themeToggle').click();
  await settle(page);
  const after = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  const iconAfter = await page.evaluate(() => document.querySelector('#themeIcon use').getAttribute('href'));
  assert('theme flips', before !== after, `${before} -> ${after}`);
  assert('icon follows the theme', iconBefore !== iconAfter, `${iconBefore} -> ${iconAfter}`);
  assert('label follows the theme',
    (await page.locator('#themeLabel').innerText()).toLowerCase() === (after === 'dark' ? 'light' : 'dark'));
  assert('mirrored into the two tool keys',
    await page.evaluate(() => ['edt-theme', 'psf-theme', 'cpdf-theme']
      .every((k) => { try { return !!localStorage.getItem(k); } catch { return false; } })));
  const bgAfter = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const bgBefore = await page.evaluate((b) => {
    document.documentElement.setAttribute('data-theme', b);
    return getComputedStyle(document.body).backgroundColor;
  }, before);
  assert('body background actually changed', bgAfter !== bgBefore, `${bgBefore} -> ${bgAfter}`);

  /* ======================================================= 5. responsive */
  console.log('\n--- 5. responsive: no horizontal overflow at any width ---');
  for (const [w, h, name] of [[375, 812, 'phone'], [768, 1024, 'tablet'],
                              [1024, 768, 'small-desktop'], [1440, 900, 'desktop']]) {
    await page.setViewportSize({ width: w, height: h });
    await settle(page);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert(`${name} ${w}px: no h-overflow`, over <= 1, `overflow ${over}px`);
    await page.screenshot({ path: join(OUT, `landing_${w}.png`), fullPage: true });
  }

  /* Both themes get looked at, not just the toggle. A dark palette that was
     never rendered is the easiest place for an unreadable pair of colours to
     hide — this suite failed on nothing until it started taking the picture. */
  await page.setViewportSize({ width: 1024, height: 768 });
  for (const theme of ['dark', 'light']) {
    await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
    await settle(page);
    await page.screenshot({ path: join(OUT, `landing_${theme}_1024.png`), fullPage: true });
    const contrast = await page.evaluate(() => {
      const lum = (c) => {
        const [r, g, b] = c.match(/\d+/g).slice(0, 3).map(Number)
          .map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
      const bg = getComputedStyle(document.body).backgroundColor;
      const probe = (sel) => {
        const el = document.querySelector(sel);
        return el ? ratio(getComputedStyle(el).color, bg) : 0;
      };
      return { body: probe('.lede'), muted: probe('.spec'), card: probe('.tool-card h3'), accent: probe('.tool-go') };
    });
    const worst = Math.min(...Object.values(contrast));
    assert(`${theme}: every text pair is at least 4.5:1`, worst >= 4.5,
      Object.entries(contrast).map(([k, v]) => `${k}=${v.toFixed(2)}`).join(' '));
  }

  /* ================================================ 6. touch + a11y basics */
  console.log('\n--- 6. touch targets and keyboard ---');
  const touch = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const tp = await touch.newPage();
  await tp.goto(PAGE_URL, { waitUntil: 'load' });
  await settle(tp);
  const small = await tp.evaluate(() =>
    [...document.querySelectorAll('.ghost-btn, .sub-btn')]
      .map((e) => ({ t: e.textContent.trim().slice(0, 18), h: Math.round(e.getBoundingClientRect().height) }))
      .filter((x) => x.h < 44));
  assert('every control is at least 44px tall', small.length === 0,
    small.map((s) => `${s.t}=${s.h}px`).join(', ') || 'all >= 44px');

  await page.keyboard.press('Tab');
  const focused = await page.evaluate(() => {
    const el = document.activeElement;
    const s = getComputedStyle(el);
    return { tag: el.tagName, outline: s.outlineWidth, style: s.outlineStyle };
  });
  assert('focus is visible on the first tab stop',
    focused.style !== 'none' && parseFloat(focused.outline) > 0, JSON.stringify(focused));

  assert('reduced-motion is honoured',
    await page.evaluate(() => {
      const rules = [...document.styleSheets].flatMap((s) => { try { return [...s.cssRules]; } catch { return []; } });
      return rules.some((r) => r.conditionText && r.conditionText.includes('prefers-reduced-motion')
                             && /transition:\s*none/.test(r.cssText));
    }));

  await ctx.close();
  await touch.close();

  /* ===================================== 7. under the REAL deployed CSP */
  console.log('\n--- 7. served with the netlify.toml CSP (the real deployment) ---');
  const { server, port } = await serve(ROOT);
  const origin = `http://127.0.0.1:${port}`;
  const sreq = [], serr = [];
  const sctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
  const sp = await sctx.newPage();
  record(sp, sreq, serr);
  const violations = [];
  sp.on('console', (m) => { if (/Content Security Policy/i.test(m.text())) violations.push(m.text()); });
  const resp = await sp.goto(origin + '/', { waitUntil: 'load' });
  await settle(sp);
  assert('served 200', resp.status() === 200, String(resp.status()));
  assert('CSP header present', /default-src 'none'/.test(resp.headers()['content-security-policy'] || ''));
  assert('no CSP violation', violations.length === 0, violations.join(' | ') || 'none');
  assert('no external request under CSP', external(sreq, origin).length === 0,
    external(sreq, origin).join(', ') || 'none');
  assert('no console error under CSP', serr.length === 0, serr.join(' | ') || 'none');
  assert('styles survived the CSP (inline style allowed)',
    await sp.evaluate(() => getComputedStyle(document.body).backgroundColor !== 'rgba(0, 0, 0, 0)'));
  assert('icons survived the CSP',
    (await sp.locator('svg.ic').count()) === svgIcons);
  await sp.screenshot({ path: join(OUT, 'landing_csp_desktop.png'), fullPage: true });

  /* ============================ 8. negative control: the detector can fire */
  console.log('\n--- 8. negative control: can the "external request" detector fail? ---');
  const nreq = [];
  const np = await sctx.newPage();
  np.on('request', (r) => nreq.push(r.url()));
  await np.goto(origin + '/', { waitUntil: 'load' });
  const cleanCount = external(nreq, origin).length;
  await np.evaluate(() => {
    const img = document.createElement('img');
    img.src = 'https://example.com/definitely-not-local.png';
    document.body.appendChild(img);
  });
  await np.waitForTimeout(1200);
  assert('CONTROL: a planted external request IS detected',
    cleanCount === 0 && external(nreq, origin).length >= 1,
    `before=${cleanCount} after=${external(nreq, origin).length}`);

  await sctx.close();
  server.close();
} finally {
  await browser.close();
}

console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'} — ${failures} failing assertion(s)`);
process.exit(failures === 0 ? 0 : 1);
