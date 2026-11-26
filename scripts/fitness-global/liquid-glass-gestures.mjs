import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rmdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { go, origin, repo } from './browser.mjs';

const engine = process.argv.includes('--webkit') ? 'webkit' : 'chromium';
const videoOnly = process.argv.includes('--video');
const modulePath = process.env.PLAYWRIGHT_MODULE || path.resolve(repo, '../qa-tools/node_modules/playwright/index.mjs');
const playwright = await import(pathToFileURL(modulePath));
const browser = await playwright[engine].launch(engine === 'chromium' ? { channel: process.env.QA_BROWSER_CHANNEL || 'chrome' } : {});
const output = path.join(repo, 'docs/evidence/liquid-glass-navigation/iteracion-2');
await mkdir(output, { recursive: true });

const navigation = '.app-bottom-nav:visible, .app-sidebar:visible nav';
const marker = '.bottom-nav-indicator, .sidebar-nav-indicator';
const active = 'button[aria-current="page"]';
const initial = { width: 390, height: 844 };
const nav = page => page.locator(navigation);
const button = (page, name) => nav(page).getByRole('button', { name, exact: true });
const keyframe = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const side = (n, m) => Math.abs(n - m) <= 1.5;

async function mount({ viewport = initial, theme = 'dark', touch = false, recordVideo } = {}) {
  const context = await browser.newContext({
    viewport, hasTouch: touch, isMobile: touch, colorScheme: theme, reducedMotion: 'no-preference',
    locale: 'es-AR', timezoneId: 'America/Buenos_Aires', recordVideo,
  });
  const errors = [];
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === origin) return route.continue();
    errors.push('Petición externa bloqueada: ' + url.origin);
    return route.abort();
  });
  await context.addInitScript(() => {
    window.__gestureQA = { captured: null, pointerType: null, lost: 0, cancelled: 0, events: [] };
    for (const phase of ['pointerdown', 'gotpointercapture', 'pointerup', 'pointercancel', 'lostpointercapture', 'click']) {
      document.addEventListener(phase, event => {
        const last = window.__gestureQA.events;
        last.push([phase, event.target.closest('button')?.textContent.trim(), event.detail, event.pointerType]);
        if (last.length > 16) last.shift();
      }, true);
    }
    document.addEventListener('pointerdown', event => {
      if (event.target.closest('.app-bottom-nav')) window.__gestureQA.pointerType = event.pointerType;
    }, true);
    document.addEventListener('gotpointercapture', event => {
      if (event.target.closest('.app-bottom-nav')) window.__gestureQA.captured = { target: event.target, id: event.pointerId };
    }, true);
    document.addEventListener('lostpointercapture', () => { window.__gestureQA.lost++; }, true);
    document.addEventListener('pointercancel', () => { window.__gestureQA.cancelled++; }, true);
  });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(origin + '/qa?controls=0&theme=' + theme, { waitUntil: 'commit', timeout: 90000 });
    await page.locator('.home-variants').waitFor({ timeout: 90000 });
    await keyframe(page);
    return { page, context, errors };
  } catch (error) {
    await context.close();
    throw error;
  }
}

async function state(page) {
  await keyframe(page);
  return nav(page).evaluate((el, selectors) => {
    const selected = el.querySelector(selectors.active);
    const indicator = el.querySelector(selectors.marker);
    const center = rect => [rect.left + rect.width / 2, rect.top + rect.height / 2];
    const bounds = indicator.getBoundingClientRect();
    const button = selected.getBoundingClientRect();
    const box = item => {
      const rect = item.getBoundingClientRect();
      return [rect.x, rect.y, rect.width, rect.height];
    };
    return {
      selected: selected.textContent.trim(),
      marker: center(bounds),
      button: center(button),
      cell: button.width,
      markerSize: [bounds.width, bounds.height],
      labels: [...el.querySelectorAll('button')].map(box),
      contents: [...el.querySelectorAll('.bottom-nav-item svg, .bottom-nav-item span')].map(box),
      transition: getComputedStyle(indicator).transitionDuration,
      dragging: !!el.querySelector('[data-dragging]'),
      scroll: document.querySelector('.app-main').scrollTop,
    };
  }, { marker, active });
}

