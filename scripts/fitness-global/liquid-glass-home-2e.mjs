import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { before, open, repo, start } from './browser.mjs';
import { contrast } from './liquid-glass-home-2c-contrast.mjs';
import { fingerprint } from './liquid-glass-home-2d-flows.mjs';

const output = path.join(repo, 'docs/evidence/liquid-glass-home-2e', before ? 'before' : 'after');
const engine = process.argv.includes('--webkit') ? 'webkit' : 'chrome';
const section = process.argv.find(value => value.startsWith('--section='))?.split('=')[1] ?? 'all';
const iteration = process.argv.find(value => value.startsWith('--iteration='))?.split('=')[1];
const resultsPath = process.argv.find(value => value.startsWith('--results='))?.slice('--results='.length);
const referencePath = process.argv.find(value => value.startsWith('--reference='))?.slice('--reference='.length);
assert.ok(['all', 'capturas', 'matriz'].includes(section));
assert.ok(!iteration || ['production', 'first', 'second'].includes(iteration));
if (iteration) assert.equal(before, iteration !== 'second');
const widths = [[320, 568], [375, 812], [390, 844], [430, 932], [768, 1024], [1024, 768], [1440, 900]];
const views = ['Semana', 'Mes', 'Año'];
const root = '[data-history-root]';
const view = (page, name) => page.locator('.ah-view-switch').getByRole('button', { name, exact: true });
const day = (page, date) => page.locator(`.ah-day[data-date="${date}"]`);
const heading = '.ah-navigation h3';
const detail = '.history-day-detail';
const home = '.home-date-nav, .energy-card, .daily-quick-actions, .daily-habits-block, .daily-logs, .bottom-nav-track, .app-sidebar'
  + (iteration ? '' : ', .home-history-toggle');
const today = '2026-11-13';

function verifyBrowserErrors(errors) {
  const resizeNotice = 'ResizeObserver loop completed with undelivered notifications.';
  const notices = engine === 'webkit' ? errors.filter(error => error === resizeNotice) : [];
  assert.deepEqual(notices.length ? errors.filter(error => error !== resizeNotice) : errors, []);
  errors.length = 0;
  return notices;
}

