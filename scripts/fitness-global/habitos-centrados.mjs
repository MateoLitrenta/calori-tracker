import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { before, open, repo, start } from './browser.mjs';

const engine = process.argv.includes('--webkit') ? 'webkit' : 'chromium';
const modulePath = process.env.PLAYWRIGHT_MODULE || path.resolve(repo, '../qa-tools/node_modules/playwright/index.mjs');
const browser = engine === 'webkit' ? await (await import(pathToFileURL(modulePath))).webkit.launch() : await start();
const phase = before ? 'before' : 'after';
const output = path.join(repo, 'docs/evidence/habitos-centrados', phase);
const widths = [[320, 568, 'light'], [375, 812, 'light'], [390, 844, 'dark'], [1440, 900, 'light'], [1440, 900, 'dark']];
const habits = '.daily-habits-block';
const button = (scope, name) => scope.getByRole('button', { name, exact: true });
const settle = page => page.evaluate(async () => {
  await document.fonts.ready;
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
});

async function fixture(page, mode, zoom) {
  await page.evaluate(({ mode, zoom }) => {
    const qa = window.__homeQA;
    const active = qa.profiles[qa.account];
    qa.originalHabits ??= structuredClone(active.records[qa.today]);
    const row = structuredClone(qa.originalHabits);
    if (mode === 'large') Object.assign(row, { water: 1234567, steps: 12345678, weight: 112.4 });
    if (mode === 'no-weight') delete row.weight;
    active.records[qa.today] = row;
    qa.store = qa.makeStore();
    qa.notify();
    document.documentElement.style.fontSize = zoom === 200 ? '200%' : '';
  }, { mode, zoom });
  await settle(page);
}

async function measure(page) {
  return page.evaluate(habits => {
    const block = document.querySelector(habits);
    const rect = el => el.getBoundingClientRect();
    const center = r => r.left + r.width / 2;
    const axis = (container, elements) => {
      const boxes = elements.map(rect);
      return Math.abs(center(rect(container)) - (Math.min(...boxes.map(box => box.left)) + Math.max(...boxes.map(box => box.right))) / 2);
    };
    const textFits = el => {
      const range = document.createRange();
      range.selectNodeContents(el);
      const boundary = rect(el.closest('button') || el.closest('.habit-card'));
      return [...range.getClientRects()].every(r => r.left >= boundary.left - 1 && r.right <= boundary.right + 1);
    };
    const card = el => {
      const css = getComputedStyle(el);
      const header = el.querySelector('.habit-header'), metric = el.querySelector('.habit-metric');
      const reading = el.querySelector('.habit-reading'), controls = el.lastElementChild;
      const parts = [header, metric, controls];
      const column = css.flexDirection === 'column';
      const delta = column ? [...parts.map(part => axis(el, [part]))] : [axis(el, [reading, controls]), axis(reading, [header, metric])];
      const targets = [...el.querySelectorAll('button, input')].map(target => {
        const r = rect(target), style = getComputedStyle(target);
        return { label: target.getAttribute('aria-label') || target.textContent.trim(), width: r.width, height: r.height,
          padding: style.padding, font: style.font, color: style.color, border: style.border, radius: style.borderRadius };
      });
      const fits = [...el.querySelectorAll('.habit-label, .habit-metric > span, .habit-value, .habit-controls button, .habit-edit')].every(textFits);
      return { label: header.textContent.trim(), direction: css.flexDirection, delta,
        rows: parts.map(part => rect(part).top - rect(el).top), fits,
        surface: [css.padding, css.color, css.backgroundColor, css.borderRadius, css.boxShadow],
        targets: targets.map(({width, height}) => ({width, height})),
        controls: targets.map(({label, padding, font, color, border, radius}) => ({label, padding, font, color, border, radius})) };
    };
    const heading = block.querySelector('h4');
    const outside = ['.home-date-nav', '.energy-card', '.daily-quick-actions', '.daily-records', '.bottom-nav-track']
      .map(selector => document.querySelector(selector)).map(el => {
        const r = rect(el);
        return [r.width, r.height, el.textContent.replace(/\s+/g, ' ').trim()];
      });
    const main = document.querySelector('.app-main');
    return { columns: getComputedStyle(block.querySelector('.daily-habits')).gridTemplateColumns.split(' ').length,
      title: [heading.textContent.trim(), rect(heading).left, rect(heading).width],
      cards: [...block.querySelectorAll('.habit-card')].map(card), outside,
      overflow: Math.max(document.documentElement.scrollWidth - innerWidth, main.scrollWidth - main.clientWidth) };
  }, habits);
}

function validate(view, reference) {
  assert.ok(view.overflow <= 1, 'Desbordamiento horizontal: ' + view.overflow);
  assert.ok(view.cards.every(card => card.fits && card.targets.every(({width, height}) => width >= 43.9 && height >= 43.9)),
    JSON.stringify(view.cards));
  if (!reference) return;
  assert.deepEqual(view.title, reference.title);
  assert.deepEqual(view.outside, reference.outside);
  assert.equal(view.columns, reference.columns);
  assert.deepEqual(view.cards.map(({surface, controls}) => ({surface, controls})),
    reference.cards.map(({surface, controls}) => ({surface, controls})));
  assert.ok(view.cards.every(card => card.delta.every(offset => offset <= 1)),
    JSON.stringify(view.cards.map(({label, delta}) => [label, delta])));
  if (view.columns === 3) {
    const rows = view.cards.map(card => card.rows.map(Math.round));
    assert.ok(rows.every(row => Math.abs(row[0] - rows[0][0]) <= 1 && Math.abs(row[1] - rows[0][1]) <= 1),
      JSON.stringify(rows));
  }
}

