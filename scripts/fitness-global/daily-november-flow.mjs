import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { open, repo } from './browser.mjs';
import {start} from '../ux-stage1/browser.mjs';
import {measureTime} from '../ux-stage2/native-time.mjs';
import { measureControl } from './control-colors.mjs';

const output=path.join(repo,'docs/evidence/perfil-noviembre/despues');
await mkdir(output,{recursive:true});
const browser=await start(['--enable-blink-features=LangAttributeAwareFormControlUI']);
const results=[];
const byName=(page,name)=>page.getByRole('button',{name,exact:true});
try {
  for(const theme of ['light','dark']) {
    const {page,context,errors}=await open(browser,320,'system',theme);
    try {
      const report={theme,forms:[]};
      await page.locator('.home-week-days button[aria-label*="12 de noviembre"]').click();
      await byName(page,'Agregar comida').click();
      const description=page.locator('#add-meal-description'), calories=page.locator('#add-meal-calories');
      const field=page.locator('#add-meal-time'), save=byName(page,'Guardar comida');
      const text='Comida sintética con una descripción larga, preparada en casa y con verduras. '.repeat(3).trim();
      await description.fill(text); await calories.fill('482'); await field.fill('21:23');
      await field.focus(); await field.evaluate(el=>window.originalDailyTime=el);
      await page.setViewportSize({width:768,height:1024});
      await page.emulateMedia({colorScheme:theme==='light'?'dark':'light'});
      await page.waitForFunction(t=>document.documentElement.classList.contains('dark')===(t==='light'),theme);
      assert.equal(await field.inputValue(),'21:23');
      assert.ok(await field.evaluate(el=>el===document.activeElement && el===window.originalDailyTime));
      assert.equal(await description.inputValue(),text);
      await page.setViewportSize({width:320,height:568});
      await page.emulateMedia({colorScheme:theme});
      await page.waitForFunction(t=>document.documentElement.classList.contains('dark')===(t==='dark'),theme);
      await byName(page,'Usar hora actual').click();
      assert.match(await field.inputValue(),/^12:\d\d$/);
      await page.evaluate(()=>{
        const q=window.__homeQA, update=q.store.updateRecord;
        q.failed=true;
        q.store={...q.store,updateRecord:async(...args)=>{
          if(q.gate){await new Promise(done=>q.releaseWrite=done);q.gate=false;}
          return update(...args);
        }};
        q.gate=true;q.notify();
      });
      await save.click();
      const busy=byName(page,'Guardando…');
      await busy.waitFor();
      assert.ok(await busy.isDisabled());
      report.disabledSave=await measureControl(busy);
      report.disabledCancel=await measureControl(byName(page,'Cancelar'));
      await page.evaluate(()=>window.__homeQA.releaseWrite());
      await page.locator('.meal-write-error').waitFor();
      assert.equal(await description.inputValue(),text);
      assert.equal(await calories.inputValue(),'482');
      await page.evaluate(()=>window.__homeQA.failed=false);
      await save.click(); await byName(page,'Ver registro').click();
      const row=page.locator('.daily-record-open:focus');
      assert.match(await row.innerText(),/Comida sintética/);
      await row.press('Enter'); await page.locator('.record-detail-edit').click();
      assert.match(await page.locator('#edit-meal-time').inputValue(),/^12:\d\d$/);
      assert.deepEqual(await page.evaluate(()=>window.__homeQA.writes.map(w=>[w.date,w.status])),[['2026-11-12','failed'],['2026-11-12','confirmed']]);
      await byName(page,'Cancelar').click();
      for(const kind of ['meal','workout','edit-meal','edit-workout','weight']) {
        if (kind.startsWith('edit-')) {
          await page.locator('.daily-record-open[data-entry-kind="'+kind.slice(5)+'"]').first().click();
          await page.locator('.record-detail-edit').click();
        } else await byName(page,kind==='meal'?'Agregar comida':kind==='workout'?'Agregar ejercicio':'Editar peso').click();
        const form=page.locator('form.entry-form:visible');
        if(kind==='workout'){
          await byName(form,'Caminata').click();
          await form.locator('input[id$="distance"]').fill('2.35');
          assert.match(await form.locator('.entry-distance').innerText(),/km/i);
        }
        await form.evaluate(el=>{
          const nodes=[el,...el.querySelectorAll('*')].filter(n=>n instanceof HTMLElement);
          const sizes=nodes.map(n=>parseFloat(getComputedStyle(n).fontSize));
          nodes.forEach((n,i)=>n.style.fontSize=sizes[i]*2+'px');
        });
        const target=form.locator(kind==='weight'?'input[name="weight"]':'input[type=time]');
        await target.evaluate(el=>el.scrollIntoView({block:'center'}));
        const geometry=await form.evaluate(el=>{
          const primary=el.querySelector('[type="submit"]').getBoundingClientRect(), cancel=el.querySelector('.entry-cancel').getBoundingClientRect();
          const time=el.querySelector('input[type=time]')?.getBoundingClientRect(),now=el.querySelector('.entry-time-now')?.getBoundingClientRect();
          return {overflow:Math.max(el.scrollWidth-el.clientWidth,document.documentElement.scrollWidth-innerWidth),
            footerGap:Math.max(primary.left-cancel.right,cancel.left-primary.right,primary.top-cancel.bottom,cancel.top-primary.bottom),
            footerBottom:Math.max(primary.bottom,cancel.bottom),
            ...time && {timeNowGap:Math.max(now.left-time.right,now.top-time.bottom),timeWidth:time.width,nowWidth:now.width,
              fitsHorizontally:Math.min(time.left,now.left)>=-0.5 && Math.max(time.right,now.right)<=innerWidth+0.5}};
        });
        assert.ok(geometry.overflow<=1 && geometry.footerGap>=0 && geometry.footerBottom<=569,JSON.stringify(geometry));
        if(kind!=='weight') assert.ok(geometry.fitsHorizontally && geometry.timeNowGap>=0,JSON.stringify(geometry));
        if(kind!=='weight') {
          await target.evaluate(el=>{el.lang='en-US';el.type='text';el.type='time';});
          await target.fill('19:54');
          const cdp=await context.newCDPSession(page);
          const native=await measureTime(cdp,await target.getAttribute('id')); await cdp.detach();
          assert.ok(native.dayPeriodVisible && native.spareWithSpanishSuffix>=0,JSON.stringify(native));
          geometry.native=native;
        }
        report.forms.push({kind,...geometry});
        await page.screenshot({path:path.join(output,'diario-320-'+theme+'-'+kind+'-200.jpg'),quality:82});
        await byName(form,'Cancelar').click();
        if(await byName(page,'Descartar cambios').isVisible()) await byName(page,'Descartar cambios').click();
      }
      assert.deepEqual(errors,[]);
      report.writes=['failed','confirmed'];report.date='2026-11-12';report.focusAndDraftAcrossResize=true;results.push(report);
      console.log(JSON.stringify(report));
    } finally {await context.close();}
  }
  await writeFile(path.join(output,'diario-recorrido.json'),JSON.stringify(results,null,2)+'\n');
} finally {await browser.close();}