async function settle(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

async function ready(page, width, height) {
  await page.setViewportSize({ width, height });
  await page.locator('.home-variants').waitFor({ timeout: 90_000 });
  assert.equal(await page.evaluate(() => window.__homeQA.phase), iteration
    ? 'liquid-glass-home-2e-v2-' + iteration
    : 'liquid-glass-home-2e-' + (before ? 'before' : 'after'));
  const toggle = page.locator('.home-history-toggle');
  if (await toggle.isVisible() && await toggle.getAttribute('aria-expanded') === 'false') await toggle.click();
  await page.locator(root).waitFor();
  await settle(page);
}

async function screenshot(page, name, section = root) {
  await page.locator(section).evaluate(el => el.scrollIntoView({ block: 'start', behavior: 'instant' }));
  await settle(page);
  await page.screenshot({ path: path.join(output, name + '.jpg'), quality: 84, scale: 'css' });
}

async function launch() {
  if (engine === 'chrome') return start();
  const modulePath = process.env.PLAYWRIGHT_MODULE || path.resolve(repo, '../qa-tools/node_modules/playwright/index.mjs');
  const { webkit } = await import(pathToFileURL(modulePath));
  return webkit.launch({ headless: true });
}

async function compare(browser) {
  await mkdir(output, { recursive: true });
  for (const [width, height] of widths.filter(([w]) => [375, 1440].includes(w))) {
    for (const theme of ['light', 'dark']) {
      const { page, context, errors } = await open(browser, 375, theme, theme);
      try {
        await ready(page, width, height);
        for (const name of views) {
          await view(page, name).click();
          await screenshot(page, [width, theme, name.toLowerCase()].join('-'));
        }
        if (width === 375 && theme === 'dark') {
          await view(page, 'Mes').click();
          await day(page, '2026-11-11').click();
          await screenshot(page, '375-dark-detalle-parcial', detail);
        }
        verifyBrowserErrors(errors);
        console.log(width, theme, '· Semana, Mes y Año');
      } finally {
        await context.close();
      }
    }
  }
}

async function select(page, date) {
  await day(page, date).click();
  assert.equal(await day(page, date).getAttribute('aria-pressed'), 'true');
  assert.match(await page.locator(detail + ' h3').first().innerText(), new RegExp('\\b' + Number(date.slice(-2)) + '\\b'));
}

async function measure(page) {
  return page.locator(iteration ? '.home-history' : root).evaluate(section => {
    const leftRight = node => {
      const bounds = node.getBoundingClientRect();
      return [bounds.left, bounds.right];
    };
    const local = section.querySelector('.ah-calendar-surface');
    const shell = document.querySelector('.app-main');
    const visible = node => node.getClientRects().length > 0 && getComputedStyle(node).visibility === 'visible';
    const controls = [...section.querySelectorAll('button:not(:disabled), summary')].filter(visible);
    const narrow = controls.flatMap(node => {
      const { width, height } = node.getBoundingClientRect();
      return Math.min(width, height) < 43.9 ? [{ kind: node.classList.contains('ah-day') ? 'día' : 'control',
        label: node.getAttribute('aria-label') || node.textContent.trim(), size: [+(width.toFixed(1)), +(height.toFixed(1))] }] : [];
    });
    const clipped = [];
    for (const owner of section.querySelectorAll('button, summary, .ah-weekdays span, .ah-entries li, .ah-day-energy dd, .ah-habits dd, .ah-month-coverage')) {
      if (!visible(owner)) continue;
      const [left, right] = leftRight(owner);
      const walker = document.createTreeWalker(owner, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode;
        if (!node.textContent.trim() || !visible(node.parentElement) || node.parentElement.closest('.sr-only')) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        if ([...range.getClientRects()].some(rect => rect.width > 0 && (rect.left < left - 1 || rect.right > right + 1))) {
          clipped.push(node.textContent.trim());
        }
      }
    }
    return {
      overflow: Math.max(document.documentElement.scrollWidth - innerWidth, shell.scrollWidth - shell.clientWidth),
      localScroll: local ? Math.max(0, local.scrollWidth - local.clientWidth) : 0,
      sectionHeight: Math.round(section.getBoundingClientRect().height),
      narrow,
      clipped,
    };
  });
}

async function scaleText(page, enable) {
  await page.locator(iteration ? '.home-history' : root).evaluate((section, active) => {
    if (window.__activityTextStyles) {
      for (const [node, value, priority] of window.__activityTextStyles) node.style.setProperty('font-size', value, priority);
    }
    const nodes = [...section.querySelectorAll('*')].filter(node => node instanceof HTMLElement);
    window.__activityTextStyles = active ? nodes.map(node => [node, node.style.fontSize, node.style.getPropertyPriority('font-size')]) : [];
    if (active) {
      const sizes = nodes.map(node => parseFloat(getComputedStyle(node).fontSize));
      nodes.forEach((node, index) => node.style.setProperty('font-size', sizes[index] * 2 + 'px', 'important'));
    }
  }, enable);
  await settle(page);
}

async function clearance(page) {
  return page.locator(root).evaluate(section => {
    const main = section.closest('.app-main');
    const nav = document.querySelector('.app-bottom-nav');
    const limit = nav && nav.getClientRects().length ? nav.getBoundingClientRect().top : innerHeight;
    const reach = selector => {
      const control = section.querySelector(selector);
      main.scrollTop = main.scrollHeight;
      // A retained period height can leave a control above the viewport at the
      // scroll end. Measure the nearest position where it can be used.
      if (control.getBoundingClientRect().top < main.getBoundingClientRect().top) {
        main.scrollTop += control.getBoundingClientRect().bottom - limit + 12;
      }
      const target = control.getBoundingClientRect();
      const hit = document.elementFromPoint(target.x + target.width / 2, target.y + target.height / 2);
      return { gap: Math.round(limit - target.bottom), tappable: control.contains(hit) };
    };
    const edit = reach('[data-history-open]');
    const energy = reach('.ah-energy > summary');
    return { gap: Math.min(edit.gap, energy.gap), tappable: edit.tappable && energy.tappable, edit, energy };
  });
}

async function seed(page, scenario) {
  await page.evaluate(scenario => {
    const qa = window.__homeQA;
    const current = qa.store.activeProfile.records;
    if (scenario === 'empty') {
      qa.setProfile({ records: {} });
      return;
    }
    if (scenario === 'sparse') {
      qa.setProfile({ records: { [qa.today]: { ...current[qa.today], meals: [], workouts: [], water: 250, steps: 800 } } });
      return;
    }
    const example = current['2026-11-13'];
    const row = (dateStr, meals, values = {}) => ({ ...example, dateStr, date: dateStr + 'T12:00:00',
      meals, workouts: [], steps: 0, water: 0, weight: undefined, ...values });
    const meal = (id, name, calories) => ({ id, name, type: 'Almuerzo', time: '13:00', calories });
    if (scenario === 'leap') {
      qa.setProfile({ records: {
        '2024-02-29': row('2024-02-29', [meal('leap', 'Última comida de febrero', 1750)], { date: '2024-03-01T02:30:00Z' }),
        '2024-03-01': row('2024-03-01', [meal('march', 'Primera comida de marzo', 1750)]),
        '2023-12-31': row('2023-12-31', [meal('december', 'Última comida del año', 1750)]),
      } });
      return;
    }
    const earlyMonth = Array.from({ length: 8 }, (_, index) => {
      const date = '2026-11-' + String(index + 1).padStart(2, '0');
      return [date, row(date, [meal('dense-' + index, 'Registro de prueba ' + index, 650 + index * 250)])];
    });
    qa.setProfile({ records: {
      ...current, ...Object.fromEntries(earlyMonth),
      '2026-11-14': row('2026-11-14', [meal('future', 'Registro futuro sintético', 333333)]),
    } });
  }, scenario);
  await settle(page);
}

async function states(page) {
  await view(page, 'Semana').click();
  const cells = page.locator('.ah-calendar-surface--week .ah-day');
  assert.deepEqual(await cells.evaluateAll(nodes => nodes.map(node => node.dataset.date)),
    ['09', '10', '11', '12', '13', '14', '15'].map(n => '2026-11-' + n));
  for (const [date, state, balance, evidence] of [
    ['09', 'with-meals', 'deficit-high', /d[ée]ficit/i],
    ['10', 'with-meals', 'neutral', /\b0 kcal/],
    ['11', 'partial', 'empty', /Sin comidas/i],
    ['12', 'with-meals', 'surplus-high', /super[áa]vit/i],
    ['13', 'with-meals', 'deficit-high', /Hoy/],
  ]) {
    const item = day(page, '2026-11-' + date);
    assert.equal(await item.getAttribute('data-completeness'), state);
    assert.equal(await item.getAttribute('data-balance'), balance);
    assert.match(await item.getAttribute('aria-label'), evidence);
    await select(page, '2026-11-' + date);
    if (date === '10') assert.match(await page.locator(detail + ' .ah-day-energy b').innerText(), /^0\s+kcal/);
    if (date === '11') assert.match(await page.locator(detail).innerText(), /Sin comidas registradas/i);
  }
  assert.equal(await day(page, today).getAttribute('aria-current'), 'date');
  assert.equal(await day(page, '2026-11-14').isDisabled(), true);
  assert.match(await day(page, '2026-11-14').getAttribute('aria-label'), /Fecha futura.*1 comida/);
  if (iteration === 'second') {
    const recordedFuture = day(page, '2026-11-14');
    const emptyFuture = day(page, '2026-11-15');
    assert.equal((await recordedFuture.locator('.ah-day-state--future').textContent()).trim(), 'Con datos');
    assert.equal((await emptyFuture.locator('.ah-day-state--future').textContent()).trim(), '');
    assert.equal(await recordedFuture.locator('.ah-day-state--future svg').count(), 0);
    assert.equal(await emptyFuture.locator('.ah-day-state--future svg').count(), 0);
    assert.match(await emptyFuture.getAttribute('aria-label'), /Fecha futura/);
  }
  assert.doesNotMatch(await page.locator('.ah-period-summary').innerText(), /333[. ]?333/);
  assert.equal(await page.locator('.home-date-context time').getAttribute('datetime'), today);
  const target = day(page, today);
  await page.locator('.ah-today').focus();
  await page.keyboard.press('Tab');
  const entered = await target.evaluate(node => {
    return { held: node === document.activeElement, visible: node.matches(':focus-visible'),
      active: document.activeElement?.getAttribute('aria-label'), tag: document.activeElement?.tagName };
  });
  assert.ok(entered.held && entered.visible, 'Entrada al día mediante Tab: ' + JSON.stringify(entered));
  await page.keyboard.press('ArrowLeft');
  const selected = day(page, '2026-11-12');
  assert.equal(await selected.getAttribute('aria-pressed'), 'true');
  const keyboardFocus = await selected.evaluate(node => {
    const style = getComputedStyle(node);
    return { held: node === document.activeElement, visible: node.matches(':focus-visible'), outline: style.outline,
      outlineWidth: style.outlineWidth, shadow: style.boxShadow, active: document.activeElement?.getAttribute('aria-label') };
  });
  assert.ok(keyboardFocus.held && keyboardFocus.visible && (parseFloat(keyboardFocus.outlineWidth) > 0 || keyboardFocus.shadow !== 'none'),
    JSON.stringify(keyboardFocus));
}

async function byKeyboard(page, name) {
  const control = view(page, name);
  await control.focus();
  await page.keyboard.press('Enter');
  assert.equal(await control.getAttribute('aria-pressed'), 'true');
  assert.ok(await control.evaluate(node => node === document.activeElement));
}

async function measureMatrix(browser, previous) {
  const rows = [];
  for (const theme of ['light', 'dark']) {
    const { page, context, errors } = await open(browser, 375, theme, theme);
    try {
      for (const [width, height] of widths) {
        const result = { width, theme, modes: [], contrast: [] };
        await ready(page, width, height);
        await scaleText(page, false);
        await seed(page, 'rich');
        await byKeyboard(page, 'Mes');
        await page.locator('.ah-today').evaluate(node => node.click());
        await page.locator('.app-main').evaluate(node => { node.scrollTop = 0; });
        await settle(page);
        result.home = await fingerprint(page, home);
        const prior = previous?.rows.find(row => row.width === width && row.theme === theme);
        if (prior) {
          // The disclosure title is the only approved change outside the history root.
          const expected = iteration ? prior.home.filter(item => item[0] !== 'BUTTON' || !item.at(-1).startsWith('Historial y tendencias')) : prior.home;
          assert.deepEqual(result.home, expected, 'Cambió Inicio o la navegación a ' + width + ' px en ' + theme);
        }
        await states(page);
        for (const zoom of [100, 200]) {
          for (const name of views) {
            await scaleText(page, false);
            await byKeyboard(page, name);
            await scaleText(page, zoom === 200);
            if (name === 'Año') assert.equal(await page.locator('.ah-year .ah-month').count(), 12);
            const geometry = await measure(page);
            const reserved = await clearance(page);
            result.modes.push({ name, zoom, ...geometry, ...reserved });
            if (zoom === 100 && [375, 1440].includes(width)) {
              await page.locator(root).evaluate(node => node.scrollIntoView({ block: 'start', behavior: 'instant' }));
              const targets = '.ah-header h2, .ah-view-switch button, .ah-navigation h3, .ah-nav-actions button, .ah-day-number, .ah-day-balance, .ah-month-name, .ah-month-caption, .ah-month strong, .ah-month .ah-balance-label, .ah-month b, .ah-day-energy b, .ah-day-channels dd'
                + (iteration ? ', .ah-month-coverage, .ah-day-status, .ah-open' : '');
              result.contrast.push(await contrast(page, page.locator(root), width + ' ' + theme + ' ' + name, true, { targets, scope: root }));
            }
          }
        }
        result.notices = verifyBrowserErrors(errors);
        assert.deepEqual(await page.evaluate(() => {
          const qa = window.__homeQA;
          return [qa.writes.length, qa.aiCalls.length, qa.externalRequests];
        }), [0, 0, 0]);
        rows.push(result);
        const anomalies = result.modes.filter(brokenLayout);
        console.log('Matriz', width, theme, '· 6 configuraciones', anomalies.length ? JSON.stringify(anomalies) : '');
      }
    } finally {
      await context.close();
    }
  }
  return rows;
}

function brokenLayout(mode) {
  return mode.overflow > 1 || mode.clipped.length > 0 || mode.narrow.length > 0 || !mode.tappable || mode.gap < 0;
}

async function boundaries(browser) {
  const { page, context, errors } = await open(browser, 375, 'dark', 'dark');
  try {
    await page.goto(new URL('/qa?controls=0&theme=dark&clock=leap', page.url()).href, { waitUntil: 'commit' });
    await ready(page, 390, 844);
    await seed(page, 'leap');
    assert.deepEqual(await page.evaluate(() => [window.__homeQA.today, new Date().getDate(), new Date().getUTCDate()]), ['2024-03-01', 1, 2]);
    await view(page, 'Mes').click();
    assert.equal(await page.locator('.ah-week').count(), 5);
    await page.getByRole('button', { name: 'Mes anterior', exact: true }).click();
    assert.match(await page.locator(heading).innerText(), /febrero de 2024/i);
    assert.equal(await page.locator('.ah-week').count(), 5);
    await select(page, '2024-02-29');
    assert.match(await page.locator(detail).innerText(), /Última comida de febrero/);
    await day(page, '2024-02-29').focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await day(page, '2024-03-01').getAttribute('aria-pressed'), 'true');
    await view(page, 'Semana').click();
    assert.match(await page.locator(heading).innerText(), /26 feb.*3 mar/i);
    await view(page, 'Año').click();
    assert.equal(await page.locator('.ah-month[aria-current=date]').getAttribute('data-month'), '2024-03');
    assert.equal(await page.locator('[data-month="2024-04"]').isDisabled(), true);
    await page.getByRole('button', { name: 'Año anterior', exact: true }).click();
    assert.equal(await page.locator(heading).innerText(), '2023');
    await page.locator('[data-month="2023-12"]').click();
    assert.match(await page.locator(heading).innerText(), /diciembre de 2023/i);
    await select(page, '2023-12-31');
    assert.match(await page.locator(detail).innerText(), /Última comida del año/);
    await view(page, 'Semana').click();
    await page.locator(root).getByRole('button', { name: 'Semana siguiente', exact: true }).click();
    assert.match(await page.locator(heading).innerText(), /ene.*2024/);
    await view(page, 'Año').click();
    const main = page.locator('.app-main');
    await main.evaluate(el => { el.scrollTop = el.scrollHeight; });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.setViewportSize({ width: 375, height: 812 });
    await settle(page);
    assert.equal(await page.locator('.ah-month').count(), 12);
    assert.equal(await page.locator('.ah-month[data-selected=true]').getAttribute('data-month'), '2024-01');
    await page.locator('[data-month="2024-01"]').click();
    assert.equal(await page.locator('.ah-week').count(), 5);
    await page.getByRole('button', { name: 'Mes anterior', exact: true }).click();
    await page.getByRole('button', { name: 'Mes anterior', exact: true }).click();
    assert.equal(await page.locator('.ah-week').count(), 5);
    await page.getByRole('button', { name: 'Mes anterior', exact: true }).click();
    assert.equal(await page.locator('.ah-week').count(), 6); // octubre de 2023
    assert.equal(await page.locator('.home-date-context time').getAttribute('datetime'), '2024-03-01');
    return { local: '2024-03-01', utc: '2024-03-02', leap: '2024-02-29', yearSwitch: '2023-12 / 2024-01',
      notices: verifyBrowserErrors(errors) };
  } finally {
    await context.close();
  }
}

