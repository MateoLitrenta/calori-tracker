import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { go, heights, metrics, open, period, repo, settled, start } from '../ux-stage1/browser.mjs';

const before = process.argv.includes('--before');
const mode = process.argv.includes('--flows') ? 'flows' : 'layout';
const origin = 'http://127.0.0.1:' + (before ? '5197' : '5198');
const directory = path.join(repo, 'docs/evidence/ux-stage2', before ? 'before' : 'after');
const evidence = [];
mkdirSync(directory, { recursive: true });
const browser = await start();
const meal = page => page.getByRole('button', { name: '+ Comida', exact: true });
const dialog = page => page.getByRole('dialog');
const history = async page => {
  const toggle = page.locator('.home-history-toggle');
  if (await toggle.getAttribute('aria-expanded') === 'false') await toggle.click();
  return page.locator('[data-history-root]');
};
const capture = (page, name) => page.screenshot({ path: path.join(directory, name + '.jpg'), quality: 85 });
const counters = page => page.evaluate(() => {
  const qa = window.__homeQA;
  return { writes: qa.writes.map(w => ({ day: w.date, status: w.status })), ai: qa.aiCalls.length, external: qa.externalRequests };
});
async function check(name, width, theme, inspect, scenario = 'main') {
  const { page, context, errors } = await open(browser, width, theme, scenario, 'light', origin);
  try {
    const result = await inspect(page);
    const services = await counters(page);
    assert.equal(services.external, 0);
    assert.deepEqual(errors, []);
    evidence.push({ name, width, theme, status: 'passed', services, ...result });
  } catch (error) {
    evidence.push({ name, width, theme, status: 'failed', error: error.message });
    console.error(name, width, theme, error.message);
  } finally {
    await context.close();
  }
}
async function enlarge(page) {
  await page.evaluate(() => {
    const scope = document.querySelector('[role="dialog"]') ?? document.querySelector('.app-main');
    const styles = [...scope.querySelectorAll('*')].filter(e => e instanceof HTMLElement)
      .map(e => [e, getComputedStyle(e).fontSize, getComputedStyle(e).lineHeight]);
    for (const [element, size, line] of styles) {
      element.style.fontSize = parseFloat(size) * 2 + 'px';
      if (line !== 'normal') element.style.lineHeight = parseFloat(line) * 2 + 'px';
    }
  });
  await settled(page);
}
async function layout(page, width, theme) {
  const datedHistory = await history(page);
  await datedHistory.locator('.ah-navigation').scrollIntoViewIfNeeded();
  if (width === 375 || width === 1440) await capture(page, width + '-' + theme + '-historial');
  if (!before && width < 768) {
    await datedHistory.getByRole('button', { name: 'Ver detalle del día' }).click();
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Detalle del día');
  }
  const main = page.locator('.app-main');
  await main.evaluate(e => { e.scrollTop = 0; });
  if (width === 375 || width === 1440) await capture(page, width + '-' + theme + '-inicio');
  await meal(page).click();
  const form = page.locator('.entry-form').first();
  await form.waitFor();
  if (width === 375 || width === 1440) await capture(page, width + '-' + theme + '-comida');
  const box = await form.boundingBox();
  if (!before) {
    await dialog(page).getByRole('button', { name: 'Elegir de galería' }).waitFor();
    await dialog(page).getByRole('button', { name: 'Usar hora actual' }).waitFor();
    assert.ok(box.width >= Math.min(width - 36, 550));
  }
  await page.locator('#add-meal-description').fill('Descripción extensa para comprobar el formulario y su pie. '.repeat(12));
  await enlarge(page);
  const geometry = await form.evaluate(element => {
    const body = element.querySelector('.entry-form-content');
    const submit = element.querySelector('button[type=submit]').getBoundingClientRect();
    return { width: element.clientWidth, scrollWidth: element.scrollWidth, bodyWidth: body.clientWidth, bodyScrollWidth: body.scrollWidth,
      footerVisible: submit.bottom <= innerHeight + 1 && submit.top >= 0 };
  });
  if (!before) {
    assert.ok(geometry.footerVisible);
    assert.ok(geometry.bodyScrollWidth <= geometry.bodyWidth + 1, JSON.stringify(geometry));
  }
  if (width === 375 || width === 1440) await capture(page, width + '-' + theme + '-comida-texto200');
  return { formWidth: box.width, text200: geometry };
}

