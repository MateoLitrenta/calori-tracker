import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rmdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { before, go, origin, repo, start } from './browser.mjs';

const finalGlass = process.argv.includes('--glass-final');
const optics = finalGlass || process.argv.includes('--glass-iteration-2');
const webkit = process.argv.includes('--webkit');
assert.ok(!webkit || optics, 'WebKit matrix output requires a phase-specific fixture');
const output = path.join(repo, 'docs/evidence/liquid-glass-navigation',
  finalGlass ? 'iteracion-final' : optics ? 'iteracion-2' : '', before ? 'before' : 'after');
const playwright = process.env.PLAYWRIGHT_MODULE || path.resolve(repo, '../qa-tools/node_modules/playwright/index.mjs');
const browser = webkit ? await (await import(pathToFileURL(playwright))).webkit.launch() : await start();
const mobile = {
  nav: '.app-bottom-nav', surface: '.bottom-nav-track', marker: '.bottom-nav-indicator',
};
const desktop = {
  nav: '.app-sidebar nav', surface: '.app-sidebar', marker: '.sidebar-nav-indicator',
};
const sizes = [[320, 568], [375, 812], [390, 844], [767, 844], [768, 844], [1280, 800], [1440, 900]];
const themes = ['light', 'dark'];
const conditionsOnly = process.argv.includes('--conditions');
const report = { browser: browser.version(), engine: webkit ? 'webkit' : 'chromium', origin, matrix: [], conditions: [], motion: [] };
if (finalGlass) report.transmission = [];
await mkdir(output, { recursive: true });

const settle = page => page.evaluate(async () => {
  await document.fonts.ready;
  await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
});

