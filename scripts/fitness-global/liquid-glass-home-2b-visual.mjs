import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { before, go, open, origin, repo, start } from './browser.mjs';

const webkit = process.argv.includes('--webkit');
const quick = process.argv.includes('--quick');
const phase = before ? 'before' : 'after';
const output = path.join(repo, 'docs/evidence/liquid-glass-home-2b', phase);
const modulePath = process.env.PLAYWRIGHT_MODULE || path.resolve(repo, '../qa-tools/node_modules/playwright/index.mjs');
const browser = webkit ? await (await import(pathToFileURL(modulePath))).webkit.launch() : await start();
const layouts = [[320, 568], [375, 812], [390, 844], [440, 956], [768, 1024], [1280, 800], [1440, 900]];
const themes = ['light', 'dark'];
const blocks = { registros: '.daily-logs', habitos: '.daily-habits-block', actividad: '.activity-history-v2' };
const report = { browser: browser.version(), engine: webkit ? 'webkit' : 'chromium', phase, cases: [], warnings: [] };
const targets = {
  registros: '.daily-record-open, .daily-records-toggle',
  habitos: '.habit-value, .habit-controls button, .habit-edit',
  actividad: '.ah-view-switch button, .ah-nav-actions button, .ah-day, .ah-month, .ah-open, .ah-key-disclosure summary',
};
const textSelectors = {
  registros: '.daily-logs h4, .fitness-entry-count, .daily-record-title, .daily-record-meta, .fitness-record-kcal, .daily-records-toggle',
  habitos: '.daily-habits-heading h4, .habit-label, .habit-value, .habit-unit, .habit-edit, .habit-controls button:not(:disabled)',
  actividad: '.ah-header h2, .ah-navigation h3, .ah-view-switch button, .ah-day:not(:disabled) .ah-day-number, .ah-day:not(:disabled) .ah-day-balance, .ah-month:not(:disabled) .ah-month-name, .ah-eyebrow, .ah-day-status, .ah-open:not(:disabled)',
};
const iconSelectors = {
  registros: '.daily-record-open svg',
  habitos: '.habit-header svg',
  actividad: '.ah-nav-actions button:not(:disabled) svg, .ah-detail-jump svg, .ah-open:not(:disabled) svg',
};
await mkdir(output, { recursive: true });

const settle = page => page.evaluate(async () => {
  await document.fonts.ready;
  await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
});

async function fixture(page, scenario) {
  await page.evaluate(scenario => {
    const qa = window.__homeQA;
    qa.initialQARecords ??= structuredClone(qa.profiles.A.records);
    const records = structuredClone(qa.initialQARecords);
    const today = records[qa.today];
    if (scenario === 'stress') {
      today.meals[0].name = 'Bowl de quinoa con tomates cherry, huevos duros y sándwich de miga';
      today.meals[0].calories = 1100;
      today.meals[0].photo_path = 'fixture-home-2b-photo';
      qa.files.set(today.meals[0].photo_path, '/landing/meal-demo.webp');
      today.meals[1].calories = 750;
      today.water = 1234567;
      today.steps = 12345678;
      today.weight = 112.4;
    } else if (scenario === 'empty') {
      Object.assign(today, { meals: [], workouts: [], water: 0, steps: 0, weight: null });
    } else if (scenario === 'single') {
      today.meals = today.meals.slice(0, 1);
      today.workouts = [];
    }
    qa.profiles = { ...qa.profiles, A: { ...qa.profiles.A, records } };
    qa.store = qa.makeStore();
    qa.notify();
  }, scenario);
  await settle(page);
}

async function expandActivity(page) {
  const toggle = page.locator('.home-history-toggle');
  if (await toggle.isVisible() && await toggle.getAttribute('aria-expanded') === 'false') await toggle.click();
  await page.locator(blocks.actividad).waitFor();
  await settle(page);
}

async function place(page, selector) {
  await page.locator(selector).evaluate(el => {
    document.querySelector('.app-main').scrollTop += el.getBoundingClientRect().top - 19;
  });
  await settle(page);
}

const shot = (page, name) => page.screenshot({ path: path.join(output, `${name}.jpg`), quality: 88, scale: 'css' });