async function clippedSunday(page) {
  await page.goto(new URL('/qa?controls=0&theme=light&clock=sunday', page.url()).href, { waitUntil: 'commit' });
  await ready(page, 320, 568);
  await view(page, 'Semana').click();
  await select(page, '2026-11-09');
  const surface = page.locator('.ah-calendar-surface--week');
  const todayButton = page.locator('.ah-today');
  await todayButton.scrollIntoViewIfNeeded();
  await surface.evaluate(node => { node.scrollLeft = 0; });
  const scrollTop = () => page.locator('.app-main').evaluate(node => node.scrollTop);
  const first = await scrollTop();
  await todayButton.click();
  await settle(page);
  const sunday = day(page, '2026-11-15');
  assert.equal(await sunday.getAttribute('aria-pressed'), 'true');
  const geometry = () => surface.evaluate(node => {
      const child = node.querySelector('[aria-current=date]');
      return { localScroll: node.scrollLeft, available: node.scrollWidth - node.clientWidth,
        clipped: +(child.getBoundingClientRect().right - node.getBoundingClientRect().right).toFixed(1) };
  });
  const clicked = { ...(await geometry()), verticalDelta: (await scrollTop()) - first };
  await todayButton.focus();
  await surface.evaluate(node => { node.scrollLeft = 0; });
  const second = await scrollTop();
  await page.keyboard.press('Enter');
  await settle(page);
  const repeated = { ...(await geometry()), verticalDelta: (await scrollTop()) - second,
    focusHeld: await todayButton.evaluate(node => node === document.activeElement) };
  if (!before) {
    assert.ok(clicked.clipped <= 1 && repeated.clipped <= 1, 'Hoy debe revelar la fecha incluso si ya está seleccionada');
    assert.ok(Math.abs(clicked.verticalDelta) <= 1 && Math.abs(repeated.verticalDelta) <= 1);
    assert.equal(repeated.focusHeld, true);
  }
  return { clicked, repeated };
}

