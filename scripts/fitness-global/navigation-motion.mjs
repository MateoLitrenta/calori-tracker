import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rmdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { repo, start, tabs } from './browser.mjs';

const origin = 'http://127.0.0.1:5194';
const out = process.env.CALORI_QA_OUTPUT_DIR || path.join(repo, 'docs/evidence/navigation-polish/after');
const sidebar = { root: '.app-sidebar nav', marker: '.sidebar-nav-indicator', active: '[aria-current="page"]', axis: 'y' };
const week = { root: '.home-week-days', marker: '.home-week-indicator', active: '[aria-pressed="true"]', axis: 'x' };
const date = day => '2026-11-' + String(day).padStart(2, '0');
const dayButton = (page, day) => page.locator('[data-day="' + date(day) + '"]');
const tabButton = (page, name) => page.locator(sidebar.root).getByRole('button', { name, exact: true });
const button = (page, name) => page.getByRole('button', { name, exact: true });
const frames = page => page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
const report = { origin, firstPaint: [], tracks: [], cases: [] };
const browser = await start();
await mkdir(out, { recursive: true });

// Measure in the track's coordinate space so viewport/strip scrolling cannot
// masquerade as motion. Also compare all four edges with the active button.
function instrument(specs) {
  const round = value => Math.round(value * 10) / 10;
  function measure(spec) {
    const root = document.querySelector(spec.root);
    const marker = root?.querySelector(spec.marker);
    const button = root?.querySelector('button' + spec.active);
    if (!button || !marker || marker.getBoundingClientRect().width === 0 ||
        getComputedStyle(marker).visibility === 'hidden') return null;
    const r = marker.getBoundingClientRect(), b = button.getBoundingClientRect();
    return {
      position: round(r[spec.axis] - root.getBoundingClientRect()[spec.axis]),
      error: round(Math.max(...['left','right','top','bottom'].map(edge => Math.abs(r[edge] - b[edge])))),
      active: button.dataset.day ?? button.textContent.trim(),
    };
  }
  window.navMeasure = measure;
  window.navFirst = {};
  function first() {
    for (const spec of specs) window.navFirst[spec.axis] ??= measure(spec);
    if (specs.some(spec => (spec.axis === 'x' || innerWidth >= 768) && !window.navFirst[spec.axis])) requestAnimationFrame(first);
  }
  requestAnimationFrame(first);
  window.navTransitions = [];
  document.addEventListener('transitionrun', e => {
    if (specs.some(spec => e.target.matches(spec.marker)) && e.propertyName === 'transform')
      window.navTransitions.push(e.target.className);
  });
  window.navArm = (spec, type) => {
    document.addEventListener(type, () => {
      const start = performance.now();
      window.navTrack = new Promise(done => {
        const samples = [];
        function sample() {
          samples.push({ ms: round(performance.now() - start), ...measure(spec) });
          const elapsed = performance.now() - start;
          const unfinished = samples.at(-1).error > 1 || samples.length < 5;
          if (elapsed < 320 || (unfinished && elapsed < 3000)) requestAnimationFrame(sample);
          else done(samples);
        }
        sample();
      });
    }, { once: true, capture: true });
  };
}

