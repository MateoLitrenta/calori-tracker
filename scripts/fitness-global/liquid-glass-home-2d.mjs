import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { before, open, repo, start } from './browser.mjs';
import { settle } from './liquid-glass-home-2c-flows.mjs';
import { button, closeWithEscape, fingerprint, mealId, mealTitle, openForm, openRecord, photoId, seed, today, workoutId, workoutTitle } from './liquid-glass-home-2d-flows.mjs';

const engine = process.argv.includes('--webkit') ? 'webkit' : 'chromium';
const modulePath = process.env.PLAYWRIGHT_MODULE || path.resolve(repo, '../qa-tools/node_modules/playwright/index.mjs');
const phase = before ? 'before' : 'after';
const section = process.argv.find(value => value.startsWith('--section='))?.split('=')[1] ?? 'all';
assert.ok(['all', 'smoke', 'recorridos'].includes(section));
const output = path.join(repo, 'docs/evidence/liquid-glass-home-2d');
const widths = [[320, 568], [375, 812], [390, 844], [440, 956], [768, 1024], [1280, 800], [1440, 900]];
const captures = {
  '320-dark': ['detalle-foto-texto-200', 'eliminar-texto-200', 'peso-texto-200'],
  '375-dark': ['inicio', 'detalle-comida', 'detalle-foto', 'eliminar', 'eliminando', 'error-eliminar', 'eliminado',
    'descarte-foco', 'peso-teclado-simulado', 'error-peso', 'peso-guardando', 'peso-en-perfil', 'recibo-meal', 'error-comida'],
  '1440-light': ['detalle-ejercicio', 'peso', 'recibo-workout', 'error-ejercicio'],
};
const home = '.home-date-nav, .energy-card, .daily-quick-actions, .daily-habits-block, .daily-logs, .home-history, .bottom-nav-track, .app-sidebar';
const editor = '.entry-sheet-header, .entry-form, .entry-form-content, .entry-form-footer, input:not([type=file]), textarea, select, .entry-save';

async function measure(dialog) {
  return dialog.evaluate(root => {
    const bounds = el => {
      const r = el.getBoundingClientRect();
      return [r.width, r.height];
    };
    const selectors = '.entry-form-content, .record-detail-details, .record-detail-meta, .record-detail-actions, .entry-form-footer, .profile-dialog-body, .profile-actions';
    const scrollables = [...root.querySelectorAll(selectors)];
    const controls = [...root.querySelectorAll('button, input, textarea, select, summary')].filter(el => el.getClientRects().length);
    const targets = controls.map(el => {
      const style = getComputedStyle(el);
      return { label: el.getAttribute('aria-label') ?? el.textContent.trim(), size: bounds(el),
        disabled: el.disabled, font: parseFloat(style.fontSize), isField: el.matches('input, textarea, select'),
        clipped: el.matches('button') && el.scrollWidth > el.clientWidth + 1 };
    });
    const photo = root.querySelector('.record-detail-content img');
    const close = root.querySelector('.entry-sheet-header button');
    const danger = root.querySelector('.record-detail-delete, .profile-button-danger');
    const style = getComputedStyle(root);
    return { size: bounds(root), radius: style.borderTopLeftRadius, photo: photo ? photo.complete && photo.naturalWidth > 0 : false,
      close: close ? {size: bounds(close), radius: getComputedStyle(close).borderTopLeftRadius} : null,
      dangerOrange: danger && [getComputedStyle(danger).color, getComputedStyle(danger).backgroundColor].includes('rgb(255, 154, 83)'),
      overflow: Math.max(root.scrollWidth - root.clientWidth, document.documentElement.scrollWidth - innerWidth,
        ...scrollables.map(el => el.scrollWidth - el.clientWidth)),
      minimum: Math.min(...targets.filter(target => !target.disabled).flatMap(target => target.size)),
      narrow: targets.filter(target => !target.disabled && target.size.some(value => value < 43.9)),
      clipped: targets.filter(target => target.clipped),
      fieldFont: targets.find(target => target.isField)?.font ?? null,
      animated: [root.parentElement, root, ...controls].filter(el => {
        const css = getComputedStyle(el);
        return [css.animationDuration, css.transitionDuration].some(value => value.split(',').some(number => parseFloat(number) > .001));
      }).length };
  });
}

