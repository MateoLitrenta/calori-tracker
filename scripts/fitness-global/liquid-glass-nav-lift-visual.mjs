import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { before, go, open, origin, repo, start, tabs } from './browser.mjs';

const webkit = process.argv.includes('--webkit');
const quick = process.argv.includes('--quick');
const modulePath = process.env.PLAYWRIGHT_MODULE || path.resolve(repo, '../qa-tools/node_modules/playwright/index.mjs');
const browser = webkit ? await (await import(pathToFileURL(modulePath))).webkit.launch() : await start();
const evidence = path.join(repo, 'docs/evidence/liquid-glass-home/ajuste-altura-nav');
const output = path.join(evidence, before ? 'before' : 'after');
const reportName = webkit ? 'mediciones-webkit.json' : 'mediciones-chromium.json';
const phase = before ? 'before' : 'after';
const report = { browser: browser.version(), phase, cases: [], safeAreas: [], resize: [], desktop: [], warnings: [] };

const small = [[320, 568], [375, 812], [390, 844], [440, 956]];
const themes = quick ? ['light'] : ['light', 'dark'];
const widths = quick ? [[390, 844]] : small;
const names = Object.keys(tabs);
const tolerance = .75;
const close = (actual, expected, name) => assert.ok(Math.abs(actual - expected) < tolerance, name + ': ' + actual + ' ≠ ' + expected);
const round = number => Number(number.toFixed(2));
const afterRender = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));

async function resize(page, width, height) {
  await page.setViewportSize({ width, height });
  await page.waitForFunction(([width, height]) => innerWidth === width && innerHeight === height, [width, height]);
  await afterRender(page);
}

async function measure(page) {
  return page.evaluate(() => {
    const html = document.documentElement;
    const measureLength = value => {
      const probe = document.createElement('div');
      probe.style.position = 'fixed';
      probe.style.height = value;
      document.querySelector('.app-shell').append(probe);
      const number = probe.getBoundingClientRect().height;
      probe.remove();
      return number;
    };
    const track = document.querySelector('.bottom-nav-track');
    const indicator = document.querySelector('.bottom-nav-indicator');
    const main = document.querySelector('.app-main');
    const trackStyle = getComputedStyle(track);
    const selectionStyle = getComputedStyle(indicator);
    const bounds = track.getBoundingClientRect();
    const area = document.querySelector('.app-shell').getBoundingClientRect();
    const selected = track.querySelector('[aria-current="page"]');
    const box = selected.getBoundingClientRect();
    const buttons = [...track.querySelectorAll('button')].map(button => {
      const frame = button.getBoundingClientRect();
      const center = document.elementFromPoint(frame.x + frame.width / 2, frame.y + frame.height / 2);
      return [frame.width, frame.height, button.contains(center), button.scrollWidth - button.clientWidth];
    });
    const reserve = measureLength('var(--glass-nav-reserve)');
    const offset = measureLength('var(--feedback-offset)');
    const style = getComputedStyle(main);
    const cssSmallHeight = CSS.supports('height', '100svh') ? measureLength('100svh') : null;
    const cssSafe = measureLength('env(safe-area-inset-bottom, 0px)');
    const res = {
      width: innerWidth, height: innerHeight, smallHeight: cssSmallHeight, cssSafe,
      capsule: { top: bounds.top, width: bounds.width, height: bounds.height, bottom: bounds.bottom,
        left: bounds.left, right: innerWidth - bounds.right, gap: innerHeight - bounds.bottom, gapInShell: area.bottom - bounds.bottom,
        radius: trackStyle.borderRadius, background: trackStyle.background, filter: trackStyle.backdropFilter },
      indicator: { radius: selectionStyle.borderRadius, background: selectionStyle.background, duration: selectionStyle.transitionDuration },
      selectionAligned: Math.abs(box.top - indicator.getBoundingClientRect().top) < 1,
      horizontalOverflow: Math.max(html.scrollWidth - innerWidth, main.scrollWidth - main.clientWidth, 0),
      buttons, reserve, offset, reservePadding: parseFloat(style.paddingBottom),
      scrollPadding: parseFloat(style.scrollPaddingBlockEnd) || 0,
      coach: document.querySelector('.app-shell-coach') ? {
        composerClearance: bounds.top - document.querySelector('.chat-composer').getBoundingClientRect().bottom,
        inputClearance: bounds.top - document.querySelector('.chat-composer textarea').getBoundingClientRect().bottom,
        viewportBottom: area.bottom,
      } : null,
    };
    return res;
  });
}