async function session(width, height, theme, check, videoName) {
  const viewport = { width, height };
  const temp = videoName && await mkdtemp(path.join(tmpdir(), 'calori-nav-'));
  const context = await browser.newContext({ viewport, locale: 'es-AR', timezoneId: 'America/Buenos_Aires',
    colorScheme: theme, reducedMotion: 'no-preference', ...(temp && { recordVideo: { dir: temp, size: viewport } }) });
  const errors = [];
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === origin) return route.continue();
    errors.push(url.hostname);
    return route.abort();
  });
  await context.addInitScript(instrument, [sidebar, week]);
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const video = page.video();
  let videoSeconds;
  page.on('pageerror', e => errors.push(e.message));
  try {
    await page.goto(origin + '/qa?controls=0&theme=' + theme, { waitUntil: 'commit', timeout: 90000 });
    await page.locator('.fitness-home').waitFor({ timeout: 90000 });
    await page.evaluate(() => document.fonts.ready);
    await frames(page);
    const first = await page.evaluate(() => ({ ...window.navFirst, transitions: window.navTransitions.slice() }));
    for (const axis of width >= 768 ? ['x', 'y'] : ['x'])
      assert.ok(first[axis] && first[axis].error <= 1, 'first paint ' + JSON.stringify(first));
    assert.deepEqual(first.transitions, []);
    report.firstPaint.push({ width, theme, ...first });
    const ready = performance.now();
    if (video) await page.waitForTimeout(350);
    await check(page);
    if (video) await page.waitForTimeout(350);
    assert.deepEqual(await page.evaluate(() => [window.__homeQA.externalRequests, window.__homeQA.aiCalls.length]), [0, 0]);
    assert.deepEqual(errors, []);
    videoSeconds = (performance.now() - ready) / 1000;
  } finally {
    await context.close();
  }
  if (video) {
    // Drop the blank Vite/bootstrap frames from the beginning of the recording.
    const require = createRequire(process.env.PLAYWRIGHT_MODULE || path.resolve(repo, '../qa-tools/node_modules/playwright/index.mjs'));
    const { registry } = require('playwright-core/lib/server/registry/index');
    const ffmpeg = registry.findExecutable('ffmpeg').executablePath();
    execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-sseof', '-' + videoSeconds.toFixed(3),
      '-i', await video.path(), '-an', '-c:v', 'libvpx', '-threads', '1', '-b:v', '1M', '-crf', '10',
      '-y', path.join(out, videoName + '.webm')]);
    await video.delete();
    await rmdir(temp);
  }
}

async function aligned(page, spec, active) {
  const value = await page.evaluate(spec => window.navMeasure(spec), spec);
  assert.equal(value?.active, active);
  assert.ok(value.error <= 1, 'marker/button edges ' + JSON.stringify(value));
  if (spec === week)
    assert.equal(await page.locator('.home-date-context time').getAttribute('datetime'), active);
  return value;
}

async function track(page, spec, label, active, action, mode = 'slide', event = 'click') {
  await page.evaluate(([spec, event]) => window.navArm(spec, event), [spec, event]);
  await action();
  const samples = await page.evaluate(() => window.navTrack);
  assert.ok(samples?.length > 2, 'insufficient samples ' + label);
  const first = samples[0].position, last = samples.at(-1).position;
  const between = samples.filter(s => s.position > Math.min(first, last) + .1 && s.position < Math.max(first, last) - .1);
  if (mode === 'slide') {
    assert.ok(Math.abs(last - first) > 2, label + ' should reach a different button');
    if (between.length) assert.ok(between.some(s => s.active === active), label + ' selection must update during transition');
  } else if (mode === 'stationary') {
    assert.ok(samples.every(s => Math.abs(s.position - first) <= 1), 'unexpected motion ' + label);
  } else {
    assert.equal(between.length, 0, 'reduced motion ' + label);
    assert.ok(samples.filter(s => s.active === active).every(s => s.error <= 1), 'late reduced motion ' + label);
  }
  await aligned(page, spec, active);
  report.tracks.push({ label, axis: spec.axis, mode, from: samples[0].active, active, intermediateFrames: between.length,
    sampleMs: samples.map(s => s.ms), positions: samples.map(s => s.position), firstAcceptedMs: samples.find(s => s.active === active)?.ms });
}

async function checkMarker(page, spec) {
  const marker = page.locator(spec.root).locator(spec.marker);
  assert.equal(await marker.count(), 1);
  const css = await marker.evaluate(el => {
    const style = getComputedStyle(el);
    return [el.getAttribute('aria-hidden'), style.pointerEvents, style.transitionDuration, style.transitionTimingFunction];
  });
  assert.equal(css[0], 'true');
  assert.equal(css[1], 'none');
  assert.ok(css[2].split(', ').every(s => s === '0.2s'), css[2]);
  assert.ok(css[3].startsWith('cubic-bezier(0.16, 1, 0.3, 1)'), css[3]);
}