async function closeup(page, selector, name) {
  await page.locator(selector).screenshot({ path: path.join(output, `${name}.jpg`), quality: 88, scale: 'css' });
}

async function materialCloseups(page, theme) {
  for (const [name, selector] of Object.entries({ registros: '.daily-records', habitos: '.daily-habits', selector: '.ah-view-switch' })) {
    await place(page, selector);
    await closeup(page, selector, `detalle-${theme}-${name}`);
  }
}

async function period(page, name) {
  await page.locator('.ah-view-switch').getByRole('button', { name, exact: true }).click();
  await settle(page);
}

async function geometry(page, selectors) {
  return page.evaluate(selectors => {
    const box = el => {
      const rect = el.getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height };
    };
    const styles = el => {
      const css = getComputedStyle(el);
      return { ...box(el), radius: css.borderRadius, fill: css.backgroundColor, surface: css.backgroundImage, shadow: css.boxShadow };
    };
    const main = document.querySelector('.app-main');
    const visible = selector => [...document.querySelectorAll(selector)].filter(el => el.getClientRects().length);
    const approved = ['.home-header', '.home-date-nav', '.energy-card', '.daily-quick-actions button:first-child', '.daily-quick-actions button:last-child', '.bottom-nav-track', '.app-sidebar'];
    const layouts = Object.fromEntries(Object.entries(selectors).map(([name, selector]) => [name, visible(selector).map(el => {
      const css = getComputedStyle(el);
      return { label: el.getAttribute('aria-label') ?? el.textContent.trim(), ...box(el),
        disabled: el.matches(':disabled'), motion: css.transitionDuration, overflow: el.scrollWidth - el.clientWidth };
    })]));
    const rows = visible('.daily-record-open').map(el => {
      const copy = el.querySelector('.daily-record-title');
      const kcal = el.querySelector('.fitness-record-kcal');
      const range = document.createRange();
      range.selectNodeContents(copy);
      const lines = [...range.getClientRects()].map(line => ({ left: line.left, top: line.top, right: line.right, bottom: line.bottom }));
      const energy = box(kcal);
      return { title: copy.textContent.trim(), kcal: kcal.textContent.trim(), lines: lines.length,
        overlap: lines.some(line => line.left < energy.right && line.right > energy.left && line.top < energy.bottom && line.bottom > energy.top) };
    });
    const photo = document.querySelector('.daily-record-open img');
    const disclosure = document.querySelector('.daily-records-toggle');
    const records = document.querySelector('.daily-records');
    return {
      overflow: Math.max(document.documentElement.scrollWidth - innerWidth, main.scrollWidth - main.clientWidth),
      sections: Object.fromEntries(Object.entries(layouts).map(([name, controls]) => [name, {
        count: controls.length,
        minimum: Math.min(...controls.map(el => Math.min(el.width, el.height))),
        short: controls.filter(el => !el.disabled && (el.width < 43.9 || el.height < 43.9)).map(({ label, width, height }) => ({ label, width, height })),
        clipped: controls.filter(el => el.overflow > 1).map(({ label, overflow }) => ({ label, overflow })),
        reduced: controls.every(el => el.motion.split(',').every(duration => Number.parseFloat(duration) === 0)),
      }])),
      rows,
      photo: photo?.naturalWidth ? { frame: box(photo.parentElement), image: box(photo) } : null,
      recordsDisclosureGap: disclosure && records ? box(disclosure).top - box(records).bottom : null,
      orange: getComputedStyle(document.documentElement).getPropertyValue('--fit-orange').trim(),
      approved: approved.map(selector => [selector, styles(document.querySelector(selector))]),
    };
  }, selectors);
}

