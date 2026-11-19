import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { repo, heights } from './browser.mjs';

const before = process.argv.includes('--reference');
const engine = process.argv.includes('--webkit') ? 'webkit' : 'chromium';
const pw = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE || path.resolve(repo,'../qa-tools/node_modules/playwright/index.mjs')));
const browser = await pw[engine].launch(engine === 'chromium' ? { channel:'chrome' } : {});
const out = path.join(repo,process.argv.includes('--scratch') ? 'node_modules/.cache/calori-meal-flow' : 'docs/evidence/meal-flow',before ? 'before' : 'after',engine);
await mkdir(out,{recursive:true});
const origin = 'http://127.0.0.1:5194';
const name = 'Arroz con verduras y pollo';
const rows = [];

// Inject viewport metrics, not a native keyboard. The shaded region marks the
// part of the layout below the synthetic visual viewport in the screenshots.
function setupViewport() {
  const full = window.innerHeight;
  const viewport = new EventTarget();
  Object.assign(viewport,{height:full,offsetTop:0});
  Object.defineProperty(window,'visualViewport',{configurable:true,value:viewport});
  window.setTestViewport = (height = full, top = 0, difference = 0) => {
    Object.defineProperty(window,'innerHeight',{configurable:true,value:full-difference});
    Object.assign(viewport,{height,offsetTop:top});
    viewport.dispatchEvent(new Event('resize'));
    viewport.dispatchEvent(new Event('scroll'));
    let mask = document.getElementById('test-keyboard-mask');
    if (!mask) {
      mask = document.createElement('aside');
      mask.id = 'test-keyboard-mask';
      mask.setAttribute('aria-hidden','true');
      mask.textContent = 'Área fuera del viewport · simulación';
      Object.assign(mask.style,{position:'fixed',inset:'auto 0 0',zIndex:'9999',background:'#30353b',color:'#fff',textAlign:'center',font:'13px system-ui',paddingTop:'12px',pointerEvents:'none'});
      document.body.append(mask);
    }
    mask.style.top = top + height + 'px';
    mask.hidden = height === full;
  };
}

