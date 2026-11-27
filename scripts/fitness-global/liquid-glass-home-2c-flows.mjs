import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { go } from './browser.mjs';
import { contrast } from './liquid-glass-home-2c-contrast.mjs';

const date = '2026-11-12';
const btn = (scope, name) => scope.getByRole('button', { name, exact: true });
const selected = page => page.locator('.home-date-context time').getAttribute('datetime');
const focusIs = locator => locator.evaluate(el => el === document.activeElement);
const field = (scope, id) => scope.locator('#' + id);
const view = (page, title) => page.getByRole('dialog', { name: title, exact: true });
const reach = locator => locator.evaluate(el => el.scrollIntoView({ block: 'center', inline: 'nearest' }));

export const settle = page => page.evaluate(async () => {
  await document.fonts.ready;
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
});

async function openDialog(page, title, action = title) {
  const opener = btn(page, action);
  await reach(opener);
  await opener.press('Enter');
  const dialog = view(page, title);
  await dialog.waitFor();
  await settle(page);
  return { dialog, opener };
}

async function checkDate(dialog) {
  assert.equal(await dialog.locator('.entry-date-context time').first().getAttribute('datetime'), date);
}

async function fingerprint(dialog) {
  return dialog.evaluate(el => [el, ...el.querySelectorAll('h3, .entry-sheet-header, .entry-sheet-header button, input, button, .record-detail-main')]
    .filter(node => node.getClientRects().length).map(node => {
      const style = getComputedStyle(node);
      const {width, height} = node.getBoundingClientRect();
      return [node.tagName, node.getAttribute('aria-label'), width, height, style.color, style.backgroundColor, style.backgroundImage,
        style.borderRadius, style.boxShadow, style.padding, node.matches('input') ? node.value : node.textContent.replace(/\s+/g, ' ').trim()];
    }));
}

function keyboardFixture() {
  const viewport = new EventTarget();
  Object.assign(viewport, { height: innerHeight, offsetTop: 0, scale: 1 });
  Object.defineProperty(viewport, 'pageTop', { get: () => scrollY + viewport.offsetTop });
  Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });
  window.qaKeyboard = (mode, pan = 0) => {
    viewport.height = mode ? Math.round(innerHeight * (mode === 'numeric' ? .6 : .57)) : innerHeight;
    viewport.offsetTop = mode ? pan || 14 : 0;
    let mask = document.querySelector('#qa-keyboard-occlusion');
    if (!mask) {
      mask = document.createElement('div');
      mask.id = 'qa-keyboard-occlusion';
      mask.textContent = 'Teclado y controles del sistema simulados';
      Object.assign(mask.style, { position: 'fixed', inset: 'auto 0 0', zIndex: 99999, padding: '14px', textAlign: 'center',
        background: '#32363b', borderTop: '2px dashed #b4c1cf', color: 'white', font: '14px system-ui' });
      document.body.append(mask);
    }
    mask.hidden = !mode;
    mask.style.top = viewport.offsetTop + Math.round(viewport.height * .735) + 'px';
    viewport.dispatchEvent(new Event('resize'));
    viewport.dispatchEvent(new Event('scroll'));
  };
}

async function keyboard(page, mode, pan = 0) {
  await page.evaluate(([mode, pan]) => window.qaKeyboard(mode, pan), [mode, pan]);
  await settle(page);
}

