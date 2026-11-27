import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { before, go, open, repo, start } from './browser.mjs';

const engine = process.argv.includes('--webkit') ? 'webkit' : 'chromium';
const playwrightModule = process.env.PLAYWRIGHT_MODULE || path.resolve(repo, '../qa-tools/node_modules/playwright/index.mjs');
const browser = engine === 'webkit' ? await (await import(pathToFileURL(playwrightModule))).webkit.launch() : await start();
const output = path.join(repo, 'docs/evidence/peso-vigente', before ? 'before' : 'after');
const today = '2026-11-27';
const older = '2026-11-24';
const latest = '2026-11-26';
const future = '2026-11-28';
const button = (scope, name) => scope.getByRole('button', { name, exact: true });
const weightFact = page => page.locator('.profile-fact-weight');
const settle = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
await mkdir(output, { recursive: true });

async function seed(page) {
  await page.evaluate(({ today, older, latest, future }) => {
    const q = window.__homeQA;
    const source = q.store.activeProfile.records[today];
    const oldDay = { ...source, date: older + 'T12:00:00', dateStr: older, version: '102', weight: 78 };
    const rows = {
      [latest]: { ...source, date: latest + 'T12:00:00', dateStr: latest, version: '1', weight: 80 },
      [today]: { ...source, weight: undefined },
      [future]: { ...source, date: future + 'T12:00:00', dateStr: future, weight: 120 },
      [older]: oldDay,
    };
    q.setProfile({ weight: 77, records: rows });
  }, { today, older, latest, future });
  await settle(page);
}

async function profileReading(page, weight, date = null, base = 77) {
  const fact = weightFact(page);
  await fact.waitFor();
  const text = (await fact.innerText()).replace(/\s+/g, ' ');
  const times = fact.locator('time');
  assert.match(text, new RegExp('(?:^| )' + String(weight).replace('.', ',') + ' kg(?: |$)'));
  if (date) {
    assert.match(text, /Peso vigente/);
    assert.equal(await times.getAttribute('datetime'), date);
    assert.match(await times.innerText(), /noviembre/);
    assert.match(text, new RegExp('Peso base para estimaciones.*' + base + ' kg', 'i'));
  } else {
    assert.equal(await times.count(), 0);
  }
  return { weight, date, base, text };
}

async function selectDay(page, date) {
  const target = page.locator('.home-week-days [data-day="' + date + '"]');
  await target.scrollIntoViewIfNeeded();
  await target.click();
  assert.equal(await page.locator('.home-date-context time').getAttribute('datetime'), date);
}

async function historicalEnergy(page) {
  await selectDay(page, older);
  const summary = page.locator('summary[aria-label="Ver desglose"]');
  await summary.scrollIntoViewIfNeeded();
  await summary.click();
  const energy = (await page.locator('.fitness-breakdown-body').innerText()).replace(/\s+/g, ' ');
  assert.match(energy, /TMB: 1\.719 kcal/);
  assert.match(energy, /Gasto estimado 2\.321 kcal/);
  await summary.click();
  return energy;
}

async function saveDailyWeight(page, date, weight, label) {
  await selectDay(page, date);
  const trigger = button(page, label);
  await trigger.evaluate(el => el.scrollIntoView({ block: 'center', inline: 'nearest' }));
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: label, exact: true });
  await dialog.waitFor();
  assert.equal(await dialog.locator('.entry-date-context time').getAttribute('datetime'), date);
  await dialog.getByRole('textbox', { name: 'Peso (kg)' }).fill(String(weight));
  await button(dialog, 'Guardar peso').click();
  await dialog.waitFor({ state: 'hidden' });
  const confirmed = await page.evaluate(() => {
    const entry = window.__homeQA.writes.at(-1);
    return { date: entry.date, weight: entry.record.weight, status: entry.status };
  });
  assert.deepEqual(confirmed, { date, weight, status: 'confirmed' });
  return confirmed;
}

async function removeWeights(page, dates) {
  await page.evaluate(dates => {
    const q = window.__homeQA;
    const records = { ...q.store.activeProfile.records };
    for (const date of dates) {
      records[date] = { ...records[date] };
      delete records[date].weight;
    }
    q.setProfile({ records });
  }, dates);
  await settle(page);
}

