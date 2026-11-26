import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { before, open, origin, repo, start } from './browser.mjs';

const webkit = process.argv.includes('--webkit');
const compare = process.argv.includes('--compare');
const targets = [[320, 568], [375, 812], [390, 844], [440, 956], [768, 1024], [1280, 800], [1440, 900]];
const themes = ['light', 'dark'];
const output = path.join(repo, 'docs/evidence/liquid-glass-home', before ? 'before' : 'after');
const playwright = process.env.PLAYWRIGHT_MODULE || path.resolve(repo, '../qa-tools/node_modules/playwright/index.mjs');
const browser = webkit ? await (await import(pathToFileURL(playwright))).webkit.launch() : await start();
const report = { engine: webkit ? 'webkit' : 'chromium', version: browser.version(), origin, cases: [], warnings: [] };
const samples = {
  'Marca': '.home-header h1',
  'Fecha': '.home-date-context h2',
  'Semana': '.home-date-mobile-week',
  'Día elegido': '.home-week-days [aria-pressed="true"] :is(span, strong)',
  'Día disponible': '.home-week-days button:not(:disabled):not([aria-pressed="true"]) :is(span, strong)',
  'Icono de fecha': '.home-date-heading button:not(:disabled) svg',
  'Balance': '.fitness-readout :is(h4, .energy-number > span, .energy-number small, .energy-qualifier)',
  'Comparación': '.fitness-comparison :is(dt, dd:not(.fitness-track))',
  'Desglose': '.fitness-breakdown > summary > span',
  'Acciones': '.daily-quick-actions button',
};
await mkdir(output, { recursive: true });

async function settle(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
  });
}

async function screenshot(page, name, locator) {
  const settings = { path: path.join(output, name + '.png'), scale: 'css' };
  if (locator) await page.locator(locator).screenshot(settings);
  else await page.screenshot(settings);
}

async function geometry(page) {
  return page.evaluate(() => {
    const size = el => {
      const { width, height, top, right, bottom, left } = el.getBoundingClientRect();
      return { width, height, top, right, bottom, left };
    };
    const root = document.querySelector('.app-main');
    const box = selector => {
      const el = document.querySelector(selector);
      const css = getComputedStyle(el);
      return { ...size(el), radius: css.borderRadius, border: css.borderColor,
        fill: css.backgroundColor, image: css.backgroundImage, shadow: css.boxShadow,
        backdrop: css.backdropFilter || css.webkitBackdropFilter || 'none' };
    };
    const actions = [...document.querySelectorAll('.daily-quick-actions button')];
    const visibleNav = [...document.querySelectorAll('.app-bottom-nav, .app-sidebar')].find(el => el.getClientRects().length);
    const dateContext = document.querySelector('.home-date-context');
    const dateLabel = [...dateContext.querySelectorAll('time > span')].find(el => el.getClientRects().length);
    const dateRange = document.createRange();
    dateRange.selectNodeContents(dateLabel);
    const week = document.querySelector('.home-week-scroll');
    return {
      horizontalOverflow: Math.max(document.documentElement.scrollWidth - innerWidth, root.scrollWidth - root.clientWidth),
      brandOrange: getComputedStyle(document.documentElement).getPropertyValue('--fit-orange').trim(),
      title: box('.home-heading-brand'),
      calendar: box('.home-date-nav'),
      selected: box('.home-week-indicator'),
      board: box('.energy-card'),
      entry: {
        first: box('.daily-quick-actions button:first-child'),
        second: box('.daily-quick-actions button:last-child'),
      },
      nav: box(visibleNav.matches('.app-bottom-nav') ? '.bottom-nav-track' : '.app-sidebar'),
      navType: visibleNav.matches('.app-bottom-nav') ? 'mobile' : 'desktop',
      date: document.querySelector('.home-date-context time').dateTime,
      dateFits: dateContext.scrollWidth <= dateContext.clientWidth + 1,
      dateLines: new Set([...dateRange.getClientRects()].map(rect => Math.round(rect.top))).size,
      weekScroll: week.scrollWidth - week.clientWidth,
      balance: document.querySelector('.energy-number').textContent.trim(),
      actions: actions.map(el => ({
        text: el.textContent.trim(), ...size(el), textOverflows: el.scrollWidth > el.clientWidth + 1,
        duration: getComputedStyle(el).transitionDuration,
      })),
      targets: [...document.querySelectorAll('.home-date-nav button, .fitness-breakdown > summary')].map(el => ({
        label: el.getAttribute('aria-label') || el.textContent.trim(), ...size(el),
        textOverflows: el.scrollWidth > el.clientWidth + 1,
      })),
    };
  });
}