async function entries(page) {
  const day = page.locator('.home-date-context time');
  const original = await day.getAttribute('datetime');
  const h = await history(page);
  await h.locator('.ah-day:not(:disabled)').filter({ hasText: /^15/ }).first().click();
  assert.equal(await day.getAttribute('datetime'), original);
  await h.locator('[data-history-open]').click();
  assert.equal(await day.getAttribute('datetime'), '2026-11-15');
  await meal(page).click();
  const field = page.locator('#add-meal-description');
  await field.fill('Almuerzo sintético · prueba de borrador');
  await page.locator('#add-meal-calories').fill('340');
  await page.emulateMedia({ colorScheme: 'dark' });
  await settled(page);
  assert.ok(await page.locator('html').evaluate(e => e.classList.contains('dark')));
  page.once('dialog', prompt => prompt.dismiss());
  await page.keyboard.press('Escape');
  assert.equal(await field.inputValue(), 'Almuerzo sintético · prueba de borrador');
  await page.evaluate(() => { window.__homeQA.failed = true; });
  await dialog(page).getByRole('button', { name: 'Guardar comida' }).click();
  await page.getByText(/Tu comida y su foto se conservan/).waitFor();
  assert.equal(await field.inputValue(), 'Almuerzo sintético · prueba de borrador');
  await page.evaluate(() => { window.__homeQA.failed = false; });
  await dialog(page).getByRole('button', { name: 'Guardar comida' }).click();
  await dialog(page).waitFor({ state: 'hidden' });
  const record = page.getByRole('button', { name: /Almuerzo sintético · prueba de borrador/ });
  await record.click();
  await dialog(page).getByRole('button', { name: /Editar/ }).click();
  await page.locator('#edit-meal-description').fill('Comida sintética editada');
  await dialog(page).getByRole('button', { name: 'Guardar cambios' }).click();
  await dialog(page).waitFor({ state: 'hidden' });
  assert.ok(await page.getByRole('button', { name: /Comida sintética editada/ }).isVisible());
  await meal(page).click();
  await field.fill('Borrador que se descarta');
  page.once('dialog', prompt => prompt.accept());
  await dialog(page).getByRole('button', { name: 'Cancelar' }).click();
  await dialog(page).waitFor({ state: 'hidden' });
  assert.equal(await page.evaluate(() => document.activeElement?.textContent?.trim()), '+ Comida');
  const { writes, ai } = await counters(page);
  assert.equal(ai, 0);
  assert.deepEqual(writes.map(w => [w.day, w.status]), [
    ['2026-11-15', 'failed'], ['2026-11-15', 'confirmed'], ['2026-11-15', 'confirmed'],
  ]);
}

