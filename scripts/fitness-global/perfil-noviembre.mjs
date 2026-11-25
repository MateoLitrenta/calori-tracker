import assert from 'node:assert/strict';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { mkdir, writeFile } from 'node:fs/promises';
import { before, go, open, origin, repo, start } from './browser.mjs';
import { measureControl } from './control-colors.mjs';

const folder = path.join(repo,'docs/evidence/perfil-noviembre',before?'antes':'despues');
await mkdir(folder,{recursive:true});
const browser = await start();
const rows = [];
const photo = {name:'avatar.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVQImWNgYGD4DwABBAEAHnOcQAAAAABJRU5ErkJggg==','base64')};
async function checkColors(page,control,row,label) {
  await page.mouse.move(0,0);
  row.colors ??= {};
  row.colors[label]={normal:await measureControl(control)};
  await control.hover();
  row.colors[label].hover=await measureControl(control);
  await page.mouse.move(0,0);
  await page.keyboard.press('Tab');
  await control.focus();
  row.colors[label].focus=await measureControl(control);
  const box=await control.boundingBox();
  assert.ok(box.width>=44 && box.height>=44,label+' · área táctil');
  assert.ok(Object.values(row.colors[label]).every(state=>state.contrast>=4.5),label+' · contraste');
}
const longName = 'Alejandra Martínez del Valle';
async function sample(width,theme) {
  const systemJourney = !before && width===375 && theme==='dark';
  const {context,page,errors} = await open(browser,width,'system',theme,origin);
  const b=name=>page.getByRole('button',{name,exact:true});
  const shot=async(name,anchor)=>{
    if(anchor) await anchor.scrollIntoViewIfNeeded();
    if(width===375||width===1440||name==='lectura'||name==='200') await page.screenshot({path:path.join(folder,width+'-'+theme+'-perfil-'+name+'.jpg'),quality:85});
  };
  try {
    await go(page,'Perfil');
    const root=page.locator('.profile-view');
    const main=page.locator('.app-main');
    const row={width,theme,height:Math.round((await root.boundingBox()).height)};
    await shot('lectura');
    const check = !before && width===375;
    if(check){
      await checkColors(page,b('Editar perfil'),row,'editar');
      await checkColors(page,b('Cambiar foto'),row,'cambiarFoto');
    }
    const method=page.getByRole('button',{name:/Cómo calculamos tu gasto/});
    await method.click();
    const explanation=page.locator('#profile-energy-details');
    await explanation.waitFor();
    assert.match(await explanation.innerText(),/solaparse/);
    if(!before) assert.equal(await explanation.evaluate(el=>!!el.closest('.profile-personal-panel')),true);
    await shot('calculo',explanation);
    await method.click();
    await b('Editar perfil').click();
    const name=page.getByLabel('Nombre',{exact:true});
    await name.fill(longName);
    const weight=page.getByLabel('Peso de perfil (kg)');
    await weight.fill('75.5');
    await shot('edicion',weight);
    if(systemJourney){
      await name.focus();
      await page.setViewportSize({width:1440,height:900}); await page.emulateMedia({colorScheme:'light'});
      await page.waitForFunction(()=>!document.documentElement.classList.contains('dark'));
      assert.ok(await name.evaluate(el=>el===document.activeElement));
      assert.equal(await b('Sistema').getAttribute('aria-pressed'),'true');
      await page.setViewportSize({width,height:812}); await page.emulateMedia({colorScheme:theme});
    }
    if(width===375){
      const file=page.getByLabel('Elegir foto de perfil');
      await file.setInputFiles(photo);
      await b('Cancelar foto').waitFor();
      if(check) await checkColors(page,b('Guardar foto'),row,'guardarFoto');
      await shot('foto',b('Guardar foto'));
      await b('Cancelar foto').click();
      assert.equal(await name.inputValue(),longName);
      await file.setInputFiles(photo);
      await b('Guardar foto').click();
      await b('Eliminar foto').waitFor();
      if(!before){
        await checkColors(page,b('Eliminar foto'),row,'eliminarFoto');
        await b('Eliminar foto').click();
      }
      await page.getByText('Foto actualizada.',{exact:true}).waitFor({state:'hidden'});
      await page.getByText('Foto eliminada.',{exact:true}).waitFor({state:'hidden'});
      assert.equal(await weight.inputValue(),'75.5');
      assert.equal(await page.evaluate(()=>window.__homeQA.profileWrites.length),0);
    }
    await page.evaluate(()=>{const q=window.__homeQA; q.profileError=true; q.setProfile({age:38});});
    if(check){
      await checkColors(page,b('Guardar cambios'),row,'guardar');
      await checkColors(page,b('Cancelar'),row,'cancelar');
      await checkColors(page,weight,row,'campo');
    }
    await b('Guardar cambios').click();
    const failure=before?page.getByText(/No se pudieron guardar los datos/):page.locator('.profile-personal-panel form [role=alert]');
    await failure.waitFor();
    assert.equal(await name.inputValue(),longName);
    await shot('error',b('Guardar cambios'));
    if(check){
      row.error=await measureControl(failure);
    }
    await page.evaluate(slow=>{
      const q=window.__homeQA; q.profileError=false;
      if(!slow) return;
      const update=q.store.updateProfile;
      q.store={...q.store,updateProfile:async(...args)=>{
        await new Promise(done=>{q.releaseSave=done;}); return update(...args);
      }};
      q.notify();
    },check);
    await b('Guardar cambios').click();
    if(check){
      const busy=page.locator('.profile-personal-panel button[type=submit]');
      assert.ok(await busy.isDisabled());
      row.colors.guardar.disabled=await measureControl(busy);
      await page.evaluate(()=>window.__homeQA.releaseSave());
    }
    await b('Editar perfil').waitFor();
    const saved=await page.evaluate(()=>{
      const q=window.__homeQA,p=q.store.activeProfile;return [p.name,p.age,p.weight,p.records[q.today].weight,q.profileWrites.length];
    });
    assert.deepEqual(saved,[longName,38,75.5,72.8,1]);
    await shot('guardado',b('Editar perfil'));
    await b('Editar perfil').click(); await name.fill('Cambio para descartar');
    await b('Cancelar').click();
    const keep=b('Seguir editando'); await keep.waitFor();
    assert.ok(await keep.evaluate(el=>el===document.activeElement));
    if(check){
      await checkColors(page,keep,row,'seguirEditando');
      await checkColors(page,page.getByRole('dialog').getByRole('button',{name:/Descartar/}),row,'descartar');
    }
    await keep.click(); assert.equal(await name.inputValue(),'Cambio para descartar');
    await b('Cancelar').click(); await page.getByRole('dialog').getByRole('button',{name:/Descartar/}).click();
    if (!before) assert.ok(await b('Editar perfil').evaluate(el => el === document.activeElement));
    const data=page.locator('.profile-management');
    await data.locator('summary').click();
    await b('Borrar todos los registros').click();
    await data.getByRole('button',{name:'Cancelar'}).click();
    await shot('gestion',data);
    if(!before && width===320){
      await root.evaluate(el=>{
        const nodes=[el,...el.querySelectorAll('*')].filter(n=>n instanceof HTMLElement);
        const sizes=nodes.map(n=>parseFloat(getComputedStyle(n).fontSize));
        nodes.forEach((n,i)=>{n.style.fontSize=sizes[i]*2+'px';});
      });
      await main.evaluate(el=>el.scrollTop=0);
      await shot('200');
    }
    row.overflow=await main.evaluate(el=>Math.max(el.scrollWidth-el.clientWidth,document.documentElement.scrollWidth-innerWidth));
    assert.ok(row.overflow<=1,JSON.stringify(row));
    if (!before && width === 375) {
      await go(page, 'Inicio');
      await page.locator('summary[aria-label="Ver desglose"]').click();
      assert.match(await page.locator('.fitness-breakdown-body').innerText(), /TMB:/);
      assert.ok(await page.getByRole('heading', {name: 'Hábitos', exact: true}).isVisible());
      const history = page.getByRole('button', {name: /Historial y tendencias/});
      if (await history.getAttribute('aria-expanded') !== 'true') await history.click();
      assert.ok(await page.locator('.activity-history-v2').isVisible());
      for (const tab of ['Datos', 'Coach']) {
        await go(page, tab);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      }
      row.navigation = ['Ver desglose', 'Hábitos', 'Historial', 'Datos', 'Coach'];
    }
    assert.deepEqual(errors,[]);
    console.log(width,theme,row.height,row.overflow);
    rows.push(row);
  } finally {
    await context.close();
  }
}
async function recordEdit() {
  const {context,page,errors}=await open(browser,375,'dark','dark',origin,{recordVideo:{dir:tmpdir(),size:{width:375,height:812}}});
  const video=page.video();
  const button=name=>page.getByRole('button',{name,exact:true});
  try {
    await go(page,'Perfil');
    await page.waitForTimeout(850);
    const method=page.getByRole('button',{name:/Cómo calculamos tu gasto/});
    await method.click(); await page.locator('#profile-energy-details').scrollIntoViewIfNeeded(); await page.waitForTimeout(1050);
    await method.click(); await button('Editar perfil').click();
    await page.getByLabel('Nombre',{exact:true}).fill(longName);
    await page.getByLabel('Peso de perfil (kg)').fill('75.5');
    await page.evaluate(()=>window.__homeQA.profileError=true);
    await button('Guardar cambios').click();
    await page.locator('.profile-save-error').scrollIntoViewIfNeeded(); await page.waitForTimeout(1400);
    await page.evaluate(()=>window.__homeQA.profileError=false);
    await button('Guardar cambios').click(); await button('Editar perfil').waitFor();
    await page.locator('.app-main').evaluate(el=>el.scrollTop=0);
    await page.waitForTimeout(1000); assert.deepEqual(errors,[]);
  } finally {
    await context.close();
    await video.saveAs(path.join(folder,'perfil-edicion.webm')); await video.delete();
  }
}
try {
  if (process.argv.includes('--video')) {
    await recordEdit();
  } else {
    for (const width of [375, 1440, 320, 768]) {
      for (const theme of ['light', 'dark']) await sample(width, theme);
    }
    await writeFile(path.join(folder, 'perfil-mediciones.json'), JSON.stringify({browser: browser.version(), rows}, null, 2) + '\n');
  }
} finally {
  await browser.close();
}