async function sidebarTour(page) {
  await checkMarker(page, sidebar);
  const original = await page.locator(sidebar.marker).elementHandle();
  for (const target of ['Coach', 'Datos', 'Perfil', 'Datos', 'Coach', 'Inicio', 'Perfil', 'Inicio']) {
    await track(page, sidebar, 'sidebar → ' + target, target, () => tabButton(page, target).click());
    await page.locator(tabs[target]).first().waitFor();
    assert.ok(await original.evaluate(el => el.isConnected));
  }
}

async function weekTour(page) {
  await checkMarker(page, week);
  const original = await page.locator(week.marker).elementHandle();
  for (const day of [12, 9, 8, 13, 9, 12]) {
    await track(page, week, 'día → ' + day, date(day), () => dayButton(page, day).click());
    assert.ok(await original.evaluate(el => el.isConnected));
    const meal = { 9: 'Almuerzo del lunes', 12: 'Comida de ayer' }[day];
    if (meal) assert.ok((await page.locator('.daily-logs').innerText()).includes(meal));
  }
  assert.equal(await dayButton(page, 13).getAttribute('aria-current'), 'date');
  assert.ok(await dayButton(page, 14).isDisabled());
  assert.ok(await button(page, 'Semana siguiente').isDisabled());
  report.cases.push('Date label and synthetic meal match selection; today and future independently identified');
}

async function interrupt(page, spec, order, active) {
  const steps = await page.locator(spec.root).evaluate(async (root, [spec, order]) => {
    const buttons = root.querySelectorAll('button'), steps = [];
    for (const index of order) {
      buttons[index].click();
      await new Promise(done => setTimeout(done, 45));
      steps.push(window.navMeasure(spec));
    }
    return steps;
  }, [spec, order]);
  assert.ok(steps.slice(0, -1).some(point => point.error > 1), 'interrupt an active transition');
  await page.waitForTimeout(240);
  await aligned(page, spec, active);
  report.cases.push({ rapid: spec.axis, steps, final: active });
}

async function resizeText(page, selector) {
  await page.locator(selector).evaluate(el => {
    const sizes = [el, ...el.querySelectorAll('button, button span, button strong')].map(node => {
      const css = getComputedStyle(node);
      return [node, parseFloat(css.fontSize), parseFloat(css.lineHeight)];
    });
    for (const [node, size, line] of sizes) {
      node.style.fontSize = size * 2 + 'px';
      if (line) node.style.lineHeight = line * 2 + 'px';
    }
  });
  await frames(page);
}

