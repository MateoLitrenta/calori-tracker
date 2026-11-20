import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { repo, heights } from './browser.mjs';

const before = process.argv.includes('--reference');
const mealAction = before ? '+ Comida' : 'Agregar comida';
const workoutAction = before ? '+ Ejercicio' : 'Agregar ejercicio';
const pan = process.argv.includes('--pan');
const engine = process.argv.includes('--webkit') ? 'webkit' : 'chromium';
const pw = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE || path.resolve(repo,'../qa-tools/node_modules/playwright/index.mjs')));
const browser = await pw[engine].launch(engine==='chromium'?{channel:'chrome'}:{});
const dir = process.env.CALORI_QA_OUTPUT_DIR || path.join(repo,pan ? 'docs/evidence/meal-flow/safari-pan' : 'docs/evidence/meal-flow/safari',before?'before':'after',engine);
await mkdir(dir,{recursive:true});
const origin='http://127.0.0.1:'+(before && pan ? 5199 : 5194);
const results=[];

// Paint an independent obstruction INSIDE the reported visual viewport. It
// receives pointer hits like an obstruction, but never contains app controls.
function setup(pan) {
  const vv = new EventTarget();
  const full=innerHeight;
  Object.assign(vv,{height:full,offsetTop:0});
  Object.defineProperty(window,'visualViewport',{value:vv});
  let phase = 0;
  Object.defineProperty(vv, 'pageTop', { get: () => scrollY + vv.offsetTop });
  window.keyboardScenario = (kind) => {
    const open = !!kind;
    const decimal = kind==='number';
    vv.height = open ? Math.round(full * (decimal ? 0.58 : 0.55)) : full;
    vv.offsetTop=open?(decimal?17:9):0;
    if (pan && document.querySelector('form.entry-form')) {
      // Real document scroll, independent visual pan and a moving browser obstruction.
      document.documentElement.style.overflowY='auto';
      document.body.style.minHeight='350vh';
      vv.offsetTop = open ? [48, 92, 127][phase % 3] : 0;
      window.scrollTo(0,open ? [318, 657, 884][phase++ % 3] : 0);
    } else if (pan) { window.scrollTo(0,0); }
    let mask=document.querySelector('#qa-obstruction');
    if (!mask) {
      mask=document.createElement('div');
      mask.id='qa-obstruction';
      Object.assign(mask.style,{position:'fixed',inset:'auto 0 0',background:'#3d4349',borderTop:'2px dashed #bec8ce',color:'white',padding:'8px',textAlign:'center',zIndex:99999,font:'13px system-ui'});
      mask.textContent='Obstrucción simulada · ensayo de geometría';
      document.body.append(mask);
    }
    mask.style.top = (vv.offsetTop + vv.height - Math.round(vv.height * (decimal ? 0.33 : 0.27))) + 'px';
    mask.hidden=!open;
    vv.dispatchEvent(new Event('resize')); vv.dispatchEvent(new Event('scroll'));
  };
}

