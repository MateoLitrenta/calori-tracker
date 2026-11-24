import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { before, go, open, origin, repo, start } from './browser.mjs';

const out = path.join(repo, 'docs/evidence/datos-noviembre', before ? 'antes' : 'despues');
await mkdir(out, {recursive:true});
const browser = await start();
const rows = [];
const rect = (page, selector) => page.locator(selector).first().boundingBox();
const settle = page => page.evaluate(async () => {
  await document.fonts.ready;
  await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
});
const align = (page, selector) => page.locator(selector).first().evaluate(el => el.scrollIntoView({block:'start', behavior:'instant'}));
const mainTop = page => page.locator('.app-main').evaluate(el => el.scrollTop);
const overflow = page => page.evaluate(() => Math.max(document.documentElement.scrollWidth-innerWidth,
  document.querySelector('.app-main').scrollWidth-document.querySelector('.app-main').clientWidth));

async function sample(width, theme) {
  const record = width === 375 && theme === 'dark';
  const { page, context, errors } = await open(browser, width, 'system', theme, origin, {
    hasTouch: record,
    ...(record && {recordVideo:{dir:tmpdir(),size:{width,height:812}}})
  });
  const video = page.video();
  const observe = async () => { await settle(page); if(record) await page.waitForTimeout(380); };
  const photo = async name => {
    if (width === 375 || width === 1440 || (theme === 'light' && name !== 'detalle')) await page.screenshot({path:path.join(out,width+'-'+theme+'-'+name+'.jpg'),quality:82});
  };
  const button = (parent,name) => parent.getByRole('button',{name,exact:true});
  const day = n => page.locator('.ah-day[data-date="2026-11-'+n+'"]');
  const selected = page.locator('.ah-detail');
  const row = {width,theme};
  try {
    await page.evaluate(() => {
      const qa=window.__homeQA, records={...qa.store.activeProfile.records};
      for (const [date, source] of [['2026-03-10','2026-11-10'],['2026-07-11','2026-11-11'],['2026-11-14','2026-11-12']]) {
        records[date]={...records[source],dateStr:date,date:date+'T12:00:00'};
      }
      qa.setProfile({records});
    });
    await go(page,'Datos');
    await observe();
    row.summary = Math.round((await rect(page,'.charts-summary')).height);
    row.plot = Math.round((await rect(page,'.charts-plot')).y - (await rect(page,'.charts-header')).y);
    await photo('datos');
    const bars = page.locator('.charts-bucket');
    const detail = page.locator('#charts-bucket-detail');
    await align(page,'.charts-energy');
    const panelHeight = (await rect(page,'.charts-energy')).height;
    for (const n of [0,1,2]) { await bars.nth(n).hover(); await observe(); }
    row.hoverGrowth = Math.round((await rect(page,'.charts-energy')).height - panelHeight);
    if (!before) { assert.equal(row.hoverGrowth,0); assert.ok(await detail.isHidden()); }
    await bars.nth(0).click(); await observe();
    assert.ok(await detail.isVisible());
    const close = button(page,'Quitar selección del gráfico');
    await close.click(); await observe();
    if(!before) assert.equal(await bars.nth(0).evaluate(el=>el===document.activeElement),true);
    await bars.nth(1).focus(); await page.keyboard.press('Tab'); await observe();
    if(!before) assert.ok(await detail.isHidden());
    await page.keyboard.press('Space'); await observe();
    assert.equal(await bars.nth(2).getAttribute('aria-pressed'),'true');
    await close.focus(); await page.keyboard.press('Escape'); await observe();
    if (!before) assert.ok(await bars.nth(2).evaluate(el=>el===document.activeElement));
    await bars.nth(1).press('Enter');
    await button(page,'Año').click(); await observe();
    assert.equal(await bars.count(),12);
    assert.ok(await detail.isHidden());
    if (record) {
      const rail = page.locator('.charts-plot-scroll');
      await align(page,'.charts-energy');
      const box=await rail.boundingBox();
      const x=Math.round(box.x+box.width*.8), y=Math.round(box.y+25);
      const session=await context.newCDPSession(page);
      const previousLeft=await rail.evaluate(el=>el.scrollLeft);
      await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
      for(let i=1;i<=8;i++) {
        await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-i*15,y}]});
        await page.waitForTimeout(35);
      }
      await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      await page.waitForTimeout(400);
      row.swipe = Math.round(await rail.evaluate(el=>el.scrollLeft)-previousLeft);
      assert.ok(row.swipe>0);
      if(!before) assert.ok(await detail.isHidden());
      await bars.nth(6).tap(); await observe();
      assert.equal(await bars.nth(6).getAttribute('aria-pressed'),'true');
      await session.detach();
    }
    assert.ok(await overflow(page)<=1);
    await go(page,'Inicio');
    const toggle = page.locator('.home-history-toggle');
    if (await toggle.isVisible() && await toggle.getAttribute('aria-expanded')==='false') await toggle.click();
    const periods=page.locator('.ah-view-switch');
    await button(periods,'Mes').click();
    await day('12').click(); await observe();
    await align(page,'.ah-calendar-surface'); await observe();
    row.detailGap = Math.round((await selected.boundingBox()).y - ((await rect(page,'.ah-calendar-surface')).y+(await rect(page,'.ah-calendar-surface')).height));
    await photo('calendario');
    if(await page.locator('.ah-detail-jump').isVisible()) {
      await page.locator('.ah-detail-jump').click(); await observe();
      assert.ok(await selected.evaluate(el=>el===document.activeElement));
    }
    await photo('detalle');
    for(const [date,status] of [['11','Actividad sin comidas'],['10','comida']]) {
      await day(date).focus(); const top=await mainTop(page);
      await page.keyboard.press('Enter'); await observe();
      assert.match(await selected.innerText(),new RegExp(status,'i'));
      assert.equal(await mainTop(page),top);
      assert.equal(await page.locator('.home-date-context time').getAttribute('datetime'),'2026-11-13');
    }
    await day('10').press('ArrowLeft'); await page.keyboard.press('ArrowLeft');
    await observe();
    assert.match(await selected.locator('h3').innerText(),/8 de noviembre/);
    assert.match(await selected.innerText(),/Sin registros/);
    if (!before && record) {
      await selected.focus(); await selected.evaluate(el=>window.savedDetail=el);
      await page.setViewportSize({width:1440,height:900}); await page.emulateMedia({colorScheme:'light'}); await observe();
      assert.equal(await selected.count(),1);
      assert.ok(await selected.evaluate(el=>el===window.savedDetail && el===document.activeElement));
      assert.match(await selected.locator('h3').innerText(),/8 de noviembre/);
      await page.setViewportSize({width,height:812}); await page.emulateMedia({colorScheme:theme}); await observe();
    }
    await button(periods,'Año').click(); await align(page,'.ah-navigation'); await observe();
    const months=page.locator('button.ah-month');
    assert.equal(await months.count(),12);
    row.year=Math.round((await rect(page,'.ah-year')).height);
    assert.match(await months.nth(2).innerText(),/0\s*kcal/);
    assert.match(await months.nth(6).innerText(),/parcial/i);
    assert.match(await months.nth(0).innerText(),/Sin registros/);
    assert.ok(await months.last().isDisabled());
    await photo('año');
    if(!before && width===320) {
      await page.evaluate(()=>{document.documentElement.style.fontSize='200%';});
      await observe(); assert.ok(await overflow(page)<=1);
      await months.nth(2).click();
      assert.match(await selected.locator('h3').innerText(),/marzo/);
      await go(page,'Datos'); await observe(); assert.ok(await overflow(page)<=1);
      await page.evaluate(()=>window.__homeQA.setProfile({records:{}}));
      await page.locator('.charts-empty').waitFor();
    }
    assert.ok(await overflow(page)<=1);
    assert.deepEqual(errors,[]);
    rows.push(row);
    console.log(JSON.stringify(row));
  } finally {
    await context.close();
    if (video) {await video.saveAs(path.join(out,'recorrido.webm')); await video.delete();}
  }
}

