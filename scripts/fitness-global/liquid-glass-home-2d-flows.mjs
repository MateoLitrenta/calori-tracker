import assert from 'node:assert/strict';
import { go } from './browser.mjs';
import { keyboard, keyboardFixture, settle, verifyKeyboard } from './liquid-glass-home-2c-flows.mjs';
import { contrast } from './liquid-glass-home-2c-contrast.mjs';

export const today = '2026-11-13';
export const earlier = '2026-11-12';
export const photoId = 'a-lunch';
export const mealId = 'a-breakfast';
export const workoutId = 'a-gym';
export const photo = 'qa-detalle-foto';
export const mealTitle = 'Tostada de centeno con tomate, hummus, hojas frescas y semillas crocantes para el almuerzo sintético';
export const workoutTitle = 'Entrenamiento de fuerza con intervalos y caminata de recuperación de una sesión larga';
const longNotes = 'Primera parte de una nota sintética de revisión. Segunda parte con términos técnicos y una palabra extra larga: ' +
  'SemillasCrocantes'.repeat(6) + '.\nÚltima línea, conservada en el registro.';
export const button = (scope, name) => scope.getByRole('button', { name, exact: true });
export const dialog = (page, title) => page.getByRole('dialog', {name: title, exact: true});
export const center = locator => locator.evaluate(el => el.scrollIntoView({ block: 'center', inline: 'nearest' }));
const focus = locator => locator.evaluate(el => el === document.activeElement);

export async function seed(page) {
  await page.evaluate(({ today, photoId, workoutId, photo, mealTitle, workoutTitle, longNotes }) => {
    const qa = window.__homeQA;
    const records = structuredClone(qa.store.activeProfile.records);
    const row = records[today];
    Object.assign(row.meals.find(item => item.id === photoId), { name: mealTitle, details: longNotes, photo_path: photo });
    Object.assign(row.workouts.find(item => item.id === workoutId), { activity: workoutTitle, details: longNotes, distance: 5.25, pace: '6:20' });
    qa.files.set(photo, '/brand/calori-logo-symbol.png');
    qa.setProfile({ records });
  }, { today, photoId, workoutId, photo, mealTitle, workoutTitle, longNotes });
  await settle(page);
}

export async function openRecord(page, id) {
  const opener = page.locator('.daily-record-open[data-entry-id="' + id + '"]');
  await center(opener);
  await opener.press('Enter');
  const window = dialog(page, 'Detalle del registro');
  await window.waitFor();
  await settle(page);
  return { opener, window };
}

export async function openForm(page, title, action = title) {
  const opener = button(page, action);
  await center(opener);
  await opener.press('Enter');
  const window = dialog(page, title);
  await window.waitFor();
  await settle(page);
  return { opener, window };
}

export async function closeWithEscape(page, window, opener) {
  await page.keyboard.press('Escape');
  await window.waitFor({ state: 'hidden' });
  await settle(page);
  assert.ok(await focus(opener));
}

export function fingerprint(root, selectors) {
  return root.locator(selectors).evaluateAll(elements => elements.map(el => {
    const s = getComputedStyle(el), b = el.getBoundingClientRect();
    return [el.tagName, el.getAttribute('role'), b.width, b.height, s.backgroundColor, s.backgroundImage,
      s.color, s.borderRadius, s.boxShadow, s.font, s.padding, el.textContent.replace(/\s+/g, ' ').trim()];
  }));
}

const detailAppearance = '.entry-sheet-header h3, .entry-sheet-header button, .entry-date-context, .record-detail-main, .record-detail-content p, .record-detail-content span, .record-detail-content small, .record-detail-content dd, .record-detail-content dt, .record-detail-details, .record-detail-actions button';
const confirmationAppearance = 'h2, p, strong, span, button';
const receiptAppearance = 'strong, span, button';
const formAppearance = '.entry-sheet-header, .entry-form, .entry-form-content, .entry-form-footer, input:not([type=file]), textarea, select, .entry-save, .entry-ai-action';
const pickDay = async (page, day) => {
  const control = page.locator('.home-week-days [data-day="' + day + '"]');
  await center(control);
  await control.press('Enter');
  assert.equal(await page.locator('.home-date-context time').getAttribute('datetime'), day);
  await settle(page);
};
const allWrites = page => page.evaluate(() => window.__homeQA.writes.map(entry => ({ date: entry.date, status: entry.status })));
const getWeight = page => page.evaluate(() => ({
  base: window.__homeQA.store.activeProfile.weight,
  today: window.__homeQA.store.activeProfile.records[window.__homeQA.today].weight,
}));
const setFailure = (page, failed) => page.evaluate(failed => { window.__homeQA.failed = failed; }, failed);

