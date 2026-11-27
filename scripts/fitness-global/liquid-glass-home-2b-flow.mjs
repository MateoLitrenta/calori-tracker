import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { before, go, open, repo, start } from './browser.mjs';

const webkit = process.argv.includes('--webkit');
const blocks = process.argv.find(arg => arg.startsWith('--block='))?.slice(8).split(',') ?? [];
assert.ok(blocks.every(block => ['records', 'habits', 'activity'].includes(block)));
const pw = process.env.PLAYWRIGHT_MODULE || path.resolve(repo, '../qa-tools/node_modules/playwright/index.mjs');
const browser = webkit ? await (await import(pathToFileURL(pw))).webkit.launch() : await start();
const output = path.join(repo, 'docs/evidence/liquid-glass-home-2b');
const today = '2026-11-13';
const long = 'Bowl de quinoa con tomates cherry, huevos duros y sándwich de miga';
const description = 'Primera porción de quinoa y tomates cherry. Segunda porción de sándwich y huevos duros.';
const section = page => page.locator('[data-history-root]');
const selected = page => page.locator('.home-date-context time').getAttribute('datetime');
const day = (page, date) => page.locator(`.ah-day[data-date="${date}"]`);
const button = (scope, name) => scope.getByRole('button', { name, exact: true });
const settle = page => page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));

async function reveal(locator) {
  const result = await locator.evaluate(el => {
    el.scrollIntoView({ block: 'center', inline: 'nearest' });
    const box = el.getBoundingClientRect();
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return { width: box.width, height: box.height, hit: el.contains(hit) };
  });
  assert.ok(result.hit && result.width >= 43.5 && result.height >= 43.5, JSON.stringify(result));
}

async function recordFixture(page, state) {
  await page.evaluate(({state, long, description}) => {
    const q = window.__homeQA;
    q.initialRecord ??= structuredClone(q.profiles.A.records[q.today]);
    const row = structuredClone(q.initialRecord);
    if (state === 'empty') Object.assign(row, { meals: [], workouts: [] });
    else {
      Object.assign(row.meals[0], {name: long, details: description, calories: 1100});
      row.meals[1].calories = 750;
      if (state === 'one') Object.assign(row, { meals: row.meals.slice(0, 1), workouts: [] });
    }
    q.profiles.A.records[q.today] = row;
    q.store = q.makeStore();
    q.notify();
  }, {state, long, description});
  await settle(page);
}

async function detail(page, row, { title, amount, details }) {
  await reveal(row);
  assert.equal(await row.locator('.fitness-record-kcal').textContent(), amount);
  await row.evaluate(el => el.focus({ preventScroll: true }));
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Detalle del registro' });
  await dialog.waitFor();
  assert.equal(await dialog.locator('.record-detail-main').textContent(), title);
  assert.match(await dialog.locator('.record-detail-content').textContent(), new RegExp(amount.replace(/[+.]/g, '\\$&')));
  if (details) assert.equal(await dialog.locator('.record-detail-details').textContent(), details);
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  assert.ok(await row.evaluate(el => document.activeElement === el), 'Detail must return focus to its record');
}

async function records(page) {
  const all = page.locator('.daily-record-open');
  await recordFixture(page, 'many');
  assert.equal(await all.count(), 5);
  assert.deepEqual(await all.evaluateAll(items => items.map(el => el.dataset.entryId)), [
    'a-breakfast', 'a-gym', 'a-lunch', 'a-walk', 'a-snack',
  ]);
  await detail(page, all.nth(0), { title: long, amount: '+1.100 kcal', details: description });
  await detail(page, all.nth(1), { title: 'Gimnasio', amount: '-250 kcal' });
  assert.equal(await all.nth(2).locator('.fitness-record-kcal').textContent(), '+750 kcal');
  const expand = button(page, 'Ver todos los registros (5)');
  await reveal(expand);
  await expand.click();
  assert.equal(await all.filter({ visible: true }).count(), 5);
  await button(page, 'Mostrar menos').click();
  await recordFixture(page, 'one');
  assert.equal(await all.count(), 1);
  await recordFixture(page, 'empty');
  assert.equal(await all.count(), 0);
  assert.match(await page.locator('.daily-logs-empty').textContent(), /las comidas y los ejercicios/i);
  const opener = button(page, 'Agregar comida');
  await reveal(opener);
  await opener.click();
  await page.locator('#add-meal-description').fill('Tostada sintética de avena');
  await page.locator('#add-meal-calories').fill('750');
  await button(page, 'Guardar comida').click();
  const receipt = page.locator('.meal-saved');
  await receipt.waitFor();
  await reveal(button(receipt, 'Ver registro'));
  await button(receipt, 'Ver registro').click();
  const saved = page.locator('.daily-record-open[data-just-saved]');
  await saved.waitFor();
  assert.match(await saved.locator('.daily-record-title').textContent(), /Tostada sintética de avena/);
  assert.equal(await saved.locator('.fitness-record-kcal').textContent(), '+750 kcal');
  assert.equal(await selected(page), today);
  return { states: [5, 1, 0], signed: ['+1.100 kcal', '+750 kcal', '-250 kcal'], receipt: true, detailFocus: true };
}

