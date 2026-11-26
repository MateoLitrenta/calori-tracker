import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { before, go, open, origin, repo, start } from './browser.mjs';

const webkit = process.argv.includes('--webkit');
const playwright = process.env.PLAYWRIGHT_MODULE || path.resolve(repo, '../qa-tools/node_modules/playwright/index.mjs');
const browser = webkit ? await (await import(pathToFileURL(playwright))).webkit.launch() : await start();
const output = path.join(repo, 'docs/evidence/liquid-glass-home');
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

async function closeWithoutWriting(page, name, input, date, width) {
  const trigger = button(page, name);
  await trigger.scrollIntoViewIfNeeded();
  const scroll = await main(page).evaluate(node => node.scrollTop);
  await trigger.press('Enter');
  const dialog = page.getByRole('dialog', { name, exact: true });
  await dialog.waitFor();
  assert.equal(await dialog.getAttribute('aria-modal'), 'true');
  assert.ok(await dialog.evaluate(node => node.classList.contains(innerWidth < 768 ? 'entry-bottom-sheet' : 'entry-desktop-modal')));
  assert.equal(await dialog.locator('.entry-date-context time').getAttribute('datetime'), date);
  assert.ok(await main(page).evaluate(node => node.inert));
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
  assert.ok(Math.abs(scroll - await main(page).evaluate(node => node.scrollTop)) <= 1, 'Canceling preserves the reading position');
  assert.equal(await selectedDate(page), date);
  return { name, date, layout: width < 768 ? 'sheet' : 'dialog', preservedDraftUntilConfirmed: true, focusRestored: true, scrollPreserved: true };
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
    assert.equal(await page.evaluate(() => window.__homeQA.phase), before ? 'liquid-glass-home-before' : 'liquid-glass-home-after');
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
    await go(page, 'Inicio');
    await settle(page);
    const restored = await main(page).evaluate(node => node.scrollTop);
    assert.ok(Math.abs(scroll - restored) <= 1, JSON.stringify({ scroll, restored }));
    assert.equal(await selectedDate(page), '2026-11-09');

    const usage = await page.evaluate(() => ({
      writes: window.__homeQA.writes.length, aiCalls: window.__homeQA.aiCalls.length,
      externalRequests: window.__homeQA.externalRequests,
    }));
    assert.deepEqual(usage, { writes: 0, aiCalls: 0, externalRequests: 0 });
    assert.deepEqual(errors, []);
    return { width, theme, week, weekDays, energy, forms, history, scroll: { before: scroll, after: restored }, usage };
  } finally {
    await context.close();
  }
}

try {
  const scenarios = [];
  for (const [width, theme] of [[375, 'light'], [1440, 'dark']]) {
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