async function contrast(page, selector, iconSelector) {
  const samples = await page.evaluate(({ selector, iconSelector }) => {
    const samples = [];
    const points = (el, rect) => [.24, .5, .76]
      .map(p => [Math.floor(rect.left + p * rect.width), Math.floor(rect.top + rect.height * .5)])
      .filter(([x, y]) => el.contains(document.elementFromPoint(x, y)));
    for (const el of document.querySelectorAll(selector)) {
      const range = document.createRange();
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode;
        const holder = node.parentElement;
        const text = node.textContent.trim().replace(/\s+/g, ' ');
        if (!text || holder.closest('[aria-hidden="true"], :disabled') || holder.closest(selector) !== el) continue;
        range.selectNodeContents(node);
        const fg = getComputedStyle(holder).color;
        for (const rect of range.getClientRects()) {
          if (rect.width <= 3 || rect.height <= 3 || rect.top < 0 || rect.bottom >= innerHeight) continue;
          const positions = points(holder, rect);
          if (positions.length) samples.push({ positions, fg, text, kind: 'text' });
        }
      }
    }
    for (const icon of document.querySelectorAll(iconSelector)) {
      const rect = icon.getBoundingClientRect();
      if (rect.width <= 3 || rect.height <= 3 || rect.top < 0 || rect.bottom >= innerHeight) continue;
      const positions = points(icon.parentElement, rect);
      if (positions.length) samples.push({ positions, fg: getComputedStyle(icon).color,
        text: icon.closest('button')?.getAttribute('aria-label') ?? '', kind: 'icon' });
    }
    return samples;
  }, { selector, iconSelector });
  if (!samples.length) return { count: 0, min: null };
  const style = await page.addStyleTag({ content: `
    :is(${selector}) { -webkit-text-fill-color: transparent !important; text-shadow: none !important; }
    :is(${iconSelector}) { visibility: hidden !important; }
  ` });
  let screenshot;
  try { screenshot = (await page.screenshot({ scale: 'css' })).toString('base64'); }
  finally { await style.evaluate(el => el.remove()); }
  return page.evaluate(async ({ screenshot, samples }) => {
    const img = new Image();
    img.src = `data:image/png;base64,${screenshot}`;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const bitmap = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const lum = channels => channels.slice(0, 3).map(n => n / 255)
      .map(n => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4)
      .reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
    const totals = Object.fromEntries(['text', 'icon'].map(kind => [kind, { count: 0, worst: null }]));
    for (const { positions, fg, text, kind } of samples) {
      const group = totals[kind];
      group.count += 1;
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = fg;
      ctx.fillRect(0, 0, 1, 1);
      const light = lum([...ctx.getImageData(0, 0, 1, 1).data]);
      for (const [x,y] of positions) {
        const index = (y * canvas.width + x) * 4;
        const colors = [...bitmap.slice(index, index + 3)];
        const background = lum(colors);
        const ratio = (Math.max(light, background) + .05) / (Math.min(light, background) + .05);
        if (!group.worst || ratio < group.worst.min) group.worst = { text, fg, bg: colors.join(','), min: ratio };
      }
    }
    const summary = group => ({ count: group.count, ...group.worst, min: group.worst ? Number(group.worst.min.toFixed(2)) : null });
    return { ...summary(totals.text), icons: summary(totals.icon) };
  }, { screenshot, samples });
}

async function focusCheck(page, selector) {
  const target = page.locator(selector).filter({ visible: true }).last();
  await page.keyboard.press('Tab');
  await target.evaluate(el => {
    el.scrollIntoView({ block: 'center', inline: 'nearest' });
    el.focus({ preventScroll: true });
  });
  await settle(page);
  return target.evaluate(el => {
    const css = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    const nav = document.querySelector('.bottom-nav-track');
    const extent = Math.max(0, Number.parseFloat(css.outlineWidth) + Number.parseFloat(css.outlineOffset));
    return { text: el.getAttribute('aria-label') ?? el.textContent.trim(), active: el === document.activeElement, focus: el.matches(':focus-visible'),
      outline: css.outlineStyle, hit: el.contains(hit), gap: nav.getClientRects().length ? nav.getBoundingClientRect().top - r.bottom - extent : null };
  });
}