async function navigation(browser) {
  const { page, context, errors } = await open(browser, 375, 'light', 'light');
  try {
    await ready(page, 375, 812);
    if (iteration === 'second') {
      const disclosure = page.getByRole('button', { name: 'Tu actividad', exact: true });
      const content = page.locator('.home-history-content');
      assert.equal(await disclosure.getAttribute('aria-controls'), await content.getAttribute('id'));
      assert.equal(await disclosure.getAttribute('aria-expanded'), 'true');
      await disclosure.focus();
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.press('Tab');
      assert.ok(await disclosure.evaluate(node => node === document.activeElement && node.matches(':focus-visible')));
      await page.keyboard.press('Space');
      assert.equal(await disclosure.getAttribute('aria-expanded'), 'false');
      assert.equal(await content.isVisible(), false);
      assert.ok(await disclosure.evaluate(node => node === document.activeElement && node.matches(':focus-visible')));
      await page.keyboard.press('Enter');
      assert.equal(await disclosure.getAttribute('aria-expanded'), 'true');
      assert.equal(await content.isVisible(), true);
      assert.equal(await page.getByRole('heading', { name: 'Tu actividad', exact: true }).count(), 1);
    }
    await seed(page, 'empty');
    assert.match(await page.locator(detail).innerText(), /Sin registros/);
    assert.equal(await page.locator(detail + ' .ah-day-energy b').count(), 0);
    await view(page, 'Año').click();
    assert.equal(await page.locator('.ah-month:visible').count(), 12);
    assert.match(await page.locator('[data-month="2026-10"]').innerText(), /Sin registros/);
    assert.match(await page.locator('[data-month="2026-12"]').getAttribute('aria-label'), /Próximamente|Futuro/i);
    await seed(page, 'sparse');
    await view(page, 'Mes').click();
    assert.match(await page.locator(detail).innerText(), /Sin comidas registradas/i);
    await seed(page, 'rich');
    await select(page, '2026-11-09');
    await page.locator('.ah-detail-jump').click();
    assert.ok(await page.locator(detail).evaluate(node => node === document.activeElement));
    const action = page.locator('[data-history-open]');
    await action.click();
    assert.equal(await page.locator('.home-date-context time').getAttribute('datetime'), '2026-11-09');
    await page.getByRole('button', { name: /Volver a Tu actividad/ }).click();
    assert.equal(await day(page, '2026-11-09').getAttribute('aria-pressed'), 'true');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await view(page, 'Semana').evaluate(button => button.click());
    await page.waitForFunction(() => document.querySelector('[data-history-motion="scale"]') !== null);
    await view(page, 'Año').evaluate(button => button.click());
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await settle(page);
    assert.equal(await page.locator('[data-history-motion]').count(), 0);
    await view(page, 'Mes').evaluate(button => button.click());
    await settle(page);
    assert.equal(await page.locator('[data-history-motion]').count(), 0);
    const main = page.locator('.app-main');
    const position = () => main.evaluate(node => node.scrollTop);
    await main.evaluate(node => { node.scrollTop = node.scrollHeight; });
    const initial = await position();
    await view(page, 'Semana').evaluate(button => button.click());
    await settle(page);
    const scrollDelta = Math.abs(initial - await position());
    assert.ok(scrollDelta <= 1, 'Cambió la posición de lectura durante el cambio de vista');
    const sunday = await clippedSunday(page);
    return { empty: true, sparse: true, rich: true, focus: true, motion: true, scrollDelta, sunday,
      notices: verifyBrowserErrors(errors) };
  } finally {
    await context.close();
  }
}

const browser = await launch();
try {
  if (engine === 'chrome' && section !== 'matriz') await compare(browser);
  if (section !== 'capturas') {
    const previous = referencePath ? JSON.parse(await readFile(referencePath, 'utf8')) : null;
    const results = { engine, version: browser.version() };
    results.rows = await measureMatrix(browser, previous);
    results.boundaries = await boundaries(browser);
    console.log('Calendario', JSON.stringify(results.boundaries));
    results.navigation = await navigation(browser);
    console.log('Navegación', JSON.stringify(results.navigation));
    if (resultsPath) await writeFile(resultsPath, JSON.stringify(results, null, 2) + '\n');
    if (!before) {
      for (const { width, theme, modes, contrast: samples } of results.rows) {
        assert.deepEqual(modes.filter(brokenLayout), [], width + ' ' + theme + ' · medidas de diseño');
        assert.deepEqual(samples.flatMap(sample => sample.violations), [], width + ' ' + theme + ' · contraste');
      }
    }
    console.log(engine, results.version, results.rows.length, 'pares de ancho y tema,', results.rows.length * 6, 'configuraciones');
  }
} finally {
  await browser.close();
}