async function smoke(page, width, theme, shot, prior) {
  const initial = await fingerprint(page, home);
  if (prior) assert.deepEqual(initial, prior.initial, 'Cambió la superficie principal de Inicio');
  await shot('inicio');
  const checks = [];
  const capture = async (root, name, zoom) => {
    const data = await measure(root), failures = [];
    const label = [width, theme, zoom, name].join(' ');
    const check = (condition, detail) => { if (!condition) failures.push(label + ' · ' + detail); };
    if (!before) {
      check(data.overflow <= 1, 'Desborde ' + data.overflow + ' px');
      check(!data.narrow.length, 'Blancos táctiles ' + JSON.stringify(data.narrow));
      check(!data.clipped.length, 'Texto recortado ' + JSON.stringify(data.clipped));
      check(!data.animated, 'Movimiento reducido');
      check(!data.dangerOrange, 'Acción destructiva naranja');
      if (name === 'detalle-foto') check(data.photo, 'No hay una foto renderizada');
      if (data.close) check(data.close.radius === '50%' || parseFloat(data.close.radius) >= data.close.size[0] / 2, 'Cierre circular');
      if (width < 768 && name === 'peso') check(data.fieldFont >= 16, 'Fuente Safari');
    }
    await shot(name + (zoom === 200 ? '-texto-200' : ''));
    checks.push({ name, zoom, ...data, failures });
  };
  const guard = [];
  for (const zoom of [100, 200]) {
    await page.evaluate(zoom => { document.documentElement.style.fontSize = zoom === 200 ? '200%' : ''; }, zoom);
    await settle(page);
    for (const [id, key, title] of [[mealId, 'detalle-comida', 'Yogur, fruta y avena'], [photoId, 'detalle-foto', mealTitle], [workoutId, 'detalle-ejercicio', workoutTitle]]) {
      const { opener, window } = await openRecord(page, id);
      assert.equal(await window.locator('.record-detail-main').textContent(), title);
      assert.equal(await window.locator('.entry-date-context time').first().getAttribute('datetime'), today);
      if (!before && id === photoId) await window.locator('.record-detail-content img').evaluate(async image => {
        if (image.decode) await image.decode();
      });
      await capture(window, key, zoom);
      if (id === photoId) {
        const deleteOpener = button(window, 'Eliminar');
        await deleteOpener.press('Enter');
        const confirm = page.locator('dialog[data-record-delete][open]');
        await confirm.waitFor();
        assert.match(await confirm.innerText(), /centeno con tomate/);
        const cancel = button(confirm, 'Cancelar');
        assert.ok(await cancel.evaluate(el => el === document.activeElement));
        await capture(confirm, 'eliminar', zoom);
        await cancel.press('Enter');
        await confirm.waitFor({ state: 'hidden' });
        await settle(page);
        assert.ok(await deleteOpener.evaluate(el => el === document.activeElement));
      }
      await closeWithEscape(page, window, opener);
    }
    const weight = await openForm(page, 'Editar peso');
    assert.equal(await weight.window.locator('input[name=weight]').inputValue(), '72.8');
    assert.match(await weight.window.innerText(), /kg/);
    await capture(weight.window, 'peso', zoom);
    await closeWithEscape(page, weight.window, weight.opener);

    const meal = await openForm(page, 'Agregar comida');
    guard.push(await fingerprint(meal.window, editor));
    const description = meal.window.locator('#add-meal-description');
    await description.fill('Borrador de comparación, creado con datos sintéticos');
    await page.keyboard.press('Escape');
    const discard = page.locator('dialog[data-discard-draft][open]');
    await discard.waitFor();
    assert.ok(await button(discard, 'Seguir editando').evaluate(el => document.activeElement === el));
    await capture(discard, 'descarte', zoom);
    await button(discard, 'Descartar cambios').press('Enter');
    await meal.window.waitFor({ state: 'hidden' });
    await settle(page);
    assert.ok(await meal.opener.evaluate(el => el === document.activeElement));
  }
  if (prior) assert.deepEqual(guard, prior.guard, 'Cambió el formulario de comida aprobado en 2C');
  return { initial, checks, guard };
}

async function sample(browser, [width, height], theme, group, previous) {
  const standard = [390, 1280].includes(width) ? (width === 390 ? 375 : 1440) : width;
  const { page, context, errors } = await open(browser, standard, theme, theme);
  const viewport = width + '-' + theme;
  const shot = async name => {
    if (engine === 'chromium' && captures[viewport]?.includes(name)) await page.screenshot({
      path: path.join(output, phase, viewport + '-' + name + '.jpg'), scale: 'css', quality: 87, animations: 'disabled',
    });
  };
  try {
    if (standard !== width) await page.setViewportSize({ width, height });
    await seed(page);
    assert.equal(await page.evaluate(() => window.__homeQA.phase), 'liquid-glass-home-2b-after');
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains('dark')), theme === 'dark');
    const data = group === 'smoke'
      ? await smoke(page, width, theme, shot, previous)
      : await (await import('./liquid-glass-home-2d-flows.mjs')).journey(page, {width, theme, before, shot, previous});
    const usage = await page.evaluate(() => {
      const qa = window.__homeQA;
      return { external: qa.externalRequests, ai: qa.aiCalls.length, writes: qa.writes.length };
    });
    assert.equal(usage.external + usage.ai, 0);
    if (group === 'smoke') assert.equal(usage.writes, 0);
    assert.deepEqual(errors, []);
    return { width, theme, ...data, usage };
  } finally {
    await context.close();
  }
}

const browser = engine === 'webkit' ? await (await import(pathToFileURL(modulePath))).webkit.launch() : await start();
try {
  await mkdir(path.join(output, phase), { recursive: true });
  for (const group of section === 'all' ? ['smoke', 'recorridos'] : [section]) {
    const filename = engine + '-' + group + '.json';
    const reference = before ? null : JSON.parse(await readFile(path.join(output, 'before', filename), 'utf8')).cases;
    const results = [];
    for (const viewport of widths) {
      const [width] = viewport;
      for (const theme of ['light', 'dark']) {
        if (group === 'recorridos' && !(width === 375 && theme === 'dark' || width === 1440 && theme === 'light')) continue;
        const previous = reference?.find(entry => entry.width === width && entry.theme === theme);
        const row = await sample(browser, viewport, theme, group, previous);
        results.push(row);
        console.log(engine, phase, group, width, theme);
        for (const warning of row.checks?.flatMap(state => state.failures) ?? []) console.error(warning);
      }
    }
    await writeFile(path.join(output, phase, filename), JSON.stringify({engine, version: browser.version(), cases: results}, null, 2) + '\n');
    if (results.some(result => result.checks?.some(item => item.failures.length))) process.exitCode = 1;
  }
} finally {
  await browser.close();
}