async function enlargedAndReceipt(theme) {
  const {page,context,errors}=await open(browser,320,theme,theme);
  const doubleText = async selector => {
    await page.locator(selector).evaluate(el=>{
      const nodes=[el,...el.querySelectorAll('*')].filter(n=>n instanceof HTMLElement);
      const sizes=nodes.map(n=>parseFloat(getComputedStyle(n).fontSize));
      nodes.forEach((n,i)=>n.style.fontSize=sizes[i]*2+'px');
    });
    await settle(page);
    assert.ok(await overflow(page)<=1);
  };
  try {
    const button=name=>page.getByRole('button',{name,exact:true});
    await button('Agregar comida').click();
    await page.getByLabel('Descripción',{exact:true}).fill('Muestra del recorrido');
    await page.locator('#add-meal-calories').fill('500');
    await button('Guardar comida').click();
    await page.locator('.meal-saved').waitFor();
    await button('Ver registro').click();
    assert.match(await page.locator('.daily-record-open:focus').innerText(),/Muestra del recorrido/);

    const toggle=page.locator('.home-history-toggle');
    if(await toggle.isVisible() && await toggle.getAttribute('aria-expanded')==='false') await toggle.click();
    await page.locator('.ah-view-switch').getByRole('button',{name:'Año'}).click();
    await doubleText('.activity-history-v2');
    await align(page,'.ah-year');
    await page.screenshot({path:path.join(out,'320-'+theme+'-año-200.jpg'),quality:82});
    const month=page.locator('button.ah-month:not(:disabled)').last();
    assert.ok(await month.evaluate(el=>el.scrollWidth<=el.clientWidth+1));

    await go(page,'Datos');
    const bars=page.locator('.charts-bucket');
    const heights=[];
    for (const index of [0,1,2,5]) {
      await bars.nth(index).click();
      await settle(page);
      heights.push(Math.round((await rect(page,'.charts-detail')).height));
    }
    assert.ok(Math.max(...heights)-Math.min(...heights)<=1, 'Cambiar el día conserva la altura del detalle');
    console.log('Altura del detalle abierto a 320 px',heights);
    await bars.first().click();
    await doubleText('.charts-insights');
    const lines=await page.locator('.charts-period button').first().evaluate(el=>{
      const range=document.createRange(); range.selectNodeContents(el);
      return range.getClientRects().length;
    });
    assert.equal(lines,1,'Semana debe caber al 200 %');
    await align(page,'.charts-header');
    await page.screenshot({path:path.join(out,'320-'+theme+'-datos-200.jpg'),quality:82});
    await page.locator('.charts-detail-clear').click();
    assert.ok(await page.locator('.charts-bucket').first().evaluate(el=>el===document.activeElement));
    await page.evaluate(()=>window.__homeQA.setProfile({records:{}}));
    await page.locator('.charts-empty').waitFor();
    assert.deepEqual(errors,[]);
    console.log('320 px · texto 200 % · Ver registro',theme);
  } finally {await context.close();}
}

try {
  if(process.argv.includes('--ampliado')) {
    for(const theme of ['light','dark']) await enlargedAndReceipt(theme);
  } else {
    for (const width of [375,320,768,1440]) for(const theme of ['dark','light']) await sample(width,theme);
    await writeFile(path.join(out,'mediciones.json'),JSON.stringify({browser:browser.version(),rows},null,2)+'\n');
  }
} finally {await browser.close();}