async function verifyKeyboard(page, id, line = 0) {
  const values = await page.evaluate(({ id, line }) => {
    const field = document.getElementById(id);
    const box = field.getBoundingClientRect(), css = getComputedStyle(field);
    const row = field.matches('textarea') ? box.top + parseFloat(css.paddingTop) + parseFloat(css.borderTopWidth) + (line + .5) * parseFloat(css.lineHeight)
      : box.top + box.height / 2;
    const form = field.closest('form');
    const footer = form.querySelector('.entry-form-footer');
    const body = form.querySelector('.entry-form-content');
    const dialog = form.closest('[role=dialog]');
    const main = document.querySelector('.app-main');
    const buttons = [...footer.querySelectorAll('button')].map(el => {
      const r = el.getBoundingClientRect();
      return [r.top + 4, r.bottom - 4].every(y => [r.left + 6, r.right - 6].every(x => el.contains(document.elementFromPoint(x, y))));
    });
    return { id, visualHeight: visualViewport.height, top: visualViewport.offsetTop, sheet: dialog.getBoundingClientRect().y,
      field: field === document.elementFromPoint(box.x + box.width / 2, row), focused: field === document.activeElement, actions: buttons.every(Boolean),
      inert: main.inert, opacity: getComputedStyle(main).opacity, actionsBeforeFields: footer.getBoundingClientRect().bottom <= body.getBoundingClientRect().top + 1,
      safePaddingTop: getComputedStyle(dialog).paddingTop, layoutHeight: innerHeight };
  }, { id, line });
  assert.ok(values.field && values.focused && values.actions && values.inert && values.opacity === '0' && values.actionsBeforeFields &&
    Math.abs(values.top - values.sheet) <= 1, JSON.stringify(values));
  return values;
}

async function navigateCalendar(page, sample, shot) {
  const { dialog, opener } = await openDialog(page, 'Elegir fecha', 'Abrir calendario mensual');
  const calendar = dialog.locator('.home-date-picker');
  assert.deepEqual(await calendar.locator('[role=columnheader]').evaluateAll(items => items.map(el => el.getAttribute('aria-label'))),
    ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']);
  assert.ok(await calendar.locator('[data-calendar-day="2026-11-14"]').isDisabled());
  await page.waitForFunction(() => document.activeElement?.dataset.calendarDay === '2026-11-13');
  const live = calendar.locator('[data-calendar-day="2026-11-13"]');
  assert.equal(await live.getAttribute('aria-current'), 'date');
  await page.keyboard.press('ArrowLeft');
  await page.waitForFunction(() => document.activeElement?.dataset.calendarDay === '2026-11-12');
  assert.equal(await selected(page), '2026-11-13');
  await page.keyboard.press('Enter');
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(await selected(page), date);
  assert.ok(await focusIs(opener));

  await opener.press('Enter');
  await dialog.waitFor();
  await page.waitForFunction(() => document.activeElement?.dataset.calendarDay === '2026-11-12');
  assert.equal(await calendar.locator('[aria-selected=true] button').getAttribute('data-calendar-day'), date);
  assert.equal(await live.getAttribute('aria-current'), 'date');
  await sample(dialog, 'calendario');
  await shot('calendario-historico');
  await page.keyboard.press('PageUp');
  await page.waitForFunction(() => document.activeElement?.dataset.calendarDay?.startsWith('2026-10'));
  assert.equal(await selected(page), date);
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  assert.ok(await focusIs(opener));
}

async function endDraft(page, dialog, keep = false) {
  await btn(dialog, 'Cancelar').press('Enter');
  const discard = page.locator('dialog[data-discard-draft][open]');
  await discard.waitFor();
  const original = await fingerprint(discard);
  if (keep) {
    await btn(discard, 'Seguir editando').press('Enter');
    await discard.waitFor({ state: 'hidden' });
    await dialog.waitFor();
  } else {
    await btn(discard, 'Descartar cambios').press('Enter');
    await dialog.waitFor({ state: 'hidden' });
  }
  return original;
}

async function prepareMeal(page, dialog, sample, shot, repo) {
  const name = field(dialog, 'add-meal-description');
  const time = field(dialog, 'add-meal-time');
  assert.equal(await time.getAttribute('type'), 'time');
  assert.equal(await field(dialog, 'add-meal-type').evaluate(el => el.tagName), 'SELECT');
  await field(dialog, 'add-meal-type').selectOption('Cena');
  await time.fill('20:45');
  await btn(dialog, 'Usar hora actual').press('Enter');
  assert.notEqual(await time.inputValue(), '20:45');
  await time.fill('20:45');
  await name.fill('Tostada sintética 2C');

  const gallery = page.waitForEvent('filechooser');
  await btn(dialog, 'Elegir de galería').press('Enter');
  await (await gallery).setFiles({ name: 'foto-sintetica.png', mimeType: 'image/png',
    buffer: await readFile(path.join(repo, 'public/brand/calori-logo-symbol.png')) });
  await dialog.getByRole('img', { name: 'Vista previa de la comida' }).waitFor();
  await page.evaluate(() => {
    const qa = window.__homeQA;
    qa.replyDelayMs = 1800;
    qa.cameraDenials = 0;
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {
      getUserMedia() { qa.cameraDenials += 1; return Promise.reject(new DOMException('Permiso sintético rechazado', 'NotAllowedError')); },
    } });
  });
  await btn(dialog, 'Tomar foto').press('Enter');
  await page.getByText(/No pude acceder a la cámara/).waitFor();
  assert.equal(await page.evaluate(() => window.__homeQA.cameraDenials), 1);

  await btn(dialog, 'Estimar con IA').press('Enter');
  const pending = btn(dialog, 'Estimando…');
  await pending.waitFor();
  assert.ok(await pending.isDisabled());
  await reach(pending);
  await sample(dialog, 'estimando');
  await shot('estimando');
  const result = dialog.locator('.entry-estimate-result');
  await result.waitFor();
  assert.match(await result.innerText(), /450 kcal/);
  assert.equal(await page.evaluate(() => window.__homeQA.aiCalls.at(-1).attachment.kind), 'image');
  await reach(result.locator('summary'));
  await sample(dialog, 'estimacion-foto');
  await shot('estimacion-foto');
  await btn(dialog, 'Quitar foto').press('Enter');
  assert.equal(await dialog.getByRole('img', { name: 'Vista previa de la comida' }).count(), 0);
  await page.evaluate(() => { window.__homeQA.aiError = 503; window.__homeQA.replyDelayMs = 0; });
  await btn(dialog, 'Estimar con IA').press('Enter');
  const error = dialog.getByText(/Podés ingresar las calorías manualmente/);
  await error.waitFor();
  await reach(error);
  await sample(dialog, 'error-ia');
  await shot('error-ia');
  await page.evaluate(() => { window.__homeQA.aiError = 0; });
  await dialog.locator('.fitness-extras summary').press('Enter');
  await field(dialog, 'add-meal-notes').fill('Tostada y fruta');
  await field(dialog, 'add-meal-calories').fill('480');
}

