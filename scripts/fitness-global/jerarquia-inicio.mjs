import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { before, go, open, repo, start } from './browser.mjs';

const engine = process.argv.includes('--webkit') ? 'webkit' : 'chromium';
const modulePath = process.env.PLAYWRIGHT_MODULE || path.resolve(repo, '../qa-tools/node_modules/playwright/index.mjs');
const browser = engine === 'webkit' ? await (await import(pathToFileURL(modulePath))).webkit.launch() : await start();
const phase = before ? 'before' : 'after';
const output = path.join(repo, 'docs/evidence/jerarquia-inicio', phase);
const today = '2026-11-13';
const yesterday = '2026-11-12';
const areas = {
  calendar: '.home-date-nav', balance: '.energy-card', actions: '.daily-quick-actions',
  habits: '.daily-habits-block', records: '.daily-logs', activity: '.home-history',
};
const cases = [[375, 'light'], [390, 'dark'], [1440, 'light'], [1440, 'dark']].map(([width, theme]) => ({ width, theme }));
const button = (scope, name) => scope.getByRole('button', { name, exact: true });
const day = (page, date) => page.locator('.home-week-days [data-day="' + date + '"]');
const selected = page => page.locator('.home-date-context time').getAttribute('datetime');
const center = locator => locator.evaluate(el => el.scrollIntoView({ block: 'center', inline: 'nearest' }));
const settle = page => page.evaluate(async () => {
  await document.fonts.ready;
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
});
const isFocused = locator => locator.evaluate(el => el === document.activeElement);
const focus = locator => locator.evaluate(el => el.focus({ preventScroll: true }));

async function bounds(page) {
  return page.evaluate(areas => {
    const rect = el => el.getBoundingClientRect();
    const main = document.querySelector('.app-main');
    const layout = Object.fromEntries(Object.entries(areas).map(([name, selector]) => {
      const {x, y, width, height} = rect(document.querySelector(selector));
      return [name, { x, y, width, height }];
    }));
    const habits = document.querySelector('.daily-habits');
    const signature = [...habits.querySelectorAll('.habit-card, .habit-controls, .habit-controls button, .habit-value, .habit-edit')].map(el => {
      const css = getComputedStyle(el), box = rect(el), relative = rect(habits);
      return { type: el.className, label: el.getAttribute('aria-label'), text: el.textContent.trim(),
        x: box.x - relative.x, y: box.y - relative.y, width: box.width, height: box.height,
        padding: css.padding, gap: css.gap, border: css.border, radius: css.borderRadius,
        color: css.color, background: css.backgroundColor, shadow: css.boxShadow };
    });
    const journal = getComputedStyle(document.querySelector('.daily-journal'));
    const balance = document.querySelector('.energy-card');
    return { layout, signature, grid: journal.gridTemplateAreas,
      energy: [balance.dataset.energyState, ...[...balance.querySelectorAll('.energy-number, .fitness-channel')].map(el => el.textContent.replace(/\s+/g, ' ').trim())],
      zoom: getComputedStyle(document.documentElement).fontSize,
      overflow: Math.max(document.documentElement.scrollWidth - innerWidth, main.scrollWidth - main.clientWidth) };
  }, areas);
}

async function indicator(page, date) {
  const active = page.locator('.home-week-days [aria-pressed="true"]');
  assert.equal(await active.getAttribute('data-day'), date);
  const mark = await page.locator('.home-week-indicator').evaluate(el => {
    const box = el.getBoundingClientRect(), button = el.parentElement.querySelector('[aria-pressed="true"]').getBoundingClientRect();
    return { visible: !el.hidden, color: getComputedStyle(el).backgroundColor,
      offset: Math.max(...['x', 'y', 'width', 'height'].map(key => Math.abs(box[key] - button[key]))) };
  });
  assert.ok(mark.visible && mark.color === 'rgb(255, 154, 83)' && mark.offset <= 1, JSON.stringify(mark));
  return mark;
}

function validateLayout(result, width) {
  assert.ok(result.overflow <= 1, 'Desbordamiento horizontal: ' + result.overflow);
  const { calendar, balance, actions, habits, records, activity } = result.layout;
  assert.ok(calendar.y < balance.y && balance.y < actions.y);
  if (width < 768) {
    assert.ok(actions.y < Math.min(habits.y, records.y) && Math.max(habits.y, records.y) < activity.y);
    assert.ok(before ? records.y < habits.y : habits.y < records.y);
  } else {
    assert.equal(result.grid, '"entry records" "habits records"');
    assert.ok(actions.x === habits.x && habits.y > actions.y && habits.x + habits.width < records.x);
  }
}

function compareLayout(reference, current) {
  assert.deepEqual(current.energy, reference.energy, 'Los valores de balance difieren');
  assert.deepEqual(current.signature, reference.signature, 'Las tarjetas de hábitos cambiaron');
  assert.equal(current.grid, reference.grid);
}

