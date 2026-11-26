import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { before, go, origin, repo } from './browser.mjs';
import { simulateViewport } from './coach-qa-viewport.mjs';

const engine = process.argv.includes('--webkit') ? 'webkit' : 'chromium';
const modulePath = process.env.PLAYWRIGHT_MODULE || path.resolve(repo, '../qa-tools/node_modules/playwright/index.mjs');
const playwright = await import(pathToFileURL(modulePath));
const browser = await playwright[engine].launch(engine === 'chromium' ? { channel: process.env.QA_BROWSER_CHANNEL || 'chrome' } : {});
const output = path.join(repo, 'docs/evidence/liquid-glass-navigation', before ? 'before' : 'after');
await mkdir(output, { recursive: true });

const portrait = { width: 375, height: 667 };
const keyboard = { reduction: 265, offsetTop: 12, keyboard: true };
const navigation = '.app-bottom-nav:visible, .app-sidebar:visible nav';
const button = (root, name) => root.getByRole('button', { name, exact: true });
const editor = page => page.getByRole('textbox', { name: 'Mensaje para Coach' });
const proposal = page => page.getByRole('region', { name: 'Propuesta de registros para revisar' });
const log = page => page.locator('.chat-messages');
const setReader = (page, top) => log(page).evaluate((el, value) => { el.scrollTop = value; }, top);
const getReader = page => log(page).evaluate(el => el.scrollTop);
const viewport = (page, options) => page.evaluate(value => window.simulateCoachViewport(value), options);
const frames = page => page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));

async function readNavigation(page, expected) {
  const nav = page.locator(navigation);
  await nav.waitFor();
  await frames(page);
  const state = await nav.evaluate(el => {
    const current = [...el.querySelectorAll('[aria-current="page"]')];
    const marker = el.querySelector('.bottom-nav-indicator, .sidebar-nav-indicator');
    return {
      current: current.map(item => item.textContent.trim()),
      mark: marker && [marker.offsetWidth, marker.offsetHeight, getComputedStyle(marker).transform],
      markerInteractive: marker && getComputedStyle(marker).pointerEvents !== 'none',
    };
  });
  assert.deepEqual(state.current, [expected]);
  assert.ok(state.mark?.[0] >= 44);
  assert.equal(state.markerInteractive, false);
  return state;
}

async function keyboardState(page, subject, owner) {
  await frames(page);
  const geometry = await subject.evaluate(element => {
    const shell = document.querySelector('.app-shell-coach');
    const reader = document.querySelector('.chat-messages').getBoundingClientRect();
    const field = element.getBoundingClientRect();
    const position = element.matches('textarea') ? [element.selectionStart, element.selectionEnd] : null;
    return {
      focus: document.activeElement === element,
      caret: position,
      field: [field.top, field.bottom],
      reader: [reader.top, reader.bottom],
      visible: [visualViewport.offsetTop, visualViewport.offsetTop + visualViewport.height],
      keyboard: shell.dataset.coachKeyboard,
      owner: shell.dataset.coachKeyboardOwner,
      navPadding: parseFloat(getComputedStyle(shell.querySelector('.app-main')).paddingBottom),
      width: innerWidth,
    };
  });
  assert.equal(geometry.keyboard, 'open', JSON.stringify(geometry));
  assert.equal(geometry.owner, owner);
  assert.equal(geometry.focus, true);
  assert.equal(geometry.navPadding, 0);
  await page.locator('.app-bottom-nav').waitFor({ state: 'hidden' });
  const area = owner === 'proposal' ? geometry.reader : geometry.visible;
  assert.ok(geometry.field[0] >= area[0] - 2 && geometry.field[1] <= area[1] + 2, JSON.stringify(geometry));
  return geometry;
}

async function assertTappable(element) {
  assert.ok(await element.evaluate(el => {
    const bounds = el.getBoundingClientRect();
    const hit = document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    return bounds.bottom <= visualViewport.height + visualViewport.offsetTop + 1 && el.contains(hit);
  }), 'Enviar debe poder tocarse por encima del teclado');
}

async function mockProposal(page, type) {
  const count = await page.evaluate(kind => {
    const qa = window.__homeQA;
    const common = { dateStr: qa.today, calories: 210, time: '16:20', details: 'Datos sintéticos' };
    const action = kind === 'meal'
      ? { type: 'add_meal', estimated: true, payload: { ...common, name: 'Yogur y melón', type: 'Merienda' } }
      : { type: 'add_workout', estimated: true, payload: { ...common, activity: 'Remo sintético', duration: 30 } };
    qa.nextAI = { reply: 'Revisá la propuesta sintética.', actions: [action], presentation: 'none' };
    return qa.aiCalls.length;
  }, type);
  return count;
}

