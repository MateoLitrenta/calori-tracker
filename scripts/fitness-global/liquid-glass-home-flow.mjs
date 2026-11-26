import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { before, go, open, origin, repo, start } from './browser.mjs';

const webkit = process.argv.includes('--webkit');
const navLift = process.argv.includes('--glass-nav-lift');
const playwright = process.env.PLAYWRIGHT_MODULE || path.resolve(repo, '../qa-tools/node_modules/playwright/index.mjs');
const browser = webkit ? await (await import(pathToFileURL(playwright))).webkit.launch() : await start();
const output = path.join(repo, 'docs/evidence/liquid-glass-home', navLift ? 'ajuste-altura-nav' : '');
const button = (scope, name) => scope.getByRole('button', { name, exact: true });
const day = (page, value) => page.locator(`.home-week-days [data-day="${value}"]`);
const selectedDate = page => page.locator('.home-date-context time').getAttribute('datetime');
const main = page => page.locator('.app-main');
const localNumber = new Intl.NumberFormat('es-AR');
const kcal = n => localNumber.format(n);
const signed = n => (n > 0 ? '+' : '') + kcal(n);
const settle = page => page.evaluate(() =>
  new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));

async function assertWeek(page, expected) {
  const dates = await page.locator('.home-week-days [data-day]').evaluateAll(buttons =>
    buttons.map(button => ({ date: button.dataset.day, disabled: button.disabled })));
  assert.deepEqual(dates.map(({ date }) => Number(date.slice(-2))), expected);
  assert.deepEqual(dates.filter(({ disabled }) => disabled).map(({ date }) => Number(date.slice(-2))),
    expected.filter(date => date > 13));
  const selected = page.locator('.home-week-days [data-day][aria-pressed=true]');
  assert.equal(await selected.count(), 1);
  assert.equal(await selected.getAttribute('data-day'), await selectedDate(page));
}

async function checkEnergy(page, date, { intake, steps, exercise, category }) {
  // The fixed account's TMB is 1,679 kcal. The fixture includes records with
  // intake below, equal to, and above expenditure to cover all three signs.
  const gasto = 1679 + steps + exercise;
  const saldo = intake - gasto;
  const score = page.getByRole('region', { name: 'Resumen energético' });
  assert.equal(await selectedDate(page), date);
  assert.equal(await score.locator('.energy-number > span').textContent(), signed(saldo));
  assert.deepEqual(await score.locator('.fitness-channel dt').allTextContents(), ['Calorías consumidas', 'Gasto estimado']);
  assert.deepEqual(await score.locator('.fitness-channel dd:not(.fitness-track) > span').allTextContents(), [kcal(intake), kcal(gasto)]);
  const tracks = await score.locator('.fitness-track > span').evaluateAll(bars => bars.map(bar => parseFloat(bar.style.width)));
  const max = Math.max(intake, gasto);
  assert.equal(tracks.length, 2);
  for (const [index, value] of [intake, gasto].entries()) {
    assert.ok(Math.abs(tracks[index] - 100 * value / max) < 0.01, JSON.stringify({ tracks, intake, gasto }));
  }
  const details = score.locator('details');
  const summary = details.locator('summary');
  assert.equal(await details.evaluate(node => node.open), false);
  await summary.press('Enter');
  await details.locator('.fitness-breakdown-body').waitFor();
  assert.equal(await details.evaluate(node => node.open), true);
  assert.equal(await details.locator('.fitness-balance-category').textContent(), category);
  assert.deepEqual(await details.locator('.fitness-breakdown-values dd').allTextContents(),
    [kcal(intake) + ' kcal', kcal(gasto) + ' kcal']);
  for (const text of [`TMB: ${kcal(1679)} kcal`, `Pasos: ${kcal(steps)} kcal`, `Ejercicio: ${kcal(exercise)} kcal`]) {
    assert.ok(await details.getByText(text, { exact: true }).isVisible(), text);
  }
  await summary.press('Space');
  assert.equal(await details.evaluate(node => node.open), false);
  return { date, intake, gasto, saldo, category, tracks };
}