async function holdNextWrite(page) {
  await page.evaluate(() => {
    const qa = window.__homeQA, original = qa.store.updateRecord;
    qa.failed = false;
    qa.pendingSubmitted = 0;
    qa.store = { ...qa.store, updateRecord: (...args) => new Promise(resolve => {
      qa.pendingSubmitted += 1;
      qa.releaseWrite = () => resolve(original(...args));
    }) };
    qa.notify();
  });
  await settle(page);
}
const releaseWrite = page => page.evaluate(() => { void window.__homeQA.releaseWrite(); });
const pending = page => page.evaluate(() => window.__homeQA.pendingSubmitted);

async function checkReceipt(page, receipt, width, transientError) {
  await receipt.waitFor();
  await settle(page);
  const measure = () => receipt.evaluate(el => {
    const panel = el.getBoundingClientRect();
    const nav = document.querySelector('.bottom-nav-track').getBoundingClientRect();
    const get = button => {
      const r = button.getBoundingClientRect();
      const hit = document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
      return { w:r.width, h:r.height, hit:button.contains(hit), cover:button.contains(hit) ? null : hit?.textContent.trim().slice(0, 170) };
    };
    return { gap: nav.height ? nav.top-panel.bottom : null, bounds:[panel.x,panel.y,panel.width,panel.height],
      layer: Number(getComputedStyle(el).zIndex),
      controls:[...el.querySelectorAll('button')].map(get) };
  });
  const initial = await measure();
  const passing = values => values.controls.every(control => control.hit && control.w >= 43.9 && control.h >= 43.9);
  const priorErrorVisible = !!(transientError && await transientError.isVisible());
  const overlap = !passing(initial) && priorErrorVisible ? initial.controls : null;
  if (overlap) await transientError.waitFor({state:'hidden'});
  const stable = overlap ? await measure() : initial;
  assert.ok(passing(stable), JSON.stringify(stable));
  if (width < 768) assert.ok(stable.gap >= 0, JSON.stringify(stable));
  return { ...stable, overlap, priorErrorVisible };
}

async function profileGuard(page) {
  await go(page, 'Perfil');
  const profile = page.locator('.profile-view');
  const initial = await fingerprint(profile, '.profile-personal-panel, .profile-fact-weight, .profile-weight-value');
  const edit = button(profile, 'Editar perfil');
  await center(edit);
  await edit.press('Enter');
  await profile.getByLabel('Nombre', {exact: true}).fill('Nombre sintético sin guardar');
  await button(profile, 'Cancelar').press('Enter');
  const discard = page.locator('dialog[data-discard-draft][open]');
  await discard.waitFor();
  assert.notEqual(await discard.getAttribute('data-draft-context'), 'home');
  const actual = await fingerprint(page, 'dialog[data-discard-draft], dialog[data-discard-draft] h2, dialog[data-discard-draft] button');
  await button(discard, 'Descartar cambios').press('Enter');
  await discard.waitFor({state:'hidden'});
  await go(page, 'Inicio');
  return { initial, discard: actual };
}

async function verifyDiscard(page, sample, shot) {
  const meal = await openForm(page, 'Agregar comida');
  const field = meal.window.locator('#add-meal-description');
  const notes = 'Borrador sintético en revisión\nOtra línea editable';
  await field.fill(notes);
  await field.evaluate(el => el.setSelectionRange(8, 17));
  const content = meal.window.locator('.entry-form-content');
  const before = await content.evaluate(el => el.scrollTop);
  await page.keyboard.press('Escape');
  const confirm = page.locator('dialog[data-discard-draft][open]');
  await confirm.waitFor();
  const keep = button(confirm, 'Seguir editando');
  assert.ok(await focus(keep));
  await sample(confirm, 'descarte', confirmationAppearance, 'dialog[data-discard-draft][open]');
  await shot('descarte-foco');
  await keep.press('Enter');
  await confirm.waitFor({ state:'hidden' });
  await settle(page);
  assert.equal(await field.inputValue(), notes);
  assert.deepEqual(await field.evaluate(el => [el.selectionStart, el.selectionEnd]), [8, 17]);
  assert.ok(await focus(field));
  assert.equal(await content.evaluate(el => el.scrollTop), before);
  await page.keyboard.press('Escape');
  await button(confirm, 'Descartar cambios').press('Enter');
  await meal.window.waitFor({ state:'hidden' });
  assert.ok(await focus(meal.opener));
  await meal.opener.press('Enter');
  await meal.window.waitFor();
  assert.equal(await field.inputValue(), '');
  await closeWithEscape(page, meal.window, meal.opener);
  assert.equal((await allWrites(page)).length, 0);
  return { caret: [8, 17], restoredScroll: before, persisted: false };
}