async function run(width,theme) {
  const height=heights[width], mobile=width<768;
  const ctx=await browser.newContext({viewport:{width,height},locale:'es-AR',timezoneId:'America/Buenos_Aires',colorScheme:theme,reducedMotion:'reduce'});
  await ctx.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
  if (mobile) await ctx.addInitScript(setup,pan);
  const page=await ctx.newPage();
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const button=name=>page.getByRole('button',{name,exact:true});
  const field=id=>page.locator('#'+id);
  const input=async (id,text) => { await field(id).fill(text); };
  const keyboard=async kind=>{
    if(mobile) await page.evaluate(kind=>window.keyboardScenario(kind),kind);
    await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
  };
  const observe=async (step, line=0) => {
    const values=await page.evaluate(line=>{
      const el=document.activeElement;
      const box=el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};};
      const content=document.querySelector('.entry-form-content'), dialog=document.querySelector('.entry-sheet-header').parentElement;
      const toolbar=document.querySelector('.entry-form-footer');
      const rect=el.getBoundingClientRect(),style=getComputedStyle(el);
      // Fixtures have explicit, short, non-wrapping lines. Measure the selected
      // line independently of the product's caret mirror.
      const y=el.tagName==='TEXTAREA'?rect.top+parseFloat(style.paddingTop)+parseFloat(style.borderTopWidth)+(line+.5)*parseFloat(style.lineHeight):rect.top+rect.height/2;
      const lineHeight=parseFloat(style.lineHeight) || 18;
      const sampleY=el.tagName==='TEXTAREA' ? [y-lineHeight/2+1,y+lineHeight/2-1] : [rect.top+3,rect.bottom-3];
      const fieldHit=sampleY.every(py=>document.elementFromPoint(rect.left+rect.width/2,py)===el);
      const actionHits=[...toolbar.querySelectorAll('button')].every(b=>{
        const r=b.getBoundingClientRect();
        return [r.top+3,r.bottom-3].every(y=>[r.left+6,r.right-6].every(x=>b.contains(document.elementFromPoint(x,y))));
      });
      const mask=document.querySelector('#qa-obstruction');
      const main=document.querySelector('.app-main');
      if (main.inert) main.querySelector('.daily-quick-actions button').focus({preventScroll:true});
      return {field:el.id||el.name, focusRetained:document.activeElement===el, backgroundOpacity:getComputedStyle(main).opacity,
        safeAreaPadding:getComputedStyle(dialog).paddingTop, fieldBox:box(el), lineRange:sampleY, layout:[document.documentElement.clientWidth,document.documentElement.clientHeight],
        visual:[visualViewport.offsetTop,visualViewport.height],windowScroll:scrollY,mainScroll:main.scrollTop,bodyScroll:content.scrollTop,
        backdrop:box(dialog.parentElement),sheet:box(dialog),heading:box(dialog.querySelector('.entry-sheet-header')),body:box(content),actions:box(toolbar),
        obstructionTop:mask&&!mask.hidden?mask.getBoundingClientRect().top:null,fieldHit,actionHits,inert:main.inert};
    },line);
    results.push({width,height,theme,step,...values});
    if(width===375 && mobile && (pan ? ['alta-calorias','ejercicio-notas-final','ejercicio-distancia-final'] : ['alta-calorias','edicion-descripcion','ejercicio-actividad','ejercicio-notas']).includes(step)) {
      await page.screenshot({path:path.join(dir,theme+'-'+step+'.jpg'),quality:85,animations:'disabled'});
    }
    if(!before) {
      assert.ok(values.actionHits && values.fieldHit,JSON.stringify(results.at(-1)));
      if (pan && mobile && step !== 'peso') {
        assert.ok(values.windowScroll >= 300);
        assert.ok(Math.abs(values.sheet.y-values.visual[0]) <= 1, JSON.stringify(values));
      }
      if(mobile) {assert.ok(values.inert && values.focusRetained);assert.equal(values.backgroundOpacity,'0');}
    }
  };
  try {
    await page.goto(origin+'/qa?controls=0&theme='+theme);
    await button(mealAction).click();
    const desc='Uno\nDos\nTres\nCuatro\nCinco\nSeis';
    await input('add-meal-description',desc);
    await keyboard('text');
    await field('add-meal-description').evaluate(el=>el.setSelectionRange(4,7));
    await page.keyboard.insertText('Otro');
    assert.equal(await field('add-meal-description').inputValue(),desc.replace('Dos','Otro'));
    await keyboard('text'); await observe('alta-descripcion',1);
    if(pan) {
      await keyboard(null);
      await page.evaluate(()=>{window.__homeQA.aiError=503;});
      const estimate=button('Estimar con IA');
      await estimate.scrollIntoViewIfNeeded();
      await estimate.click();
      // The reviewed WebKit baseline may lose the click on textarea blur.
      // Use keyboard activation there to compare the same failed request.
      if (before && !await page.evaluate(()=>window.__homeQA.aiCalls.length)) await estimate.press('Enter');
      if (!before) await page.getByText(/Podés ingresar las calorías manualmente/).waitFor();
    }
    await input('add-meal-calories','482'); await keyboard('number'); await observe('alta-calorias');
    await keyboard(null);
    await field('add-meal-time').fill('20:45');
    await field('add-meal-calories').focus(); await keyboard('number');
    if(before) await keyboard(null);
    await button('Cancelar').click();
    await keyboard(null); await button('Seguir editando').click();
    assert.equal(await field('add-meal-description').inputValue(),desc.replace('Dos','Otro'));
    await button('Guardar comida').click();
    await page.locator('.meal-saved').waitFor();
    if (pan && width===375 && theme==='dark') await page.locator('.meal-saved').screenshot({path:path.join(dir,'comida-guardada.jpg')});
    if (before) {
      await button('Cerrar confirmación').click();
      await page.getByRole('link', {name: 'Ver registros', exact: true}).click();
      assert.equal(new URL(page.url()).hash, '#fitness-daily-entries');
      await page.locator('.daily-record-open').first().click();
    } else {
      await button('Ver registro').click();
      const saved = page.locator('.daily-record-open:focus');
      assert.equal(await saved.getAttribute('data-entry-kind'), 'meal');
      assert.equal(await saved.locator('.daily-record-title').textContent(), desc.replace('Dos','Otro'));
      await saved.click();
    }
    await page.locator('.record-detail-edit').click();
    await input('edit-meal-description',desc); await keyboard('text'); await observe('edicion-descripcion',5);
    if(before) await keyboard(null);
    await button('Guardar cambios').click(); await keyboard(null);
    await button('Cerrar confirmación').click();
    await page.locator('.daily-quick-actions').scrollIntoViewIfNeeded();
    await button(workoutAction).click();
    await input('add-workout-activity','Caminata'); await keyboard('text'); await observe('ejercicio-actividad');
    await keyboard(null);
    await input('add-workout-duration','25'); await keyboard('number'); await observe('ejercicio-duracion');
    await keyboard(null);
    await input('add-workout-calories','160'); await keyboard('number'); await observe('ejercicio-calorias');
    await keyboard(null);
    await input('add-workout-notes',desc); await keyboard('text'); await observe('ejercicio-notas',5);
    if(pan) {
      for(const part of [' A', ' B', ' C']) {
        await page.keyboard.insertText(part); await keyboard('text'); await observe('ejercicio-notas-'+part.trim(),5);
      }
      await keyboard(null); await keyboard('text'); await observe('ejercicio-notas-final',5);
      await field('add-workout-distance').focus();
      for(const [i,key] of ['2','.','3','5'].entries()) {
        await page.keyboard.press(key); await keyboard('number'); await observe('distancia-'+i);
      }
      assert.equal(await field('add-workout-distance').inputValue(),'2.35');
      await keyboard(null); await field('add-workout-distance').focus(); await keyboard('number'); await observe('ejercicio-distancia-final');
      await field('add-workout-notes').focus(); await keyboard('text');
    }
    const sel=await field('add-workout-notes').evaluate(el=>[el.selectionStart,el.selectionEnd]);
    await page.locator('.entry-form-content').evaluate(el=>{el.scrollTop=Math.max(0,el.scrollTop-60);});
    await keyboard(null); await keyboard('text');
    assert.deepEqual(await field('add-workout-notes').evaluate(el=>[el.selectionStart,el.selectionEnd]),sel);
    if(before) await keyboard(null);
    await page.locator('.entry-form-footer button[type=submit]').click(); await keyboard(null);
    if(pan && !before) {
      const receipt=page.getByRole('complementary',{name:'Confirmación de ejercicio'});
      await receipt.waitFor(); assert.match(await receipt.innerText(),/25 min.*160 kcal/);
      if (width===375 && theme==='dark') await receipt.screenshot({path:path.join(dir,'ejercicio-guardado.jpg')});
      await receipt.getByRole('button',{name:'Ver registro'}).click();
      assert.equal(await page.evaluate(()=>document.activeElement.dataset.entryKind),'workout');
      await page.keyboard.press('Enter'); await page.locator('.record-detail-edit').click();
      const distance = field('edit-workout-distance');
      assert.equal(await distance.inputValue(),'2.35');
      await distance.focus(); await keyboard('number'); await observe('edicion-distancia');
      await keyboard(null);
      await field('edit-workout-notes').focus();
      await field('edit-workout-notes').evaluate(el=>el.setSelectionRange(el.value.length,el.value.length));
      await keyboard('text'); await observe('edicion-notas',5);
      await keyboard(null); await button('Cancelar').click();
    }
    await button('Editar peso').click(); const weight=page.locator('input[name=weight]'); await weight.focus();
    await keyboard('number'); await observe('peso');
    if(before) await keyboard(null);
    await button('Cancelar').click(); await keyboard(null);
    assert.deepEqual(errors,[]);
    assert.equal(await page.evaluate(()=>window.__homeQA.externalRequests),0);
    console.log(engine,width,theme,'OK');
  } finally { await ctx.close(); }
}
try {
  for (const width of [375,320,1440]) for(const theme of ['dark','light']) await run(width,theme);
  await writeFile(path.join(dir,'geometria.json'),JSON.stringify(results,null,2)+'\n');
} finally { await browser.close(); }
