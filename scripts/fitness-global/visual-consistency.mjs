import assert from 'node:assert/strict';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { go, heights, repo, start } from './browser.mjs';

const before = process.argv.includes('--reference');
const origin = 'http://127.0.0.1:5194';
const dir = path.join(repo, 'docs/evidence/visual-consistency', before ? 'before' : 'after');
await mkdir(dir, { recursive: true });
const browser = await start();
const rows = [];
const regions = ['.home-date-nav','.fitness-score','.daily-quick-actions','.daily-habits-block','.daily-logs'];
const names = ['date','balance','actions','habits','records'];
const titles = { Inicio: '.home-header h1', Coach: '.chat-heading :is(h1,h2)', Datos: '.charts-heading h1', Perfil: '.profile-page-title' };
const settle = page => page.evaluate(async () => { await document.fonts.ready; await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))); });
async function geometry(page, selectors) {
  return page.evaluate(selectors => selectors.map(selector => {
    const el = [...document.querySelectorAll(selector)].find(node => node.getClientRects().length > 0);
    if (!el) return null;
    const { x,y,width,height } = el.getBoundingClientRect();
    return [x,y,width,height].map(Math.round);
  }), selectors);
}
async function verifyLoadingHeading(page, tab) {
  const heading = page.getByRole('heading', {level: 1});
  const measure = () => heading.evaluate(el => {
    const {x, y, height} = el.getBoundingClientRect();
    const frame = (el.closest('header') ?? el).getBoundingClientRect();
    return [x, y, height, frame.x, frame.y, frame.width, frame.height];
  });
  const ready = await measure();
  await page.evaluate(() => window.__homeQA.setLoading(true));
  await page.locator('.view-skeleton').waitFor();
  assert.equal(await heading.count(), 1, tab);
  assert.deepEqual(await measure(), ready, tab);
  await page.evaluate(() => window.__homeQA.setLoading(false));
  await page.locator('.view-skeleton').waitFor({state: 'detached'});
}
async function verifyHeaderActions(page, tab) {
  if (tab === 'Inicio') {
    assert.equal(await page.locator('.home-header').getByRole('link').count(), 0);
    const toggle = page.locator('.home-history-toggle');
    const collapsed = await toggle.isVisible() && await toggle.getAttribute('aria-expanded') === 'false';
    if (collapsed) await toggle.click();
    await page.locator('[data-history-open]').click();
    assert.ok(await page.locator('#fitness-daily-entries').evaluate(el => el === document.activeElement));
    await page.locator('.history-record-return').click();
    assert.ok(await page.locator('[data-history-root]').evaluate(el => el === document.activeElement));
    if (collapsed) await toggle.click();
    await page.locator('.app-main').evaluate(el => { el.scrollTop = 0; });
  } else if (tab === 'Coach') {
    const heading = page.locator('.chat-heading');
    await heading.getByRole('button',{name:'Mis objetivos'}).click();
    await page.getByRole('dialog',{name:'Mis objetivos'}).waitFor();
    await page.keyboard.press('Escape');
    const history = heading.getByRole('button',{name:'Historial'});
    await history.click();
    await page.locator('.chat-history-picker select').waitFor();
    await history.click();
    await page.locator('.chat-textarea').fill('Borrador sintético');
    await heading.getByRole('button',{name:'Nueva conversación'}).click();
    assert.equal(await page.locator('.chat-textarea').inputValue(),'');
  } else if (tab === 'Datos') {
    const period = page.getByRole('group',{name:'Período',exact:true});
    await period.getByRole('button',{name:'Mes'}).click();
    assert.equal(await period.getByRole('button',{name:'Mes'}).getAttribute('aria-pressed'),'true');
  }
}