async function settled(page, name) {
  await page.waitForFunction(({ navigation, marker, active, name }) => {
    const el = [...document.querySelectorAll(navigation.replaceAll(':visible', ''))]
      .find(candidate => candidate.getBoundingClientRect().width > 0);
    const selected = el?.querySelector(active);
    const indicator = el?.querySelector(marker);
    if (!indicator || selected?.textContent.trim() !== name || el.querySelector('[data-dragging]')) return false;
    const b = selected.getBoundingClientRect();
    const m = indicator.getBoundingClientRect();
    const expected = [b.x + b.width / 2, b.y + b.height / 2];
    return Math.abs(m.x + m.width / 2 - expected[0]) <= 1.5 &&
      Math.abs(m.y + m.height / 2 - expected[1]) <= 1.5 &&
      Math.abs(m.width - b.width) <= 1.5 && Math.abs(m.height - b.height) <= 1.5;
  }, { navigation, marker, active, name });
  return state(page);
}

const getScroll = page => page.locator('.app-main').evaluate(el => el.scrollTop);
const resetScroll = page => page.locator('.app-main').evaluate(el => { el.scrollTop = 0; });

function mouse(page) {
  return {
    async down(x, y) { await page.mouse.move(x, y); await page.mouse.down(); },
    move: (x, y) => page.mouse.move(x, y, { steps: 5 }),
    up: () => page.mouse.up(),
  };
}

async function touch(session) {
  const emit = (type, x, y) => session.send('Input.dispatchTouchEvent', {
    type, touchPoints: x === undefined ? [] : [{ x: Math.round(x), y: Math.round(y), id: 1 }],
  });
  return {
    down: (x, y) => emit('touchStart', x, y),
    async move(x, y) { await emit('touchMove', x, y); },
    up: () => emit('touchEnd'),
    cancel: () => emit('touchCancel'),
  };
}

async function perform(page, input, dx, dy, expected, check) {
  const from = await state(page);
  const [x, y] = from.button;
  const delta = [dx * from.cell, dy];
  await input.down(x, y);
  await input.move(x + delta[0], y + delta[1]);
  const held = await state(page);
  assert.equal(held.selected, from.selected, 'El destino solo cambia si se acepta la navegación al soltar');
  assert.deepEqual(held.labels, from.labels, 'Posición y área de los controles permanecen estables');
  assert.deepEqual(held.contents, from.contents, 'Iconos y rótulos mantienen su posición');
  check?.(from, held, delta);
  await input.up();
  await settled(page, expected);
  return {
    from: from.selected, accepted: expected, pointerDelta: delta,
    markerDelta: held.marker.map((n, index) => Math.round((n - from.marker[index]) * 100) / 100),
  };
}

function traceHorizontal(from, held, [dx]) {
  assert.ok(Math.abs(held.marker[0] - from.marker[0] - dx) <= 3, 'Seguimiento horizontal uno a uno dentro de la cápsula');
}

function traceVertical(from, held) {
  assert.ok(side(held.marker[0], from.marker[0]));
  assert.ok(held.marker[1] <= from.marker[1] - 0.4 && held.marker[1] >= from.marker[1] - 6,
    JSON.stringify({ from: from.marker, held: held.marker }));
  assert.equal(held.scroll, from.scroll);
}

async function interrupt(page, kind) {
  await go(page, 'Inicio');
  const { button: [x, y], cell } = await settled(page, 'Inicio');
  const input = mouse(page);
  await input.down(x, y);
  await input.move(x + cell, y);
  const held = await state(page);
  assert.equal(held.selected, 'Inicio');
  assert.ok(held.marker[0] >= x + cell * .6);
  if (kind === 'lost') {
    await page.evaluate(() => {
      const { id, target } = window.__gestureQA.captured ?? {};
      if (!target?.hasPointerCapture(id)) throw Error('No se capturó el puntero');
      target.releasePointerCapture(id);
    });
    await input.move(x + cell + 1, y);
  } else if (kind === 'resize') {
    await page.setViewportSize({ width: 667, height: 375 });
  } else if (kind === 'breakpoint') {
    await page.setViewportSize({ width: 768, height: 650 });
    await page.locator('.app-bottom-nav').waitFor({ state: 'hidden' });
    await page.locator('.app-sidebar').waitFor();
  } else if (kind === 'external') {
    await button(page, 'Datos').focus();
    await page.keyboard.press('Enter');
    await page.locator('.charts-insights').waitFor();
  }
  await input.up();
  if (kind === 'resize' || kind === 'breakpoint') await page.setViewportSize(initial);
  const name = kind === 'external' ? 'Datos' : 'Inicio';
  try {
    await settled(page, name);
  } catch (error) {
    console.error(JSON.stringify({ kind, expected: name, geometry: await state(page),
      events: await page.evaluate(() => window.__gestureQA.events) }));
    throw error;
  }
  return { kind, selected: name };
}

