import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { before, open, repo, start } from './browser.mjs';

const iteration = process.argv.find(arg => arg.startsWith('--iteration='))?.split('=')[1];
assert.ok(['production', 'first', 'second'].includes(iteration));
assert.equal(before, iteration !== 'second');
const output = path.join(repo, 'docs/evidence/liquid-glass-home-2e-v2', iteration);
const resultsPath = process.argv.find(arg => arg.startsWith('--results='))?.slice('--results='.length);
const slice = process.argv.find(arg => arg.startsWith('--only='))?.slice('--only='.length);
const scenarioFilter = process.argv.find(arg => arg.startsWith('--scenario='))?.slice('--scenario='.length);
const scenarios = ['empty', 'sparse', 'dense'];
assert.ok(!scenarioFilter || scenarios.includes(scenarioFilter));
const root = '[data-history-root]';
const view = (page, name) => page.locator('.ah-view-switch').getByRole('button', { name, exact: true });
const cell = (page, date) => page.locator(`.ah-day[data-date="${date}"]`);
const period = (page, name) => page.locator(root).getByRole('button', { name, exact: true });

const settle = page => page.evaluate(async () => {
  await document.fonts.ready;
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
});

async function startActivity(page, width, height) {
  await page.setViewportSize({ width, height });
  assert.equal(await page.evaluate(() => window.__homeQA.phase), 'liquid-glass-home-2e-v2-' + iteration);
  const toggle = page.locator('.home-history-toggle');
  if (await toggle.isVisible() && await toggle.getAttribute('aria-expanded') === 'false') await toggle.click();
  await page.locator(root).waitFor();
  await settle(page);
}

async function seed(page, scenario) {
  await page.evaluate(scenario => {
    const qa = window.__homeQA;
    const generation = qa.store.activeProfile.recordGeneration ?? '22222222-2222-4222-8222-222222222222';
    const row = (dateStr, values) => ({ dateStr, date: dateStr + 'T12:00:00', meals: [], workouts: [], steps: 0, water: 0, generation, version: '1', ...values });
    const meal = (id, name, calories, type = 'Almuerzo', time = '13:00') => ({ id, name, calories, type, time });
    const workout = (id, activity, duration, calories, time) => ({ id, activity, duration, calories, time, muscles: [] });
    const records = {};
    if (scenario === 'sparse') {
      records['2026-11-12'] = row('2026-11-12', { meals: [meal('sparse', 'Bowl de arroz y verduras', 720)] });
      records['2026-11-13'] = row('2026-11-13', { steps: 1800, water: 750 });
      records['2026-11-17'] = row('2026-11-17', { meals: [meal('future', 'Comida futura de prueba', 930)] });
    }
    if (scenario === 'dense') {
      for (let day = 1; day <= 31; day++) {
        const date = '2026-10-' + String(day).padStart(2, '0');
        if (day === 7 || day === 22) {
          records[date] = row(date, { steps: 5800, water: 1750 });
        } else if (day === 20) {
          records[date] = row(date, { meals: [meal('exact-zero', 'Comidas registradas', 1679)] });
        } else {
          const detailed = day === 30 || day === 31;
          const names = ['Arroz con verduras y pollo', 'Tortilla y ensalada', 'Pasta con tomate', 'Merluza y papas al horno'];
          records[date] = row(date, {
            steps: 2700 + day * 170, water: 1250 + (day % 4) * 250,
            meals: [meal('lunch-' + day, names[day % names.length], day % 2 ? 2750 + day * 20 : 680 + day * 10),
              ...(detailed ? [meal('breakfast-' + day, 'Yogur, fruta y avena', 385, 'Desayuno', '08:30'),
                meal('snack-' + day, 'Tostada con queso', 245, 'Merienda', '16:30')] : [])],
            workouts: detailed ? [workout('gym-' + day, 'Gimnasio', 45, 250, '10:30'), workout('walk-' + day, 'Caminata', 25, 110, '19:30')]
              : day % 5 === 0 ? [workout('football-' + day, 'Fútbol 5', 60, 420, '18:30')] : [],
          });
        }
      }
      for (const [month, count] of [['07', 4], ['08', 17], ['09', 24]]) {
        for (let day = 1; day <= count; day++) {
          const date = `2026-${month}-${String(day).padStart(2, '0')}`;
          records[date] = row(date, { meals: [meal('annual-' + date, 'Registros del día', month === '08' ? 2100 : 1300 + day * 10)] });
        }
      }
      records['2026-11-01'] = row('2026-11-01', { meals: [meal('neighbor', 'Comidas del domingo', 1720)] });
      records['2026-11-13'] = row('2026-11-13', { meals: [meal('today', 'Comidas de hoy', 1975)], water: 1500, steps: 4700, weight: 72.8 });
      records['2026-11-17'] = row('2026-11-17', { meals: [meal('future', 'Comida futura de prueba', 930)] });
    }
    qa.setProfile({ records });
  }, scenario);
  await settle(page);
}

async function choose(page, scenario) {
  await view(page, 'Mes').click();
  await page.locator('.ah-today').click();
  if (scenario === 'dense') {
    await period(page, 'Mes anterior').click();
    await cell(page, '2026-10-30').click();
    assert.equal(await cell(page, '2026-10-30').getAttribute('aria-pressed'), 'true');
  }
}

async function capture(page, name, selector = '.home-history') {
  await page.locator(selector).evaluate(el => el.scrollIntoView({ block: 'start', behavior: 'instant' }));
  await settle(page);
  await page.screenshot({ path: path.join(output, name + '.jpg'), quality: 80, scale: 'css' });
}

