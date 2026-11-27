import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { before, open, repo, start } from './browser.mjs';
import { journey, settle } from './liquid-glass-home-2c-flows.mjs';

const engine = process.argv.includes('--webkit') ? 'webkit' : 'chromium';
const modulePath = process.env.PLAYWRIGHT_MODULE || path.resolve(repo, '../qa-tools/node_modules/playwright/index.mjs');
const phase = before ? 'before' : 'after';
const section = process.argv.find(value => value.startsWith('--section='))?.split('=')[1] ?? 'all';
assert.ok(['all', 'smoke', 'recorridos'].includes(section));
const output = path.join(repo, 'docs/evidence/liquid-glass-home-2c');
const widths = [[320, 568], [375, 812], [390, 844], [440, 956], [768, 1024], [1280, 800], [1440, 900]];
const styles = [
  ['home', '.home-date-nav, .energy-card, .daily-quick-actions, .daily-habits-block, .daily-logs, .home-history'],
  ['nav', '.bottom-nav-track, .app-sidebar'],
];
const screens = [
  ['comida', 'Agregar comida', '#add-meal-description'],
  ['ejercicio', 'Agregar ejercicio', '#add-workout-activity'],
  ['calendario', 'Elegir fecha', '[data-calendar-day]'],
  ['editar-comida', 'Editar comida', '#edit-meal-description'],
  ['editar-ejercicio', 'Editar ejercicio', '#edit-workout-activity'],
];
const button = (scope, name) => scope.getByRole('button', { name, exact: true });
async function openWindow(page, title) {
  const kind = title === 'Editar comida' ? 'meal' : title === 'Editar ejercicio' ? 'workout' : null;
  if (!kind) {
    const opener = button(page, title === 'Elegir fecha' ? 'Abrir calendario mensual' : title);
    await opener.press('Enter');
    return opener;
  }
  const row = page.locator('.daily-record-open[data-entry-kind="' + kind + '"]').first();
  await row.evaluate(el => el.scrollIntoView({ block: 'center' }));
  await row.press('Enter');
  await page.getByRole('dialog', { name: 'Detalle del registro' }).locator('.record-detail-edit').press('Enter');
  return row;
}
const boundedRound = n => Math.round(n * 100) / 100;

async function fingerprint(page) {
  return page.evaluate(styles => Object.fromEntries(styles.map(([name, selector]) => [
    name,
    [...document.querySelectorAll(selector)].map(el => {
      const r = el.getBoundingClientRect(), s = getComputedStyle(el);
      return { x: r.x, y: r.y, w: r.width, h: r.height, fill: s.backgroundColor, material: s.backgroundImage,
        shadow: s.boxShadow, radius: s.borderRadius, text: el.textContent.replace(/\s+/g, ' ').trim() };
    }),
  ])), styles);
}

async function metrics(dialog) {
  return dialog.evaluate(root => {
    const bounds = el => {
      const r = el.getBoundingClientRect();
      return { width: r.width, height: r.height };
    };
    const sheet = [...root.querySelectorAll('.entry-form-content, .home-date-picker, .home-month-grid, .entry-form-footer')];
    const controls = [...root.querySelectorAll('button, input:not([type=file]), select, textarea, summary')].filter(el => el.getClientRects().length);
    const targets = controls.map(el => {
      const label = (el.getAttribute('aria-label') ?? el.id) || el.textContent.trim();
      const style = getComputedStyle(el);
      return { label, ...bounds(el), disabled: el.disabled, font: parseFloat(style.fontSize),
        field: el.matches('input, select, textarea'), contentOverflow: el.matches('button') ? el.scrollWidth - el.clientWidth : 0 };
    });
    const animated = [root.parentElement, root, ...controls].filter(el => {
      const css = getComputedStyle(el);
      return [css.animationDuration, css.transitionDuration].some(value => value.split(',').some(number => parseFloat(number) > .001));
    }).length;
    const header = root.querySelector('.entry-sheet-header');
    const close = header.querySelector('button');
    const field = controls.find(el => el.matches('input, select, textarea'));
    const accent = root.querySelector('.entry-save, [aria-selected=true] button');
    const style = el => getComputedStyle(el);
    return { sheet: bounds(root), close: bounds(close), heading: bounds(header),
      material: { shellRadius: style(root).borderTopLeftRadius, closeRadius: style(close).borderTopLeftRadius,
        headerReflective: style(header).backgroundImage !== 'none', fieldRadius: field ? style(field).borderTopLeftRadius : null,
        fieldFill: field ? style(field).backgroundColor : null, fieldReflective: field ? style(field).backgroundImage !== 'none' : null,
        accent: style(accent).backgroundColor },
      overflow: Math.max(root.scrollWidth - root.clientWidth, document.documentElement.scrollWidth - innerWidth,
        ...sheet.map(el => el.scrollWidth - el.clientWidth)),
      minEnabled: Math.min(...targets.filter(target => !target.disabled).map(({width, height}) => Math.min(width, height))),
      minFieldFont: Math.min(...targets.filter(target => target.field).map(({font}) => font)),
      narrow: targets.filter(({ disabled, width, height }) => !disabled && (width < 43.9 || height < 43.9)),
      clipped: targets.filter(({ contentOverflow }) => contentOverflow > 1),
      animated };
  });
}