async function states(page) {
  await interrupt(page, sidebar, [3, 1, 2, 0], 'Inicio');
  await interrupt(page, week, [0, 3, 1, 5], date(13));

  const coach = tabButton(page, 'Coach');
  await coach.hover();
  await page.waitForTimeout(240);
  const css = async (locator, property) => locator.evaluate((el, property) => getComputedStyle(el)[property], property);
  assert.notEqual(await css(coach, 'backgroundColor'), await css(page.locator(sidebar.marker), 'backgroundColor'));
  assert.notEqual(await css(coach, 'backgroundColor'), 'rgba(0, 0, 0, 0)');
  await tabButton(page, 'Inicio').focus();
  await track(page, sidebar, 'Tab solo enfoca Coach', 'Inicio', () => page.keyboard.press('Tab'), 'stationary', 'keydown');
  assert.ok(await coach.evaluate(el => el.matches(':focus-visible') && getComputedStyle(el).outlineStyle !== 'none'));
  await track(page, sidebar, 'Enter abre Coach', 'Coach', () => page.keyboard.press('Enter'));
  await page.locator(tabs.Coach).waitFor();
  await track(page, sidebar, 'regreso a Inicio', 'Inicio', () => tabButton(page, 'Inicio').click());
  await dayButton(page, 13).focus();
  for (const [key, focused] of [['ArrowLeft', 12], ['Home', 8], ['ArrowRight', 9], ['End', 13], ['ArrowRight', 13], ['Home', 8]]) {
    await track(page, week, key + ' solo foco', date(13), () => page.keyboard.press(key), 'stationary', 'keydown');
    assert.ok(await dayButton(page, focused).evaluate(el => el.matches(':focus-visible') && getComputedStyle(el).outlineStyle !== 'none'));
  }
  await track(page, week, 'Espacio elige el día enfocado', date(8), () => page.keyboard.press('Space'));
  const sameNode = await page.locator(week.marker).elementHandle();
  for (const [label, day] of [['Semana anterior', 1], ['Semana siguiente', 8]]) {
    await track(page, week, label + ', misma columna', date(day), () => button(page, label).click(), 'stationary');
    assert.ok(await sameNode.evaluate(el => el.isConnected));
  }
  await button(page, 'Abrir calendario mensual').click();
  await track(page, week, 'calendario elige jueves', date(5), () => page.locator('[data-calendar-day="' + date(5) + '"]').click());
  assert.ok(await sameNode.evaluate(el => el.isConnected));
  await track(page, week, 'Hoy regresa al viernes', date(13), () => page.locator('.home-date-today').click());

  // The modal is the first user-facing barrier. Exercise the application guards
  // separately by delivering synthetic clicks to the background buttons.
  await button(page, 'Agregar comida').click();
  const draft = page.getByLabel('Descripción', { exact: true });
  await draft.fill('Borrador sintético');
  const sidebarBlocked = page.locator(sidebar.root + ' button').nth(2);
  assert.ok(await sidebarBlocked.evaluate(el => !!el.closest('[inert]')));
  await track(page, sidebar, 'formulario bloquea sección', 'Inicio', () => sidebarBlocked.evaluate(el => el.click()), 'stationary');
  await page.getByText(/antes de cambiar de sección/).first().waitFor();
  await track(page, week, 'formulario bloquea fecha', date(13), () => dayButton(page, 11).evaluate(el => el.click()), 'stationary');
  assert.ok(await page.locator('.home-date-blocked').isVisible());
  assert.equal(await draft.inputValue(), 'Borrador sintético');
  await button(page, 'Cancelar').click();
  await button(page, 'Descartar cambios').click();
  await track(page, sidebar, 'abrir Perfil', 'Perfil', () => tabButton(page, 'Perfil').click());
  await button(page, 'Editar perfil').click();
  const profile = page.getByRole('textbox', { name: 'Nombre', exact: true });
  await profile.fill('QA borrador');
  await track(page, sidebar, 'confirmación de Perfil pendiente', 'Perfil', () => tabButton(page, 'Inicio').click(), 'stationary');
  await track(page, sidebar, 'cancelar salida de Perfil', 'Perfil', () => button(page, 'Seguir editando').click(), 'stationary');
  assert.equal(await profile.inputValue(), 'QA borrador');
  await tabButton(page, 'Inicio').click();
  await track(page, sidebar, 'salida confirmada de Perfil', 'Inicio', () => button(page, 'Descartar cambios').click());
  assert.equal(await page.evaluate(() => window.__homeQA.profileWrites.length), 0);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await track(page, week, 'día con movimiento reducido', date(9), () => dayButton(page, 9).click(), 'snap');
  await track(page, sidebar, 'sección con movimiento reducido', 'Perfil', () => tabButton(page, 'Perfil').click(), 'snap');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await button(page, 'Cambiar Tema').click();
  const option = page.locator('.appearance-picker [aria-pressed="true"]');
  assert.equal((await option.innerText()).trim(), 'Claro');
  assert.notEqual(await css(option, 'backgroundColor'), 'rgba(0, 0, 0, 0)');
  await page.locator('.appearance-picker').getByRole('button', { name: 'Oscuro' }).click();
  await button(page, 'Cambiar Tema').click();
  assert.equal((await option.innerText()).trim(), 'Oscuro');
  await page.keyboard.press('Escape');
  await aligned(page, sidebar, 'Perfil');
  report.cases.push('Hover, visible keyboard focus and appearance selection (Claro/Oscuro) remain distinct');
}