async function isolated(page, errors) {
  assert.deepEqual(errors, []);
  assert.deepEqual(await page.evaluate(() => {
    const qa = window.__homeQA;
    return [qa.writes.length, qa.aiCalls.length, qa.externalRequests];
  }), [0, 0, 0]);
}

async function shots(browser) {
  for (const [width, height] of [[375, 812], [1440, 900]]) {
    for (const theme of ['light', 'dark']) {
      if (slice && `${width}-${theme}` !== slice) continue;
      const { page, context, errors } = await open(browser, 375, theme, theme);
      try {
        await startActivity(page, width, height);
        for (const scenario of scenarios.filter(name => !scenarioFilter || name === scenarioFilter)) {
          await seed(page, scenario);
          await choose(page, scenario);
          const base = [width, theme, scenario].join('-');
          if (scenario === 'dense') {
            const counts = await page.locator('.ah-day[data-date^="2026-10-"]').evaluateAll(nodes => nodes.reduce((count, node) => {
              const key = node.dataset.completeness;
              count[key] = (count[key] ?? 0) + 1;
              return count;
            }, {}));
            assert.deepEqual(counts, { 'with-meals': 29, partial: 2 });
            assert.equal(await cell(page, '2026-10-20').getAttribute('data-balance'), 'neutral');
          }
          await capture(page, base + '-mes');
          await view(page, 'Semana').click();
          await capture(page, base + '-semana');
          await view(page, 'Año').click();
          if (iteration === 'second' && scenario === 'dense') {
            const october = page.locator('[data-month="2026-10"]');
            const december = page.locator('[data-month="2026-12"]');
            assert.equal(await october.locator('.ah-month-days [data-state="recorded"]').count(), 31);
            assert.match(await october.locator('.ah-month-coverage').innerText(), /31 días con registros/);
            assert.equal(await december.locator('.ah-month-days [data-state="future"]').count(), 31);
            assert.ok(await december.isDisabled());
          }
          await capture(page, base + '-ano');
          if (width === 375 && scenario === 'dense') await capture(page, base + '-ano-final', '[data-month="2026-09"]');
        }
        await isolated(page, errors);
        console.log(iteration, width, theme, '· capturas');
      } finally {
        await context.close();
      }
    }
  }
}

async function record(browser, width, height, theme) {
  const { page, context, errors } = await open(browser, 375, theme, theme, undefined, {
    recordVideo: { dir: path.join(repo, '../home-2e-v2-video-tmp'), size: { width, height } },
  });
  const video = page.video();
  try {
    await startActivity(page, width, height);
    await seed(page, 'dense');
    await choose(page, 'dense');
    await page.locator(root).evaluate(el => el.scrollIntoView({ block: 'start', behavior: 'instant' }));
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const frames = [];
    const act = async (label, fn, hold = 570) => {
      await page.evaluate(() => {
        window.cancelAnimationFrame(window.__activityMotionFrame);
        window.__activityMotionSamples = [];
        const sample = time => {
          window.__activityMotionSamples.push(time);
          window.__activityMotionFrame = window.requestAnimationFrame(sample);
        };
        window.__activityMotionFrame = window.requestAnimationFrame(sample);
      });
      await fn();
      await page.waitForTimeout(hold);
      const durations = await page.evaluate(() => {
        window.cancelAnimationFrame(window.__activityMotionFrame);
        const points = window.__activityMotionSamples;
        return points.slice(1).map((time, index) => time - points[index]);
      });
      durations.sort((a, b) => a - b);
      assert.ok(durations.length > 0);
      frames.push({ label, frames: durations.length, p95Ms: Math.round(durations[Math.floor((durations.length - 1) * .95)]), maxMs: Math.round(durations.at(-1)) });
    };
    await page.waitForTimeout(450);
    await act('Fecha anterior', () => cell(page, '2026-10-29').click());
    await act('Fecha siguiente', () => cell(page, '2026-10-30').click());
    await act('Mes siguiente', () => period(page, 'Mes siguiente').click());
    await act('Hoy', () => page.locator('.ah-today').click());
    await act('Semana por teclado', async () => {
      await view(page, 'Semana').focus();
      await page.keyboard.press('Enter');
    });
    await act('Año', () => view(page, 'Año').click());
    await act('Abrir octubre', () => page.locator('.ah-month[data-month="2026-10"]').click());
    await act('Leyenda', () => page.locator('.ah-key-disclosure > summary').click());
    await act('Cerrar leyenda', () => page.locator('.ah-key-disclosure > summary').click());
    if (width < 768) await act('Detalle del día', () => page.locator('.ah-detail-jump').click(), 900);
    await isolated(page, errors);
    return { width, height, theme, frames };
  } finally {
    await context.close();
    await video.saveAs(path.join(output, `movimiento-${width}-${theme}.webm`));
    await video.delete();
  }
}

await mkdir(output, { recursive: true });
const browser = await start();
try {
  if (!process.argv.includes('--video-only')) await shots(browser);
  if (process.argv.includes('--video') || process.argv.includes('--video-only')) {
    assert.equal(iteration, 'second');
    const frames = [await record(browser, 375, 812, 'dark'), await record(browser, 1024, 768, 'light')];
    if (resultsPath) await writeFile(resultsPath, JSON.stringify(frames, null, 2) + '\n');
    console.log('Secuencias de vídeo', JSON.stringify(frames));
  }
} finally {
  await browser.close();
}