async function tour(width, theme) {
  const video = width===375 && theme==='dark' && engine==='chromium';
  const size = {width,height:heights[width]};
  const ctx = await browser.newContext({viewport:size,locale:'es-AR',timezoneId:'America/Buenos_Aires',colorScheme:theme,reducedMotion:'reduce',
    ...(video ? {recordVideo:{dir:path.join(repo,'scratch'),size}} : {})});
  await ctx.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  if (width < 768) await ctx.addInitScript(setupViewport);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror',err=>errors.push(err.message));
  const capture = async stage => {
    await page.screenshot({path:path.join(out,width+'-'+theme+'-'+stage+'.jpg'),quality:82,animations:'disabled'});
    if (video) await page.waitForTimeout(600);
  };
  const mobile = width < 768;
  const viewport = (height,top,difference) => page.evaluate(args=>window.setTestViewport(...args),height ? [height,top,difference] : []);
  const button = (label) => page.getByRole('button',{name:label,exact:true});
  const submit = button('Guardar comida');
  try {
    await page.goto(origin+'/qa?controls=0&theme='+theme);
    await button('+ Comida').click();
    const desc = page.getByLabel('Descripción',{exact:true});
    await desc.fill((name+' con ensalada. ').repeat(6));
    if (mobile) await viewport(Math.round(size.height*.53),18,68);
    await desc.press('End');
    await desc.press('Backspace');
    const geometry = await page.evaluate(()=>{
      const rect = s=>document.querySelector(s).getBoundingClientRect();
      return {visibleEnd:visualViewport.height+visualViewport.offsetTop,footer:rect('.entry-form-footer').bottom,
        header:rect('.entry-sheet-header').top,content:rect('.entry-form-content').height,backgroundInert:document.querySelector('.app-main').inert};
    });
    if (mobile && !before) {
      assert.ok(geometry.footer < geometry.visibleEnd && geometry.footer > geometry.header,JSON.stringify(geometry));
      assert.ok(geometry.header>=17 && geometry.content>40 && geometry.backgroundInert);
    }
    await capture('escritura');
    await desc.fill(name);
    const calories = page.getByLabel('Calorías',{exact:true});
    await calories.fill('482');
    if (mobile) await viewport(Math.round(size.height*.57),8,45);
    await page.getByLabel('Hora',{exact:true}).fill('22:45');
    if (mobile) {
      await viewport();
      await calories.focus();
      await viewport(Math.round(size.height*.57),8,45);
      await viewport();
    }
    await page.evaluate(()=>{window.__homeQA.failed=true;});
    await submit.click();
    await (before ? page.getByText(/No se pudo confirmar el guardado/).first() : page.locator('.meal-write-error')).waitFor();
    assert.equal(await desc.inputValue(),name);
    assert.equal(await calories.inputValue(),'482');
    assert.equal(await button('Ver registro').count(),0);
    await capture('error');
    await page.evaluate(()=>{window.__homeQA.failed=false;});
    await submit.click();
    await desc.waitFor({state:'hidden'});
    const writes = await page.evaluate(()=>window.__homeQA.writes.map(w=>({date:w.date,status:w.status,id:w.record.meals.at(-1).id})));
    assert.equal(writes.length,2); assert.equal(writes[0].id,writes[1].id);
    assert.deepEqual(writes.map(w=>w.status),['failed','confirmed']);
    await capture('guardado');
    if (before) {
      const expand = page.getByRole('button',{name:/Ver todos los registros/});
      if (await expand.isVisible()) await expand.click();
      await page.locator('.daily-record-open').filter({hasText:name}).filter({hasText:'482'}).click();
    } else {
      const receipt = page.locator('.meal-saved');
      assert.match(await receipt.innerText(),/482/);
      await button('Ver registro').click();
      const focused = page.locator('.daily-record-open:focus');
      assert.equal(await focused.getAttribute('data-meal-id'),writes[1].id);
      await capture('fila');
      await focused.click();
    }
    await page.getByRole('dialog',{name:'Detalle del registro'}).waitFor();
    await page.getByRole('button',{name:/Editar/}).last().click();
    assert.equal(await page.locator('#edit-meal-calories').inputValue(),'482');
    await capture('editar');
    await button('Cancelar').click();
    if (mobile && !before) {
      for (const [open,field] of [['+ Ejercicio','#add-workout-duration'],['Editar peso','input[name=weight]']]) {
        await page.getByRole('button',{name:new RegExp(open.replace('+','\\+'),'i')}).first().click();
        await page.locator(field).focus();
        await viewport(Math.round(size.height*.55),16,64);
        const gap = await page.locator('.entry-form-footer').evaluate(el=>el.getBoundingClientRect().bottom-visualViewport.height-visualViewport.offsetTop);
        assert.ok(gap<0,open+' '+gap);
        await viewport(); await button('Cancelar').click();
      }
    }
    assert.deepEqual(errors,[]);
    assert.equal(await page.evaluate(()=>window.__homeQA.externalRequests),0);
    rows.push({width,theme,geometry,retrySameIdentity:true,confirmed:writes[1].status,editCalories:482});
    console.log(width,theme,geometry);
  } finally {
    const recording = page.video();
    await ctx.close();
    if (recording) {await recording.saveAs(path.join(out,'recorrido.webm'));await recording.delete();}
  }
}
async function verifyBoundaries() {
  const ctx = await browser.newContext({viewport:{width:375,height:812},reducedMotion:'reduce',timezoneId:'America/Buenos_Aires'});
  await ctx.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
  const page = await ctx.newPage();
  const btn = label=>page.getByRole('button',{name:label,exact:true});
  try {
    await page.goto(origin+'/qa?controls=0&theme=light');
    await page.locator('.home-week-days button[aria-label*="12 de noviembre"]').click();
    await btn('+ Comida').click();
    await page.locator('#add-meal-description').fill('Cena sintética de ayer');
    await btn('Estimar con IA').click();
    await page.locator('.entry-estimate-value').waitFor();
    await btn('Guardar comida').click();
    const receipt = page.locator('.meal-saved');
    assert.match(await receipt.innerText(),/450 kcal · Estimación con IA · 12 nov 2026/);
    await btn('Ver registro').click();
    const row = page.locator('.daily-record-open:focus');
    const id = await row.getAttribute('data-meal-id');
    await row.click();
    await page.locator('.record-detail-edit').click();
    assert.equal(await page.locator('#edit-meal-description').inputValue(),'Cena sintética de ayer');
    await page.locator('#edit-meal-calories').fill('511');
    await btn('Guardar cambios').click();
    assert.match(await receipt.innerText(),/511 kcal · 12 nov 2026/);
    await btn('Cerrar confirmación').click();
    const saved = await page.evaluate(()=>window.__homeQA.writes.map(w=>({date:w.date,meals:w.record.meals.map(m=>m.id)})));
    assert.ok(saved.every(w=>w.date==='2026-11-12' && w.meals.filter(i=>i===id).length===1));
    await page.locator('.daily-habits-block').scrollIntoViewIfNeeded();
    for (const label of ['Sumar 250 ml de agua','Sumar 500 pasos']) {
      const control = btn(label);
      await control.scrollIntoViewIfNeeded();
      const top = await page.locator('.app-main').evaluate(el=>el.scrollTop);
      await control.click(); await page.waitForTimeout(800);
      assert.equal(await receipt.count(),0);
      assert.equal(await page.locator('.app-main').evaluate(el=>el.scrollTop),top);
    }
    // Hold only delivery of a successful result to the old form. The account's
    // underlying synthetic write has already been accepted and counted.
    await page.evaluate(()=>{
      const q=window.__homeQA;
      const write=q.store.updateRecord;
      q.store={...q.store,updateRecord:async (...args)=>{
        const ok=await write(...args);
        return new Promise(resolve=>{q.releaseReceipt=()=>resolve(ok);});
      }};
      q.notify();
    });
    await btn('+ Comida').click();
    await page.locator('#add-meal-description').fill('Respuesta diferida');
    await page.locator('#add-meal-calories').fill('255');
    await page.locator('#add-meal-calories').evaluate(el=>{el.form.requestSubmit();el.form.requestSubmit();});
    await page.waitForFunction(()=>!!window.__homeQA.releaseReceipt);
    const count=await page.evaluate(()=>window.__homeQA.writes.filter(w=>w.record.meals.some(m=>m.name==='Respuesta diferida')).length);
    assert.equal(count,1);
    await page.evaluate(()=>window.__homeQA.switchAccount('B'));
    await btn('Datos').click(); await page.locator('.charts-insights').waitFor();
    const top=await page.locator('.app-main').evaluate(el=>el.scrollTop);
    await page.evaluate(()=>window.__homeQA.releaseReceipt());
    await page.waitForTimeout(250);
    assert.equal(await btn('Datos').getAttribute('aria-current'),'page');
    assert.equal(await page.locator('.app-main').evaluate(el=>el.scrollTop),top);
    assert.equal(await receipt.count(),0);
    assert.deepEqual(await page.evaluate(()=>[window.__homeQA.externalRequests,window.__homeQA.aiCalls.length]),[0,1]);
    await writeFile(path.join(out,'casos.json'),JSON.stringify({historicalDate:'2026-11-12',mockEstimate:450,manualEdit:511,
      sameEntry:true,waterAndStepsKeptScroll:true,repeatedSubmitWrites:count,lateResultView:'Datos, cuenta B',realAI:0},null,2)+'\n');
  } finally { await ctx.close(); }
}
try {
  if (process.argv.includes('--checks-only')) {
    await verifyBoundaries();
  } else {
    for (const width of [375,320,1440]) for (const theme of ['dark','light']) await tour(width,theme);
    await writeFile(path.join(out,'matriz.json'),JSON.stringify(rows,null,2)+'\n');
    if (!before) await verifyBoundaries();
  }
} finally { await browser.close(); }