async function controlHit(locator) {
  const result = await locator.evaluate(el => {
    const bounds = el.getBoundingClientRect();
    const hit = document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
    return { label: el.textContent.trim(), top: bounds.top, bottom: bounds.bottom, hit: el.contains(hit) };
  });
  assert.ok(result.top >= 0 && result.hit, JSON.stringify(result));
  return result;
}

async function checkScrollEnd(page, target) {
  const content = main(page);
  await content.evaluate(el => { el.scrollTop = el.scrollHeight; });
  await settle(page);
  const geometry = await content.evaluate(el => {
    const top = document.querySelector('.bottom-nav-track').getBoundingClientRect().top;
    return {
      reserved: parseFloat(getComputedStyle(el).paddingBottom), capsuleTop: top,
      bottomClearance: top - el.querySelector('.app-content').getBoundingClientRect().bottom,
      offset: el.scrollTop, maxScroll: el.scrollHeight - el.clientHeight,
    };
  });
  assert.ok(Math.abs(geometry.offset - geometry.maxScroll) <= 1 && geometry.bottomClearance >= 0,
    JSON.stringify(geometry));
  // Datos may keep its last control above the viewport once the reader reaches the final activity metrics.
  await target.evaluate(el => {
    const nav = document.querySelector('.bottom-nav-track').getBoundingClientRect();
    const bounds = el.getBoundingClientRect();
    if (bounds.top < 0 || bounds.bottom > nav.top) el.scrollIntoView({ block: 'center' });
  });
  const control = await controlHit(target);
  assert.ok(control.bottom <= geometry.capsuleTop, JSON.stringify({ control, geometry }));
  return { ...geometry, control };
}

async function checkMealReceipt(page) {
  const opener = button(page, 'Agregar comida');
  await opener.evaluate(el => el.scrollIntoView({ block: 'center' }));
  await opener.click();
  await page.locator('#add-meal-description').fill('Comida sintética de la prueba de navegación');
  await page.locator('#add-meal-calories').fill('360');
  await button(page, 'Guardar comida').click();
  const receipt = page.locator('.meal-saved');
  await receipt.waitFor();
  const gaps = [];
  for (const textSize of [100, 75, 200]) {
    await page.evaluate(value => { document.documentElement.style.fontSize = value + '%'; }, textSize);
    await settle(page);
    const clearance = await receipt.evaluate(el =>
      document.querySelector('.bottom-nav-track').getBoundingClientRect().top - el.getBoundingClientRect().bottom);
    assert.ok(clearance >= 8, JSON.stringify({ textSize, clearance }));
    const close = await controlHit(button(receipt, 'Cerrar confirmación'));
    const record = button(receipt, 'Ver registro');
    const receiptScroll = await record.evaluate(el => {
      const container = el.closest('.meal-saved');
      const control = el.getBoundingClientRect();
      const bounds = container.getBoundingClientRect();
      if (control.bottom > bounds.bottom) container.scrollTop += control.bottom - bounds.bottom + 1;
      return container.scrollTop;
    });
    const openRecord = await controlHit(record);
    gaps.push({ textSize, clearance, close: close.hit, openRecord: openRecord.hit, receiptScroll });
  }
  await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
  await button(receipt, 'Cerrar confirmación').click();
  await receipt.waitFor({ state: 'hidden' });
  return gaps;
}