async function startPage(theme, viewport, options = {}, preference = theme) {
  const context = await browser.newContext({
    viewport, colorScheme: theme, locale: 'es-AR', timezoneId: 'America/Buenos_Aires',
    reducedMotion: 'reduce', deviceScaleFactor: optics ? 2 : 1, ...options,
  });
  const errors = [];
  await context.route('**/*', route => {
    if (new URL(route.request().url()).origin === origin) return route.continue();
    errors.push('External network request');
    return route.abort();
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin + '/qa?controls=0&theme=' + preference, { waitUntil: 'commit', timeout: 90000 });
  await page.locator('.fitness-home').waitFor({ timeout: 90000 });
  if (optics) {
    const phase = finalGlass ? 'liquid-glass-final' : 'liquid-glass-2';
    assert.equal(await page.evaluate(() => window.__homeQA.phase), phase + (before ? '-before' : '-after'));
  }
  await settle(page);
  return { context, page, errors };
}

const picture = (page, filename, options = {}) =>
  page.screenshot({ path: path.join(output, filename + '.jpg'), scale: 'css', quality: 86, ...options });

async function geometry(page, selectors) {
  return page.evaluate(({ nav, surface, marker }) => {
    const round = n => Math.round(n * 100) / 100;
    const box = el => {
      const rect = el.getBoundingClientRect();
      return Object.fromEntries(['left', 'top', 'right', 'bottom', 'width', 'height'].map(prop => [prop, round(rect[prop])]));
    };
    const material = document.querySelector(surface);
    const navigation = document.querySelector(nav);
    const selected = document.querySelector(marker);
    const style = getComputedStyle(material);
    const markerStyle = selected && getComputedStyle(selected);
    const main = document.querySelector('.app-main');
    const buttons = [...navigation.querySelectorAll('button')].map(button => {
      const icon = button.querySelector('svg');
      const range = document.createRange();
      if (icon?.nextSibling && icon.nextSibling.parentNode === button) range.selectNode(icon.nextSibling);
      else range.selectNodeContents(button);
      const label = range.getBoundingClientRect();
      const frame = box(button);
      return {
        label: button.textContent.trim(), current: button.getAttribute('aria-current') === 'page',
        ...frame, labelWidth: round(label.width), labelHeight: round(label.height),
        labelFits: label.left >= frame.left - 1 && label.right <= frame.right + 1 &&
          label.top >= frame.top - 1 && label.bottom <= frame.bottom + 1,
        icon: icon && box(icon),
      };
    });
    const materialBox = box(material);
    const markerBox = selected && box(selected);
    return {
      viewport: [innerWidth, innerHeight], material: materialBox, main: box(main), buttons,
      rightGap: round(innerWidth - materialBox.right),
      bottomGap: round(innerHeight - materialBox.bottom),
      radius: style.borderTopLeftRadius,
      fill: style.backgroundColor, backdrop: style.backdropFilter || style.webkitBackdropFilter || 'none',
      outline: style.borderColor,
      surfaceLighting: { image: style.backgroundImage, shadow: style.boxShadow },
      brandOrange: getComputedStyle(document.documentElement).getPropertyValue('--fit-orange').trim(),
      indicator: selected ? {
        ...markerBox, radius: markerStyle.borderTopLeftRadius,
        fill: markerStyle.backgroundColor, image: markerStyle.backgroundImage,
        rim: markerStyle.borderColor, shadow: markerStyle.boxShadow,
      } : null,
      coveragePercent: round(materialBox.width * materialBox.height / (innerWidth * innerHeight) * 100),
      reservedBottom: parseFloat(getComputedStyle(main).paddingBottom),
      pageOverflow: document.documentElement.scrollWidth > innerWidth + 1,
    };
  }, selectors);
}

async function verifyGeometry(page, value, width) {
  const isMobile = width < 768;
  assert.ok(!value.pageOverflow, 'Horizontal overflow at ' + width);
  assert.equal(value.buttons.length, 4);
  assert.equal(value.buttons.filter(button => button.current).length, 1);
  assert.equal(await page.getByRole('navigation', { name: 'Navegación principal' }).count(), 1);
  if (before) return;
  for (const button of value.buttons) {
    assert.ok(button.width >= 44 && button.height >= 44, JSON.stringify(button));
    assert.ok(button.labelFits, JSON.stringify(button));
  }
  if (isMobile) {
    assert.ok(value.material.left > 0 && value.rightGap > 0 && value.bottomGap > 0, JSON.stringify(value.material));
    assert.ok(value.reservedBottom >= value.material.height + value.bottomGap - 1, 'Space for the floating navigation');
  } else {
    assert.ok(value.material.right <= value.main.left + 1, 'Sidebar overlaps the content');
  }
  const active = value.buttons.find(button => button.current);
  const marker = value.indicator;
  assert.ok(marker && marker.width > 0 && marker.height > 0, 'Active indicator must be visible');
  for (const axis of [['left', 'right'], ['top', 'bottom']]) {
    const [start, end] = axis;
    assert.ok(Math.abs(marker[start] + marker[end] - active[start] - active[end]) <= 2,
      'Indicator and active target should share a center: ' + JSON.stringify({ marker, active }));
  }
}

async function contentPosition(page, viewTop = 178) {
  await page.locator('.app-main').evaluate((el, top) => el.scrollTop = top, viewTop);
  await settle(page);
}

async function contrast(page, selectors) {
  const targets = selectors.nav + ' button' + (finalGlass && selectors === desktop
    ? ', .app-sidebar .sidebar-label, .app-sidebar .sidebar-signout, .app-sidebar .brand-symbol-sidebar + span'
    : '');
  const buttons = await page.locator(targets).evaluateAll(elements => {
    const region = rect => ({ left: rect.left, top: rect.top, width: rect.width, height: rect.height });
    return elements.map(button => {
      const svg = button.querySelector('svg');
      const label = document.createRange();
      if (svg?.nextSibling) label.selectNode(svg.nextSibling);
      else label.selectNodeContents(button);
      const style = getComputedStyle(button);
      return {
        label: button.textContent.trim(), active: button.getAttribute('aria-current') === 'page',
        text: { color: style.color, ...region(label.getBoundingClientRect()) },
        icon: svg ? { color: getComputedStyle(svg).color, ...region(svg.getBoundingClientRect()) } : null,
        outline: [style.outlineColor, style.outlineStyle, style.outlineWidth],
      };
    });
  });
  // Capture the actual blurred, tinted pixels underneath the foreground.
  const hidden = await page.addStyleTag({ content: `:is(${targets}) { color: transparent !important; }` });
  let rendered;
  try {
    rendered = (await page.screenshot({ type: 'png', scale: 'css' })).toString('base64');
  } finally {
    await hidden.evaluate(element => element.remove());
  }
  return page.evaluate(async ({ rendered, buttons }) => {
    const image = new Image();
    image.src = 'data:image/png;base64,' + rendered;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(image, 0, 0);
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const color = value => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = value;
      ctx.fillRect(0, 0, 1, 1);
      return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3);
    };
    const luminance = pixels => pixels.map(n => n / 255)
      .map(n => n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4)
      .reduce((sum, n, index) => sum + n * [0.2126, 0.7152, 0.0722][index], 0);
    const hex = pixels => '#' + pixels.map(n => n.toString(16).padStart(2, '0')).join('');
    const sample = ({ left, top, width, height, color: css }) => {
      const foreground = color(css);
      const light = luminance(foreground);
      const pixels = [];
      for (const fy of [0.2, 0.5, 0.8]) {
        for (const fx of [0.1, 0.3, 0.5, 0.7, 0.9]) {
          const x = Math.round(left + fx * width);
          const y = Math.round(top + fy * height);
          const i = (y * canvas.width + x) * 4;
          const background = [...data.slice(i, i + 3)];
          const luma = luminance(background);
          pixels.push({ background: hex(background), ratio: (Math.max(light, luma) + 0.05) / (Math.min(light, luma) + 0.05) });
        }
      }
      const worst = pixels.reduce((a, b) => a.ratio < b.ratio ? a : b);
      return { foreground: hex(foreground), background: worst.background, ratio: Math.round(worst.ratio * 100) / 100 };
    };
    return buttons.map(({ label, active, text, icon, outline }) =>
      ({ label, active, text: sample(text), icon: icon ? sample(icon) : null, outline }));
  }, { rendered, buttons });
}

