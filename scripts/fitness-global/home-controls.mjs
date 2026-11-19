import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir, readFile, writeFile, rename, mkdtemp, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { start, repo, before, origin, go } from './browser.mjs';

const out = path.join(repo, 'docs/evidence/home-controls', before ? 'before' : 'after');
await mkdir(out, { recursive: true });
const browser = await start();
const frames = page => page.evaluate(async () => {
  await document.fonts.ready;
  await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
});
const edges = locator => locator.evaluate(el => {
  const r = el.getBoundingClientRect();
  return [r.left, r.right].map(Math.round);
});
const report = { layout: [], calendar: [], motion: [], mobileLabels: [] };
const pathFor = name => path.join(out, name + '.jpg');
const shot = (locator, name) => locator.screenshot({ path: pathFor(name), quality: 85 });
async function session(width, height, theme, fn, record = false) {
  const viewport = { width, height };
  const temp = record && await mkdtemp(path.join(tmpdir(), 'calori-segmentos-'));
  const context = await browser.newContext({ viewport, locale:'es-AR', timezoneId:'America/Buenos_Aires',
    colorScheme:theme, reducedMotion:record ? 'no-preference' : 'reduce', ...(record && {recordVideo:{dir:temp,size:viewport}}) });
  const errors = [];
  await context.route('**/*', route => {
    if (new URL(route.request().url()).origin === origin) return route.continue();
    errors.push('Solicitud externa'); return route.abort();
  });
  const page = await context.newPage();
  const video = page.video();
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(origin+'/qa?controls=0&theme='+theme);
    await page.locator('.fitness-home').waitFor({timeout:90000});
    await frames(page);
    await fn(page);
    assert.equal(await page.evaluate(()=>window.__homeQA.externalRequests),0);
    assert.deepEqual(errors,[]);
  } finally { await context.close(); }
  if (video) { await rename(await video.path(),path.join(out,'selectores-'+theme+'.webm')); await rmdir(temp); }
}