async function extraCaptures(page, theme) {
  for (const name of ['Semana', 'Año']) {
    await period(page, name);
    await place(page, blocks.actividad);
    await shot(page, `390-${theme}-actividad-${name.toLowerCase().replace('ñ', 'n')}`);
  }
  await period(page, 'Mes');
  for (const scenario of ['single', 'empty']) {
    await fixture(page, scenario);
    await place(page, blocks.registros);
    await shot(page, `390-${theme}-registros-${scenario}`);
  }
  await fixture(page, 'stress');
  const water = page.getByRole('button', { name: 'Editar cantidad de agua', exact: true });
  await water.click();
  await page.getByRole('spinbutton', { name: 'Cantidad de agua (ml)' }).waitFor();
  await place(page, blocks.habitos);
  await shot(page, `390-${theme}-habitos-editando`);
  await page.keyboard.press('Enter');
  await fixture(page, 'normal');
  await page.getByRole('button', { name: 'Sumar 250 ml de agua', exact: true }).click();
  await page.locator('.habit-status').getByText('Guardado', { exact: false }).waitFor();
  await place(page, blocks.habitos);
  await shot(page, `390-${theme}-habitos-guardado`);

  await page.getByRole('button', { name: 'Agregar comida', exact: true }).click();
  await page.locator('#add-meal-description').fill('Tostada sintética de avena');
  await page.locator('#add-meal-calories').fill('750');
  await page.getByRole('button', { name: 'Guardar comida', exact: true }).click();
  await page.locator('.meal-saved').getByRole('button', { name: 'Ver registro', exact: true }).click();
  const saved = page.locator('.daily-record-open[data-just-saved]');
  await saved.waitFor();
  await settle(page);
  assert.match(await saved.textContent(), /Tostada sintética de avena.*\+750 kcal/);
  await shot(page, `390-${theme}-registros-guardado`);
}

async function datosControl(page) {
  await fixture(page, 'normal');
  await go(page, 'Datos');
  await page.locator('.app-main').evaluate(el => { el.scrollTop = 0; });
  await settle(page);
  const name = 'datos-390-light';
  await shot(page, name);
  if (!before) {
    const paths = [path.join(output, '..', 'before', name + '.jpg'), path.join(output, name + '.jpg')];
    const images = await Promise.all(paths.map(async file => (await readFile(file)).toString('base64')));
    report.datosControl = await page.evaluate(async data => {
      // The active navigation glass is checked independently. Compare Data's own rendered area.
      const height = Math.floor(document.querySelector('.bottom-nav-track').getBoundingClientRect().top);
      const canvas = document.createElement('canvas');
      canvas.width = innerWidth;
      canvas.height = height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      const pixels = [];
      for (const source of data) {
        const image = new Image();
        image.src = `data:image/jpeg;base64,${source}`;
        await image.decode();
        context.drawImage(image, 0, 0);
        pixels.push(context.getImageData(0, 0, canvas.width, canvas.height).data);
      }
      return { width: canvas.width, height, equal: pixels[0].every((value, index) => value === pixels[1][index]) };
    }, images);
    assert.equal(report.datosControl.equal, true, 'El área de Datos difiere de la referencia');
  }
  await go(page, 'Inicio');
}

function validate(entry) {
  const label = `${entry.width} ${entry.theme} ${entry.zoom}%`;
  assert.ok(entry.overflow <= 1, `Desborde ${label}: ${entry.overflow}`);
  assert.equal(entry.orange, '#ff9a53');
  for (const [name, section] of Object.entries(entry.sections)) {
    assert.deepEqual(section.short, [], `Objetivos táctiles ${name} ${label}`);
    assert.deepEqual(section.clipped, [], `Texto recortado ${name} ${label}`);
    assert.equal(section.reduced, true, `Movimiento reducido ${name} ${label}`);
  }
  assert.ok(entry.rows.some(row => row.kcal === '+1.100 kcal'), `Formato de calorías ${label}`);
  assert.ok(entry.rows.every(row => !row.overlap), `Título y calorías se pisan ${label}`);
  assert.ok(entry.recordsDisclosureGap >= 5.9, `Separación de Ver todos ${label}: ${entry.recordsDisclosureGap}`);
  assert.ok(entry.photo, `La miniatura sintética no cargó ${label}`);
  assert.ok(entry.photo.image.height <= entry.photo.frame.height + .1 && entry.photo.image.width <= entry.photo.frame.width + .1,
    `Miniatura fuera de su marco ${label}: ${JSON.stringify(entry.photo)}`);
  for (const [name, result] of Object.entries(entry.contrast ?? {})) {
    assert.ok(result.count > 0 && result.min >= 4.5, `Contraste ${name} ${label}: ${JSON.stringify(result)}`);
    assert.ok(result.icons.count > 0 && result.icons.min >= 3, `Contraste de iconos ${name} ${label}: ${JSON.stringify(result.icons)}`);
  }
  for (const check of entry.focus ?? []) {
    assert.ok(check.active && check.focus && check.outline !== 'none' && check.hit && (check.gap === null || check.gap >= 0),
      `Foco ${label}: ${JSON.stringify(check)}`);
  }
}