async function dates(page, snap) {
  const nav = page.locator(areas.calendar);
  const strip = page.locator('.home-week-days');
  const todayControl = nav.locator('.home-date-today');
  const range = nav.locator('.home-date-mobile-week');
  const calendar = button(nav, 'Abrir calendario mensual');
  const initial = await strip.locator('button').evaluateAll(items => items.map(el => [el.dataset.day, el.disabled]));
  assert.deepEqual(initial.map(([date]) => date), ['09', '10', '11', '12', '13', '14', '15'].map(d => '2026-11-' + d));
  assert.deepEqual(initial.filter(([, disabled]) => disabled).map(([date]) => date), ['2026-11-14', '2026-11-15']);
  assert.equal(await nav.locator('.home-entry-date-label').count(), before ? 1 : 0);
  assert.equal(await todayControl.count(), before ? 1 : 0);
  assert.equal(await range.count(), before ? 1 : 0);
  if (before) assert.ok(await todayControl.isDisabled());

  const todayMark = await indicator(page, today);
  await focus(day(page, today));
  await page.keyboard.press('ArrowLeft');
  assert.ok(await isFocused(day(page, yesterday)));
  assert.equal(await selected(page), today);
  await page.keyboard.press('Enter');
  assert.equal(await selected(page), yesterday);
  const yesterdayMark = await indicator(page, yesterday);
  assert.ok(await todayControl.isEnabled());
  await snap('historico');
  await focus(todayControl);
  await page.keyboard.press('Enter');
  assert.equal(await selected(page), today);
  if (!before) {
    assert.equal(await todayControl.count(), 0);
    assert.ok(await isFocused(calendar));
    assert.ok(await calendar.evaluate(el => el.matches(':focus-visible')));
  }
  const todayFocus = await isFocused(calendar);

  const earlier = button(nav, 'Semana anterior');
  const later = button(nav, 'Semana siguiente');
  await earlier.click();
  assert.equal(await selected(page), '2026-11-06');
  assert.equal(await range.count(), before ? 1 : 0);
  await earlier.click();
  assert.equal(await selected(page), '2026-10-30');
  const crossMonth = await range.innerText();
  assert.match(crossMonth, /26 oct.*1 nov.*lun–dom/);
  await snap('cruce-de-mes');
  await later.click();
  assert.equal(await range.count(), before ? 1 : 0);

  await focus(calendar);
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Elegir fecha' });
  await dialog.waitFor();
  const active = dialog.locator('[data-calendar-day="2026-11-06"]');
  await page.waitForFunction(() => document.activeElement?.dataset.calendarDay === '2026-11-06');
  assert.ok(await isFocused(active));
  await page.keyboard.press('ArrowRight');
  assert.equal(await selected(page), '2026-11-06');
  await page.keyboard.press('Enter');
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(await selected(page), '2026-11-07');
  await todayControl.click();
  assert.equal(await selected(page), today);
  return { initial, todayMark, yesterdayMark, todayFocus, crossMonth, monthlyPick: '2026-11-07' };
}

async function tabAndRecords(page) {
  const addExercise = button(page, 'Agregar ejercicio');
  await center(addExercise);
  await focus(addExercise);
  const sequence = [];
  for (let i = 0; i < 9; i += 1) {
    await page.keyboard.press('Tab');
    const section = await page.evaluate(() => {
      const el = document.activeElement;
      if (el.closest('.daily-habits-block')) return 'Hábitos';
      if (el.closest('.daily-logs')) return 'Registros';
      return el.getAttribute('aria-label') ?? el.tagName;
    });
    sequence.push(section);
    if (sequence.includes('Hábitos') && sequence.includes('Registros')) break;
  }
  assert.equal(sequence[0], before ? 'Registros' : 'Hábitos', JSON.stringify(sequence));
  assert.ok(sequence.includes('Hábitos') && sequence.includes('Registros'), JSON.stringify(sequence));
  const entry = page.locator('.daily-record-open').first();
  await center(entry);
  const firstRecord = await entry.locator('.daily-record-title').textContent();
  await focus(entry);
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Detalle del registro' });
  await dialog.waitFor();
  assert.equal(await dialog.locator('.record-detail-main').textContent(), firstRecord);
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  assert.ok(await isFocused(entry));
  return { sequence, firstRecord, focusReturned: true };
}

async function habitEditing(page, snap) {
  const habits = page.locator(areas.habits);
  const amount = key => page.evaluate(key => window.__homeQA.store.activeProfile.records[window.__homeQA.today][key], key);
  const plus = button(habits, 'Sumar 250 ml de agua');
  await center(plus);
  await plus.click();
  await habits.getByRole('status').filter({ hasText: 'Guardado' }).waitFor();
  assert.equal(await amount('water'), 2000);
  const edit = button(habits, 'Editar total de pasos');
  await center(edit);
  await edit.click();
  const field = habits.getByRole('spinbutton', { name: 'Total de pasos' });
  assert.ok(await isFocused(field));
  assert.match(await habits.getByRole('status').innerText(), /Editando/);
  await field.fill('6800');
  await snap('editando');
  await field.press('Enter');
  await habits.getByRole('status').filter({ hasText: 'Guardado' }).waitFor();
  assert.equal(await amount('steps'), 6800);
  assert.equal(await amount('weight'), 72.8);
  return { water: 2000, steps: 6800, weight: 72.8 };
}