async function editRecord(page, {id, formTitle, fieldId, revised, title, kind, width, before, sample, shot}) {
  const item = await openRecord(page, id);
  assert.match(await item.window.locator('.record-detail-main').innerText(), title);
  await button(item.window, 'Editar').press('Enter');
  const form = dialog(page, formTitle);
  await form.waitFor();
  const guard = await fingerprint(form, formAppearance);
  const name = form.locator(fieldId);
  await name.fill(revised);
  const save = button(form, 'Guardar cambios');
  const receipt = page.getByRole('complementary', {name: kind === 'meal' ? 'Confirmación de comida' : 'Confirmación de ejercicio'});
  let transientError;
  await setFailure(page, true);
  await save.press('Enter');
  if (kind === 'meal') {
    const error = form.locator('.meal-write-error');
    await error.waitFor();
    assert.equal(await name.inputValue(), revised);
    await center(error);
    await sample(form, 'error-comida', '.entry-sheet-header h3, .meal-write-error, .entry-form-footer button, input, textarea', '[aria-modal="true"]');
    await shot('error-comida');
  } else {
    transientError = page.getByText(/No se pudo confirmar el ejercicio/);
    await transientError.waitFor();
    assert.equal(await name.inputValue(), revised);
    await sample(transientError, 'error-ejercicio', 'div, p, span', '[role="status"]');
    await shot('error-ejercicio');
  }
  await holdNextWrite(page);
  await save.press('Enter');
  const saving = button(form, 'Guardando…');
  await saving.waitFor();
  assert.ok(await saving.isDisabled());
  assert.equal(await receipt.count(), 0);
  await form.locator('form').evaluate(el => el.requestSubmit());
  assert.equal(await pending(page), 1);
  await releaseWrite(page);
  const geometry = await checkReceipt(page, receipt, width, transientError);
  if (!before) assert.equal(geometry.overlap, null, 'El recibo recibe clic incluso con un aviso de error previo visible');
  const close = button(receipt, 'Cerrar confirmación');
  const reveal = button(receipt, 'Ver registro');
  assert.ok(await close.isEnabled() && await reveal.isEnabled());
  await sample(receipt, 'recibo-' + kind, receiptAppearance, '.meal-saved');
  await shot('recibo-' + kind);
  if (kind === 'meal') {
    await reveal.press('Enter');
    await page.waitForFunction(id => document.activeElement?.dataset.entryId === id, id);
    assert.match(await item.opener.innerText(), new RegExp(revised));
  } else {
    if (!before && geometry.priorErrorVisible) {
      const calendar = await openForm(page, 'Elegir fecha', 'Abrir calendario mensual');
      geometry.layerWhileModal = await page.locator('.meal-saved').evaluate(el => Number(getComputedStyle(el).zIndex));
      const backgroundBlocked = await page.locator('.app-main').evaluate(el => el.inert || el.style.overflowY === 'hidden');
      assert.ok(backgroundBlocked && geometry.layerWhileModal < geometry.layer);
      const headerClose = button(calendar.window, 'Cerrar calendario');
      assert.ok(await headerClose.evaluate(el => {
        const r = el.getBoundingClientRect();
        return el.contains(document.elementFromPoint(r.left+r.width/2, r.top+r.height/2));
      }));
      await closeWithEscape(page, calendar.window, calendar.opener);
    }
    await close.press('Enter');
    await receipt.waitFor({state:'hidden'});
  }
  assert.equal(await receipt.count(), 0);
  return { guard, geometry };
}

