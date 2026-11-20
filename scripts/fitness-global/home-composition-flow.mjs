import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, rmdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { repo, start } from './browser.mjs';

const origin = 'http://127.0.0.1:5194';
const out = path.join(repo,'docs/evidence/home-composition/after');
const button = (page,name) => page.getByRole('button',{name,exact:true});
const visibleRows = page => page.locator('.daily-record-open:visible');
const written = page => page.evaluate(()=>window.__homeQA.writes.map(w=>({date:w.date,status:w.status})));
const photo = {name:'fixture.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jPioAAAAASUVORK5CYII=','base64')};
const browser = await start();
const temp = await mkdtemp(path.join(tmpdir(),'calori-diario-'));
await mkdir(out,{recursive:true});
const result = {};
async function visit(context) {
  const errors=[];
  await context.route('**/*',route=> {
    const url = new URL(route.request().url());
    if(url.origin===origin) return route.continue();
    errors.push(url.hostname);
    return route.abort();
  });
  const page=await context.newPage();
  page.on('pageerror',error=>errors.push(error.message));
  page.setDefaultTimeout(15000);
  await page.goto(origin+'/qa?controls=0&theme=system');
  await page.locator('.daily-journal').waitFor();
  await page.evaluate(()=>document.fonts.ready);
  return {page,errors};
}
const options={viewport:{width:375,height:812},colorScheme:'light',reducedMotion:'reduce',locale:'es-AR',timezoneId:'America/Buenos_Aires'};

async function editAcrossLayouts() {
  const context=await browser.newContext(options);
  try {
    const {page,errors}=await visit(context);
    const toggle = page.locator('.home-history-toggle');
    await toggle.click();
    await page.locator('.ah-day[data-date="2026-11-09"]').click();
    assert.equal(await page.locator('.daily-active-date').last().getAttribute('datetime'),'2026-11-13');
    await page.locator('[data-history-open]').click();
    await page.waitForFunction(()=>document.activeElement?.id==='fitness-daily-entries');
    const opener=button(page,'Agregar comida');
    await opener.click();
    const input=page.locator('#add-meal-description');
    await input.fill('Comida del lunes');
    await page.locator('#add-meal-calories').fill('540');
    await page.locator('input[type=file]').setInputFiles(photo);
    const picture=page.getByAltText('Vista previa de la comida');
    await picture.waitFor();
    await page.evaluate(()=>{window.__homeQA.failed=true;});
    await button(page,'Guardar comida').click();
    const error=page.locator('.meal-write-error');
    await error.waitFor();
    const message=await error.innerText();
    const src=await picture.getAttribute('src');
    await input.focus();
    const node=await input.elementHandle();
    for (const [width,scheme] of [[768,'dark'],[1440,'light'],[375,'dark']]) {
      await page.setViewportSize({width,height:width===375?812:900});
      await page.emulateMedia({colorScheme:scheme});
      await page.locator(width<768?'.entry-bottom-sheet':'.entry-desktop-modal').waitFor();
      await page.waitForFunction(d=>document.documentElement.classList.contains('dark')===d,scheme==='dark');
      assert.ok(await node.evaluate(n=>n===document.querySelector('#add-meal-description') && document.activeElement===n));
      assert.equal(await input.inputValue(),'Comida del lunes');
      assert.equal(await picture.getAttribute('src'),src);
      assert.equal(await error.innerText(),message);
    }
    await page.keyboard.press('Escape');
    await button(page,'Seguir editando').click();
    assert.equal(await input.inputValue(),'Comida del lunes');
    await page.evaluate(()=>{window.__homeQA.failed=false;});
    await page.locator('form.entry-form').evaluate(f=>{f.requestSubmit();f.requestSubmit();});
    await page.locator('.meal-saved').waitFor();
    assert.deepEqual(await written(page),[{date:'2026-11-09',status:'failed'},{date:'2026-11-09',status:'confirmed'}]);
    await button(page,'Ver registro').click();
    const row=page.locator('.daily-record-open:focus');
    const id=await row.getAttribute('data-entry-id');
    await row.click();
    await page.locator('.record-detail-edit').click();
    const edit=page.locator('#edit-meal-description');
    await edit.fill('Edición que se descarta');
    await page.keyboard.press('Escape');
    await button(page,'Descartar cambios').click();
    await page.waitForFunction(id=>document.activeElement?.dataset.entryId===id,id);
    assert.equal(await page.evaluate(()=>window.__homeQA.writes.length),2);
    await button(page,'Editar total de pasos').click();
    const steps=page.getByRole('spinbutton',{name:'Total de pasos'});
    await steps.fill('4600');
    await page.evaluate(()=>{window.__homeQA.failed=true;});
    await steps.press('Enter');
    const retry=button(page,'Comprobar y reintentar');
    await retry.waitFor();
    assert.match(await page.locator('.habit-feedback[role=alert]').innerText(),/borrador/i);
    assert.equal(await page.evaluate(()=>window.__homeQA.store.activeProfile.records['2026-11-09'].steps),4100);
    await page.evaluate(()=>{window.__homeQA.failed=false;});
    await retry.click();
    await page.waitForFunction(()=>window.__homeQA.store.activeProfile.records['2026-11-09'].steps===4600);
    const usage=await page.evaluate(()=>[window.__homeQA.aiCalls.length,window.__homeQA.externalRequests]);
    assert.deepEqual(usage,[0,0]);assert.deepEqual(errors,[]);
    result.editor={widths:[375,768,1440,375],systemThemes:['light','dark','light','dark'],fieldIdentity:true,focus:true,photo:true,error:true,retrySingleWrite:true,editableDate:'2026-11-09',returnToRow:true,habitFailureRetriedOnSameDay:true};
  } finally {await context.close();}
}