async function layout(page, width) {
  const tabSpecs = [
    ['Inicio','.fitness-home','home'],['Datos','.charts-view','charts'],
    ['Perfil','.profile-view','profile'],['Coach','.assistant-view','chat'],
  ];
  const measurements = {};
  for (const [tab,content,id] of tabSpecs) {
    await go(page,tab);
    await page.evaluate(()=>window.__homeQA.setLoading(true));
    const skeleton = page.locator('.view-skeleton-'+id);
    await skeleton.waitFor();
    await page.waitForFunction(selector => getComputedStyle(document.querySelector(selector)).opacity === '1', '.view-skeleton-'+id);
    await frames(page);
    const skeletonEdges = await edges(skeleton);
    if (tab==='Inicio') await shot(page,width+'-inicio-carga');
    if (width===1440 && ['Datos','Perfil'].includes(tab)) await shot(page,width+'-'+id+'-carga');
    await page.evaluate(()=>window.__homeQA.setLoading(false));
    await page.locator(content).waitFor(); await frames(page);
    measurements[tab] = {carga:skeletonEdges, contenido:await edges(page.locator(content))};
    if (tab==='Inicio') {
      measurements[tab].encabezado = await edges(page.locator('.home-header'));
      await shot(page,width+'-inicio');
    } else if (width===1440 && tab!=='Coach') await shot(page,width+'-'+id);
  }
  if (!before && width>=768) {
    for (const [tab,m] of Object.entries(measurements)) {
      assert.deepEqual(m.contenido,measurements.Datos.contenido,tab+' contenido');
      if (tab!=='Coach') assert.deepEqual(m.carga,measurements.Datos.contenido,tab+' carga');
    }
    assert.deepEqual(measurements.Inicio.encabezado,measurements.Inicio.contenido);
  }
  let controls;
  if (!before && width===1440) {
    controls={};
    for(const [tab,name] of [['Datos','Período'],['Inicio','Período del historial'],['Perfil','Apariencia']]) {
      if (tab==='Inicio') await history(page); else await go(page,tab);
      controls[tab]=await page.getByRole('group',{name,exact:true}).evaluate(el=>{
        const sample=(node,props)=>props.map(p=>getComputedStyle(node).getPropertyValue(p));
        return {
          group:sample(el,['background-color','border','border-radius','gap','padding']),
          active:sample(el.querySelector('[aria-pressed=true]'),['font-family','font-size','font-weight','line-height','padding','color']),
          indicator:sample(el.querySelector('.segmented-control-indicator'),['background-color','border-radius'])
        };
      });
      assert.deepEqual(controls[tab],controls.Datos,tab+' appearance');
    }
  }
  report.layout.push({width,measurements,controls});
}
async function history(page) {
  await go(page,'Inicio');
  const disclosure = page.locator('.home-history-toggle');
  if (await disclosure.isVisible() && await disclosure.getAttribute('aria-expanded')==='false') await disclosure.click();
  return page.getByRole('group',{name:'Período del historial',exact:true});
}
async function calendar(page, theme) {
  const group = await history(page);
  for(const period of ['Semana','Mes']) {
    await group.getByRole('button',{name:period,exact:true}).click();
    const day = n => page.locator('.ah-day[data-date="2026-11-'+n+'"]');
    await day('10').click(); await page.keyboard.press('ArrowLeft'); await frames(page);
    assert.equal(await day('09').getAttribute('aria-pressed'),'true');
    assert.ok(await day('09').evaluate(el=>el.matches(':focus-visible')));
    const cases = await page.locator('.ah-day').evaluateAll(cells=>cells.filter(el=>el.dataset.date >= '2026-11-08' && el.dataset.date <= '2026-11-14').map(el=>{
      const fill=el.querySelector('.ah-day-fill');
      return {date:el.dataset.date,state:el.dataset.completeness,balance:el.dataset.balance,label:el.getAttribute('aria-label'),
        color:fill ? getComputedStyle(fill).backgroundColor : null, disabled:el.disabled, today:el.getAttribute('aria-current')};
    }));
    assert.equal(cases.length,7);
    assert.equal(cases[2].balance,'neutral'); assert.equal(cases[3].state,'partial');
    assert.equal(cases[0].color,null); assert.equal(cases[3].color,null);
    assert.equal(cases[5].today,'date'); assert.ok(cases[6].disabled);
    assert.match(cases[1].balance,/deficit/); assert.match(cases[4].balance,/surplus/);
    await shot(page.locator('.ah-calendar'),theme+'-'+period);
    report.calendar.push({theme,period,cases});
  }
}

async function exerciseControl(page, group, indices, reduced = false) {
  const indicator = group.locator('.segmented-control-indicator');
  const original = await indicator.elementHandle();
  const buttons = group.getByRole('button');
  for(const index of indices) {
    const dest = buttons.nth(index);
    // Start at the native click. Waiting for a Playwright round trip before
    // sampling can miss an entire 200ms transition on a busy host.
    await group.evaluate(el=>{
      const indicator=el.querySelector('.segmented-control-indicator');
      const x=()=>new DOMMatrixReadOnly(getComputedStyle(indicator).transform).m41;
      el.addEventListener('click',()=>{
        window.segmentSamples=new Promise(done=>{
          const samples=[x()];
          const start=performance.now();
          function sample() {
            samples.push(x());
            if(performance.now()-start<320) requestAnimationFrame(sample);
            else done(samples);
          }
          requestAnimationFrame(sample);
        });
      },{once:true,capture:true});
    });
    await dest.click();
    const track = await group.evaluate(()=>window.segmentSamples);
    const old=track[0];
    assert.equal(await dest.getAttribute('aria-pressed'),'true');
    assert.ok(await original.evaluate(el=>el.isConnected));
    const end=track.at(-1);
    if (!reduced && Math.abs(old-end)>2) assert.ok(track.some(v=>v>Math.min(old,end)+0.1 && v<Math.max(old,end)-0.1),(await group.getAttribute('aria-label'))+' '+index+' samples '+track.join(','));
    assert.ok(await dest.evaluate(el=>el.scrollWidth<=el.clientWidth+1));
  }
  return indicator.evaluate(el=>({duration:getComputedStyle(el).transitionDuration, easing:getComputedStyle(el).transitionTimingFunction}));
}