function validate(result, { name, inset = result.cssSafe } = {}) {
  const { capsule, indicator, buttons, reserve, width, smallHeight } = result;
  const description = name + ' ' + width + ' × ' + result.height;
  const lift = smallHeight === null ? 12 : Math.min(16, Math.max(12, smallHeight * .02));
  close(capsule.gap, 6 + inset + (before ? 0 : lift), description + ' gap');
  close(reserve, capsule.gap + capsule.height + 2, description + ' reserve');
  assert.ok(result.horizontalOverflow <= 1, 'Overflow ' + description + ' ' + result.horizontalOverflow);
  assert.ok(result.selectionAligned && capsule.radius && indicator.radius, 'Alineación del indicador ' + description);
  assert.ok(indicator.duration.split(',').every(duration => Number.parseFloat(duration) === 0), 'Movimiento reducido ' + description);
  assert.equal(buttons.length, 4);
  assert.ok(buttons.every(([w, h, hit, overflow]) => w >= 44 && h >= 44 && hit && overflow <= 1), 'Tamaño o hit-test ' + description + ': ' + JSON.stringify(buttons));
  if (!before) assert.ok(result.offset >= reserve + (name === 'Coach' ? 0 : 7), 'El aviso podría tapar la cápsula ' + description);
  if (name === 'Coach') {
    assert.ok(result.coach.composerClearance >= 0 && result.coach.inputClearance >= 0, 'El compositor no queda libre ' + description + ': ' + JSON.stringify(result.coach));
    close(result.reservePadding, reserve, 'Reserva del compositor ' + description);
  }
}

const lastSelectors = {
  Inicio: '.home-history-toggle',
  Datos: '.charts-insights > section:last-of-type',
  Perfil: '.profile-management > summary',
};

async function endOfContent(page, name) {
  const sel = lastSelectors[name];
  if (!sel) return null;
  const last = page.locator(sel).first();
  if (name === 'Inicio') await page.locator('.home-history-toggle').evaluate(el => { if (el.getAttribute('aria-expanded') === 'true') el.click(); });
  await page.locator('.app-main').evaluate(el => { el.scrollTop = el.scrollHeight; });
  await afterRender(page);
  const info = await last.evaluate((el) => {
    const box = el.getBoundingClientRect();
    const navTop = document.querySelector('.bottom-nav-track').getBoundingClientRect().top;
    const control = el.matches('button,summary');
    const hitY = control ? box.y + box.height / 2 : box.bottom - 4;
    return { last: control ? el.textContent.trim() : el.querySelector('h2').textContent.trim(),
      clearance: navTop - box.bottom, bottom: box.bottom,
      hit: el.contains(document.elementFromPoint(box.x + box.width / 2, hitY)),
    };
  });
  if (!before) assert.ok(info.hit && info.clearance > 0, 'Final oculto ' + name + ' ' + JSON.stringify(info));
  await page.locator('.app-main').evaluate(el => { el.scrollTop = 0; });
  return info;
}

async function simulateInset(page, context, inset) {
  if (!webkit) {
    const session = await context.newCDPSession(page);
    await session.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 0, left: inset ? 24 : 0, right: inset ? 18 : 0, bottom: inset } });
    await session.detach();
  } else {
    await page.evaluate(inset => {
      const root = document.documentElement;
      const rules = [...document.styleSheets].flatMap(sheet => [...sheet.cssRules]);
      const previous = rules.map(rule => rule.style?.getPropertyValue('--glass-nav-bottom')).find(value => value);
      if (getComputedStyle(root).getPropertyValue('--glass-nav-safe-bottom')) {
        root.style.setProperty('--glass-nav-safe-bottom', inset + 'px');
      } else {
        const withInset = previous.replace(/env\(safe-area-inset-bottom[^)]*\)/, inset + 'px');
        if (withInset === previous) throw new Error('La base no tiene env de área segura');
        root.style.setProperty('--glass-nav-bottom', withInset);
      }
    }, inset);
  }
  await afterRender(page);
}