async function actionHit(page) {
  await page.locator('.daily-quick-actions').evaluate(el => el.scrollIntoView({ block: 'center' }));
  await settle(page);
  return page.locator('.daily-quick-actions button').evaluateAll(buttons => buttons.map(el => {
    const rect = el.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    const nav = document.querySelector('.app-bottom-nav');
    return { label: el.textContent.trim(), hit: Boolean(hit && el.contains(hit)),
      clearance: nav.getClientRects().length ? nav.getBoundingClientRect().top - rect.bottom : null };
  }));
}

async function contrast(page, include) {
  const chosen = Object.entries(samples).filter(([name]) => include(name));
  const ranges = await page.evaluate(chosen => chosen.flatMap(([name, selector]) =>
    [...document.querySelectorAll(selector)].flatMap(el => {
      const icon = el instanceof SVGElement;
      const range = document.createRange();
      range.selectNodeContents(el);
      const css = getComputedStyle(el);
      const clip = el.closest('.home-week-scroll')?.getBoundingClientRect();
      const boxes = icon ? [el.getBoundingClientRect()] : [...range.getClientRects()];
      return boxes.filter(({ left, right, top, bottom, width, height }) =>
        width > 4 && height > 4 && left >= (clip ? clip.left - 1 : -1)
        && right <= (clip ? clip.right + 1 : innerWidth + 1) && top >= 0 && bottom < innerHeight)
        .map(({ left, top, width, height }) => ({
          name, text: el.textContent.trim() || el.closest('button')?.getAttribute('aria-label'), icon,
          color: css.color, left, top, width, height,
        }));
    })), chosen);
  const selector = chosen.map(([, selector]) => selector).join(', ');
  const style = await page.addStyleTag({ content: `
    :is(${selector}) { -webkit-text-fill-color: transparent !important; text-shadow: none !important; }
    :is(${selector}) svg, :is(${selector}):is(svg) { visibility: hidden !important; }
  ` });
  let bitmap;
  try {
    bitmap = (await page.screenshot({ scale: 'css' })).toString('base64');
  } finally {
    await style.evaluate(el => el.remove());
  }
  return page.evaluate(async ({ bitmap, ranges }) => {
    const image = new Image();
    image.src = 'data:image/png;base64,' + bitmap;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(image, 0, 0);
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const rgb = color => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 1, 1);
      return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3);
    };
    const lum = channels => channels.map(n => n / 255)
      .map(n => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4)
      .reduce((sum, channel, i) => sum + channel * [.2126, .7152, .0722][i], 0);
    const hex = channels => '#' + channels.map(n => n.toString(16).padStart(2, '0')).join('');
    return ranges.map(({ name, text, icon, color, left, top, width, height }) => {
      const foreground = rgb(color);
      const light = lum(foreground);
      const points = [.2, .5, .8].flatMap(fy => [.15, .35, .65, .85].map(fx => {
        const x = Math.floor(left + fx * width);
        const y = Math.floor(top + fy * height);
        const offset = (y * canvas.width + x) * 4;
        const bg = [...data.slice(offset, offset + 3)];
        const luma = lum(bg);
        return { background: hex(bg), ratio: (Math.max(light, luma) + .05) / (Math.min(light, luma) + .05) };
      }));
      const worst = points.reduce((a, b) => a.ratio < b.ratio ? a : b);
      return { name, text, icon, foreground: hex(foreground), background: worst.background, ratio: Number(worst.ratio.toFixed(2)) };
    });
  }, { bitmap, ranges });
}

async function focusChecks(page) {
  await page.locator('.app-main').evaluate(el => { el.scrollTop = 0; });
  await page.locator('.home-week-scroll').focus();
  const results = [];
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    await settle(page);
    const result = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el?.matches('.home-week-days button[aria-pressed="true"], .fitness-breakdown > summary, .daily-quick-actions button')) return null;
      const css = getComputedStyle(el);
      const frame = el.getBoundingClientRect();
      const hit = document.elementFromPoint(frame.left + frame.width / 2, frame.top + frame.height / 2);
      const surface = el.matches('.home-week-days button') ? document.querySelector('.home-week-indicator')
        : el.closest('.energy-card, .app-main');
      const capsule = document.querySelector('.app-bottom-nav');
      const outlineExtent = Math.max(0, Number.parseFloat(css.outlineOffset) + Number.parseFloat(css.outlineWidth));
      const clearance = capsule.getBoundingClientRect().top - frame.bottom - outlineExtent;
      return { label: el.getAttribute('aria-label') || el.textContent.trim(),
        focus: el.matches(':focus-visible'), outline: css.outlineStyle, outlineColor: css.outlineColor,
        backdrop: getComputedStyle(surface).backgroundColor, hit: Boolean(hit && el.contains(hit)),
        clearance: capsule.getClientRects().length ? clearance : null };
    });
    if (result) results.push(result);
    if (results.length === 4) break;
  }
  return results;
}