function verifyContrast(samples, description) {
  if (before) return;
  for (const control of samples) {
    assert.ok(control.text.ratio >= 4.5 && (!control.icon || control.icon.ratio >= 3),
      description + ': ' + JSON.stringify(control));
  }
}

async function runMatrix(theme) {
  const { context, page, errors } = await startPage(theme, { width: 375, height: 812 });
  try {
    for (const [width, height] of sizes) {
      await page.setViewportSize({ width, height });
      await contentPosition(page);
      if (!webkit && (!finalGlass || width === 390 || width === 1440)) await picture(page, 'inicio-' + width + '-' + theme);
      const info = await geometry(page, width < 768 ? mobile : desktop);
      await verifyGeometry(page, info, width);
      if (optics) {
        assert.equal(info.brandOrange, '#ff9a53');
        assert.equal(parseFloat(info.radius), width < 768 ? 28 : 26);
        assert.equal(parseFloat(info.indicator.radius), width < 768 ? 24 : 14);
      }
      if (!webkit && width === 390) {
        const pathToImage = path.join(output, 'curvas-movil-' + theme + '.png');
        if (optics) {
          const top = Math.floor(info.material.top) - 12;
          await page.screenshot({ path: pathToImage, clip: {x: 0, y: top, width, height: height - top} });
        } else {
          await page.locator(mobile.surface).screenshot({path: pathToImage});
        }
      }
      if (!webkit && width === 1440) {
        await page.screenshot({
          path: path.join(output, 'curvas-lateral-' + theme + '.png'),
          clip: {x: 0, y: 0, width: 280, height: 405},
        });
      }
      if (optics || width === 390 || width === 1440) {
        info.contrast = await contrast(page, width < 768 ? mobile : desktop);
        verifyContrast(info.contrast, theme + ' ' + width);
      }
      if (width === 390) {
        info.lastAction = await page.locator('.app-main').evaluate(main => {
          const previous = main.scrollTop;
          main.scrollTop = main.scrollHeight;
          const controls = [...main.querySelectorAll('button, a[href]')].filter(el => el.getClientRects().length);
          const last = controls.at(-1);
          if (!last) return null;
          const { left, top, width, height, bottom } = last.getBoundingClientRect();
          const hit = document.elementFromPoint(left + width / 2, top + height / 2);
          const bottomBoundary = document.querySelector('.app-bottom-nav').getBoundingClientRect().top;
          const result = { text: last.textContent.trim(), bottom, bottomBoundary, hit: !!hit && last.contains(hit) };
          main.scrollTop = previous;
          return result;
        });
        if (!before) assert.ok(info.lastAction?.hit && info.lastAction.bottom <= info.lastAction.bottomBoundary + 1,
          'Last content action must clear the floating navigation: ' + JSON.stringify(info.lastAction));
      }
      report.matrix.push({ theme, ...info });
      console.log('Inicio', theme, width + ' × ' + height);
    }
    if (webkit) {
      // Both iterations issue this WebKit notification during rapid viewport changes.
      const resizeNotice = 'ResizeObserver loop completed with undelivered notifications.';
      const count = errors.filter(message => message === resizeNotice).length;
      (report.browserWarnings ??= []).push({ theme, message: resizeNotice, count });
      assert.deepEqual(errors.filter(message => message !== resizeNotice), []);
    } else {
      assert.deepEqual(errors, []);
    }
  } finally {
    await context.close();
  }
}