async function closeWithoutWriting(page, name, input, date, width) {
  const trigger = button(page, name);
  await trigger.scrollIntoViewIfNeeded();
  if (navLift) {
    await trigger.evaluate(el => el.focus({ preventScroll: true }));
    await settle(page);
  }
  const scroll = await main(page).evaluate(node => node.scrollTop);
  if (navLift) await page.keyboard.press('Enter');
  else await trigger.press('Enter');
  const dialog = page.getByRole('dialog', { name, exact: true });
  await dialog.waitFor();
  assert.equal(await dialog.getAttribute('aria-modal'), 'true');
  assert.ok(await dialog.evaluate(node => node.classList.contains(innerWidth < 768 ? 'entry-bottom-sheet' : 'entry-desktop-modal')));
  assert.equal(await dialog.locator('.entry-date-context time').getAttribute('datetime'), date);
  assert.ok(await main(page).evaluate(node => node.inert));
  let visibleFooter = null;
  if (navLift && width < 768) {
    const label = name === 'Agregar comida' ? 'Guardar comida' : 'Guardar ejercicio';
    const actions = dialog.locator('.entry-form-footer');
    visibleFooter = [];
    for (const textSize of [100, 200]) {
      await page.evaluate(value => { document.documentElement.style.fontSize = value + '%'; }, textSize);
      await settle(page);
      assert.ok(await page.locator('.app-bottom-nav').evaluate(el => el.inert && getComputedStyle(el).opacity === '0'));
      visibleFooter.push({ textSize, actions: [await controlHit(button(actions, 'Cancelar')), await controlHit(button(actions, label))] });
    }
    await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
    await settle(page);
  }
  const field = dialog.locator(input);
  await field.fill('Borrador sintético');
  await button(dialog, 'Cancelar').click();
  const discard = button(page, 'Descartar cambios');
  await discard.waitFor();
  await button(page, 'Seguir editando').click();
  assert.equal(await field.inputValue(), 'Borrador sintético');
  await page.keyboard.press('Escape');
  await discard.click();
  await dialog.waitFor({ state: 'hidden' });
  await page.waitForFunction(label =>
    document.activeElement?.matches('.daily-quick-actions button') && document.activeElement.textContent.trim() === label, name);
  assert.equal(await main(page).evaluate(node => node.inert), false);
  const returnedScroll = await main(page).evaluate(node => node.scrollTop);
  assert.ok(Math.abs(scroll - returnedScroll) <= 1, 'Canceling preserves the reading position ' + JSON.stringify({ name, width, scroll, returnedScroll }));
  assert.equal(await selectedDate(page), date);
  return { name, date, layout: width < 768 ? 'sheet' : 'dialog', preservedDraftUntilConfirmed: true, focusRestored: true, scrollPreserved: true, ...(visibleFooter ? { visibleFooter } : {}) };
}

async function checkHistory(page, today) {
  const history = page.locator('.home-history-toggle');
  if (await history.getAttribute('aria-expanded') === 'false') await history.click();
  await page.locator('.ah-day[data-date="2026-11-09"]').click();
  assert.equal(await selectedDate(page), today, 'exploring History must not change the day used by the forms');
  await page.locator('[data-history-open]').click();
  await page.waitForFunction(() => document.activeElement?.id === 'fitness-daily-entries');
  assert.equal(await selectedDate(page), '2026-11-09');
  return { inspected: '2026-11-09', registerDayBeforeOpening: today, registerDayAfterOpening: '2026-11-09', focusOnJournal: true };
}