async function smoke(page, width, theme, shot, previous) {
  const initial = await fingerprint(page);
  if (previous) assert.deepEqual(initial, previous.initial, 'La superficie principal o la navegación cambiaron');
  if (width === 375 && theme === 'dark') await shot('inicio');
  const result = [];
  for (const zoom of [100, 200]) {
    await page.evaluate(zoom => { document.documentElement.style.fontSize = zoom === 200 ? '200%' : ''; }, zoom);
    for (const [name, title, field] of screens) {
      const opener = await openWindow(page, title);
      const dialog = page.getByRole('dialog', { name: title, exact: true });
      await dialog.locator(field).first().waitFor();
      await settle(page);
      const data = await metrics(dialog);
      const label = [width, theme, zoom, name].join(' ');
      const failures = [];
      const check = (condition, message) => { if (!condition) failures.push(label + ' · ' + message); };
      if (!before) {
        check(data.overflow <= 1, 'Desborde ' + data.overflow + ' px');
        check(!data.narrow.length, 'Blancos táctiles ' + JSON.stringify(data.narrow));
        check(!data.clipped.length, 'Texto recortado ' + JSON.stringify(data.clipped));
        check(!data.animated, 'Movimiento reducido');
        if (width < 768 && name !== 'calendario') check(data.minFieldFont >= 16, 'Fuente Safari');
        check(data.close.width >= 44 && data.close.height >= 44, 'Cierre');
        check(data.material.accent === 'rgb(255, 154, 83)', 'Acento naranja ' + data.material.accent);
        check(data.material.closeRadius === '50%' || parseFloat(data.material.closeRadius) >= data.close.width / 2, 'Cierre circular');
        check(data.material.headerReflective, 'Material del encabezado');
        if (data.material.fieldRadius) {
          check(parseFloat(data.material.fieldRadius) >= 14 && !data.material.fieldReflective,
            'Campo de lectura ' + JSON.stringify(data.material));
          check(!['transparent', 'rgba(0, 0, 0, 0)'].includes(data.material.fieldFill), 'Superficie de campo');
        }
        if (zoom === 100) {
          const original = previous?.checks.find(item => item.name === name && item.zoom === zoom);
          if (original) check(data.heading.height <= original.heading.height + 4, 'Altura de encabezado');
        }
      }
      if (name !== 'calendario') assert.equal(await dialog.locator('.entry-date-context time').first().getAttribute('datetime'), '2026-11-13');
      if (zoom === 100 && !name.startsWith('editar-') && ((width === 375 && theme === 'dark') || (width === 1440 && theme === 'light'))) await shot(name);
      if (zoom === 200 && width === 375 && theme === 'dark') await shot(name + '-texto-200');
      await page.keyboard.press('Escape');
      await dialog.waitFor({ state: 'hidden' });
      assert.ok(await opener.evaluate(el => el === document.activeElement), 'Foco de retorno ' + label);
      result.push({ name, zoom, ...data, failures, sheet: Object.fromEntries(Object.entries(data.sheet).map(([k, v]) => [k, boundedRound(v)])) });
    }
  }
  await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
  return { initial, checks: result };
}

async function sample(browser, [width, height], theme, run, previous) {
  const standard = [390, 1280].includes(width) ? (width === 390 ? 375 : 1440) : width;
  const {page, context, errors} = await open(browser, standard, theme, theme);
  const shot = async name => {
    if (engine === 'chromium') await page.screenshot({
      path: path.join(output, phase, [width, theme, name].join('-') + '.jpg'),
      scale: 'css', quality: 87, animations: 'disabled',
    });
  };
  try {
    if (standard !== width) await page.setViewportSize({width, height});
    await settle(page);
    assert.equal(await page.evaluate(() => window.__homeQA.phase), 'liquid-glass-home-2b-after');
    const data = run === 'smoke'
      ? await smoke(page, width, theme, shot, previous)
      : await journey(page, { width, theme, before, shot, repo, previous });
    const external = await page.evaluate(() => window.__homeQA.externalRequests);
    assert.equal(external, 0);
    assert.deepEqual(errors, []);
    return { width, theme, ...data, external };
  } finally {
    await context.close();
  }
}

const browser = engine === 'webkit' ? await (await import(pathToFileURL(modulePath))).webkit.launch() : await start();
try {
  await mkdir(path.join(output, phase), { recursive: true });
  const sections = section === 'all' ? ['smoke', 'recorridos'] : [section];
  for (const group of sections) {
    const filename = engine + '-' + group + '.json';
    const reference = before ? null : JSON.parse(await readFile(path.join(output, 'before', filename), 'utf8')).cases;
    const cases = [];
    for (const viewport of widths) {
      const [width] = viewport;
      for (const theme of ['light', 'dark']) {
        if (group === 'recorridos' && !((width === 375 && theme === 'dark') || (width === 1440 && theme === 'light'))) continue;
        const previous = reference?.find(item => item.width === width && item.theme === theme);
        const result = await sample(browser, viewport, theme, group, previous);
        cases.push(result);
        console.log(engine, phase, group, width, theme);
        for (const issue of result.checks?.flatMap(item => item.failures) ?? []) console.error(issue);
      }
    }
    await writeFile(path.join(output, phase, filename), JSON.stringify({ engine, version: browser.version(), cases }, null, 2) + '\n');
    if (cases.some(result => result.checks?.some(item => item.failures.length))) process.exitCode = 1;
  }
} finally {
  await browser.close();
}