async function run(theme) {
  const context = await browser.newContext({
    viewport: portrait, isMobile: true, hasTouch: true, colorScheme: theme, reducedMotion: 'reduce',
    locale: 'es-AR', timezoneId: 'America/Buenos_Aires',
  });
  const errors = [];
  const shots = [];
  await context.route('**/*', route => {
    const target = new URL(route.request().url());
    if (target.origin === origin) return route.continue();
    errors.push('Origen externo bloqueado: ' + target.hostname);
    return route.abort();
  });
  await context.addInitScript(simulateViewport);
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  const shot = async name => {
    if (engine !== 'chromium') return;
    const file = 'coach-' + name + '-' + theme + '.jpg';
    await page.screenshot({ path: path.join(output, file), quality: 87 });
    shots.push(file);
  };
  try {
    await page.goto(origin + '/qa?controls=0&theme=' + theme, { waitUntil: 'commit', timeout: 90000 });
    await page.locator('.home-variants').waitFor({ timeout: 90000 });
    await page.evaluate(() => {
      window.simulateCoachViewport();
      const { today, store } = window.__homeQA;
      const history = Array.from({ length: 14 }, (_, index) => ({
        id: 'glass-' + index, role: index % 2 === 0 ? 'user' : 'bot',
        text: index % 2 === 0 ? 'Consulta de prueba sobre mis registros.'
          : 'Respuesta sintética sobre los registros y el balance del día. '.repeat(12),
      }));
      localStorage.setItem('calori:assistant:messages:' + store.user.id + ':' + today, JSON.stringify(history));
    });

    const nav = page.locator(navigation);
    await button(nav, 'Inicio').focus();
    await page.keyboard.press('Tab');
    assert.ok(await button(nav, 'Coach').evaluate(el => el === document.activeElement && el.matches(':focus-visible')));
    await readNavigation(page, 'Inicio');
    await page.keyboard.press('Enter');
    await editor(page).waitFor();
    await readNavigation(page, 'Coach');

    await setReader(page, 240);
    await frames(page);
    await go(page, 'Inicio');
    await go(page, 'Coach');
    await page.waitForFunction(() => Math.abs(document.querySelector('.chat-messages').scrollTop - 240) <= 2);
    await shot('conversacion-375');
    if (engine === 'chromium') {
      await page.setViewportSize({ width: 1440, height: 900 });
      await viewport(page);
      await readNavigation(page, 'Coach');
      await setReader(page, 240);
      await shot('conversacion-1440');
      await page.setViewportSize(portrait);
      await viewport(page);
    }

    const draft = 'Consulta desde la fixture\nSegunda línea\nÚltima línea';
    await editor(page).fill(draft);
    await editor(page).evaluate(el => el.setSelectionRange(el.value.length, el.value.length));
    await setReader(page, 240);
    await viewport(page, keyboard);
    const composer = [await keyboardState(page, editor(page), 'composer')];
    await shot('teclado-375');
    for (const [width, height, reduction] of [[667, 375, 185], [768, 450, 235], [767, 450, 235], [375, 667, 265]]) {
      await page.setViewportSize({ width, height });
      await viewport(page, { reduction, keyboard: true });
      composer.push(await keyboardState(page, editor(page), 'composer'));
      assert.equal(await editor(page).inputValue(), draft);
      assert.deepEqual(composer.at(-1).caret, [draft.length, draft.length]);
      assert.ok(Math.abs(await getReader(page) - 240) <= 2, 'Girar no lleva al final del chat');
      await assertTappable(button(page, 'Enviar mensaje'));
    }
    await viewport(page);
    await readNavigation(page, 'Coach');
    assert.deepEqual(await editor(page).inputValue(), draft);
    assert.ok(await editor(page).evaluate(el => el === document.activeElement));
    await viewport(page, keyboard);
    const initialCalls = await mockProposal(page, 'meal');
    await assertTappable(button(page, 'Enviar mensaje'));
    await button(page, 'Enviar mensaje').tap();
    await proposal(page).waitFor();
    assert.equal(await page.evaluate(() => window.__homeQA.aiCalls.length), initialCalls + 1);
    await viewport(page);
    await readNavigation(page, 'Coach');

    await button(proposal(page), 'Editar').tap();
    const mealCalories = proposal(page).getByLabel('Calorías (kcal)');
    await mealCalories.fill('235');
    await viewport(page, keyboard);
    const mealGeometry = await keyboardState(page, mealCalories, 'proposal');
    await shot('propuesta-375');
    for (const width of [768, 767, 375]) {
      const rotated = width !== 375;
      await page.setViewportSize({ width, height: rotated ? 450 : portrait.height });
      await viewport(page, rotated ? { reduction: 190, keyboard: true } : keyboard);
      await keyboardState(page, mealCalories, 'proposal');
      assert.equal(await mealCalories.inputValue(), '235');
    }
    await viewport(page);
    await readNavigation(page, 'Coach');
    for (const tab of ['Inicio', 'Datos', 'Perfil', 'Coach']) {
      await go(page, tab);
      await readNavigation(page, tab);
    }
    assert.equal(await mealCalories.inputValue(), '235');
    assert.equal(await page.evaluate(() => window.__homeQA.writes.length), 0);
    await button(proposal(page), 'Confirmar').tap();
    const receipt = page.locator('.chat-saved').getByText('Guardado confirmado', { exact: true });
    await receipt.waitFor();
    await go(page, 'Inicio');
    await go(page, 'Coach');
    assert.equal(await receipt.count(), 1);
    await proposal(page).waitFor({ state: 'hidden' });
    const saved = await page.evaluate(() => {
      const qa = window.__homeQA;
      return { count: qa.writes.length, meal: qa.store.activeProfile.records[qa.today].meals.find(item => item.name === 'Yogur y melón') };
    });
    assert.equal(saved.count, 1);
    assert.equal(saved.meal?.calories, 235);

    await mockProposal(page, 'workout');
    await editor(page).fill('Anotá un ejercicio de prueba.');
    await button(page, 'Enviar mensaje').tap();
    await button(proposal(page), 'Editar').tap();
    const exerciseDetails = proposal(page).locator('.chat-proposal-edit textarea');
    const details = 'Primera serie\nSegunda serie';
    await exerciseDetails.fill(details);
    await exerciseDetails.evaluate(el => el.setSelectionRange(4, 8));
    await viewport(page, keyboard);
    const exerciseGeometry = await keyboardState(page, exerciseDetails, 'proposal');
    assert.deepEqual(exerciseGeometry.caret, [4, 8]);
    await shot('propuesta-ejercicio-375');
    await viewport(page);
    await readNavigation(page, 'Coach');
    await go(page, 'Datos');
    await go(page, 'Coach');
    assert.equal(await exerciseDetails.inputValue(), details);
    await button(proposal(page), 'Cancelar').tap();
    await proposal(page).waitFor({ state: 'hidden' });
    assert.equal(await receipt.count(), 1);

    await go(page, 'Perfil');
    await button(page, 'Editar perfil').click();
    const name = page.locator('.profile-view').getByLabel('Nombre', { exact: true });
    await name.fill('Perfil sintético con borrador');
    const profileMarker = await readNavigation(page, 'Perfil');
    await button(nav, 'Inicio').click();
    const discard = page.getByRole('dialog', { name: '¿Descartar los cambios?' });
    await discard.waitFor();
    const blockedMarker = await readNavigation(page, 'Perfil');
    assert.deepEqual(blockedMarker, profileMarker, 'El indicador no anticipa la navegación pendiente');
    await button(discard, 'Seguir editando').click();
    await discard.waitFor({ state: 'hidden' });
    assert.equal(await name.inputValue(), 'Perfil sintético con borrador');
    assert.deepEqual(await readNavigation(page, 'Perfil'), profileMarker);
    await button(nav, 'Inicio').click();
    await button(discard, 'Descartar cambios').click();
    const homeMarker = await readNavigation(page, 'Inicio');
    assert.notDeepEqual(homeMarker.mark, profileMarker.mark);

    for (const [label, selector] of [['Agregar comida', '#add-meal-description'], ['Agregar ejercicio', '#add-workout-activity']]) {
      const opener = button(page, label);
      await opener.focus();
      await page.keyboard.press('Enter');
      const field = page.locator(selector);
      await field.focus();
      await viewport(page, keyboard);
      await frames(page);
      assert.ok(await page.locator('.app-bottom-nav').evaluate(el => el.inert && getComputedStyle(el).opacity === '0'));
      assert.ok(await field.evaluate(el => el === document.activeElement));
      await viewport(page);
      await page.keyboard.press('Escape');
      await field.waitFor({ state: 'hidden' });
      assert.ok(await opener.evaluate(el => el === document.activeElement));
      await readNavigation(page, 'Inicio');
    }

    assert.deepEqual(await page.evaluate(() => {
      const qa = window.__homeQA;
      return [qa.aiCalls.length, qa.writes.length, qa.profileWrites.length, qa.externalRequests];
    }), [2, 1, 0, 0]);
    assert.deepEqual(errors, []);
    return { theme, composer, mealGeometry, exerciseGeometry, shots, explicitWrites: saved.count,
      readingPosition: 240, rejectedNavigation: 'Perfil', confirmedNavigation: 'Inicio' };
  } catch (error) {
    if (errors.length) console.error(errors);
    throw error;
  } finally {
    await context.close();
  }
}

try {
  const report = { engine, browserVersion: browser.version(), origin, syntheticViewport: true, states: [] };
  for (const theme of ['light', 'dark']) {
    report.states.push(await run(theme));
    console.log(engine + ' ' + (before ? 'before ' : 'after ') + theme + ': Coach, propuestas, navegación y formularios OK');
  }
  await writeFile(path.join(output, 'coach-' + engine + '-funcional.json'), JSON.stringify(report, null, 2) + '\n');
} finally {
  await browser.close();
}
