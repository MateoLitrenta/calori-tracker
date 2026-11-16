import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { evidence, go, open, start, tabs } from './browser.mjs';

const dir=path.join(evidence,'interactions');
mkdirSync(dir,{recursive:true});
const browser=await start();
const results=[];
const timing={timeout:6000};
async function test(name,scenario) {
  const {context,page,errors}=await open(browser,375,'light','dark');
  try {
    await scenario(page);
    assert.deepEqual(errors,[]);
    assert.equal(await page.evaluate(()=>window.__homeQA.externalRequests),0);
    results.push({name,status:'passed'});
  } catch(error) {
    results.push({name,status:'failed',message:error.message.split('\n')[0]});
    console.error(name,error.message);
  } finally {await context.close();}
}
async function dark(page,expected) {
  await page.waitForFunction(d=>document.documentElement.classList.contains('dark')===d,expected,timing);
}
async function reloadApp(page) {
  await page.reload({waitUntil:'commit',timeout:90000});
  await page.locator(tabs.Inicio).waitFor({timeout:90000});
}
const shot=(page,name)=>page.screenshot({path:path.join(dir,name+'.jpg'),quality:85,animations:'disabled'});
await test('Apariencia en vivo, formularios, diálogo y recarga',async page=>{
  await go(page,'Perfil');
  const selector=page.getByRole('group',{name:'Apariencia'});
  const choose=async(label,expected)=>{
    const button=selector.getByRole('button',{name:label,exact:true});
    await button.click();
    assert.equal(await button.getAttribute('aria-pressed'),'true');
    await dark(page,expected);
  };
  await choose('Oscuro',true);
  await choose('Claro',false);
  await choose('Sistema',true);
  await page.emulateMedia({colorScheme:'light'});
  await dark(page,false);
  await page.getByRole('button',{name:'Editar perfil'}).click();
  await page.getByLabel('Nombre',{exact:true}).fill('Borrador QA');
  await page.emulateMedia({colorScheme:'dark'});
  await dark(page,true);
  assert.equal(await page.getByLabel('Nombre',{exact:true}).inputValue(),'Borrador QA');
  await shot(page,'formulario-perfil-sistema-oscuro');
  await page.getByRole('button',{name:'Cancelar',exact:true}).click();
  const session=page.locator('main').getByRole('button',{name:/cerrar sesi[oó]n/i}).first();
  await session.click();
  const dialog=page.getByRole('dialog');
  await dialog.waitFor();
  assert.match(await page.evaluate(()=>document.activeElement.textContent),/Cancelar/i);
  await page.emulateMedia({colorScheme:'light'});
  await dark(page,false);
  await shot(page,'dialogo-perfil-sistema-claro');
  await page.keyboard.press('Escape');
  await dialog.waitFor({state:'hidden'});
  assert.equal(await session.evaluate(el=>el===document.activeElement),true);
  assert.deepEqual(await page.evaluate(()=>window.__homeQA.authEvents),[]);
  await reloadApp(page);
  await go(page,'Perfil');
  await dark(page,false);
  assert.equal(await selector.getByRole('button',{name:'Sistema'}).getAttribute('aria-pressed'),'true');
  await page.emulateMedia({colorScheme:'dark'});
  for(const tab of Object.keys(tabs)) {await go(page,tab);await dark(page,true);}
  await choose('Claro',false);
  await page.emulateMedia({colorScheme:'dark'});
  await dark(page,false);
  await reloadApp(page);
  await go(page,'Inicio');
  await dark(page,false);
});
await test('Perfil, guardado local recuperable y fallo visible',async page=>{
  await go(page,'Perfil');
  await page.getByRole('button',{name:'Editar perfil'}).click();
  await page.getByLabel('Nombre',{exact:true}).fill('Alex QA');
  await page.evaluate(()=>{window.__homeQA.profileError=true;});
  await page.getByRole('button',{name:'Guardar cambios'}).click();
  assert.equal(await page.getByLabel('Nombre',{exact:true}).inputValue(),'Alex QA');
  await page.getByText('Error al actualizar',{exact:true}).waitFor(timing);
  await page.evaluate(()=>{window.__homeQA.profileError=false;});
  await page.getByRole('button',{name:'Guardar cambios'}).click();
  await page.getByRole('heading',{name:'Alex QA',exact:true}).waitFor();
  await reloadApp(page);
  await go(page,'Perfil');
  await page.getByRole('heading',{name:'Alex QA',exact:true}).waitFor();
  await page.evaluate(()=>window.__homeQA.switchAccount('B'));
  await page.locator(tabs.Inicio).waitFor();
  await go(page,'Perfil');
  await page.getByRole('heading',{name:'Sol',exact:true}).waitFor();
});
await test('Carga, cuenta nueva, registro parcial y datos completos',async page=>{
  await page.evaluate(()=>window.__homeQA.setLoading(true));
  await page.locator('main[aria-busy=true]').waitFor();
  await shot(page,'inicio-cargando');
  await page.evaluate(()=>window.__homeQA.setLoading(false));
  await page.locator(tabs.Inicio).waitFor();
  await page.evaluate(()=>{window.__homeQA.switchAccount('B');window.__homeQA.setProfile({records:{}});});
  assert.match(await page.locator('.energy-card').innerText(),/sin datos|sin registros|sin comidas|faltan registros/i);
  await go(page,'Datos');
  await page.locator('.charts-empty').waitFor();
  await shot(page,'datos-sin-registros');
  await go(page,'Coach');
  assert.equal(await page.evaluate(()=>window.__homeQA.aiCalls.length),0);
  await shot(page,'coach-cuenta-nueva');
  await page.evaluate(()=>window.__homeQA.switchAccount('A'));
  await go(page,'Inicio');
  await page.locator('[data-day="2026-11-11"]').click();
  const energy=page.locator('.energy-card');
  assert.match(await energy.innerText(),/provisional|sin comidas|faltan comidas|sin balance/i);
  await energy.getByText('Sin comidas registradas',{exact:true}).waitFor();
  await shot(page,'inicio-dia-parcial');
  await page.locator('[data-day="2026-11-13"]').click();
  await go(page,'Datos');
  assert.equal(await page.locator('.charts-bucket').count(),7);
  assert.equal(await page.evaluate(()=>window.__homeQA.writes.length),0);
});
await browser.close();
writeFileSync(path.join(dir,'journeys.json'),JSON.stringify(results,null,2)+'\n');
console.log(results);
assert.ok(results.every(r=>r.status==='passed'));
