import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { before, go, open, repo, start } from './browser.mjs';

const out = process.env.CALORI_QA_OUTPUT_DIR || path.join(repo, 'docs/evidence/navigation-polish', before ? 'before' : 'after');
await mkdir(out, {recursive:true});
const browser = await start();
const results = [];
const rect = el => el.evaluate(node => {
  const {x,y,width,height} = node.getBoundingClientRect();
  return {x,y,width,height};
});
const focus = (page, selector) => page.waitForFunction(sel => document.activeElement?.matches(sel), selector);
const button = (page, name) => page.getByRole('button', {name,exact:true});
const snap = (subject,name,opts={}) => subject.screenshot({path:path.join(out,name+'.jpg'),quality:88,...opts});

async function headers(page, width, theme) {
  const header = page.locator('.home-header');
  const heading = page.getByRole('heading',{level:1});
  const check = async (desktop) => {
    assert.equal(await heading.count(),1);
    assert.equal((await heading.innerText()).trim().toUpperCase(),!before && desktop ? 'INICIO' : 'CALORI');
    assert.equal(await header.locator('img').isVisible(),before || !desktop);
    assert.equal(await header.getByRole('link',{name:'Ver registros',exact:true}).count(),Number(before));
  };
  const desktop = width >= 768;
  await check(desktop);
  const bounds = await rect(header);
  const suffix = width+'-'+theme;
  const clip = {x:0,y:0,width,height:desktop ? 250 : 215};
  await snap(page,'inicio-'+suffix,{clip});
  await page.evaluate(()=>window.__homeQA.setLoading(true));
  await page.locator('.view-skeleton-home').waitFor();
  await check(desktop);
  assert.deepEqual(await rect(header),bounds);
  await page.evaluate(()=>window.__homeQA.setLoading(false));
  await page.locator('.fitness-home').waitFor();
  if (!before) {
    for (const w of [767,768,width]) {
      await page.setViewportSize({width:w,height:desktop?900:812});
      await check(w>=768);
    }
  }
  await go(page,'Coach');
  assert.equal(await heading.count(),1);
  assert.match(await heading.innerText(),/coach/i);
  const coachLogo = page.locator('.chat-heading .brand-symbol-assistant');
  assert.equal(await coachLogo.isVisible(),before || !desktop);
  await snap(page,'coach-'+suffix,{clip});
  if (!before) {
    for (const w of [767,768,width]) {
      await page.setViewportSize({width:w,height:desktop?900:812});
      assert.equal(await coachLogo.isVisible(),w<768);
      assert.equal(await page.locator('.chat-heading-title p').isVisible(),w>=768);
    }
    for (const [tab,id] of [['Coach','chat'],['Datos','charts'],['Perfil','profile']]) {
      await go(page,tab);
      assert.equal(await heading.count(),1,tab);
      const ready=await rect(heading);
      await page.evaluate(()=>window.__homeQA.setLoading(true));
      await page.locator('.view-skeleton-'+id).waitFor();
      assert.equal(await heading.count(),1,tab+' loading');
      assert.equal((await heading.innerText()).trim().toUpperCase(),tab.toUpperCase());
      const loading=await rect(heading);
      assert.deepEqual([loading.x,loading.y,loading.height],[ready.x,ready.y,ready.height],tab+' heading during loading');
      await page.evaluate(()=>window.__homeQA.setLoading(false));
      await page.locator({Coach:'.assistant-view',Datos:'.charts-view',Perfil:'.profile-view'}[tab]).waitFor();
    }
  }
  await go(page,'Inicio');
  return bounds;
}