async function desktop(page, theme) {
  await resize(page, 1024, 768);
  await go(page, 'Inicio');
  const state = await page.evaluate(() => {
    const sidebar = document.querySelector('.app-sidebar');
    const style = getComputedStyle(sidebar), bounds = sidebar.getBoundingClientRect();
    return { navHidden: getComputedStyle(document.querySelector('.app-bottom-nav')).display === 'none',
      geometry: [bounds.x, bounds.y, bounds.width, bounds.height],
      style: [style.background, style.borderRadius, style.backdropFilter, style.boxShadow],
    };
  });
  assert.ok(state.navHidden);
  report.desktop.push({ theme, ...state });
}

function compare(reference) {
  const projection = c => [c.capsule.width, c.capsule.height, c.capsule.radius, c.capsule.background, c.capsule.filter, c.indicator, c.buttons];
  for (const key of ['cases', 'safeAreas', 'resize']) {
    assert.equal(report[key].length, reference[key].length, key);
    for (const [index, value] of report[key].entries()) {
      const base = reference[key][index];
      const lift = round(value.capsule.gap - base.capsule.gap);
      assert.ok(lift >= 11.95 && lift <= 16.05, key + ' ' + index + ': elevación ' + lift);
      assert.deepEqual(projection(value), projection(base));
      value.lift = lift;
    }
  }
  assert.deepEqual(report.desktop, reference.desktop);
}

try {
  await mkdir(output, { recursive: true });
  for (const theme of themes) {
    const { page, context, errors } = await open(browser, 375, theme, theme, origin, { hasTouch: true, isMobile: true });
    try {
      assert.equal(await page.evaluate(() => window.__homeQA.phase), 'liquid-glass-nav-lift-' + phase);
      for (const [width, height] of widths) {
        await resize(page, width, height);
        for (const zoom of [100, 200]) {
          await page.evaluate(percent => { document.documentElement.style.fontSize = percent === 200 ? '200%' : ''; }, zoom);
          for (const name of names) {
            await go(page, name);
            await page.locator('.app-main').evaluate(el => { el.scrollTop = 0; });
            await afterRender(page);
            const data = await measure(page);
            validate(data, { name });
            if (!webkit && width === 390 && zoom === 100) await page.screenshot({ path: path.join(output, name.toLowerCase() + '-390-' + theme + '.png') });
            report.cases.push({ name, theme, zoom, ...data, last: await endOfContent(page, name) });
          }
        }
        console.log(phase, theme, width, 'las cuatro vistas en 100% y 200%');
      }
      await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
      await resize(page, 390, 844);
      for (const inset of [34, 21]) {
        await simulateInset(page, context, inset);
        for (const name of ['Inicio', 'Coach', 'Datos', 'Perfil']) {
          await go(page, name);
          const data = await measure(page);
          if (!webkit) close(data.cssSafe, inset, 'safe inset CDP');
          validate(data, { name, inset });
          if (!webkit && name === 'Inicio' && theme === 'light' && inset === 34) await page.screenshot({ path: path.join(output, 'inicio-390-light-safe-34.png') });
          report.safeAreas.push({ name, theme, inset, method: webkit ? 'override CSS de la contribución segura' : 'CDP', ...data });
        }
      }
      await simulateInset(page, context, 0);
      for (const [width, height] of [[667, 375], [390, 736], [390, 844]]) {
        await resize(page, width, height);
        for (const name of ['Inicio', 'Coach']) {
          await go(page, name);
          const data = await measure(page);
          validate(data, { name, inset: 0 });
          report.resize.push({ name, theme, ...data });
        }
      }
      await desktop(page, theme);
      const notice = 'ResizeObserver loop completed with undelivered notifications.';
      if (webkit) report.warnings.push(...errors.filter(error => error === notice));
      assert.deepEqual(webkit ? errors.filter(error => error !== notice) : errors, []);
      assert.deepEqual(await page.evaluate(() => {
        const qa = window.__homeQA;
        return [qa.writes.length, qa.aiCalls.length, qa.externalRequests];
      }), [0, 0, 0]);
    } finally {
      await context.close();
    }
  }
  if (!before && !quick) compare(JSON.parse(await readFile(path.join(evidence, 'before', reportName), 'utf8')));
  await writeFile(path.join(output, quick ? 'sondeo-' + reportName : reportName), JSON.stringify(report, null, 2) + '\n');
} finally {
  await browser.close();
}