async function backdrop(page, variant, theme, lateral = false) {
  await page.evaluate(({ variant, theme, lateral }) => {
    let panel = document.querySelector('#fixture-glass-background');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'fixture-glass-background';
      panel.setAttribute('aria-hidden', 'true');
      panel.textContent = 'Contenido de prueba · Balance 450 kcal · Merienda · Ejercicio · 40 min';
      Object.assign(panel.style, {
        position: 'fixed', inset: 'auto 0 0', zIndex: '29', height: '150px', padding: '58px 14px 12px',
        font: '700 14px/1.4 sans-serif', pointerEvents: 'none', color: '#1c2522',
      });
      document.querySelector('.app-shell').prepend(panel);
    }
    if (lateral) {
      Object.assign(panel.style, {
        position: 'absolute', inset: '0 auto 0 0', zIndex: 'auto', height: 'auto', width: '256px', padding: '172px 12px 12px',
      });
    }
    panel.style.background = ({
      opaque: theme === 'dark' ? '#293134' : '#f1ebe0',
      complex: 'repeating-linear-gradient(117deg, #1c2522 0 23px, #ff9a53 23px 50px, #fffefa 50px 73px, #2c6370 73px 109px)',
      white: '#ffffff',
      black: '#000000',
    })[variant];
    panel.style.color = variant === 'white' || (variant === 'opaque' && theme === 'light') ? '#1c2522' : '#fffefa';
  }, { variant, theme, lateral });
  await settle(page);
}

async function sampleTransmission(page, selectors) {
  const lateral = selectors === desktop;
  const surface = await page.locator(selectors.surface).boundingBox();
  const rendered = (await page.screenshot({ type: 'png', scale: 'css', clip: {
    x: Math.round(surface.x + surface.width * .6), y: Math.round(surface.y + surface.height * (lateral ? .45 : .5)),
    width: 5, height: 5,
  } })).toString('base64');
  return page.evaluate(async rendered => {
    const image = new Image();
    image.src = 'data:image/png;base64,' + rendered;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0);
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const mean = [0, 0, 0];
    for (let i = 0; i < data.length; i += 4) {
      for (let channel = 0; channel < 3; channel++) mean[channel] += data[i + channel];
    }
    return mean.map(sum => Math.round(sum / (data.length / 4) * 100) / 100);
  }, rendered);
}