async function run(width, theme) {
  const { page, context, errors } = await open(browser, width, theme, theme, origin);
  try {
    const phase = navLift ? 'liquid-glass-nav-lift' : 'liquid-glass-home';
    assert.equal(await page.evaluate(() => window.__homeQA.phase), phase + (before ? '-before' : '-after'));
    const verifyBottom = navLift && width < 768 && !before;
    const today = '2026-11-13';
    const week = [9, 10, 11, 12, 13, 14, 15];
    assert.equal(await selectedDate(page), today);
    await assertWeek(page, week);
    assert.equal(await day(page, today).getAttribute('aria-current'), 'date');

    const energy = [await checkEnergy(page, today, { intake: 1250, steps: 252, exercise: 350, category: 'Déficit Alto' })];
    await day(page, today).press('Home');
    const monday = day(page, '2026-11-09');
    assert.ok(await monday.evaluate(button => button === document.activeElement));
    assert.equal(await selectedDate(page), today, 'moving focus must not select another day');
    await page.keyboard.press('ArrowRight');
    assert.ok(await day(page, '2026-11-10').evaluate(button => button === document.activeElement));
    assert.equal(await selectedDate(page), today);
    await page.keyboard.press('Enter');
    energy.push(await checkEnergy(page, '2026-11-10', { intake: 1679, steps: 0, exercise: 0, category: 'Mantenimiento' }));
    await day(page, '2026-11-12').click();
    energy.push(await checkEnergy(page, '2026-11-12', { intake: 3100, steps: 350, exercise: 420, category: 'Superávit Alto' }));

    const forms = [await closeWithoutWriting(page, 'Agregar comida', '#add-meal-description', '2026-11-12', width)];
    await button(page, 'Semana anterior').click();
    await assertWeek(page, [2, 3, 4, 5, 6, 7, 8]);
    assert.equal(await selectedDate(page), '2026-11-05');
    await button(page, 'Semana siguiente').click();
    await assertWeek(page, week);
    assert.equal(await selectedDate(page), '2026-11-12');

    const calendar = button(page, 'Abrir calendario mensual');
    await calendar.press('Enter');
    const picker = page.getByRole('dialog', { name: 'Elegir fecha', exact: true });
    await picker.waitFor();
    const weekDays = await picker.getByRole('columnheader').evaluateAll(days => days.map(day => day.getAttribute('aria-label')));
    assert.deepEqual(weekDays, ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']);
    await page.waitForFunction(() => document.activeElement?.dataset.calendarDay === '2026-11-12');
    await page.keyboard.press('Escape');
    await picker.waitFor({ state: 'hidden' });
    assert.ok(await calendar.evaluate(button => button === document.activeElement));
    await button(page.getByRole('region', { name: 'Fecha de Inicio' }), 'Hoy').click();
    assert.equal(await selectedDate(page), today);

    const history = await checkHistory(page, today);
    forms.push(await closeWithoutWriting(page, 'Agregar ejercicio', '#add-workout-activity', '2026-11-09', width));
    const scroll = await main(page).evaluate(node => {
      node.scrollTop = Math.min(230, node.scrollHeight - node.clientHeight);
      return node.scrollTop;
    });
    assert.ok(scroll > 0);
    await go(page, 'Datos');
    let dataEnd;
    if (verifyBottom) {
      const bucket = page.locator('.charts-bucket').first();
      await bucket.evaluate(el => el.scrollIntoView({ block: 'center', inline: 'center' }));
      await bucket.click();
      dataEnd = await checkScrollEnd(page, button(page, 'Quitar selección del gráfico'));
    }
    await go(page, 'Inicio');
    await settle(page);
    const restored = await main(page).evaluate(node => ({ offset: node.scrollTop, max: node.scrollHeight - node.clientHeight }));
    // Activity disclosures can return collapsed, bounding the reachable previous offset.
    const expectedScroll = navLift ? Math.min(scroll, restored.max) : scroll;
    assert.ok(Math.abs(expectedScroll - restored.offset) <= 1, JSON.stringify({ scroll, restored }));
    assert.equal(await selectedDate(page), '2026-11-09');

    let mobile;
    if (verifyBottom) {
      const historyToggle = page.locator('.home-history-toggle');
      if (await historyToggle.getAttribute('aria-expanded') === 'true') await historyToggle.click();
      const homeEnd = await checkScrollEnd(page, historyToggle);
      const mealReceipt = await checkMealReceipt(page);
      mobile = { homeEnd, dataEnd, mealReceipt };
    }
    const usage = await page.evaluate(() => ({
      writes: window.__homeQA.writes.length, aiCalls: window.__homeQA.aiCalls.length,
      externalRequests: window.__homeQA.externalRequests,
    }));
    assert.deepEqual(usage, { writes: verifyBottom ? 1 : 0, aiCalls: 0, externalRequests: 0 });
    assert.deepEqual(errors, []);
    return { width, theme, week, weekDays, energy, forms, history, scroll: { before: scroll, after: restored.offset, ...(navLift ? { restoredMax: restored.max } : {}) }, mobile, usage };
  } finally {
    await context.close();
  }
}

try {
  const scenarios = [];
  const cases = navLift ? [[320, 'light'], [440, 'dark'], [1440, 'dark']] : [[375, 'light'], [1440, 'dark']];
  for (const [width, theme] of cases) {
    const scenario = await run(width, theme);
    scenarios.push(scenario);
    console.log(JSON.stringify(scenario));
  }
  await mkdir(output, { recursive: true });
  const engine = webkit ? 'webkit' : 'chromium';
  const filename = `funcional-${engine}${before ? '-antes' : ''}.json`;
  await writeFile(path.join(output, filename), JSON.stringify({ engine, version: browser.version(), scenarios }, null, 2) + '\n');
} finally {
  await browser.close();
}
