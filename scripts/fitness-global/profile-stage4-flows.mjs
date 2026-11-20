import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { go, open, repo, start } from './browser.mjs';

const browser = await start();
const dir = path.join(repo, 'docs/evidence/ux-stage4/after');
const rows = [];
const button = (page, name) => page.getByRole('button', { name, exact: true });
const frames = page => page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
const photo = { name: 'sintetica.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/aXcAAAAASUVORK5CYII=', 'base64') };
async function profile(page) {
  await go(page, 'Perfil');
  const name = page.getByLabel('Nombre', { exact: true });
  await button(page, 'Editar perfil').click();
  await button(page, 'Cancelar').click();
  assert.equal(await page.locator('dialog[open]').count(), 0);
  await button(page, 'Editar perfil').click();
  await name.fill('Alex editado');
  const nav = page.getByRole('navigation', { name: 'Navegación principal' });
  await button(nav, 'Inicio').click();
  await button(page, 'Seguir editando').click();
  assert.equal(await name.inputValue(), 'Alex editado');
  await page.emulateMedia({ colorScheme: 'dark' });
  await frames(page);
  assert.ok(await page.locator('html.dark').count());
  await page.getByLabel('Elegir foto de perfil').setInputFiles(photo);
  await button(page, 'Guardar foto').click();
  await button(page, 'Eliminar foto').waitFor();
  assert.equal(await name.inputValue(), 'Alex editado');
  await page.evaluate(() => { window.__homeQA.profileError = true; window.__homeQA.setProfile({ age: 39 }); });
  await button(page, 'Guardar cambios').click();
  await page.getByText('No se pudieron guardar los datos. Tu borrador se conserva.').waitFor();
  assert.equal(await name.inputValue(), 'Alex editado');
  await page.evaluate(() => { window.__homeQA.profileError = false; });
  await page.getByLabel('Peso de perfil (kg)').fill('75.5');
  await button(page, 'Guardar cambios').click();
  await page.getByText('Datos personales guardados.').waitFor();
  const saved = await page.evaluate(() => {
    const q = window.__homeQA, p = q.store.activeProfile;
    return [p.name, p.age, p.weight, p.records[q.today].weight, !!p.avatar_path, q.profileWrites.length];
  });
  assert.deepEqual(saved, ['Alex editado', 39, 75.5, 72.8, true, 1]);
  await button(page, 'Editar perfil').click();
  await name.fill('Borrador privado de A');
  await page.evaluate(() => window.__homeQA.switchAccount('B'));
  await go(page, 'Perfil');
  assert.equal(await page.getByRole('heading', { name: 'Sol', exact: true }).count(), 1);
  assert.equal(await name.count(), 0);
  await page.evaluate(() => window.__homeQA.switchAccount('A'));
  await go(page, 'Perfil');
  const m = page.locator('.profile-management');
  await m.locator('summary').press('Enter');
  await button(m, 'Borrar todos los registros').click();
  await button(m, 'Cancelar').click();
  await button(m, 'Borrar todos los registros').click();
  await page.evaluate(() => {
    const q = window.__homeQA;
    const reset = q.store.resetData;
    q.resetCalls = 0;
    const gate = new Promise(done => { q.release = done; });
    q.store = { ...q.store, resetData: async () => {
      q.resetCalls++;
      if (q.resetCalls === 1) throw Error('Fallo sintético');
      await gate; await reset();
    } };
    q.notify();
  });
  await frames(page);
  await button(m, 'Borrar registros').click();
  await page.getByText('No se pudieron borrar los registros. Intentá nuevamente.').waitFor();
  await button(m, 'Borrar registros').click();
  assert.ok(await button(m, 'Borrando…').isDisabled());
  assert.ok(await button(m, 'Cancelar').isDisabled());
  await page.evaluate(() => window.__homeQA.release());
  await page.getByText('Registros eliminados').waitFor();
  assert.deepEqual(await page.evaluate(() => {
    const q = window.__homeQA;
    return [q.resetCalls, Object.keys(q.profiles.A.records).length, Object.keys(q.profiles.B.records).length, q.files.size, q.profiles.A.weight];
  }), [2, 0, 1, 1, 75.5]);
  await button(page, 'Eliminar foto').click();
  await button(page, 'Cambiar foto').waitFor();
  await button(page, 'Cerrar sesión').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancelar' }).click();
  assert.deepEqual(await page.evaluate(() => [window.__homeQA.files.size, window.__homeQA.authEvents.length]), [0, 0]);
}