async function recordTour() {
  const viewport = {width:375,height:812};
  const context = await browser.newContext({viewport,locale:'es-AR',timezoneId:'America/Buenos_Aires',colorScheme:'dark',recordVideo:{dir:path.join(repo,'scratch'),size:viewport}});
  await context.route('**/*',route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  const page = await context.newPage();
  const video = page.video();
  try {
    await page.goto(origin+'/qa?controls=0&theme=dark&loading=1');
    await page.locator('.view-skeleton-home').waitFor();
    await page.waitForTimeout(2200);
    await page.evaluate(() => window.__homeQA.setLoading(false));
    await page.locator('.fitness-score').waitFor();
    for (const tab of ['Inicio','Coach','Datos','Perfil','Inicio']) {
      await go(page,tab);
      await page.waitForTimeout(950);
    }
  } finally { await context.close(); }
  await rename(await video.path(),path.join(dir,'recorrido.webm'));
}

async function run(width, theme) {
  const viewport = { width, height: heights[width] };
  const context = await browser.newContext({ viewport, locale: 'es-AR', timezoneId: 'America/Buenos_Aires',
    colorScheme: theme, reducedMotion: 'reduce' });
  const errors = [];
  await context.route('**/*', route => {
    if (new URL(route.request().url()).origin === origin) return route.continue();
    errors.push('External request'); return route.abort();
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.setDefaultTimeout(20000);
  const prefix = width + '-' + theme;
  const shot = (scene, clip) => page.screenshot({ path: path.join(dir, prefix + '-' + scene + '.jpg'), quality: 86, clip });
  const row = { width, theme, titles: {}, borders: [] };
  try {
    await page.goto(origin + '/qa?controls=0&theme=' + theme + '&loading=1', { waitUntil: 'domcontentloaded' });
    await page.locator('.view-skeleton-home').waitFor({ timeout: 90000 });
    await page.waitForTimeout(1800);
    const chrome = ['.home-header', 'nav[aria-label="Navegación principal"]'];
    const header = !before && await page.locator('.home-header').elementHandle();
    row.loadingChrome = await geometry(page, chrome);
    row.loading = await geometry(page, names.map(name => '.home-placeholder-' + name));
    await shot('carga');
    await page.evaluate(() => window.__homeQA.setLoading(false));
    await page.locator('.fitness-score').waitFor();
    await settle(page);
    row.ready = await geometry(page, regions);
    row.readyChrome = await geometry(page, chrome);
    if (!before) {
      assert.ok(await header.evaluate(el => el === document.querySelector('.home-header')));
      assert.deepEqual(row.loadingChrome, row.readyChrome);
      assert.ok(row.loadingChrome.every(Boolean));
      row.loading.forEach((box,i) => {
        assert.ok(box, names[i]);
        const actual = row.ready[i];
        // The server cannot predict a fifth entry and its disclosure, or a multi-line name.
        // In one column the habits section follows the actual list's natural height.
        const records = names.indexOf('records');
        const belowRecords = names[i] === 'habits' && width < 1280;
        const loadedY = actual[1] - (belowRecords ? row.ready[records][3] : 0);
        const loadingY = box[1] - (belowRecords ? row.loading[records][3] : 0);
        assert.ok(Math.abs(loadedY - loadingY) <= 8, JSON.stringify({width,region:names[i],box,actual}));
        assert.ok(Math.abs(actual[2]-box[2]) <= 3, JSON.stringify({width,region:names[i],box,actual}));
      });
    }
    await shot('inicio');
    for (const [tab, selector] of Object.entries(titles)) {
      if (tab !== 'Inicio') await go(page, tab);
      if (!before) assert.equal(await page.getByRole('heading',{level:1}).count(),1);
      const title = page.locator(selector);
      if (await title.isVisible()) row.titles[tab] = await title.evaluate(el => {
        const css = getComputedStyle(el);
        return [css.fontFamily, css.fontStyle, css.fontWeight, css.fontSize, css.lineHeight, css.letterSpacing, css.textTransform, css.marginBlock];
      });
      if (tab !== 'Inicio') await shot(tab.toLowerCase());
      if (!before) {
        await verifyLoadingHeading(page, tab);
        await verifyHeaderActions(page, tab);
      }
    }
    if (!before) {
      assert.equal(Object.keys(row.titles).length, 4);
      for (const style of Object.values(row.titles)) assert.deepEqual(style,row.titles.Datos);
    }
    await go(page,'Inicio');
    const day = await page.evaluate(() => structuredClone(window.__homeQA.store.activeProfile.records[window.__homeQA.today]));
    const toggle = page.locator('.home-history-toggle');
    for (const count of [0,1,3]) {
      await page.evaluate(({day,count}) => {
        const q = window.__homeQA;
        q.setProfile({ records: {...q.store.activeProfile.records,[q.today]:{...day,meals:day.meals.slice(0,count),workouts:[]}} });
      }, {day,count});
      await settle(page);
      for (const expanded of width < 768 ? [false,true] : [true]) {
        if (await toggle.isVisible() && (await toggle.getAttribute('aria-expanded') === 'true') !== expanded) await toggle.click();
        await settle(page);
        const border = await page.evaluate(() => {
          const list = document.querySelector('.daily-records');
          const items = [...list.children].filter(el => el.getClientRects().length);
          const outer = document.querySelector('.home-history');
          const scroller = document.querySelector('.app-main');
          scroller.scrollTop += outer.getBoundingClientRect().top - 210;
          const rect = outer.getBoundingClientRect();
          return { count:items.length, history:parseFloat(getComputedStyle(outer).borderTopWidth),
            last: items.length ? parseFloat(getComputedStyle(items.at(-1)).borderBottomWidth) : list.offsetHeight,
            interior: items.slice(1).map((el,i) => parseFloat(getComputedStyle(el).borderTopWidth) + parseFloat(getComputedStyle(items[i]).borderBottomWidth)),
            x:rect.x, y:rect.y, w:rect.width };
        });
        assert.equal(border.count,count);
        if (!before) {
          assert.equal(border.last,0);
          assert.equal(border.history,1);
          assert.ok(border.interior.every(value => value===1));
        }
        row.borders.push({count,expanded,...border});
        if (width === 375) {
          const y = Math.max(0, Math.min(border.y-135, viewport.height-230));
          await shot('limite-'+count+'-'+(expanded?'abierto':'cerrado'),{x:0,y,width,height:230});
        }
      }
    }
    assert.deepEqual(errors,[]);
    assert.deepEqual(await page.evaluate(() => {const q=window.__homeQA;return [q.writes.length,q.aiCalls.length,q.externalRequests];}), [0,0,0]);
    rows.push(row);
    console.log(prefix, JSON.stringify(row.ready));
  } finally {
    await context.close();
  }
}
try {
  for (const width of [375,320,1440]) for (const theme of ['light','dark']) await run(width,theme);
  if (!before) await recordTour();
  await writeFile(path.join(dir,'matriz.json'),JSON.stringify(rows,null,2)+'\n');
} finally { await browser.close(); }
