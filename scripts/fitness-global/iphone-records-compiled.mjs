import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { heights, repo, start } from './browser.mjs';
import { measureControl } from './control-colors.mjs';

const before = process.argv.includes('--before');
const deployed = !!process.env.CALORI_PREVIEW_URL;
const origin = process.env.CALORI_PREVIEW_URL
  ? new URL(process.env.CALORI_PREVIEW_URL).origin
  : 'http://127.0.0.1:' + (before ? '5203' : '5204');
assert.ok(origin.startsWith('http://127.0.0.1:') || /^https:\/\/calori-tracker-[a-z0-9-]+\.vercel\.app$/.test(origin), 'Use a local build or a Calori deployment URL');
const assetsOnly = process.argv.includes('--details-only');
const output = process.env.CALORI_QA_OUTPUT_DIR || path.join(repo, 'docs/evidence/iphone-noviembre', deployed ? 'preview' : before ? 'antes' : 'despues');
await mkdir(output, { recursive: true });

const day = '2026-11-25';
const owner = '10000000-0000-4000-8000-000000000001';
const dayId = '20000000-0000-4000-8000-000000000001';
const generation = '30000000-0000-4000-8000-000000000001';
const meal = { id: '40000000-0000-4000-8000-000000000001', description: 'Bocadillo de queso y tomate', meal_type: 'Desayuno', calories: 380, time_str: '08:30', meal_details: 'Registro sintético para comparar el detalle.' };
const workout = { id: '50000000-0000-4000-8000-000000000001', activity_name: 'Natación', duration_min: 40, calories_burned: 310, time_str: '09:00', workout_details: 'Registro sintético para comparar el detalle.' };
const profile = { id: owner, user_id: owner, name: 'Alex', age: 34, weight_kg: 73, height_cm: 175, gender: 'Masculino', goal: 'Mantenimiento', activity_level: 'Moderado', onboarding_completed: true, avatar_path: null };
const user = { id: owner, aud: 'authenticated', role: 'authenticated', email: 'synthetic@example.test', app_metadata: {}, user_metadata: {}, created_at: day + 'T13:10:00Z' };
const supabaseConfig = await readFile(path.join(repo, 'src/lib/supabaseConfig.ts'), 'utf8');
const supabase = new URL(/supabaseUrl = '(https:\/\/[^']+)'/.exec(supabaseConfig)[1]);
const storageKey = 'sb-' + supabase.hostname.split('.')[0] + '-auth-token';

const browser = await start();
const reports = [];
const button = (root, name) => root.getByRole('button', { name, exact: true });
const nav = (page, name) => button(page.getByRole('navigation', { name: 'Navegación principal' }), name);
const waitForFrames = page => page.evaluate(async () => {
  await document.fonts.ready;
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
});