async function entry(page) {
  await go(page, 'Inicio');
  const date = await page.locator('.home-date-context time').getAttribute('datetime');
  await button(page, 'Agregar comida').click();
  const field = page.locator('#add-meal-description');
  await field.fill('Texto sintético');
  await page.locator('#add-meal-time').fill('19:54');
  await page.locator('.entry-photo-section input[type=file]').setInputFiles(photo);
  await page.getByAltText('Vista previa de la comida').waitFor();
  await page.evaluate(() => {
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: () => new Promise(() => {}) });
  });
  await button(page, 'Tomar foto').click();
  await button(page, 'Cerrar cámara').waitFor();
  await page.keyboard.press('Escape');
  await button(page, 'Cerrar cámara').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('dialog[open]').count(), 0);
  await field.focus();
  await page.keyboard.press('Escape');
  const keep = button(page, 'Seguir editando');
  await keep.waitFor();
  assert.ok(await keep.evaluate(el => el === document.activeElement));
  await page.emulateMedia({ colorScheme: 'light' });
  await frames(page);
  await page.keyboard.press('Tab');
  assert.ok(await button(page, 'Descartar cambios').evaluate(el => el === document.activeElement));
  await page.keyboard.press('Escape');
  await keep.waitFor({ state: 'hidden' });
  assert.ok(await field.evaluate(el => el === document.activeElement));
  assert.equal(await field.inputValue(), 'Texto sintético');
  assert.equal(await page.locator('#add-meal-time').inputValue(), '19:54');
  assert.equal(await page.getByAltText('Vista previa de la comida').count(), 1);
  await button(page, 'Usar hora actual').click();
  assert.equal(await page.locator('#add-meal-time').inputValue(), '12:00');
  await button(page, 'Cancelar').click();
  await button(page, 'Descartar cambios').click();
  await field.waitFor({ state: 'hidden' });
  assert.equal(await page.locator('.home-date-context time').getAttribute('datetime'), date);
  assert.ok(await button(page, 'Agregar comida').evaluate(el => el === document.activeElement));
}
async function typography(page) {
  await go(page, 'Perfil');
  await page.evaluate(() => window.__homeQA.setProfile({ name: 'Nombre sintético muy extenso '.repeat(4) }));
  const colors = [];
  for (const scheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: scheme });
    await frames(page);
    const ratios = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      const luminance = token => {
        const hex = root.getPropertyValue('--fit-' + token).trim().substring(1);
        const rgb = hex.match(/../g).map(pair => parseInt(pair, 16) / 255).map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
        return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
      };
      return [['ink','surface'],['quiet','surface'],['accent','surface'],['on-orange','orange'],['danger','danger-soft']].map(([fg,bg]) => {
        const [lighter,darker] = [luminance(fg),luminance(bg)].sort((a,b) => b-a);
        return { fg, bg, ratio: (lighter + 0.05) / (darker + 0.05) };
      });
    });
    assert.ok(ratios.every(pair => pair.ratio >= 4.5));
    colors.push({ scheme, ratios });
  }
  await page.locator('.profile-management summary').click();
  await page.evaluate(() => {
    const original = [...document.querySelectorAll('.profile-view *')].filter(el => el instanceof HTMLElement).map(el => [el, parseFloat(getComputedStyle(el).fontSize), parseFloat(getComputedStyle(el).lineHeight)]);
    for (const [el, size, line] of original) { el.style.fontSize = size * 2 + 'px'; if (line) el.style.lineHeight = line * 2 + 'px'; }
  });
  const overflow = await page.locator('.app-main').evaluate(el => el.scrollWidth - el.clientWidth);
  assert.ok(overflow <= 1, 'CSS text 200% overflow: ' + overflow);
  const overlap = await page.locator('.profile-theme-control button').evaluateAll(buttons => buttons.filter(button => {
    const range = document.createRange(); range.selectNodeContents(button);
    const label = range.getBoundingClientRect(), box = button.getBoundingClientRect();
    return label.left < box.left - 1 || label.right > box.right + 1;
  }).map(button => button.textContent));
  assert.deepEqual(overlap, [], 'Theme labels must fit at 200% text');
  return colors;
}
async function previousStages(page) {
  await page.evaluate(() => window.__homeQA.reset());
  await go(page, 'Datos');
  await button(page, 'Año').click();
  const bars = page.locator('.charts-bucket');
  assert.equal(await bars.count(), 12);
  await page.setViewportSize({ width: 375, height: 812 });
  await frames(page);
  assert.ok(await bars.evaluateAll(all => {
    const bounds = document.querySelector('.charts-plot-scroll').getBoundingClientRect();
    return all.some(el => el.querySelector('.charts-bar-expenditure') && el.getBoundingClientRect().left >= bounds.left - 1 && el.getBoundingClientRect().right <= bounds.right + 1);
  }));
  await page.evaluate(() => {
    const q = window.__homeQA;
    localStorage.setItem('calori:assistant:messages:' + q.store.user.id + ':' + q.today, JSON.stringify(
      Array.from({ length: 12 }, (_, i) => ({ id: 'sintetico-' + i, role: i % 2 ? 'bot' : 'user', text: 'Lectura sintética extensa. '.repeat(25) }))));
  });
  await go(page, 'Coach');
  assert.equal(await page.locator('.chat-message').count(), 12);
  assert.equal(await page.locator('.chat-proactive > details').evaluate(el => el.open), false);
  const reader = page.locator('.chat-messages');
  await reader.evaluate(el => { el.scrollTop = 100; });
  await frames(page);
  await page.locator('.chat-textarea').focus();
  await go(page, 'Inicio');
  await go(page, 'Coach');
  assert.equal(await reader.evaluate(el => el.scrollTop), 100);
}

try {
  for (const width of [320, 375, 1440]) {
    const { context, page, errors } = await open(browser, width, 'system', 'light');
    try {
      await profile(page);
      await entry(page);
      const colors = await typography(page);
      if (width === 1440) await previousStages(page);
      const counts = await page.evaluate(() => [window.__homeQA.externalRequests, window.__homeQA.aiCalls.length, window.__homeQA.writes.length]);
      assert.deepEqual(counts, [0, 0, 0]);
      assert.deepEqual(errors, []);
      rows.push({ width, previousStages: width === 1440 ? 'annual narrowing and Coach reading passed' : undefined, profile: 'passed', entry: 'passed', colors, cssText200: 'passed', counts });
    } finally { await context.close(); }
  }
  await writeFile(path.join(dir, 'flows.json'), JSON.stringify(rows, null, 2) + '\n');
  console.log('Profile, entries, layers, contrast and CSS text: %d passed', rows.length);
} finally { await browser.close(); }