async function mobileLabels(page,width) {
  for(const [tab,name] of [['Datos','Período'],['Inicio','Período del historial'],['Perfil','Apariencia']]) {
    if(tab==='Inicio') await history(page); else await go(page,tab);
    const group=page.getByRole('group',{name,exact:true});
    await group.scrollIntoViewIfNeeded();
    const labels=await group.getByRole('button').evaluateAll(buttons=>buttons.map(button=>{
      const range=document.createRange(); range.selectNodeContents(button);
      const r=range.getBoundingClientRect(), box=button.getBoundingClientRect();
      return {label:button.textContent,lines:range.getClientRects().length, fits:r.width <= box.width && r.height <= box.height};
    }));
    assert.ok(labels.every(label=>label.fits && label.lines===1),JSON.stringify({width,tab,labels}));
    report.mobileLabels.push({width,tab,labels});
  }
}

async function motion(page, theme) {
  for (const [tab,name] of [['Datos','Período'],['Inicio','Período del historial'],['Perfil','Apariencia']]) {
    if(tab==='Inicio') await history(page); else await go(page,tab);
    const group = page.getByRole('group',{name,exact:true});
    await group.scrollIntoViewIfNeeded();
    const settings = await exerciseControl(page,group,[0,1,2,0,2,1]);
    assert.equal(settings.duration,'0.2s');
    const buttons = group.getByRole('button');
    await group.evaluate(el=>{
      const b=el.querySelectorAll('button');
      b[0].click(); b[2].click(); b[1].click(); b[2].click();
    });
    await page.waitForTimeout(240);
    assert.equal(await buttons.nth(2).getAttribute('aria-pressed'),'true');
    const bounds=await group.locator('.segmented-control-indicator').boundingBox();
    const target=await buttons.nth(2).boundingBox();
    assert.ok(Math.abs(bounds.x+bounds.width/2-target.x-target.width/2)<2);
    await buttons.first().focus(); await page.keyboard.press('Space');
    assert.ok(await buttons.first().evaluate(el=>el.matches(':focus-visible') && el.getAttribute('aria-pressed')==='true'));
    if(tab==='Perfil') {
      for (const mode of ['dark','light']) {
        await page.emulateMedia({colorScheme:mode});
        await page.waitForFunction(dark=>document.documentElement.classList.contains('dark')===dark,mode==='dark');
        assert.equal(await buttons.first().getAttribute('aria-pressed'),'true');
        assert.equal(await page.evaluate(()=>localStorage.getItem('calori-theme')),'system');
      }
    }
    await page.emulateMedia({reducedMotion:'reduce'});
    const calm=await exerciseControl(page,group,[1],true);
    assert.equal(parseFloat(calm.duration),0);
    await page.emulateMedia({reducedMotion:'no-preference',colorScheme:theme});
    report.motion.push({theme,tab,...settings,reduced:calm.duration});
  }
}

try {
  const layoutOnly = process.argv.includes('--layout-only');
  if (layoutOnly) {
    Object.assign(report,JSON.parse(await readFile(path.join(out,'mediciones.json'),'utf8')));
    report.layout=[];
  }
  if (!before && !layoutOnly) {
    for (const width of [320,375]) await session(width,812,'light',p=>mobileLabels(p,width));
    for (const theme of ['light','dark']) await session(960,680,theme,p=>motion(p,theme),true);
  }
  for (const width of [375,1440,1920]) await session(width,width===375?812:width===1920?1080:900,'light',p=>layout(p,width));
  if (!layoutOnly) for (const theme of ['light','dark']) await session(1440,900,theme,p=>calendar(p,theme));
  await writeFile(path.join(out,'mediciones.json'),JSON.stringify(report,null,2)+'\n');
} finally { await browser.close(); }