async function journey(page, snap) {
  const readings = [];
  const writes = [];
  await go(page, 'Inicio');
  const energyBefore = await historicalEnergy(page);
  await go(page, 'Perfil');
  readings.push(await profileReading(page, 80, latest));

  await go(page, 'Inicio');
  writes.push(await saveDailyWeight(page, older, 81.5, 'Editar peso'));
  await go(page, 'Perfil');
  readings.push(await profileReading(page, 80, latest));
  await go(page, 'Inicio');
  writes.push(await saveDailyWeight(page, latest, 80.5, 'Editar peso'));
  await go(page, 'Perfil');
  readings.push(await profileReading(page, 80.5, latest));

  await go(page, 'Inicio');
  writes.push(await saveDailyWeight(page, today, 82, 'Registrar peso'));
  const energyAfter = await historicalEnergy(page);
  assert.equal(energyAfter, energyBefore);
  await go(page, 'Perfil');
  readings.push(await profileReading(page, 82, today));
  await removeWeights(page, [today]);
  readings.push(await profileReading(page, 80.5, latest));
  await removeWeights(page, [latest]);
  readings.push(await profileReading(page, 81.5, older));
  await removeWeights(page, [older]);
  readings.push(await profileReading(page, 77));
  await snap('sin-medicion');

  await button(page, 'Editar perfil').click();
  const baseInput = page.getByRole('spinbutton', { name: 'Peso base para estimaciones (kg)', exact: true });
  assert.equal(await baseInput.inputValue(), '77');
  await snap('peso-base');
  await baseInput.fill('79');
  await button(page, 'Guardar cambios').click();
  await button(page, 'Editar perfil').waitFor();
  readings.push(await profileReading(page, 79, null, 79));
  const state = await page.evaluate(() => {
    const q = window.__homeQA, p = q.store.activeProfile;
    return { base: p.weight, profileWrites: q.profileWrites.length, recordWrites: q.writes.length,
      dates: Object.keys(p.records).sort(), presentWeights: Object.values(p.records).filter(r => r.weight != null).length };
  });
  assert.deepEqual(state, { base: 79, profileWrites: 1, recordWrites: 3, dates: [older, latest, today, future], presentWeights: 1 });
  return { readings, writes, state, energyBefore, energyAfter };
}

async function sample(width, theme, checkJourney) {
  const { context, page, errors } = await open(browser, width === 390 ? 375 : width, theme, theme);
  try {
    if (width === 390) await page.setViewportSize({ width, height: 844 });
    assert.equal(await page.evaluate(() => window.__homeQA.phase), 'weight-current-' + (before ? 'before' : 'after'));
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains('dark')), theme === 'dark');
    await seed(page);
    await go(page, 'Perfil');
    const reading = before ? await profileReading(page, 77) : await profileReading(page, 80, latest);
    const snap = async suffix => {
      if (engine !== 'chromium') return;
      await page.locator('.profile-personal-panel').scrollIntoViewIfNeeded();
      await settle(page);
      await page.screenshot({ path: path.join(output, width + '-' + theme + '-' + suffix + '.jpg'), quality: 88 });
    };
    await snap('perfil');
    const layout = await page.locator('.profile-fact-weight').evaluate(el => {
      const bounds = el.getBoundingClientRect(), container = el.closest('.app-main');
      const nav = document.querySelector('.bottom-nav-track');
      return { weightWidth: bounds.width, weightHeight: bounds.height, overflow: container.scrollWidth - container.clientWidth,
        clearance: nav && nav.getClientRects().length ? nav.getBoundingClientRect().top - bounds.bottom : null };
    });
    assert.ok(layout.overflow <= 1, JSON.stringify(layout));
    assert.ok(layout.clearance == null || layout.clearance > 0, JSON.stringify(layout));
    let events = null;
    if (checkJourney) {
      if (before) {
        await go(page, 'Inicio');
        events = { historicalEnergy: await historicalEnergy(page) };
      } else {
        events = await journey(page, snap);
      }
    }
    const remote = await page.evaluate(() => ({ external: window.__homeQA.externalRequests, ai: window.__homeQA.aiCalls.length }));
    assert.deepEqual(remote, { external: 0, ai: 0 });
    assert.deepEqual(errors, []);
    return { width, theme, reading, layout, events, remote };
  } finally {
    await context.close();
  }
}

try {
  const cases = [];
  const screens = engine === 'chromium' ? [[375, 'light'], [390, 'dark'], [1440, 'light'], [1440, 'dark']] : [[390, 'dark'], [1440, 'light']];
  for (const [width, theme] of screens) {
    cases.push(await sample(width, theme, width < 400 && cases.length === 0));
    console.log(engine, before ? 'before' : 'after', width, theme);
  }
  await writeFile(path.join(output, engine + '.json'), JSON.stringify({ engine, version: browser.version(), cases }, null, 2) + '\n');
} finally {
  await browser.close();
}