async function recordJourney() {
  const context=await browser.newContext({...options,recordVideo:{dir:temp,size:options.viewport}});
  const {page,errors}=await visit(context);
  const recording=page.video();
  const pause=()=>page.waitForTimeout(450);
  let seconds, tail;
  try {
    const add=button(page,'Agregar comida');
    await add.scrollIntoViewIfNeeded();
    const start=performance.now();
    await pause();
    await add.click();
    await page.locator('#add-meal-description').fill('Yogur, fruta y avena');
    await page.locator('#add-meal-calories').fill('410');
    await page.locator('#add-meal-time').fill('22:30');
    const readScroll=()=>page.locator('.app-main').evaluate(el=>el.scrollTop);
    const top=await readScroll();
    await pause();
    await button(page,'Guardar comida').click();
    const receipt=page.locator('.meal-saved');
    await receipt.waitFor();
    assert.ok(Math.abs(await readScroll()-top)<=1,'saving should preserve reading position');
    assert.equal(await visibleRows(page).count(),4);
    assert.equal(await page.locator('.daily-records-toggle').getAttribute('aria-expanded'),'false');
    const id=await page.evaluate(()=>window.__homeQA.store.activeProfile.records[window.__homeQA.today].meals.at(-1).id);
    await receipt.scrollIntoViewIfNeeded();await pause();
    await button(page,'Ver registro').click();
    const row=page.locator('.daily-record-open:focus');
    assert.equal(await row.getAttribute('data-entry-id'),id);
    assert.equal(await row.getAttribute('data-entry-kind'),'meal');
    assert.equal(await visibleRows(page).count(),6);
    assert.equal(await row.evaluate(r=>[...document.querySelectorAll('.daily-record-open')].indexOf(r)),5);
    assert.equal(await page.locator('.daily-record-title').filter({hasText:'Yogur, fruta y avena'}).count(),2);
    await pause();
    const water=button(page,'Sumar 250 ml de agua');
    await water.scrollIntoViewIfNeeded();await pause();
    await water.click();
    await page.waitForFunction(()=>window.__homeQA.store.activeProfile.records[window.__homeQA.today].water===2000);
    assert.equal(await page.locator('.daily-records-toggle').getAttribute('aria-expanded'),'true');
    await pause();
    seconds=(performance.now()-start)/1000;
    await button(page,'Mostrar menos').click();
    assert.equal(await visibleRows(page).count(),4);
    assert.ok(await page.locator('.daily-records-toggle').evaluate(e=>e===document.activeElement));
    assert.deepEqual(await page.evaluate(()=>[window.__homeQA.aiCalls.length,window.__homeQA.externalRequests]),[0,0]);
    assert.deepEqual(errors,[]);
    tail=(performance.now()-start)/1000;
    result.journey={rows:6,visibleBefore:4,visibleAfter:6,sameName:2,focusedOrdinal:6,kind:'meal',scrollChangeOnSave:0,waterBefore:1750,waterAfter:2000,expansionPreserved:true};
  } finally {await context.close();}
  const require=createRequire(process.env.PLAYWRIGHT_MODULE || path.resolve(repo,'../qa-tools/node_modules/playwright/index.mjs'));
  const {registry}=require('playwright-core/lib/server/registry/index');
  // Include the complete journey; cut both the dev-server startup and the final regression-only steps.
  const ffmpeg=registry.findExecutable('ffmpeg').executablePath();
  execFileSync(ffmpeg,['-hide_banner','-loglevel','error','-sseof','-'+tail.toFixed(3),
    '-i',await recording.path(),'-t',seconds.toFixed(3),'-an','-c:v','libvpx','-threads','1',
    '-b:v','900k','-crf','10','-y',path.join(out,'recorrido.webm')]);
  await recording.delete();
  result.journey.interactionSeconds=Number(seconds.toFixed(2));
}

try {
  await editAcrossLayouts();
  await recordJourney();
  result.browser=await browser.version();
  await writeFile(path.join(out,'recorrido.json'),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result));
} finally {await browser.close();await rmdir(temp).catch(()=>{});}