async function geometry(page) {
  await tabButton(page, 'Perfil').click();
  await page.waitForTimeout(250);
  await page.evaluate(() => { window.navTransitions = []; });
  await resizeText(page, sidebar.root);
  await aligned(page, sidebar, 'Perfil');
  for (const width of [768, 767, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    await frames(page);
    if (width >= 768) await aligned(page, sidebar, 'Perfil');
    else assert.ok(await page.locator(sidebar.marker).isHidden());
  }
  assert.deepEqual(await page.evaluate(() => window.navTransitions), []);
  await tabButton(page, 'Inicio').click();
  await page.locator(week.marker).waitFor();
  await page.waitForTimeout(250);
  await page.evaluate(() => { window.navTransitions = []; });
  await page.setViewportSize({ width: 320, height: 700 });
  await frames(page);
  await resizeText(page, week.root);
  await aligned(page, week, date(13));
  const strip = page.locator('.home-week-scroll');
  const metrics = await strip.evaluate(el => ({ width: el.clientWidth, content: el.scrollWidth }));
  assert.ok(metrics.content > metrics.width);
  assert.deepEqual(await page.evaluate(() => window.navTransitions), []);
  const visible = locator => locator.evaluate(el => {
    const region = el.closest('.home-week-scroll').getBoundingClientRect(), rect = el.getBoundingClientRect();
    return rect.left >= region.left - 1 && rect.right <= region.right + 1;
  });
  assert.ok(await visible(dayButton(page, 13)), 'selected day should remain visible after enlarging the strip');
  await dayButton(page, 13).focus();
  await page.keyboard.press('Home');
  assert.ok(await visible(dayButton(page, 8)));
  await aligned(page, week, date(13));
  await page.setViewportSize({ width: 375, height: 700 });
  await frames(page);
  assert.ok(await visible(dayButton(page, 8)), 'keep the explored day visible across resize');
  await page.keyboard.press('End');
  assert.ok(await visible(dayButton(page, 13)));
  await page.keyboard.press('ArrowLeft');
  await track(page, week, 'Enter en tira con texto 200%', date(12), () => page.keyboard.press('Enter'));
  assert.ok(await visible(dayButton(page, 12)));
  for (const width of [375, 768, 1440]) {
    await page.evaluate(() => { window.navTransitions = []; });
    await page.setViewportSize({ width, height: 900 });
    await frames(page);
    await aligned(page, week, date(12));
    assert.deepEqual(await page.evaluate(() => window.navTransitions), []);
  }
  report.cases.push({ textScalePercent: 200, stripAt320: metrics, keyboardRevealsFocusedDay: true,
    resizeWidths: [320, 375, 767, 768, 1024, 1440], resizeTransformTransitions: 0 });
}

try {
  await session(1440, 900, 'light', states);
  await session(1440, 900, 'dark', geometry);
  await session(1024, 700, 'light', sidebarTour, 'sidebar');
  await session(375, 812, 'dark', weekTour, 'dias');
  // Frame cadence varies while heavy views mount. Require measured motion in both
  // directions for each axis, including an adjacent button and an end-to-end jump.
  for (const [axis, prefix, slots] of [
    ['y', 'sidebar →', ['Inicio', 'Coach', 'Datos', 'Perfil']],
    ['x', 'día →', [8, 9, 10, 11, 12, 13].map(date)],
  ]) {
    const moves = report.tracks.filter(t => t.axis === axis && t.label.startsWith(prefix) && t.intermediateFrames > 0)
      .map(t => slots.indexOf(t.active) - slots.indexOf(t.from));
    assert.ok(moves.some(v => v > 0) && moves.some(v => v < 0), axis + ' needs bidirectional sampled motion');
    assert.ok(moves.some(v => Math.abs(v) === 1), axis + ' needs an adjacent sampled transition');
    assert.ok(moves.some(v => Math.abs(v) === slots.length - 1), axis + ' needs an end-to-end sampled transition');
  }
  report.browser = await browser.version();
  await writeFile(path.join(out, 'movimiento.json'), JSON.stringify(report, null, 2) + '\n');
  console.log('Navigation passed: ' + report.tracks.length + ' tracks, 4 isolated contexts, 2 videos.');
} finally {
  await browser.close();
}