async function weight(page,width,theme) {
  const desktop = width>=768;
  const suffix = width+'-'+theme;
  const edit = button(page,'Editar peso');
  if (!desktop) {
    await page.evaluate(()=>{
      const viewport = new EventTarget();
      Object.assign(viewport,{height:innerHeight,width:innerWidth,offsetTop:0,pageTop:0,scale:1});
      Object.defineProperty(window,'visualViewport',{configurable:true,value:viewport});
    });
  }
  await edit.click();
  const form = page.locator('.entry-weight-form');
  const dialog = page.getByRole('dialog',{name:'Editar peso',exact:true});
  const input = form.locator('input[name=weight]');
  const cancel = form.getByRole('button',{name:'Cancelar'});
  const save = form.getByRole('button',{name:'Guardar peso'});
  await page.mouse.move(0,0);
  const measures = async () => ({cancel:await rect(cancel),save:await rect(save)});
  const normal = await measures();
  await snap(dialog,'peso-'+suffix);
  if (desktop) {
    await cancel.hover();
    await snap(dialog,'peso-hover-'+suffix);
    if (!before) {
      assert.equal(normal.save.x - normal.cancel.x - normal.cancel.width,12);
      assert.equal(normal.cancel.y,normal.save.y);
      assert.ok(normal.cancel.height>=48 && normal.save.height>=48);
      const background=async el=>el.evaluate(b=>getComputedStyle(b).backgroundColor);
      const themeColors=await form.evaluate(f=>{
        const probe=document.createElement('span');
        f.appendChild(probe);
        const resolve=token=>{probe.style.backgroundColor='var('+token+')';return getComputedStyle(probe).backgroundColor;};
        const colors=[resolve('--fit-soft'),resolve('--fit-orange')];
        probe.remove();
        return colors;
      });
      assert.deepEqual([await background(cancel),await background(save)],themeColors);
      const align = await form.evaluate(f=>{
        const footer=f.querySelector('.entry-form-footer');
        return Math.abs(footer.getBoundingClientRect().right - parseFloat(getComputedStyle(footer).paddingRight) - footer.lastElementChild.getBoundingClientRect().right);
      });
      assert.ok(align<1,'right alignment');
      await cancel.focus();
      await page.keyboard.press('Tab');
      await focus(page,'.entry-weight-save');
      const style=await page.addStyleTag({content:'.entry-weight-form .entry-form-footer button {font-size:200% !important}'});
      const large=await measures();
      const nextLine=large.save.y>large.cancel.y;
      const gap=nextLine ? large.save.y-large.cancel.y-large.cancel.height : large.save.x-large.cancel.x-large.cancel.width;
      assert.equal(gap,12);
      assert.ok(await form.locator('.entry-form-footer button').evaluateAll(btns=>btns.every(b=>b.scrollHeight<=b.clientHeight+1 && b.scrollWidth<=b.clientWidth+1)));
      await style.evaluate(s=>s.remove());
    }
  } else {
    await input.focus();
    await page.evaluate(()=>{window.visualViewport.height=420;window.visualViewport.dispatchEvent(new Event('resize'));});
    await page.waitForFunction(()=>document.querySelector('.entry-bottom-sheet').style.getPropertyValue('--entry-viewport-height')==='420px');
    const keyboard = await measures();
    const field=await rect(input);
    assert.ok(keyboard.save.y+keyboard.save.height<=field.y+1 && field.y+field.height<=420);
    assert.equal(await input.evaluate(e=>e===document.activeElement),true);
    assert.match(await form.locator('.entry-form-content').evaluate(e=>getComputedStyle(e).overflowY),/auto|scroll/);
    await snap(dialog,'peso-teclado-'+suffix);
    await page.evaluate(()=>{window.visualViewport.height=innerHeight;window.visualViewport.dispatchEvent(new Event('resize'));});
  }
  await page.keyboard.press('Escape');
  await dialog.waitFor({state:'hidden'});
  await focus(page,'button[aria-label="Editar peso"]');
  return normal;
}

async function recordsAndWeight(page) {
  const all = page.getByRole('button',{name:/Ver todos los registros/});
  const visibleRows=page.locator('[data-entry-id]:visible');
  assert.equal(await visibleRows.count(),4);
  await all.click();
  assert.equal(await visibleRows.count(),5);
  await button(page,'Mostrar menos').click();
  const history = page.locator('.home-history-toggle');
  if (await history.isVisible() && await history.getAttribute('aria-expanded')==='false') await history.click();
  await page.locator('.ah-day[data-date="2026-11-09"]').click();
  await page.locator('[data-history-open]').click();
  await focus(page,'#fitness-daily-entries');
  await button(page,'Registrar peso').click();
  const input=page.locator('input[name=weight]');
  await input.fill('71,4');
  await button(page,'Cancelar').click();
  await button(page,'Seguir editando').click();
  assert.equal(await input.inputValue(),'71.4');
  await page.keyboard.press('Escape');
  await button(page,'Descartar cambios').click();
  await page.waitForFunction(()=>document.activeElement?.textContent.trim()==='Registrar peso');
  await button(page,'Registrar peso').click();
  await input.fill('71,4');
  await page.evaluate(()=>{window.__homeQA.failed=true;});
  await button(page,'Guardar peso').click();
  await page.waitForFunction(()=>window.__homeQA.writes.some(w=>w.status==='failed'));
  assert.equal(await input.inputValue(),'71.4');
  await page.evaluate(()=>{window.__homeQA.failed=false;});
  await page.locator('.entry-weight-form').evaluate(form=>{form.requestSubmit();form.requestSubmit();});
  await input.waitFor({state:'hidden'});
  assert.deepEqual(await page.evaluate(()=>{
    const q=window.__homeQA, profile=q.store.activeProfile;
    return [q.writes.filter(w=>w.status==='confirmed').length,profile.weight,profile.records['2026-11-09'].weight,profile.records[q.today].weight];
  }),[1,73,71.4,72.8]);
  await button(page,'Editar peso').click();
  await input.fill('71,6');
  await button(page,'Guardar peso').click();
  await focus(page,'button[aria-label="Editar peso"]');
  await button(page,'Agregar comida').click();
  await page.locator('#add-meal-description').fill('Comida sintética de prueba');
  await page.locator('#add-meal-calories').fill('360');
  await button(page,'Guardar comida').click();
  await button(page,'Ver registro').click();
  await focus(page,'[data-entry-id]');
  assert.deepEqual(await page.evaluate(()=>{
    const q=window.__homeQA,day=q.store.activeProfile.records['2026-11-09'];
    const meal=day.meals.find(m=>m.name==='Comida sintética de prueba');
    return [day.weight,!!meal && document.activeElement.dataset.entryId===meal.id,q.aiCalls.length];
  }),[71.6,true,0]);
}

try {
  for (const width of [1440,375]) for (const theme of ['light','dark']) {
    const {context,page,errors}=await open(browser,width,theme);
    try {
      await page.evaluate(()=>document.fonts.ready);
      const header=await headers(page,width,theme);
      const actions=await weight(page,width,theme);
      if (!before && theme==='light') await recordsAndWeight(page);
      assert.deepEqual(errors,[]);
      assert.equal(await page.evaluate(()=>window.__homeQA.externalRequests),0);
      results.push({width,theme,header,actions});
      console.log(width,theme,'OK');
    } finally { await context.close(); }
  }
  await writeFile(path.join(out,'surfaces.json'),JSON.stringify(results,null,2)+'\n');
} finally {await browser.close();}