async function runLateralBackdrop(theme) {
  const { context, page, errors } = await startPage(theme, { width: 1440, height: 900 });
  try {
    const endpoints = {};
    for (const variant of ['black', 'white', 'complex']) {
      await backdrop(page, variant, theme, true);
      if (variant !== 'complex') endpoints[variant] = await sampleTransmission(page, desktop);
      const samples = await contrast(page, desktop);
      verifyContrast(samples, 'lateral ' + theme + ' ' + variant);
      report.conditions.push({ scenario: 'lateral-prueba-' + variant, theme, contrast: samples });
      if (!webkit && variant === 'complex') await page.screenshot({
        path: path.join(output, 'lateral-fondo-prueba-' + theme + '.png'),
        clip: { x: 0, y: 0, width: 290, height: 900 },
      });
    }
    report.transmission.push({ surface: 'lateral', theme, ...endpoints });
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
}

async function disableFirstBackdropLayer(page) {
  // Remove the CSS feature-gated enhancement while leaving the default material.
  return page.evaluate(() => {
    let disabled = 0;
    const strip = container => {
      for (let n = container.cssRules.length - 1; n >= 0; n--) {
        const rule = container.cssRules[n];
        if (rule instanceof CSSSupportsRule && rule.conditionText.includes('backdrop-filter')) {
          container.deleteRule(n);
          disabled++;
        } else if (rule.cssRules && rule.deleteRule) strip(rule);
      }
    };
    for (const sheet of document.styleSheets) strip(sheet);
    return disabled;
  });
}

async function runConditions(theme) {
  const { context, page, errors } = await startPage(theme, { width: 390, height: 844 }, {}, 'system');
  const collect = async (scenario, extra = {}) => {
    const info = await geometry(page, mobile);
    const samples = await contrast(page, mobile);
    verifyContrast(samples, scenario + ' ' + theme);
    report.conditions.push({ scenario, theme, geometry: info, contrast: samples, ...extra });
    return info;
  };
  try {
    await contentPosition(page);
    const endpoints = {};
    for (const [variant, title] of [['opaque', 'fondo-cercano'], ['complex', 'fondo-complejo'],
      ['black', 'fondo-negro'], ['white', 'fondo-blanco']]) {
      await backdrop(page, variant, theme);
      if (finalGlass && (variant === 'black' || variant === 'white')) endpoints[variant] = await sampleTransmission(page, mobile);
      await collect(title);
      if ((!finalGlass && variant === 'opaque') || variant === 'complex') await picture(page, title + '-' + theme);
    }
    if (finalGlass) report.transmission.push({ surface: 'cápsula', theme, ...endpoints });
    await backdrop(page, 'complex', theme);
    const session = await context.newCDPSession(page);
    for (const [name, value, title] of [
      ['prefers-contrast', 'more', 'contraste-alto'],
      ['prefers-reduced-transparency', 'reduce', 'transparencia-reducida'],
    ]) {
      await session.send('Emulation.setEmulatedMedia', { features: [
        {name: 'prefers-color-scheme', value: theme}, {name: 'prefers-reduced-motion', value: 'reduce'}, {name, value},
      ] });
      await settle(page);
      const applied = await page.evaluate(({name, value}) => matchMedia('(' + name + ': ' + value + ')').matches, {name, value});
      await collect(title, { applied });
      if (!finalGlass) await picture(page, title + '-' + theme);
    }
    await session.send('Emulation.setEmulatedMedia', { features: [] });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    const changedTheme = theme === 'dark' ? 'light' : 'dark';
    await page.emulateMedia({ colorScheme: changedTheme });
    await page.waitForFunction(dark => document.documentElement.classList.contains('dark') === dark, changedTheme === 'dark');
    await collect('sistema-cambio-dinamico', { effectiveTheme: changedTheme });
    await page.emulateMedia({ colorScheme: theme });
    await page.waitForFunction(dark => document.documentElement.classList.contains('dark') === dark, theme === 'dark');
    await page.locator('#fixture-glass-background').evaluate(el => el.remove());
    await page.setViewportSize({ width: 320, height: 568 });
    await settle(page);
    const readSize = () => page.locator(mobile.nav + ' button span').first().evaluate(el => parseFloat(getComputedStyle(el).fontSize));
    const originalSize = await readSize();
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    await settle(page);
    const expandedSize = await readSize();
    if (!before) assert.ok(expandedSize >= originalSize * 2 - 1, 'Browser root font size must propagate to the navigation');
    const expanded = await geometry(page, mobile);
    await verifyGeometry(page, expanded, 320);
    const nav = page.getByRole('navigation', { name: 'Navegación principal' });
    const location = button => button.getAttribute('aria-current');
    await nav.getByRole('button', { name: 'Inicio' }).focus();
    await page.keyboard.press('Tab');
    const focus = nav.getByRole('button', {name: 'Coach'});
    assert.ok(await focus.evaluate(el => el.matches(':focus-visible') && getComputedStyle(el).outlineStyle !== 'none'));
    assert.equal(await location(focus), null, 'Focus alone must not select the tab');
    if (!finalGlass) await picture(page, 'texto-200-foco-' + theme);
    await page.keyboard.press('Enter');
    await page.locator('.assistant-view').waitFor();
    assert.equal(await location(focus), 'page');
    const durations = await page.locator(mobile.marker).evaluate(el =>
      getComputedStyle(el).transitionDuration.split(', ').map(parseFloat),
    );
    assert.ok(durations.every(n => n === 0));
    report.conditions.push({ scenario: 'texto-200-y-teclado', theme, geometry: expanded, originalSize, expandedSize, reducedMotionSeconds: durations });

    await page.evaluate(() => document.documentElement.style.removeProperty('font-size'));
    await page.setViewportSize({ width: 390, height: 844 });
    await go(page, 'Inicio');
    // Chromium's protocol can emulate a device inset without pretending to be iOS.
    try {
      await session.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 0, left: 24, right: 18, bottom: 34 } });
      await settle(page);
      const inset = await geometry(page, mobile);
      if (!before) {
        assert.ok(inset.bottomGap >= 34);
        assert.ok(inset.material.left >= 24 && inset.rightGap >= 18);
        assert.ok(inset.reservedBottom >= inset.bottomGap + inset.material.height - 1);
      }
      report.conditions.push({ scenario: 'safe-area-34', theme, geometry: inset, overrides: { left: 24, right: 18, bottom: 34 } });
      await session.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 0, left: 0, right: 0, bottom: 0 } });
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes('Protocol error')) throw error;
      report.conditions.push({ scenario: 'safe-area-34', theme, protocolSupported: false });
    }

    await backdrop(page, 'complex', theme);
    const disabled = await disableFirstBackdropLayer(page);
    const fallback = await collect('sin-backdrop-filter', { enhancementRulesRemoved: disabled });
    if (!before) {
      assert.ok(disabled >= 1, 'A backdrop enhancement must have been tested');
      assert.equal(fallback.backdrop, 'none');
    }
    if (!finalGlass) await picture(page, 'sin-backdrop-' + theme);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
}