async function scrollAndBottom(page) {
  const toggle = page.locator('.home-history-toggle');
  if (await toggle.isVisible() && await toggle.getAttribute('aria-expanded') === 'false') {
    await center(toggle);
    await toggle.click();
  }
  await page.locator('[data-history-root]').waitFor();
  const main = page.locator('.app-main');
  const target = page.locator('.ah-energy > summary');
  await target.waitFor();
  await main.evaluate(el => { el.scrollTop = el.scrollHeight; });
  await settle(page);
  const last = await target.evaluate(el => {
    const r = el.getBoundingClientRect();
    const nav = document.querySelector('.bottom-nav-track');
    return { label: el.textContent.trim(), hit: el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)),
      gap: nav.getClientRects().length ? nav.getBoundingClientRect().top - r.bottom : null };
  });
  assert.ok(last.hit && (last.gap == null || last.gap > 0), JSON.stringify(last));
  const position = await main.evaluate(el => {
    el.scrollTop = Math.min(280, el.scrollHeight - el.clientHeight);
    return el.scrollTop;
  });
  await go(page, 'Datos');
  await go(page, 'Inicio');
  const restored = await main.evaluate(el => el.scrollTop);
  assert.ok(position > 0 && Math.abs(restored - position) <= 1, JSON.stringify({ position, restored }));
  assert.equal(await selected(page), today);
  return { last, position, restored };
}

async function sample({width, theme}, index, baseline) {
  const {context, page, errors} = await open(browser, width === 390 ? 375 : width, theme, theme);
  const evidencePair = (width === 375 && theme === 'light') || (width === 390 && theme === 'dark');
  const checkFlow = (width === 375 || width === 1440) && theme === 'light';
  const shot = suffix => page.screenshot({ path: path.join(output, width + '-' + theme + '-' + suffix + '.jpg'), quality: 88, scale: 'css' });
  const fullShot = suffix => engine === 'chromium' ? shot(suffix) : null;
  const journeyShot = suffix => engine === 'chromium' && evidencePair ? shot(suffix) : null;
  try {
    if (width === 390) await page.setViewportSize({ width, height: 844 });
    await settle(page);
    assert.equal(await page.evaluate(() => window.__homeQA.phase), 'liquid-glass-home-2b-after');
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains('dark')), theme === 'dark');
    assert.equal(await selected(page), today);
    const layout = await bounds(page);
    validateLayout(layout, width);
    if (baseline) compareLayout(baseline[index].layout, layout);
    await fullShot('inicio');
    const mark = await indicator(page, today);
    if (evidencePair) {
      await page.locator(areas.actions).evaluate(el => {
        document.querySelector('.app-main').scrollTop += el.getBoundingClientRect().top - 18;
      });
      await settle(page);
      await journeyShot('jerarquia');
    }

    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    await settle(page);
    const zoom = await bounds(page);
    assert.equal(zoom.zoom, '32px');
    validateLayout(zoom, width);
    if (baseline) compareLayout(baseline[index].zoom, zoom);
    const zoomIndicator = await indicator(page, today);
    if (evidencePair) {
      await page.locator(areas.habits).evaluate(el => {
        document.querySelector('.app-main').scrollTop += el.getBoundingClientRect().top - 18;
      });
      await settle(page);
      await journeyShot('texto-200');
    }
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '';
      document.querySelector('.app-main').scrollTop = 0;
    });
    await settle(page);

    let flow = null;
    if (checkFlow) {
      const dateFlow = await dates(page, journeyShot);
      const navigation = await tabAndRecords(page);
      const habits = await habitEditing(page, journeyShot);
      const scroll = await scrollAndBottom(page);
      flow = { dateFlow, navigation, habits, scroll };
    }
    const usage = await page.evaluate(() => {
      const q = window.__homeQA;
      return { writes: q.writes.map(({date, status}) => [date, status]), ai: q.aiCalls.length, external: q.externalRequests };
    });
    assert.deepEqual(usage, { writes: checkFlow ? [[today, 'confirmed'], [today, 'confirmed']] : [], ai: 0, external: 0 });
    assert.deepEqual(errors, []);
    return { width, theme, layout, zoom, mark, zoomIndicator, flow, usage };
  } finally {
    await context.close();
  }
}

try {
  await mkdir(output, { recursive: true });
  const reference = before ? null : JSON.parse(await readFile(path.join(output, '..', 'before', engine + '.json'), 'utf8')).cases;
  const results = [];
  for (const [index, config] of cases.entries()) {
    results.push(await sample(config, index, reference));
    console.log(engine, phase, config.width, config.theme);
  }
  await writeFile(path.join(output, engine + '.json'), JSON.stringify({ engine, version: browser.version(), cases: results }, null, 2) + '\n');
} finally {
  await browser.close();
}