async function habitsAndPhoto(page) {
  const daily = page.locator('.daily-habits');
  await enlarge(page);
  const controls = await daily.locator('.habit-controls button').evaluateAll(buttons => buttons.map(button => {
    const text = document.createRange();
    text.selectNodeContents(button);
    return [button.getBoundingClientRect().width, text.getBoundingClientRect().width];
  }));
  assert.ok(controls.every(([control, label]) => control >= 44 && control >= label), JSON.stringify(controls));
  for (const [label, expected] of [['Sumar 250 ml de agua', '2.500'], ['Sumar 500 pasos', '6.500']]) {
    await page.getByRole('button', { name: label }).evaluate(button => { button.click(); button.click(); button.click(); });
    await page.waitForFunction(value => [...document.querySelectorAll('.habit-value')].some(e => e.textContent.trim() === value), expected);
  }
  await page.waitForFunction(() => {
    const qa = window.__homeQA;
    const day = qa.store.activeProfile.records[qa.today];
    return day.water === 2500 && day.steps === 6500;
  });
  await page.getByRole('button', { name: 'Registrar peso' }).click();
  await dialog(page).getByLabel('Peso (kg)').fill('73,2');
  await dialog(page).getByRole('button', { name: 'Guardar peso' }).click();
  await page.getByRole('button', { name: 'Editar peso' }).waitFor();
  await meal(page).click();
  await dialog(page).locator('input[type=file]').setInputFiles({
    name: 'synthetic.png', mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jPioAAAAASUVORK5CYII=', 'base64'),
  });
  await dialog(page).getByAltText('Vista previa de la comida').waitFor();
  assert.equal((await counters(page)).ai, 0);
  await dialog(page).getByRole('button', { name: 'Estimar con IA' }).click();
  await page.waitForFunction(() => window.__homeQA.aiCalls.length === 1);
  assert.equal(await page.locator('#add-meal-calories').inputValue(), '450');
}

async function annual(page, width, empty = false) {
  await go(page, 'Datos');
  await period(page, 'Año');
  if (!empty && !before) await page.locator('.charts-bucket').nth(9).click();
  await page.setViewportSize({ width, height: heights[width] });
  await settled(page);
  const data = await metrics(page);
  if (empty) { await page.locator('.charts-empty').waitFor(); return { empty }; }
  assert.equal(data.buckets.length, 12);
  const activity = data.buckets.filter(b => b.energy && b.visible).map(b => b.label);
  assert.equal(activity.length > 0, !before);
  await page.locator('.charts-energy').scrollIntoViewIfNeeded();
  if (width === 375) await capture(page, '375-anual-' + (await page.locator('html').evaluate(e => e.classList.contains('dark')) ? 'dark' : 'light'));
  if (before) {
    await period(page, 'Mes');
    await period(page, 'Año');
    assert.ok((await metrics(page)).buckets.some(b => b.energy && b.visible));
  } else {
    assert.equal(await page.locator('.charts-bucket').nth(9).getAttribute('aria-pressed'), 'true');
    const scroller = page.locator('.charts-plot-scroll');
    for (const position of [40, 0]) {
      await scroller.evaluate((e, value) => { e.scrollLeft = value; }, position);
      await settled(page);
      await page.setViewportSize({ width: 1440, height: heights[1440] });
      await settled(page);
      await page.setViewportSize({ width, height: heights[width] });
      await settled(page);
      assert.equal(await scroller.evaluate(e => e.scrollLeft), position);
    }
  }
  return { activity, months: data.buckets.length };
}

try {
  if (mode === 'layout') {
    for (const width of Object.keys(heights).map(Number)) {
      for (const theme of ['light', 'dark']) await check('Inicio, Historial y formulario', width, theme, page => layout(page, width, theme));
    }
  } else if (!before) {
    for (const width of [375, 1440]) await check('Alta, error, edición, cancelar, foco y Sistema', width, 'system', entries);
    await check('Hábitos rápidos, peso y foto con IA explícita', 320, 'dark', habitsAndPhoto);
  }
  if (mode === 'layout') {
    for (const width of [320, 375, 393]) {
      for (const theme of ['light', 'dark']) await check('Año redimensionado a ' + width, 1440, theme, page => annual(page, width));
    }
    await check('Año vacío redimensionado', 1440, 'light', page => annual(page, 375, true), 'empty');
  }
} finally {
  await browser.close();
  writeFileSync(path.join(directory, mode + '.json'), JSON.stringify(evidence, null, 2) + '\n');
}
assert.ok(evidence.every(row => row.status === 'passed'), 'See recorded scenario failures');
console.log(mode, evidence.length, 'passed');