async function record(name, action) {
  const viewport = { width: 390, height: 844 };
  const dir = await mkdtemp(path.join(tmpdir(), 'calori-glass-'));
  const { context, page, errors } = await startPage('dark', viewport, {
    reducedMotion: 'no-preference', recordVideo: { dir, size: viewport },
  });
  const video = page.video();
  let seconds;
  try {
    await contentPosition(page, optics ? 0 : undefined);
    const ready = performance.now();
    await page.waitForTimeout(250);
    await action(page);
    await page.waitForTimeout(350);
    seconds = (performance.now() - ready) / 1000;
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
  const require = createRequire(playwright);
  const { registry } = require('playwright-core/lib/server/registry/index');
  const ffmpeg = registry.findExecutable('ffmpeg').executablePath();
  execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-sseof', '-' + seconds.toFixed(3), '-i',
    await video.path(), '-an', '-c:v', 'libvpx', '-threads', '1', '-b:v', '1M', '-crf', '12', '-y',
    path.join(output, name + '.webm')]);
  await video.delete();
  await rmdir(dir);
  console.log('Video', name);
}

async function indicatorVideo(page) {
  const beforeNav = await geometry(page, mobile);
  for (const name of ['Datos', 'Perfil', 'Coach', 'Inicio']) {
    const samples = await page.evaluate(async ({ selectors, name }) => {
      const nav = document.querySelector(selectors.nav);
      const marker = nav.querySelector(selectors.marker);
      const button = [...nav.querySelectorAll('button')].find(el => el.textContent.trim() === name);
      const from = marker.getBoundingClientRect().left;
      const initial = performance.now();
      const frames = [{ time: 0, left: from }];
      button.click();
      do {
        await new Promise(done => requestAnimationFrame(done));
        frames.push({ time: Math.round(performance.now() - initial), left: Math.round(marker.getBoundingClientRect().left * 10) / 10 });
      } while (performance.now() - initial < 330);
      return frames;
    }, { selectors: mobile, name });
    assert.equal(await page.getByRole('button', {name, exact: true}).getAttribute('aria-current'), 'page');
    report.motion.push({ scenario: 'indicador', name, samples });
    await page.waitForTimeout(230);
  }
  const afterNav = await geometry(page, mobile);
  assert.deepEqual(afterNav.buttons, beforeNav.buttons, 'Returning to the same tab preserves the label positions');
  assert.ok(report.motion.some(({ samples }) => {
    const first = samples[0].left, last = samples.at(-1).left;
    return samples.slice(1, -1).some(({left}) => left > Math.min(first, last) && left < Math.max(first, last));
  }), 'The indicator moves through intermediate frames');
}