async function saveMeal(page, dialog, sample, shot, hasKeyboard) {
  const name = field(dialog, 'add-meal-description');
  const save = btn(dialog, 'Guardar comida');
  await page.evaluate(() => { window.__homeQA.failed = true; });
  await save.click();
  if (hasKeyboard) await keyboard(page, null);
  const error = dialog.locator('.meal-write-error');
  await error.waitFor();
  assert.equal(await name.inputValue(), 'Tostada sintética 2C');
  await sample(dialog, 'error-guardado');
  await shot('error-guardado');
  await page.evaluate(() => {
    const qa = window.__homeQA;
    qa.failed = false;
    const original = qa.store.updateRecord;
    qa.submitAttempts = 0;
    qa.store = { ...qa.store, updateRecord: (...args) => new Promise(resolve => {
      qa.submitAttempts += 1;
      qa.finishSave = () => resolve(original(...args));
    }) };
    qa.notify();
  });
  await settle(page);
  await save.click();
  const saving = btn(dialog, 'Guardando…');
  await saving.waitFor();
  assert.ok(await saving.isDisabled() && await btn(dialog, 'Cancelar').isDisabled());
  await dialog.locator('form').evaluate(el => el.requestSubmit());
  assert.equal(await page.evaluate(() => window.__homeQA.submitAttempts), 1);
  await sample(dialog, 'guardando');
  await shot('guardando');
  await page.evaluate(() => { void window.__homeQA.finishSave(); });
  const receipt = page.getByRole('complementary', { name: 'Confirmación de comida' });
  await receipt.waitFor();
  await shot('guardado');
  await btn(receipt, 'Ver registro').press('Enter');
  const meal = page.locator('.daily-record-open:focus');
  assert.match(await meal.innerText(), /Tostada sintética 2C/);
}