async function habits(page) {
  const block = page.locator('.daily-habits-block');
  const status = block.getByRole('status');
  const plus = button(block, 'Sumar 250 ml de agua');
  await reveal(plus);
  await plus.click();
  await status.filter({ hasText: 'Guardado' }).waitFor();
  const amount = key => page.evaluate(key => window.__homeQA.store.activeProfile.records[window.__homeQA.today][key], key);
  assert.equal(await amount('water'), 2000);
  const edit = button(block, 'Editar total de pasos');
  await reveal(edit);
  await edit.click();
  const steps = block.getByRole('spinbutton', { name: 'Total de pasos' });
  assert.ok(await steps.evaluate(el => document.activeElement === el));
  await page.evaluate(() => { window.__homeQA.failed = true; });
  await steps.fill('10000');
  await steps.press('Enter');
  await block.getByRole('alert').filter({ hasText: 'borrador' }).waitFor();
  assert.equal(await amount('steps'), 6300);
  const retry = button(block, 'Comprobar y reintentar');
  await reveal(retry);
  await page.evaluate(() => { window.__homeQA.failed = false; });
  await retry.click();
  await status.filter({ hasText: 'Guardado' }).waitFor();
  assert.equal(await amount('steps'), 10000);
  const weight = button(block, 'Editar peso');
  await reveal(weight);
  await weight.click();
  const modal = page.getByRole('dialog', { name: 'Editar peso' });
  await modal.getByRole('textbox', { name: 'Peso (kg)' }).fill('112,4');
  await button(modal, 'Guardar peso').click();
  await modal.waitFor({ state: 'hidden' });
  assert.equal(await amount('weight'), 112.4);
  const values = await block.locator('.habit-metric').allTextContents();
  assert.deepEqual(values.map(value => value.replace(/\s+/g, ' ').trim()), ['2.000 ml', '10.000', '112,4kg'].map(value => value.replace(/\s+/g, ' ').trim()));
  assert.equal(await selected(page), today);
  await page.evaluate(() => {
    const q = window.__homeQA;
    const record = q.profiles.A.records[q.today];
    q.profiles.A.records[q.today] = { ...record, water: 1234567, steps: 12345678 };
    q.store = q.makeStore();
    q.notify();
  });
  await settle(page);
  const large = await block.locator('.habit-metric').allTextContents();
  assert.deepEqual(large.map(value => value.replace(/\s/g, '')), ['1.234.567ml', '12.345.678', '112,4kg']);
  const increments = await block.locator('.habit-controls button').evaluateAll(controls =>
    controls.map(el => {
      const {width, height} = el.getBoundingClientRect();
      return { text: el.textContent.trim(), width, height, fits: el.scrollWidth <= el.clientWidth + 1 };
    }));
  assert.deepEqual(increments.map(item => item.text), ['−250', '+250', '−500', '+500']);
  assert.ok(increments.every(item => item.width >= 44 && item.height >= 44 && item.fits), JSON.stringify(increments));
  return { water: 2000, steps: 10000, weight: 112.4, saved: true, failedDraft: true, retried: true,
    large: ['1.234.567 ml', '12.345.678', '112,4 kg'], minimumTargets: true };
}