try {
  for (const theme of themes) {
    const { page, context, errors } = await open(browser, 375, theme, theme, origin);
    try {
      assert.equal(await page.evaluate(() => window.__homeQA.phase), `liquid-glass-home-2b-${phase}`);
      for (const [width, height] of layouts.filter(([width]) => !quick || [390, 1440].includes(width))) {
        await page.setViewportSize({ width, height });
        await page.waitForFunction(width => innerWidth === width, width);
        await fixture(page, 'stress');
        await page.locator('.daily-record-open img').waitFor();
        await page.locator('.daily-record-open img').evaluate(img => img.decode());
        await expandActivity(page);
        if (quick) {
          if (!webkit) for (const [name, selector] of Object.entries(blocks)) {
            await place(page, selector);
            await shot(page, `${width}-${theme}-${name}`);
          }
          if (!webkit && width === 390) await materialCloseups(page, theme);
          if (!webkit && width === 390 && theme === 'light') await datosControl(page);
          continue;
        }
        for (const zoom of [100, 200]) {
          await page.evaluate(z => {
            document.documentElement.style.fontSize = z === 200 ? '200%' : '';
            document.querySelector('.app-main').scrollTop = 0;
          }, zoom);
          await settle(page);
          const entry = { width, height, theme, zoom, ...await geometry(page, targets) };
          if (zoom === 100) {
            entry.contrast = {};
            for (const [name, selector] of Object.entries(blocks)) {
              await place(page, selector);
              entry.contrast[name] = await contrast(page, textSelectors[name], iconSelectors[name]);
              if (!webkit && ([390, 1440].includes(width) || name === 'registros')) await shot(page, `${width}-${theme}-${name}`);
            }
          }
          if (width === 390 || (width === 320 && zoom === 200)) {
            entry.focus = [];
            for (const selector of ['.daily-record-open', '.habit-edit', '.ah-key-disclosure summary']) entry.focus.push(await focusCheck(page, selector));
          }
          if (!webkit && zoom === 200 && width === 320) {
            await place(page, blocks.habitos);
            await shot(page, `320-${theme}-habitos-200`);
          }
          if (!before) validate(entry);
          report.cases.push(entry);
        }
        await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
        if (!webkit && width === 390) {
          await materialCloseups(page, theme);
          await extraCaptures(page, theme);
          if (theme === 'light') await datosControl(page);
        }
        console.log(phase, width, theme);
      }
      const warning = 'ResizeObserver loop completed with undelivered notifications.';
      if (webkit) report.warnings.push(...errors.filter(error => error === warning));
      assert.deepEqual(webkit ? errors.filter(error => error !== warning) : errors, []);
      assert.deepEqual(await page.evaluate(() => [window.__homeQA.aiCalls.length, window.__homeQA.externalRequests]), [0, 0]);
    } finally {
      await context.close();
    }
  }
  if (!quick) {
    if (!before) {
      const reference = JSON.parse(await readFile(path.join(output, '..', 'before', `${report.engine}.json`), 'utf8'));
      for (const actual of report.cases) {
        const original = reference.cases.find(r => r.width === actual.width && r.theme === actual.theme && r.zoom === actual.zoom);
        assert.deepEqual(actual.approved, original.approved, `Apariencia 2A y navegación ${actual.width} ${actual.theme} ${actual.zoom}%`);
      }
    }
    await writeFile(path.join(output, `${report.engine}.json`), JSON.stringify(report, null, 2) + '\n');
  }
} finally {
  await browser.close();
}