async function editRecord(page, kind, title, sample, shot, guards) {
  const row = page.locator('.daily-record-open[data-entry-kind="' + kind + '"]').filter({ hasText: title });
  await reach(row);
  await row.press('Enter');
  const detail = view(page, 'Detalle del registro');
  await detail.waitFor();
  guards['detalle-' + kind] = await fingerprint(detail);
  const edit = kind === 'meal' ? 'Editar comida' : 'Editar ejercicio';
  await detail.locator('.record-detail-edit').press('Enter');
  const dialog = view(page, edit);
  await dialog.waitFor();
  await checkDate(dialog);
  const id = kind === 'meal' ? 'edit-meal-description' : 'edit-workout-activity';
  await field(dialog, id).fill(title + ' editado');
  await field(dialog, id).press('Shift+Tab');
  await page.keyboard.press('Tab');
  assert.ok(await field(dialog, id).evaluate(el => el.matches(':focus-visible')));
  await sample(dialog, 'edicion-' + kind);
  await shot('edicion-' + kind);
  await btn(dialog, 'Guardar cambios').press('Enter');
  const receipt = page.locator('.meal-saved');
  await receipt.waitFor();
  await btn(receipt, 'Cerrar confirmación').press('Enter');
  assert.ok(await page.locator('.daily-record-open').filter({ hasText: title + ' editado' }).count());
}

async function workout(page, sample, shot) {
  const { dialog } = await openDialog(page, 'Agregar ejercicio');
  await checkDate(dialog);
  assert.deepEqual(await dialog.locator('.entry-activity-chips button').allTextContents(), ['Gimnasio', 'Fútbol', 'Correr', 'Natación', 'Caminata']);
  const sport = btn(dialog, 'Correr');
  await sport.press('Enter');
  assert.equal(await sport.getAttribute('aria-pressed'), 'true');
  assert.ok(await sport.evaluate(el => el.matches(':focus-visible')));
  await sample(dialog, 'deporte-seleccionado');
  await shot('deporte-seleccionado');
  await field(dialog, 'add-workout-duration').fill('35');
  await field(dialog, 'add-workout-distance').fill('5.25');
  assert.equal(await field(dialog, 'add-workout-time').getAttribute('type'), 'time');
  await field(dialog, 'add-workout-time').fill('18:15');
  await field(dialog, 'add-workout-notes').fill('Intervalos\nTrotes cortos\nFinal');
  await btn(dialog, 'Estimar con IA').press('Enter');
  const result = dialog.locator('.entry-estimate-result');
  await result.waitFor();
  assert.match(await result.innerText(), /220 kcal/);
  await reach(result);
  await sample(dialog, 'estimacion-ejercicio');
  await btn(dialog, 'Guardar ejercicio').press('Enter');
  const receipt = page.getByRole('complementary', { name: 'Confirmación de ejercicio' });
  await receipt.waitFor();
  await btn(receipt, 'Cerrar confirmación').press('Enter');
}