async function activity(page) {
  const history = section(page);
  const toggle = page.locator('.home-history-toggle');
  if (await toggle.isVisible() && await toggle.getAttribute('aria-expanded') === 'false') {
    await reveal(toggle);
    await toggle.click();
  }
  const selectPeriod = async name => {
    const control = button(history.locator('.ah-view-switch'), name);
    await reveal(control);
    await control.click();
    assert.equal(await control.getAttribute('aria-pressed'), 'true');
  };
  await selectPeriod('Mes');
  const states = {};
  for (const [date, state] of [['08', 'empty'], ['09', 'with-meals'], ['11', 'partial'], ['13', 'with-meals'], ['14', 'future']]) {
    const item = day(page, '2026-11-' + date);
    assert.equal(await item.getAttribute('data-completeness'), state);
    states[date] = state;
  }
  const current = day(page, today);
  assert.equal(await current.getAttribute('aria-current'), 'date');
  assert.ok(await day(page, '2026-11-14').isDisabled());
  await reveal(current);
  await current.evaluate(el => el.focus({ preventScroll: true }));
  // With the calendar selected by click, enter again through the keyboard's
  // tab order so WebKit also switches to its keyboard focus indicator.
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  assert.ok(await current.evaluate(el => el === document.activeElement && el.matches(':focus-visible')));
  await page.keyboard.press('ArrowLeft');
  const previous = day(page, '2026-11-12');
  assert.equal(await previous.getAttribute('aria-pressed'), 'true');
  assert.ok(await previous.evaluate(el => el === document.activeElement && el.matches(':focus-visible')));
  assert.equal(await selected(page), today);
  await selectPeriod('Semana');
  const week = await history.locator('.ah-day').evaluateAll(days => days.map(el => el.dataset.date));
  assert.deepEqual(week.map(date => Number(date.slice(-2))), [9, 10, 11, 12, 13, 14, 15]);
  assert.equal(await history.locator('.ah-period-boundary').textContent(), 'Lunes a domingo');
  const previousWeek = button(history, 'Semana anterior');
  await reveal(previousWeek);
  await previousWeek.click();
  assert.equal(await history.locator('.ah-day').first().getAttribute('data-date'), '2026-11-02');
  const nextWeek = button(history, 'Semana siguiente');
  await reveal(nextWeek);
  await nextWeek.click();
  assert.equal(await history.locator('.ah-day').first().getAttribute('data-date'), '2026-11-09');
  assert.equal(await selected(page), today);
  await selectPeriod('Año');
  assert.equal(await history.locator('.ah-month').count(), 12);
  assert.ok(await history.locator('.ah-month[data-month="2026-12"]').isDisabled());
  const november = history.locator('.ah-month[data-month="2026-11"]');
  await reveal(november);
  await november.click();
  assert.equal(await button(history.locator('.ah-view-switch'), 'Mes').getAttribute('aria-pressed'), 'true');
  await reveal(previous);
  await previous.click();
  assert.equal(await selected(page), today);
  const openDay = history.locator('[data-history-open]');
  await reveal(openDay);
  await openDay.click();
  await page.waitForFunction(() => document.activeElement?.id === 'fitness-daily-entries');
  assert.equal(await selected(page), '2026-11-12');
  const content = page.locator('.app-main');
  const position = await content.evaluate(el => {
    el.scrollTop = Math.min(230, el.scrollHeight - el.clientHeight);
    return el.scrollTop;
  });
  assert.ok(position > 0);
  await go(page, 'Datos');
  await go(page, 'Inicio');
  await settle(page);
  const restored = await content.evaluate(el => ({ top: el.scrollTop, max: el.scrollHeight - el.clientHeight }));
  assert.ok(Math.abs(restored.top - Math.min(position, restored.max)) <= 1, JSON.stringify({position, restored}));
  assert.equal(await selected(page), '2026-11-12');
  return { states, week, months: 12, keyboard: true, consultedThenOpened: '2026-11-12', restored: restored.top };
}

async function run(width, theme, block, test) {
  const { page, context, errors } = await open(browser, width, theme, theme);
  try {
    assert.equal(await page.evaluate(() => window.__homeQA.phase), 'liquid-glass-home-2b-' + (before ? 'before' : 'after'));
    const result = await test(page);
    const usage = await page.evaluate(() => {
      const q = window.__homeQA;
      return { writes: q.writes.map(({date,status}) => [date,status]), ai: q.aiCalls.length, external: q.externalRequests };
    });
    const outcomes = { records: ['confirmed'], habits: ['confirmed', 'failed', 'confirmed', 'confirmed'], activity: [] }[block];
    assert.deepEqual(usage, { writes: outcomes.map(status => [today, status]), ai: 0, external: 0 });
    assert.deepEqual(errors, []);
    const row = { width, theme, block, result, usage };
    console.log(JSON.stringify(row));
    return row;
  } finally {
    await context.close();
  }
}

try {
  const results = [];
  const cases = blocks.length ? [[375, 'light']] : [[375, 'light'], [1440, 'dark']];
  for (const [width, theme] of cases) {
    for (const [block, test] of Object.entries({ records, habits, activity })) {
      if (!blocks.length || blocks.includes(block)) results.push(await run(width, theme, block, test));
    }
  }
  if (!blocks.length) {
    const engine = webkit ? 'webkit' : 'chromium';
    await mkdir(output, { recursive: true });
    await writeFile(path.join(output, `funcional-${engine}${before ? '-antes' : ''}.json`),
      JSON.stringify({engine, version: browser.version(), results}, null, 2) + '\n');
  }
} finally {
  await browser.close();
}