async function flow(page, snap) {
  const block = page.locator(habits);
  const plus = button(block, 'Sumar 250 ml de agua');
  const edit = button(block, 'Editar total de pasos');
  const status = block.getByRole('status');
  await plus.evaluate(el => {
    el.scrollIntoView({ block: 'center' });
    el.focus({ preventScroll: true });
  });
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  assert.ok(await plus.evaluate(el => document.activeElement === el && el.matches(':focus-visible')));
  await page.keyboard.press('Enter');
  await status.filter({ hasText: 'Guardado' }).waitFor();
  await snap('guardado');
  await edit.click();
  const field = block.getByRole('spinbutton', { name: 'Total de pasos' });
  const editBounds = await field.evaluate(el => {
    const {width, height} = el.getBoundingClientRect();
    return { width, height, focus: document.activeElement === el };
  });
  assert.ok(editBounds.width >= 44 && editBounds.height >= 44 && editBounds.focus);
  await field.fill('6800');
  await snap('editando');
  await field.press('Enter');
  await status.filter({ hasText: 'Guardado' }).waitFor();
  const record = await page.evaluate(() => {
    const q = window.__homeQA, {water, steps, weight} = q.store.activeProfile.records[q.today];
    return {water, steps, weight, writes: q.writes.map(({status}) => status)};
  });
  assert.deepEqual(record, {water: 2000, steps: 6800, weight: 72.8, writes: ['confirmed', 'confirmed']});
  const weight = button(block, 'Editar peso');
  await weight.evaluate(el => {
    el.scrollIntoView({ block: 'center' });
    el.focus({ preventScroll: true });
  });
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Editar peso' });
  await dialog.waitFor();
  assert.equal(await dialog.getByRole('textbox', { name: 'Peso (kg)' }).inputValue(), '72.8');
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  await settle(page);
  assert.ok(await weight.evaluate(el => document.activeElement === el));
  return { ...record, editBounds, weightFocusRestored: true };
}

async function sample(config, prior) {
  const [width, height, theme] = config;
  const {context, page, errors} = await open(browser, width === 390 ? 375 : width, theme, theme);
  const block = page.locator(habits);
  const snap = async state => {
    if (engine !== 'chromium') return;
    await block.screenshot({ path: path.join(output, [width, theme, state].join('-') + '.jpg'),
      quality: 88, scale: 'css', style: '.bottom-nav-track { visibility: hidden !important; }' });
  };
  try {
    if (width === 390) await page.setViewportSize({ width, height });
    assert.equal(await page.evaluate(() => window.__homeQA.phase), 'liquid-glass-home-2b-after');
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains('dark')), theme === 'dark');
    const states = [['normal', 100], ['large', 200], ['no-weight', 100]];
    const results = [];
    for (const [[mode, zoom], index] of states.map((state, index) => [state, index])) {
      await fixture(page, mode, zoom);
      const check = await measure(page);
      validate(check, prior?.states[index].check);
      if (mode === 'normal' || (mode === 'large' && width <= 390) || (mode === 'no-weight' && width === 375)) {
        await snap(mode);
      }
      const weightReachable = await block.locator('.habit-edit').evaluate(el => {
        el.scrollIntoView({ block: 'center' });
        const r = el.getBoundingClientRect();
        return el.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2));
      });
      assert.ok(weightReachable, 'El control de peso no se alcanza con scroll');
      results.push({ mode, zoom, check, weightReachable });
    }
    if (width === 375 && before) assert.ok(results[0].check.cards.some(card => card.delta.some(offset => offset > 10)));
    let interaction = null;
    if (width === 375 || (width === 1440 && theme === 'dark')) {
      await fixture(page, 'normal', 100);
      interaction = await flow(page, width === 375 ? snap : () => {});
    }
    const usage = await page.evaluate(() => ({ external: window.__homeQA.externalRequests, ai: window.__homeQA.aiCalls.length }));
    assert.deepEqual(usage, { external: 0, ai: 0 });
    assert.deepEqual(errors, []);
    return { width, theme, states: results, interaction, usage };
  } finally {
    await context.close();
  }
}

try {
  await mkdir(output, { recursive: true });
  const reference = before ? null : JSON.parse(await readFile(path.join(output, '..', 'before', engine + '.json'), 'utf8')).cases;
  const cases = [];
  for (const [index, config] of widths.entries()) {
    cases.push(await sample(config, reference?.[index]));
    console.log(engine, phase, config[0], config[2]);
  }
  await writeFile(path.join(output, engine + '.json'), JSON.stringify({engine, version: browser.version(), cases}, null, 2) + '\n');
} finally {
  await browser.close();
}