async function deletePhotoMeal(page, sample, shot) {
  const { opener, window } = await openRecord(page, photoId);
  const action = button(window, 'Eliminar');
  const confirmation = page.locator('dialog[data-record-delete][open]');
  const initial = await allWrites(page);
  const cancel = button(confirmation, 'Cancelar');
  const confirm = button(confirmation, 'Eliminar');
  await action.press('Enter');
  await confirmation.waitFor();
  assert.ok(await focus(cancel));
  assert.match(await confirmation.innerText(), /centeno con tomate/);
  assert.deepEqual(await allWrites(page), initial);
  await page.keyboard.press('Tab');
  assert.ok(await focus(confirm));
  await page.keyboard.press('Escape');
  await confirmation.waitFor({state:'hidden'});
  await settle(page);
  assert.ok(await focus(action));
  assert.deepEqual(await allWrites(page), initial);

  await action.press('Enter');
  await confirmation.waitFor();
  await setFailure(page, true);
  await confirm.press('Enter');
  const error = confirmation.getByRole('alert');
  await error.waitFor();
  assert.match(await error.innerText(), /Intentá nuevamente/);
  const retained = await page.evaluate(id => window.__homeQA.store.activeProfile.records[window.__homeQA.today].meals.some(item => item.id===id), photoId);
  assert.ok(retained);
  await sample(confirmation, 'error-eliminar', confirmationAppearance, 'dialog[data-record-delete][open]');
  await shot('error-eliminar');
  await holdNextWrite(page);
  await confirm.press('Enter');
  await confirmation.getByText('Eliminando…', {exact:true}).waitFor();
  assert.ok(await confirm.isDisabled() && await cancel.isDisabled());
  await confirm.evaluate(el => el.click());
  await page.keyboard.press('Escape');
  assert.equal(await confirmation.count(), 1);
  assert.equal(await pending(page), 1);
  await sample(confirmation, 'eliminando', confirmationAppearance, 'dialog[data-record-delete][open]');
  await shot('eliminando');
  await releaseWrite(page);
  await confirmation.waitFor({state:'hidden'});
  await window.waitFor({state:'hidden'});
  assert.equal(await opener.count(), 0);
  const notice = page.locator('.record-delete-notice');
  await notice.waitFor();
  assert.match(await notice.innerText(), /Comida eliminada/);
  await page.waitForFunction(() => document.activeElement?.id === 'fitness-daily-entries');
  await center(notice);
  await sample(notice, 'eliminado', 'p', '.record-delete-notice');
  await shot('eliminado');
  const attempts = (await allWrites(page)).slice(initial.length);
  assert.deepEqual(attempts, [{date:today,status:'failed'}, {date:today,status:'confirmed'}]);
  return { initialFocus:'Cancelar', returnedFocus:'Registros del día', attempts };
}

async function weightJourney(page, hasKeyboard, sample, shot) {
  await pickDay(page, '2026-11-11');
  const newWeight = await openForm(page, 'Registrar peso');
  assert.equal(await newWeight.window.locator('.entry-date-context time').getAttribute('datetime'), '2026-11-11');
  await closeWithEscape(page, newWeight.window, newWeight.opener);
  await pickDay(page, earlier);
  const historical = await page.locator('.energy-card').innerText();
  await pickDay(page, today);
  const prior = await getWeight(page);
  const initialEnergy = await page.locator('.energy-card').innerText();

  const existing = await openForm(page, 'Editar peso');
  const input = existing.window.locator('input[name=weight]');
  const id = await input.getAttribute('id');
  assert.equal(await input.getAttribute('inputmode'), 'decimal');
  assert.equal(await existing.window.locator('.entry-date-context time').getAttribute('datetime'), today);
  await input.fill('74,3');
  assert.equal(await input.inputValue(), '74.3');
  const geometry = [];
  if (hasKeyboard) {
    await input.evaluate(el=>el.setSelectionRange(3,4));
    await keyboard(page, 'numeric', 23);
    await page.keyboard.insertText('6');
    geometry.push(await verifyKeyboard(page, id));
    await shot('peso-teclado-simulado');
    await page.setViewportSize({width:667,height:375});
    await keyboard(page, 'numeric', 7);
    assert.deepEqual(await input.evaluate(el => [el.selectionStart,el.selectionEnd]), [4,4]);
    geometry.push(await verifyKeyboard(page, id));
    await page.setViewportSize({width:375,height:812});
    await keyboard(page, null);
    assert.equal(await input.inputValue(), '74.6');
  } else {
    await input.fill('74.6');
  }
  await setFailure(page, true);
  await button(existing.window, 'Guardar peso').click();
  const error = page.getByText(/No se pudo confirmar el peso/);
  await error.waitFor();
  assert.equal(await input.inputValue(), '74.6');
  assert.deepEqual(await getWeight(page), prior);
  await sample(error, 'error-peso', 'div, p, span', '[role="status"]');
  await shot('error-peso');
  await holdNextWrite(page);
  if (hasKeyboard) {
    await input.focus();
    await keyboard(page, 'numeric', 31);
    geometry.push(await verifyKeyboard(page, id));
  }
  await button(existing.window, 'Guardar peso').click();
  await button(existing.window, 'Guardando…').waitFor();
  assert.ok(await button(existing.window, 'Guardando…').isDisabled());
  await existing.window.locator('form').evaluate(el => el.requestSubmit());
  assert.equal(await pending(page), 1);
  if (hasKeyboard) await keyboard(page, null);
  await shot('peso-guardando');
  await releaseWrite(page);
  await existing.window.waitFor({state:'hidden'});
  const updated = await getWeight(page);
  assert.deepEqual(updated, {base:prior.base, today:74.6});
  await settle(page);
  assert.ok(await focus(existing.opener));
  assert.notEqual(await page.locator('.energy-card').innerText(), initialEnergy);
  await pickDay(page, earlier);
  assert.equal(await page.locator('.energy-card').innerText(), historical);
  await go(page, 'Perfil');
  const weight = page.locator('.profile-fact-weight');
  assert.match(await weight.locator('.profile-weight-value').innerText(), /74,6 kg/);
  assert.equal(await weight.locator('time').getAttribute('datetime'), today);
  await shot('peso-en-perfil');
  await go(page, 'Inicio');
  assert.equal(await page.locator('.home-date-context time').getAttribute('datetime'), earlier);
  return { prior, updated, historical, geometry };
}