async function open(width, theme, system = false) {
  const context = await browser.newContext({ viewport: { width, height: heights[width] || 900 },
    colorScheme: theme, reducedMotion: 'reduce', timezoneId: 'America/Buenos_Aires', locale: 'es-AR' });
  const child = row => ({ ...row, user_id: owner, daily_log_id: dayId });
  let record = { date: day, id: dayId, user_id: owner, steps: 4250, water_ml: 1500, weight: 73,
    version: '1', meals: [child(meal)], workouts: [child(workout)] };
  const counts = { saves: 0, ai: 0, conflict: false };
  const errors = [];
  const faults = { nextSave: null, saveGate: null };
  await context.addInitScript(({ user, storageKey, day, theme, system }) => {
    const BaseDate = Date;
    const initial = BaseDate.parse(day + 'T13:10:00Z');
    const started = performance.now();
    class FixtureDate extends BaseDate {
      constructor(...args) { super(...(args.length ? args : [FixtureDate.now()])); }
      static now() { return initial + Math.floor(performance.now() - started); }
    }
    window.Date = FixtureDate;
    localStorage.setItem('calori-theme', system ? 'system' : theme);
    localStorage.setItem(storageKey, JSON.stringify({ user, access_token: 'fixture-access-token',
      refresh_token: 'fixture-refresh-token', expires_at: Math.floor(initial / 1000) + 3600 }));
  }, { user, storageKey, day, theme, system });
  await context.route('**/*', route => {
    const req = route.request();
    const url = new URL(req.url());
    const { pathname } = url;
    const json = (data, status = 200) => route.fulfill({ json: data, status, headers: {
      'access-control-allow-origin': origin, 'access-control-allow-headers': '*',
      'access-control-expose-headers': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS',
    } });
    const respond = async () => {
      if (req.method() === 'OPTIONS') return json({});
      if (pathname === '/auth/v1/user') return json(user);
      if (pathname === '/rest/v1/profiles' && req.method() === 'GET') return json([profile]);
      if (pathname.endsWith('/calori_record_snapshot_v1')) return json({ protocol: 'atomic', generation, records: [record] });
      if (pathname.endsWith('/calori_save_daily_record_v1')) {
        const { p_operation_id, p_date, p_expected_version, p_generation, p_day } = req.postDataJSON();
        assert.equal(p_date, day);
        assert.equal(p_generation, generation);
        counts.saves++;
        if (faults.saveGate) await faults.saveGate;
        if (faults.nextSave === 'invalid') {
          faults.nextSave = null;
          return json({ code: '22023', message: 'Fallo sintético' }, 400);
        }
        if (p_expected_version !== record.version) {
          counts.conflict = true;
          return json({ code: 'PT409', message: 'Cambió la versión' }, 409);
        }
        record = { ...record, ...p_day, meals: p_day.meals.map(child), workouts: p_day.workouts.map(child),
          version: String(Number(record.version) + 1) };
        return json({ operation_id: p_operation_id, generation, day_id: dayId, version: record.version });
      }
      if (pathname === '/api/coach/goals') return json({ goals: [], hasMore: false });
      if (pathname === '/api/ai/chat') {
        counts.ai++;
        return json({ estimated: true, calories: 450, assumptions: ['Porción sintética de QA'], description: 'Bocadillo ficticio' });
      }
      errors.push('Petición fuera de la fixture: ' + pathname);
      return route.abort();
    };
    if (url.origin === supabase.origin || (url.origin === origin && pathname.startsWith('/api/'))) return respond();
    // Only frontend resources are served by the build or the deployment.
    if (url.origin === origin && req.method() === 'GET' && /^\/(?:app\/?$|$|assets\/|brand\/|fonts\/)/.test(pathname)) {
      return route.continue();
    }
    errors.push('Petición bloqueada: ' + pathname);
    return route.abort();
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  const response = await page.goto(origin + '/app', { waitUntil: 'domcontentloaded' });
  if (!response?.ok()) {
    await context.close();
    throw new Error('No se pudo cargar /app. Estado HTTP ' + response?.status());
  }
  await nav(page, 'Inicio').waitFor();
  const advanceRecord = () => { record = { ...record, version: String(Number(record.version) + 1), water_ml: 2200 }; };
  return { page, context, counts, faults, errors, advanceRecord, current: () => record };
}

async function openDetail(page, name) {
  const row = page.locator('.daily-record-open').filter({ hasText: name }).first();
  await row.click();
  const detail = page.locator('.record-detail-modal');
  await detail.waitFor();
  return { row, detail };
}

async function detailColors(page, before) {
  const footer = page.locator('.record-detail-actions');
  const surface = await footer.evaluate(el => {
    const style = getComputedStyle(el);
    const swatch = document.createElement('span');
    swatch.style.color = 'var(--fit-surface)';
    el.append(swatch);
    const semanticSurface = getComputedStyle(swatch).color;
    swatch.remove();
    return { footer: style.backgroundColor, border: style.borderTopColor,
      content: getComputedStyle(el.previousElementSibling).backgroundColor, semanticSurface };
  });
  const controls = {};
  for (const name of ['Editar', 'Eliminar']) {
    const action = button(footer, name);
    const box = await action.boundingBox();
    controls[name] = { ...await measureControl(action), width: box.width, height: box.height };
    if (!before) {
      assert.ok(box.width >= 44 && box.height >= 44, name + ' debe tener 44 × 44 px');
      assert.ok(controls[name].contrast >= 4.5, name + ' contraste: ' + JSON.stringify(controls[name]));
    }
  }
  if (!before) assert.equal(surface.footer, surface.semanticSurface, JSON.stringify(surface));
  return { ...surface, controls };
}
const shot = (page, name) => page.screenshot({ path: path.join(output, name + '.jpg'), quality: 85 });
const closeDetail = page => button(page, 'Cerrar detalle').click();
const fixtures = [['comida', meal.description], ['ejercicio', workout.activity_name]];

async function compare(width, theme) {
  const q = await open(width, theme);
  const { page } = q;
  const states = [];
  try {
    for (const pass of ['inicio-directo', 'vuelta-coach']) {
      if (pass === 'vuelta-coach') {
        await nav(page, 'Coach').click();
        await page.locator('.assistant-view textarea').waitFor();
        await nav(page, 'Inicio').click();
      }
      for (const [kind, label] of fixtures) {
        await openDetail(page, label);
        await waitForFrames(page);
        states.push({ pass, kind, ...await detailColors(page, before) });
        if (width === 375) await shot(page, [width, theme, pass, kind].join('-'));
        await closeDetail(page);
      }
    }
    assert.deepEqual(q.errors, []);
    reports.push({ width, theme, states });
  } finally {
    await q.context.close();
  }
}
async function compareSystem() {
  const { page, context, errors } = await open(375, 'light', true);
  try {
    for (const pass of ['inicio-directo', 'vuelta-coach']) {
      if (pass === 'vuelta-coach') {
        await nav(page, 'Coach').click();
        await page.locator('.assistant-view textarea').waitFor();
        await nav(page, 'Inicio').click();
      }
      for (const [kind, label] of fixtures) {
        await openDetail(page, label);
        const light = await detailColors(page, before);
        await page.emulateMedia({ colorScheme: 'dark' });
        await page.waitForFunction(() => document.documentElement.classList.contains('dark'));
        const dark = await detailColors(page, before);
        if (!before) assert.notEqual(light.footer, dark.footer);
        reports.push({ width: 375, theme: 'system', pass, kind, light, dark });
        await closeDetail(page);
        await page.emulateMedia({ colorScheme: 'light' });
        await page.waitForFunction(() => !document.documentElement.classList.contains('dark'));
      }
    }
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
}

async function compareLargeText() {
  const { page, context } = await open(320, 'light');
  try {
    await openDetail(page, meal.description);
    await page.locator('.record-detail-modal').evaluate(el => {
      const controls = [...el.querySelectorAll('button, p, span')];
      const sizes = controls.map(node => parseFloat(getComputedStyle(node).fontSize));
      controls.forEach((node, index) => { node.style.fontSize = sizes[index] * 2 + 'px'; });
    });
    const footer = page.locator('.record-detail-actions');
    const dom = await footer.evaluate(el => ({
      overflow: Math.max(el.scrollWidth - el.clientWidth, document.documentElement.scrollWidth - innerWidth),
      actionWidths: [...el.querySelectorAll('button')].map(button => button.getBoundingClientRect().width),
    }));
    assert.ok(dom.overflow <= 1 && dom.actionWidths.every(width => width >= 44));
    await shot(page, '320-light-detalle-texto-200');
    reports.push({ width: 320, theme: 'light', textScale: 2, ...dom });
  } finally {
    await context.close();
  }
}

async function compareMeal() {
  const q = await open(375, 'dark');
  const { page } = q;
  try {
    await button(page, 'Agregar comida').click();
    const category = page.locator('#add-meal-type');
    const time = page.locator('#add-meal-time');
    await category.waitFor();
    const suggested = await category.inputValue();
    assert.equal(await time.inputValue(), '10:10');
    assert.equal(suggested, before ? 'Almuerzo' : 'Desayuno');
    await category.scrollIntoViewIfNeeded();
    await waitForFrames(page);
    await shot(page, '375-dark-alta-1010');
    await category.selectOption('Almuerzo');
    await page.locator('#add-meal-description').fill('Fruta, avena y yogur');
    await button(page, 'Estimar con IA').click();
    await page.getByText('Se guardarán 450 kcal').waitFor();
    await category.selectOption('Desayuno');
    const result = page.locator('.entry-estimate-heading');
    assert.match(await result.innerText(), before ? /Datos modificados/ : /Categoría actualizada/);
    await result.scrollIntoViewIfNeeded();
    await shot(page, '375-dark-reclasificacion');
    assert.equal(q.counts.ai, 1);
    await button(page, 'Guardar comida').click();
    const receipt = page.getByText('Comida guardada', { exact: true });
    await receipt.waitFor();
    if (!before) await page.getByText(/Categoría de la estimación original: Almuerzo/).waitFor();
    await shot(page, '375-dark-recibo-reclasificacion');
    assert.equal(q.counts.saves, 1);
    assert.deepEqual(q.errors, []);
    reports.push({ suggested, aiRequests: q.counts.ai, receipt: true });
  } finally {
    await q.context.close();
  }
}

async function compareDelete(theme) {
  const q = await open(375, theme);
  const { page } = q;
  try {
    const { detail, row } = await openDetail(page, meal.description);
    const remove = button(detail, 'Eliminar');
    await remove.click();
    if (before) {
      await detail.waitFor({ state: 'hidden' });
      await openDetail(page, workout.activity_name);
      await shot(page, '375-' + theme + '-borrado-detalle-siguiente');
      reports.push({ delete: 'immediate', theme, writes: q.counts.saves });
      return;
    }
    const dialog = page.locator('dialog[data-record-delete]');
    const cancel = button(dialog, 'Cancelar');
    const confirm = button(dialog, 'Eliminar');
    await cancel.waitFor();
    assert.ok(await cancel.evaluate(el => el === document.activeElement));
    await shot(page, '375-' + theme + '-confirmar-eliminacion');
    await cancel.click();
    await dialog.waitFor({ state: 'hidden' });
    assert.ok(await remove.evaluate(el => el === document.activeElement));
    assert.equal(q.counts.saves, 0);
    await remove.click();
    q.faults.nextSave = 'invalid';
    await confirm.click();
    await dialog.getByRole('alert').waitFor();
    assert.equal(q.counts.saves, 1);
    assert.equal(await row.count(), 1);
    await shot(page, '375-' + theme + '-fallo-eliminacion');
    let release;
    q.faults.saveGate = new Promise(r => { release = r; });
    await confirm.evaluate(el => { el.click(); el.click(); });
    await dialog.getByText(/Eliminando/).waitFor();
    release();
    await detail.waitFor({ state: 'hidden' });
    assert.equal(await row.count(), 0);
    assert.equal(q.counts.saves, 2);
    const notice = page.locator('.record-delete-notice');
    await notice.waitFor();
    assert.ok(await page.evaluate(() => document.activeElement !== document.body && document.activeElement.isConnected));
    await openDetail(page, workout.activity_name);
    await notice.waitFor({ state: 'hidden' });
    await shot(page, '375-' + theme + '-borrado-detalle-siguiente');
    assert.deepEqual(q.errors, []);
    reports.push({ delete: 'cancel, fail, retry, double click, success and notice hidden', theme, writes: q.counts.saves });
  } finally {
    await q.context.close();
  }
}

async function compareConcurrentDelete() {
  const q = await open(375, 'light');
  const { page } = q;
  try {
    const { detail } = await openDetail(page, workout.activity_name);
    await button(detail, 'Eliminar').click();
    const dialog = page.locator('dialog[data-record-delete]');
    const confirm = button(dialog, 'Eliminar');
    q.advanceRecord();
    await confirm.click();
    await dialog.getByRole('alert').filter({ hasText: 'Los registros se actualizaron' }).waitFor();
    assert.ok(q.counts.conflict);
    assert.equal(q.current().workouts.length, 1);
    await confirm.click();
    await detail.waitFor({ state: 'hidden' });
    assert.deepEqual([q.current().water_ml, q.current().meals.length, q.current().workouts.length, q.counts.saves], [2200, 1, 0, 2]);
    assert.deepEqual(q.errors, []);
    reports.push({ delete: 'workout: conflict, refresh and retry', water: q.current().water_ml, writes: q.counts.saves });
  } finally {
    await q.context.close();
  }
}

try {
  for (const width of [320, 375, 1440]) {
    for (const theme of ['light', 'dark']) {
      await compare(width, theme);
      console.log(width, theme, 'detalles compilados');
    }
  }
  await compareSystem();
  if (!before) await compareLargeText();
  if (!assetsOnly) {
    await compareMeal();
    for (const theme of ['light', 'dark']) await compareDelete(theme);
    if (!before) await compareConcurrentDelete();
  }
  await writeFile(path.join(output, 'registros-compilado.json'), JSON.stringify({ origin, browser: browser.version(), reports }, null, 2) + '\n');
} finally {
  await browser.close();
}