async function neighbourScroll(page, input) {
  await go(page, 'Inicio');
  await resetScroll(page);
  const navBox = await page.locator('.app-bottom-nav').boundingBox();
  const y = navBox.y - 14;
  if (input) {
    await input.down(195, y);
    for (let delta = 20; delta <= 120; delta += 20) await input.move(195, y - delta);
    await input.up();
  } else {
    await page.mouse.move(195, y);
    await page.mouse.wheel(0, 190);
  }
  await page.waitForFunction(() => document.querySelector('.app-main').scrollTop > 35);
  await settled(page, 'Inicio');
  return Math.round(await getScroll(page));
}

async function keyboardFocus(page, from, next, selected) {
  await button(page, from).focus();
  await page.keyboard.press('Tab');
  assert.ok(await button(page, next).evaluate(el => el === document.activeElement && el.matches(':focus-visible')));
  await settled(page, selected);
}

async function mouseScenarios(page) {
  const input = mouse(page);
  const gestures = [];
  await settled(page, 'Inicio');
  gestures.push(await perform(page, input, .25, 0, 'Inicio', traceHorizontal));
  gestures.push(await perform(page, input, 1, 0, 'Coach', traceHorizontal));
  gestures.push(await perform(page, input, 0, -70, 'Coach', traceVertical));
  await button(page, 'Datos').click();
  await settled(page, 'Datos');
  await keyboardFocus(page, 'Inicio', 'Coach', 'Datos');
  await page.keyboard.press('Enter');
  await settled(page, 'Coach');
  gestures.push(await perform(page, input, .65, -65, 'Coach'));
  gestures.push(await perform(page, input, .93, -20, 'Datos'));

  await go(page, 'Inicio');
  gestures.push(await perform(page, input, -1.05, 0, 'Inicio', (from, held) => {
    assert.ok(held.marker[0] >= from.marker[0] - 8, 'Resistencia cerca del extremo izquierdo');
  }));
  const interrupts = [];
  for (const kind of ['lost', 'resize', 'breakpoint', 'external']) {
    interrupts.push(await interrupt(page, kind));
    await button(page, 'Perfil').click();
    await settled(page, 'Perfil');
    await keyboardFocus(page, 'Inicio', 'Coach', 'Perfil');
  }
  await go(page, 'Perfil');
  await page.getByRole('button', { name: 'Editar perfil', exact: true }).click();
  const draft = page.locator('.profile-view').getByLabel('Nombre', { exact: true });
  await draft.fill('Perfil sintético con borrador');
  const from = await settled(page, 'Perfil');
  await input.down(...from.button);
  await input.move(from.button[0] - from.cell, from.button[1]);
  await input.up();
  const discard = page.getByRole('dialog', { name: '¿Descartar los cambios?' });
  await discard.waitFor();
  await settled(page, 'Perfil');
  await discard.getByRole('button', { name: 'Seguir editando' }).click();
  assert.equal(await draft.inputValue(), 'Perfil sintético con borrador');
  await button(page, 'Inicio').click();
  await discard.getByRole('button', { name: 'Descartar cambios' }).click();
  await settled(page, 'Inicio');

  await keyboardFocus(page, 'Inicio', 'Coach', 'Inicio');
  await page.keyboard.press('Enter');
  await settled(page, 'Coach');
  await button(page, 'Datos').focus();
  await page.keyboard.press('Space');
  await settled(page, 'Datos');

  const { labels } = await state(page);
  for (const index of [3, 1, 2, 0]) {
    const [left, top, width, height] = labels[index];
    await page.mouse.click(left + width / 2, top + height / 2);
  }
  await settled(page, 'Inicio');
  const scroll = await neighbourScroll(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  gestures.push(await perform(page, input, 1, 0, 'Coach', (from, held, delta) => {
    traceHorizontal(from, held, delta);
    assert.ok(side(from.markerSize[0], held.markerSize[0]) && side(from.markerSize[1], held.markerSize[1]));
  }));
  const reducedMotion = await state(page);
  assert.ok(reducedMotion.transition.split(',').every(duration => parseFloat(duration) === 0));
  const motion = await page.evaluate(() => ({ pointerType: window.__gestureQA.pointerType, lost: window.__gestureQA.lost }));
  assert.equal(motion.pointerType, 'mouse');
  assert.ok(motion.lost > 0);
  return { gestures, interrupts, scroll, motion, reducedMotion: reducedMotion.transition, dirtyProfileStayedSelected: true };
}

async function dimensions(page) {
  const results = [];
  for (const [width, height] of [[320, 568], [375, 812], [768, 844], [1280, 800], [1440, 900]]) {
    await page.setViewportSize({ width, height });
    await go(page, 'Inicio');
    const from = await settled(page, 'Inicio');
    assert.ok(from.labels.every(([, , w, h]) => w >= 44 && h >= 44));
    if (width < 768) {
      const result = await perform(page, mouse(page), .94, 0, 'Coach', traceHorizontal);
      results.push({ width, height, result });
    } else {
      await button(page, 'Datos').click();
      await settled(page, 'Datos');
      results.push({ width, height, selected: 'Datos', sidebar: true });
    }
  }
  return results;
}

async function touchScenarios(page, context) {
  const reduced = await page.evaluate(() => ({
    current: getComputedStyle(document.querySelector('.app-bottom-nav button[aria-current="page"]')).touchAction,
    other: getComputedStyle(document.querySelector('.app-bottom-nav button:not([aria-current])')).touchAction,
    content: getComputedStyle(document.querySelector('.app-main')).touchAction,
  }));
  assert.notEqual(reduced.other, 'none', 'El resto de botones conserva su política táctil');
  assert.notEqual(reduced.content, 'none', 'El contenido conserva su política de scroll');
  await button(page, 'Coach').tap();
  await settled(page, 'Coach');
  assert.equal(await page.evaluate(() => window.__gestureQA.pointerType), 'touch');
  if (engine !== 'chromium') return { touchTap: true, gestureInput: 'tap Playwright, arrastre con mouse en matriz', touchAction: reduced };
  const session = await context.newCDPSession(page);
  const input = await touch(session);
  const vertical = await perform(page, input, 0, -75, 'Coach', traceVertical);
  const horizontal = await perform(page, input, .98, 0, 'Datos', traceHorizontal);
  const from = await settled(page, 'Datos');
  await input.down(...from.button);
  await input.move(from.button[0] - from.cell, from.button[1]);
  const held = await state(page);
  assert.ok(held.marker[0] < from.marker[0] - from.cell * .7);
  await input.cancel();
  await settled(page, 'Datos');
  assert.ok(await page.evaluate(() => window.__gestureQA.cancelled > 0));
  await button(page, 'Perfil').tap();
  await settled(page, 'Perfil');
  await keyboardFocus(page, 'Inicio', 'Coach', 'Perfil');
  const scroll = await neighbourScroll(page, input);
  return { touchTap: true, gestureInput: 'Chromium Input.dispatchTouchEvent', vertical, horizontal, cancelled: true, scroll, touchAction: reduced };
}

async function checked(result, run) {
  try {
    const out = await run(result.page, result.context);
    assert.deepEqual(result.errors, []);
    assert.deepEqual(await result.page.evaluate(() => {
      const qa = window.__homeQA;
      return [qa.aiCalls.length, qa.writes.length, qa.profileWrites.length, qa.externalRequests];
    }), [0, 0, 0, 0]);
    return out;
  } finally {
    await result.context.close();
  }
}

async function record() {
  assert.equal(engine, 'chromium');
  const dir = await mkdtemp(path.join(tmpdir(), 'calori-glass-gesto-'));
  const { context, page, errors } = await mount({ recordVideo: { dir, size: initial } });
  const video = page.video();
  let seconds;
  try {
    await page.addStyleTag({ content: '#gesture-qa-pointer{position:fixed;left:0;top:0;width:16px;height:16px;border:2px solid white;border-radius:50%;box-shadow:0 0 0 1px #202221;pointer-events:none;z-index:9999;display:none}#gesture-qa-state{position:fixed;top:12px;right:12px;max-width:calc(100% - 24px);text-wrap:balance;padding:8px 12px;background:#202725;color:#fff;font:600 12px/1.3 system-ui;border-radius:10px;pointer-events:none;z-index:9999}' });
    await page.evaluate(() => {
      const cursor = document.createElement('span');
      const caption = document.createElement('span');
      cursor.id = 'gesture-qa-pointer';
      caption.id = 'gesture-qa-state';
      cursor.setAttribute('aria-hidden', 'true');
      caption.setAttribute('aria-hidden', 'true');
      document.body.append(cursor, caption);
      let pressed = false;
      let scenario = '';
      const update = () => {
        const selected = document.querySelector('.bottom-nav-item[aria-current="page"]')?.textContent.trim();
        caption.textContent = scenario + ' · ' + (pressed ? 'Presionado' : 'Suelto') + ' · ' + (selected ?? '');
        cursor.style.background = pressed ? '#ff9a53' : 'transparent';
      };
      const observer = new MutationObserver(update);
      observer.observe(document.querySelector('.app-bottom-nav'), { subtree: true, attributeFilter: ['aria-current'] });
      window.__gestureCaption = value => { scenario = value; update(); };
      for (const name of ['pointermove', 'pointerdown', 'pointerup', 'pointercancel']) {
        document.addEventListener(name, event => {
          cursor.style.display = 'block';
          cursor.style.transform = 'translate(' + (event.clientX - 8) + 'px,' + (event.clientY - 8) + 'px)';
          if (name !== 'pointermove') pressed = name === 'pointerdown';
          update();
        }, true);
      }
    });
    await settled(page, 'Inicio');
    const caption = text => page.evaluate(value => window.__gestureCaption(value), text);
    const started = performance.now();
    await caption('Arrastre horizontal');
    await page.waitForTimeout(450);
    let from = await state(page);
    let [x, y] = from.button;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.waitForTimeout(350);
    for (let t = .07; t <= 1.035; t += .07) {
      await page.mouse.move(x + t * from.cell, y);
      await page.waitForTimeout(t >= .42 && t <= .43 ? 400 : 48);
    }
    assert.equal((await state(page)).selected, 'Inicio');
    await page.waitForTimeout(430);
    await page.mouse.up();
    await settled(page, 'Coach');
    await page.waitForTimeout(550);

    await caption('Arrastre vertical');
    from = await state(page);
    [x, y] = from.button;
    await page.mouse.move(x, y);
    await page.mouse.down();
    for (let dy = 6; dy <= 66; dy += 6) {
      await page.mouse.move(x, y - dy);
      await page.waitForTimeout(42);
    }
    traceVertical(from, await state(page));
    await page.waitForTimeout(450);
    await page.mouse.up();
    await settled(page, 'Coach');
    await page.waitForTimeout(500);

    await caption('Clic tradicional');
    const [left, top, width, height] = (await state(page)).labels[3];
    await page.mouse.move(left + width / 2, top + height / 2);
    await page.waitForTimeout(250);
    await page.mouse.click(left + width / 2, top + height / 2);
    await settled(page, 'Perfil');
    await page.waitForTimeout(650);
    seconds = (performance.now() - started) / 1000;
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
  const require = createRequire(modulePath);
  const { registry } = require('playwright-core/lib/server/registry/index');
  const ffmpeg = registry.findExecutable('ffmpeg').executablePath();
  execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-sseof', '-' + seconds.toFixed(3), '-i',
    await video.path(), '-an', '-c:v', 'libvpx', '-threads', '1', '-b:v', '1M', '-crf', '12', '-y',
    path.join(output, 'gesto-arrastre.webm')]);
  await video.delete();
  await rmdir(dir);
  console.log('Video de gesto: ' + seconds.toFixed(1) + ' s');
}

try {
  if (videoOnly) await record();
  else {
    const mouseReport = await checked(await mount(), mouseScenarios);
    const responsiveReport = await checked(await mount({ theme: 'light' }), dimensions);
    const touchReport = await checked(await mount({ theme: 'light', touch: true }), touchScenarios);
    const report = { engine, version: browser.version(), mouse: mouseReport, responsive: responsiveReport, touch: touchReport };
    await writeFile(path.join(output, 'gestos-' + engine + '.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(engine + ': ratón, teclado, anchos, interrupciones y entrada táctil comprobados');
  }
} finally {
  await browser.close();
}