async function scrollVideo(page) {
  const atStart = await page.locator(mobile.surface).boundingBox();
  const walk = await page.locator('.app-main').evaluate(async main => {
    main.scrollTop = 0;
    const distance = main.scrollHeight - main.clientHeight;
    const start = performance.now();
    const scrolls = [];
    const intervals = [];
    let previous = start;
    do {
      await new Promise(done => requestAnimationFrame(done));
      const now = performance.now();
      const elapsed = Math.min((now - start) / 2500, 1);
      main.scrollTop = distance * (1 - Math.cos(elapsed * Math.PI)) / 2;
      scrolls.push(main.scrollTop);
      intervals.push(now - previous);
      previous = now;
    } while (performance.now() - start < 2500);
    return {
      distance,
      scrolls: [scrolls[0], scrolls.at(-1)],
      frames: scrolls.length,
      frameMedianMs: Math.round(intervals.slice().sort((a, b) => a - b)[Math.floor(intervals.length / 2)] * 10) / 10,
    };
  });
  assert.ok(walk.distance > 80 && walk.scrolls[1] >= walk.distance - 2, JSON.stringify(walk));
  assert.deepEqual(await page.locator(mobile.surface).boundingBox(), atStart, 'The glass stays still while content scrolls');
  report.motion.push({ scenario: 'desplazamiento', ...walk });
}

try {
  if (!conditionsOnly) for (const theme of themes) await runMatrix(theme);
  if (!webkit) for (const theme of themes) await runConditions(theme);
  if (finalGlass) for (const theme of themes) await runLateralBackdrop(theme);
  if (optics && !finalGlass && !webkit && !conditionsOnly) {
    await record('material-en-movimiento', scrollVideo);
  } else if (!optics && !before && !conditionsOnly) {
    await record('movimiento-indicador', indicatorVideo);
    await record('contenido-detras-del-vidrio', scrollVideo);
  }
  const filename = webkit ? 'mediciones-webkit.json' : conditionsOnly ? 'condiciones.json' : 'mediciones.json';
  await writeFile(path.join(output, filename), JSON.stringify(report, null, 2) + '\n');
} finally {
  await browser.close();
}