export async function journey(page, {width, before, shot, previous}) {
  const contrasts = [];
  const sample = async (root, stage, targets, scope) => contrasts.push(await contrast(page, root, stage, before, {targets, scope}));
  const hasKeyboard = width < 768;
  if (hasKeyboard) await page.evaluate(keyboardFixture);
  const profile = await profileGuard(page);
  const calendar = await openForm(page, 'Elegir fecha', 'Abrir calendario mensual');
  const guardCalendar = await fingerprint(calendar.window, '.entry-sheet-header, .home-month-heading, .home-month-grid, .home-calendar-footer');
  await closeWithEscape(page, calendar.window, calendar.opener);

  const main = page.locator('.app-main');
  const row = await openRecord(page, photoId);
  const scroll = await main.evaluate(el=>el.scrollTop);
  assert.match(await row.window.locator('.record-detail-main').innerText(), /hummus/);
  assert.match((await row.window.innerText()).replace(/\s+/g, ' '), /\+650 kcal/);
  if (!before) {
    await row.window.locator('.record-detail-content img').evaluate(async el => {
      if (el.decode) await el.decode();
      if (!el.naturalWidth) throw Error('La foto no se cargó');
    });
  }
  await sample(row.window, 'detalle-foto', detailAppearance, '[aria-modal="true"]');
  await shot('detalle-foto-enfocado');
  const notes = row.window.locator('.record-detail-details');
  await center(notes);
  await sample(row.window, 'detalle-notas', detailAppearance, '[aria-modal="true"]');
  await closeWithEscape(page, row.window, row.opener);
  assert.equal(await main.evaluate(el=>el.scrollTop), scroll);
  const discard = await verifyDiscard(page, sample, shot);
  const meal = await editRecord(page, {id:mealId, formTitle:'Editar comida', fieldId:'#edit-meal-description', revised:'Yogur sintético ajustado', title:/Yogur, fruta/, kind:'meal', width, before, sample, shot});
  const workout = await editRecord(page, {id:workoutId, formTitle:'Editar ejercicio', fieldId:'#edit-workout-activity', revised:'Ejercicio sintético ajustado', title:/Entrenamiento de fuerza/, kind:'workout', width, before, sample, shot});
  const exercise = await openRecord(page, workoutId);
  const values = (await exercise.window.innerText()).replace(/\s+/g, ' ');
  assert.match(values, /(?:-|−)250 kcal/);
  assert.match(values, /5[.,]25 km/);
  assert.match(values, /6:20/);
  await sample(exercise.window, 'detalle-ejercicio', detailAppearance, '[aria-modal="true"]');
  const deleteExercise = button(exercise.window, 'Eliminar');
  await deleteExercise.press('Enter');
  const confirmExercise = dialog(page, '¿Eliminar ejercicio?');
  assert.match(await confirmExercise.innerText(), /Ejercicio sintético ajustado/);
  await button(confirmExercise, 'Cancelar').press('Enter');
  await confirmExercise.waitFor({state:'hidden'});
  await settle(page);
  assert.ok(await focus(deleteExercise));
  await closeWithEscape(page, exercise.window, exercise.opener);
  const deletion = await deletePhotoMeal(page, sample, shot);
  const weight = await weightJourney(page, hasKeyboard, sample, shot);
  const writes = await allWrites(page);
  assert.deepEqual(writes, ['failed','confirmed','failed','confirmed','failed','confirmed','failed','confirmed'].map(status=>({date:today,status})));
  const scope = {profile, calendar:guardCalendar, meal:meal.guard, exercise:workout.guard};
  if (previous) assert.deepEqual(scope, previous.scope, 'Cambió una superficie fuera de 2D');
  return {contrasts, scope, discard, deletion, weight, receipts:{meal:meal.geometry, exercise:workout.geometry}, writes};
}