export async function journey(page, {width, before, shot, repo, previous}) {
  const readings = [], guards = {}, keyboardChecks = [];
  const sample = async (dialog, stage) => { readings.push(await contrast(page, dialog, stage, before)); };
  const hasKeyboard = width < 768;
  if (hasKeyboard) await page.evaluate(keyboardFixture);
  await navigateCalendar(page, sample, shot);
  const { dialog, opener } = await openDialog(page, 'Agregar comida');
  await checkDate(dialog);
  await sample(dialog, 'comida');
  const name = field(dialog, 'add-meal-description');
  const draft = 'Uno\nDos\nTres\nCuatro\nCinco';
  await name.fill(draft);
  if (hasKeyboard) {
    await name.evaluate(el => el.setSelectionRange(4, 7));
    await keyboard(page, 'text', 23);
    await page.keyboard.insertText('Otro');
    await keyboard(page, 'text', 34);
    keyboardChecks.push(await verifyKeyboard(page, 'add-meal-description', 1));
    await shot('teclado-simulado');
    await page.setViewportSize({ width: 667, height: 375 });
    await keyboard(page, 'text', 7);
    assert.equal(await name.inputValue(), draft.replace('Dos', 'Otro'));
    assert.deepEqual(await name.evaluate(el => [el.selectionStart, el.selectionEnd]), [8, 8]);
    keyboardChecks.push(await verifyKeyboard(page, 'add-meal-description', 1));
    await page.setViewportSize({ width: 375, height: 812 });
    await keyboard(page, null);
  }
  // Background navigation and date selection stay inert while a draft is active.
  assert.ok(await page.locator('.app-main').evaluate(el => el.inert));
  guards.descarte = await endDraft(page, dialog, true);
  assert.equal(await name.inputValue(), hasKeyboard ? draft.replace('Dos', 'Otro') : draft);
  await prepareMeal(page, dialog, sample, shot, repo);
  if (hasKeyboard) {
    await field(dialog, 'add-meal-calories').focus();
    await keyboard(page, 'numeric', 26);
    keyboardChecks.push(await verifyKeyboard(page, 'add-meal-calories'));
  }
  await saveMeal(page, dialog, sample, shot, hasKeyboard);
  await editRecord(page, 'meal', 'Tostada sintética 2C', sample, shot, guards);

  // Validate distinct cancel and add entries using the already-loaded calendar day.
  const cancelled = (await openDialog(page, 'Agregar ejercicio')).dialog;
  await field(cancelled, 'add-workout-activity').fill('Ejercicio sintético descartado');
  await endDraft(page, cancelled);
  await workout(page, sample, shot);
  await editRecord(page, 'workout', 'Correr', sample, shot, guards);

  const weight = await openDialog(page, 'Editar peso');
  await checkDate(weight.dialog);
  guards.peso = await fingerprint(weight.dialog);
  await page.keyboard.press('Escape');
  await weight.dialog.waitFor({ state: 'hidden' });
  assert.ok(await focusIs(weight.opener));
  await reach(opener);
  const main = page.locator('.app-main');
  const initialScroll = await main.evaluate(el => el.scrollTop);
  await opener.press('Enter');
  await dialog.waitFor();
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(await main.evaluate(el => el.scrollTop), initialScroll);
  await go(page, 'Datos');
  await go(page, 'Inicio');
  assert.equal(await selected(page), date);
  assert.equal(await main.evaluate(el => el.scrollTop), initialScroll);
  if (previous) assert.deepEqual(guards, previous.guards, 'Cambió detalle, peso o confirmación de descarte');

  const synthetic = await page.evaluate(date => {
    const q = window.__homeQA, record = q.store.activeProfile.records[date];
    const meals = record.meals.filter(item => item.name.includes('Tostada sintética 2C'));
    const workouts = record.workouts.filter(item => item.activity.includes('Correr'));
    return { writes: q.writes.map(({date,status}) => [date,status]), estimateKinds: q.aiCalls.map(({estimateType, attachment}) => [estimateType, attachment?.kind || null]),
      meals: meals.map(({name,calories,time,type}) => ({name,calories,time,type})),
      workouts: workouts.map(({activity,duration,distance,calories,time}) => ({activity,duration,distance,calories,time})) };
  }, date);
  assert.deepEqual(synthetic.writes, ['failed', 'confirmed', 'confirmed', 'confirmed', 'confirmed'].map(status => [date, status]));
  assert.deepEqual(synthetic.estimateKinds, [['meal','image'], ['meal',null], ['workout',null]]);
  assert.equal(synthetic.meals.length, 1);
  assert.equal(synthetic.workouts.length, 1);
  assert.equal(synthetic.meals[0].calories, 480);
  assert.equal(synthetic.meals[0].time, '20:45');
  assert.equal(synthetic.workouts[0].distance, 5.25);
  if (previous) assert.deepEqual(synthetic, previous.synthetic);
  return { readings, guards, keyboardChecks, synthetic, initialScroll };
}
