import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {before, open, repo} from './browser.mjs';
import {start} from '../ux-stage1/browser.mjs';
import {measureControl} from './control-colors.mjs';
import {measureTime} from '../ux-stage2/native-time.mjs';

const folder = path.join(repo, 'docs/evidence/perfil-noviembre', before ? 'antes' : 'despues');
await mkdir(folder,{recursive:true});
const browser = await start(['--enable-blink-features=LangAttributeAwareFormControlUI']);
const measurements = [];
const frames = page=>page.evaluate(async()=>{await document.fonts.ready;await new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)));});
const byName=(page,name)=>page.getByRole('button',{name,exact:true});

async function exerciseForm(page, width, theme, mode) {
  const meal=mode.endsWith('meal'), edit=mode.startsWith('edit');
  if(edit) {
    const row=page.locator('.daily-record-open').filter({hasText:meal?'Yogur':'Gimnasio'});
    if(!await row.count()) await page.getByRole('button',{name:/Ver todos los registros/}).click();
    await row.first().click();
    await page.locator('.record-detail-edit').click();
  } else await byName(page,meal?'Agregar comida':'Agregar ejercicio').click();
  const form=page.locator('form.entry-form:visible');
  const field=form.locator('input[type=time]');
  await field.waitFor();
  const original=await field.inputValue();
  if(edit) assert.equal(original, meal?'08:30':'10:00');
  await field.fill('19:54');
  await field.evaluate(el=>el.closest('.entry-time').scrollIntoView({block:'center',behavior:'instant'}));
  await frames(page);
  const now=byName(form,'Usar hora actual');
  const report = await form.evaluate(el=>{
    const input=el.querySelector('input[type=time]'), now=el.querySelector('[aria-label="Usar hora actual"]');
    const f=input.getBoundingClientRect(), n=now.getBoundingClientRect(), footer=el.querySelector('.entry-form-footer');
    const [cancel,save]=[...footer.querySelectorAll('button')].map(b=>b.getBoundingClientRect());
    return {inputWidth:f.width, inputHeight:f.height, nowWidth:n.width, nowHeight:n.height,
      gap:n.top>=f.bottom-1?n.top-f.bottom:n.left-f.right, footerGap:Math.max(save.left-cancel.right,cancel.left-save.right,save.top-cancel.bottom,cancel.top-save.bottom),
      footerVisible:save.bottom<=innerHeight+1 && cancel.top>=0 && save.top>=0,
      label:input.labels?.[0]?.innerText, type:input.type,
      overflow:Math.max(0,el.scrollWidth-el.clientWidth,document.documentElement.scrollWidth-innerWidth)};
  });
  if ([375,1440].includes(width) || (theme==='light' && !edit)) {
    await page.screenshot({path:path.join(folder,'diario-'+width+'-'+theme+'-'+mode+'.jpg'),quality:84});
  }
  if(!before) {
    const cdp=await page.context().newCDPSession(page);
    await field.evaluate(el=>{el.lang='en-US';el.type='text';el.type='time';});
    report.native=await measureTime(cdp,await field.getAttribute('id'));
    await cdp.detach();
    assert.ok(report.native.dayPeriodVisible && report.native.spareWithSpanishSuffix>=0,JSON.stringify({width,theme,mode,native:report.native}));
    await form.locator('.entry-calories input').fill('482');
    assert.match(await form.locator('.entry-calories').innerText(),/kcal/i);
    if(!meal) assert.match(await form.locator('.entry-duration').innerText(),/min/i);
    if(width===375) {
      report.colors={};
      for(const [name,control] of [['hora',field],['ahora',now],['guardar',form.locator('[type=submit]')],['cancelar',byName(form,'Cancelar')]]) {
        await page.mouse.move(0,0);
        await control.evaluate(el=>el.blur());
        const normal=await measureControl(control);
        await control.hover(); await page.waitForTimeout(250); const hover=await measureControl(control);
        await page.mouse.move(0,0); await control.focus(); await page.waitForTimeout(250); const focus=await measureControl(control);
        report.colors[name]={normal,hover,focus};
      }
    }
  }
  await now.press('Enter');
  assert.match(await field.inputValue(),/^12:\d\d$/);
  assert.equal(report.type,'time');
  assert.equal(report.overflow,0);
  assert.ok(report.gap>=0 && report.inputHeight>=44 && report.nowWidth>=44 && report.nowHeight>=44 && report.footerVisible && report.footerGap>=0,JSON.stringify(report));
  await byName(form,'Cancelar').click();
  const keep=byName(page,'Seguir editando');
  assert.ok(await keep.evaluate(el=>el===document.activeElement));
  if(!before && width===375 && mode==='add-meal') {
    report.discardColors={keep:await measureControl(keep),discard:await measureControl(byName(page,'Descartar cambios'))};
    for(const pair of Object.values(report.discardColors)) assert.ok(pair.contrast>=4.5,JSON.stringify(pair));
    await page.screenshot({path:path.join(folder,'diario-'+width+'-'+theme+'-descarte.jpg'),quality:84});
    await keep.click();
    assert.match(await field.inputValue(),/^12:\d\d$/);
    await byName(form,'Cancelar').click();
  }
  await byName(page,'Descartar cambios').click();
  await form.waitFor({state:'hidden'});
  measurements.push({width,theme,mode,original,...report});
}

try {
  for(const width of [375,320,768,1440]) for(const theme of ['dark','light']) {
    const {page,context,errors}=await open(browser,width,theme,theme);
    try {
      for(const mode of ['add-meal','add-workout','edit-meal','edit-workout']) {
        await exerciseForm(page,width,theme,mode);
        console.log(width,theme,mode);
      }
      await byName(page,'Editar peso').click();
      const weight=page.locator('input[name="weight"]');
      await weight.fill('72.6');
      assert.equal(await weight.inputValue(),'72.6');
      const cancel=byName(page,'Cancelar'), save=byName(page,'Guardar peso');
      const c=await cancel.boundingBox(),s=await save.boundingBox();
      assert.ok(c.width>=44 && c.height>=44 && s.width>=44 && s.height>=44 && Math.max(s.x-c.x-c.width,c.x-s.x-s.width,s.y-c.y-c.height,c.y-s.y-s.height)>=0);
      if(width===375 || width===1440) await page.screenshot({path:path.join(folder,'diario-'+width+'-'+theme+'-peso.jpg'),quality:82});
      await cancel.click(); await byName(page,'Descartar cambios').click();
      assert.deepEqual(errors,[]);
    } finally {await context.close();}
  }
  await writeFile(path.join(folder,'diario-mediciones.json'),JSON.stringify(measurements,null,2)+'\n');
} finally {await browser.close();}