function focusContrast(state) {
  const luminance = value => value.match(/[0-9.]+/g).slice(0, 3).map(n => Number(n) / 255)
    .map(n => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4)
    .reduce((sum, channel, i) => sum + channel * [.2126, .7152, .0722][i], 0);
  const [low, high] = [luminance(state.outlineColor), luminance(state.backdrop)].sort((a, b) => a - b);
  return (high + .05) / (low + .05);
}

function validate(result) {
  const { width, theme, textSize, layout, hit, textContrast, focus } = result;
  const label = [theme, width, textSize].join(' ');
  assert.ok(layout.horizontalOverflow <= 1, 'Overflow horizontal ' + label);
  assert.equal(layout.brandOrange.toLowerCase(), '#ff9a53');
  assert.equal(layout.date, '2026-11-13');
  assert.equal(layout.entry.first.fill, 'rgb(255, 154, 83)');
  assert.equal(layout.selected.fill, 'rgb(255, 154, 83)');
  assert.notEqual(layout.entry.first.fill, layout.entry.second.fill);
  assert.ok(layout.dateFits, 'Fecha recortada ' + label);
  if (width === 390 && textSize === 100) assert.equal(layout.dateLines, 1, 'Fecha larga en dos líneas ' + label);
  if (width <= 440 && textSize === 100) assert.ok(layout.weekScroll <= 1, 'La semana no entra ' + label);
  for (const target of [...layout.targets, ...layout.actions]) {
    assert.ok(target.width >= 43.9 && target.height >= 43.9 && !target.textOverflows,
      'Control recortado o menor a 44 px ' + label + ': ' + JSON.stringify(target));
  }
  assert.ok(hit.every(action => action.hit && (action.clearance === null || action.clearance >= 0)),
    'La navegación tapa las acciones ' + label + ': ' + JSON.stringify(hit));
  assert.ok(layout.actions.every(action => action.duration.split(',').every(duration => Number.parseFloat(duration) === 0)),
    'Movimiento reducido ' + label);
  for (const sample of textContrast) {
    assert.ok(sample.ratio >= (sample.icon ? 3 : 4.5), 'Contraste ' + label + ': ' + JSON.stringify(sample));
  }
  if (focus) assert.ok(focus.length === 4 && focus.every(state => state.focus && state.outline !== 'none' && state.hit && state.ratio >= 3
    && (state.clearance === null || state.clearance > 0)),
    'Foco oculto o fuera del orden esperado ' + label + ': ' + JSON.stringify(focus));
}

try {
  for (const theme of themes) {
    const { context, page, errors } = await open(browser, 375, theme, theme, origin);
    try {
      assert.equal(await page.evaluate(() => window.__homeQA.phase), 'liquid-glass-home-' + (before ? 'before' : 'after'));
      for (const [width, height] of (compare ? targets.filter(([width]) => [390, 1440].includes(width)) : targets)) {
        await page.setViewportSize({ width, height });
        await page.waitForFunction(width => innerWidth === width, width);
        await page.locator('.app-main').evaluate(el => { el.scrollTop = 0; });
        await settle(page);
        if (!webkit && [390, 1440].includes(width)) {
          await screenshot(page, `inicio-${width}-${theme}`);
          await screenshot(page, `balance-${width}-${theme}`, '.energy-card');
          await screenshot(page, `acciones-${width}-${theme}`, '.daily-quick-actions');
        }
        if (!compare) {
          for (const textSize of [100, 200]) {
            await page.evaluate(textSize => {
              document.documentElement.style.fontSize = textSize === 200 ? '200%' : '';
              document.querySelector('.app-main').scrollTop = 0;
            }, textSize);
            await settle(page);
            if (!before && !webkit && width === 320 && textSize === 200) await screenshot(page, `texto-320-${theme}`);
            const layout = await geometry(page);
            const textContrast = textSize === 100 ? await contrast(page, name => name !== 'Acciones') : [];
            const hit = await actionHit(page);
            if (textSize === 100) textContrast.push(...await contrast(page, name => name === 'Acciones'));
            const focus = width === 390 ? (await focusChecks(page)).map(state => ({ ...state, ratio: Number(focusContrast(state).toFixed(2)) })) : undefined;
            const result = { width, height, theme, textSize, layout, hit, textContrast, focus };
            if (!before) validate(result);
            report.cases.push(result);
          }
          await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
        }
        console.log(theme, width);
      }
      const warning = 'ResizeObserver loop completed with undelivered notifications.';
      if (webkit) report.warnings.push(...errors.filter(error => error === warning));
      assert.deepEqual(webkit ? errors.filter(error => error !== warning) : errors, []);
    } finally {
      await context.close();
    }
  }
  if (!compare) await writeFile(path.join(output, (webkit ? 'mediciones-webkit' : 'mediciones') + '.json'), JSON.stringify(report, null, 2) + '\n');
} finally {
  await browser.close();
}
