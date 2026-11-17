import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {evidence,go,metrics,open,period,settled,start} from './browser.mjs';
const directory=path.join(evidence,'interactions');mkdirSync(directory,{recursive:true});
const browser=await start(),results=[];
const snapshot=(page,name)=>page.screenshot({path:path.join(directory,name+'.jpg'),quality:85,animations:'disabled'});
async function scenario(name,scenario,width,run){
 const {context,page,errors}=await open(browser,width,'system',scenario);
 try{
  await run(page);
  assert.deepEqual(errors,[]);
  const m=await metrics(page);
  assert.equal(m.ai+m.writes+m.external,0);
  results.push({name,width,status:'passed',services:'synthetic',measurements:m});
 }catch(e){results.push({name,width,status:'failed',error:e.message});}
 finally{await context.close();}
}
try{
 await scenario('Annual activity, keyboard, local scroll and live System', 'main',375,async page=>{
  await go(page,'Datos');await period(page,'Año');
  let m=await metrics(page);
  assert.ok(m.buckets.some(b=>b.visible&&b.energy));
  assert.equal(m.buckets.length,12);
  await snapshot(page,'375-annual-entry-light');
  const earlier=page.getByRole('button',{name:'Ver meses anteriores'});
  await earlier.click();
  const scroll=page.locator('.charts-plot-scroll');
  const explored=await scroll.evaluate(e=>e.scrollLeft);
  const target=page.locator('.charts-bucket').filter({has:page.locator('.charts-bar-expenditure')}).first();
  await target.focus();await page.keyboard.press('Enter');
  const selected=await scroll.evaluate(e=>e.scrollLeft);
  await page.emulateMedia({colorScheme:'dark'});await settled(page);
  assert.equal(await scroll.evaluate(e=>e.scrollLeft),selected);
  assert.equal(await page.locator('html').getAttribute('class'),'dark');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.charts-detail').getAttribute('data-selected'),'false');
  assert.equal(await scroll.evaluate(e=>e.scrollLeft),selected);
  await page.evaluate(()=>window.__homeQA.notify());await settled(page);
  assert.equal(await scroll.evaluate(e=>e.scrollLeft),selected);
  await earlier.click();await earlier.click();
  await page.locator('.charts-bucket').first().focus();
  assert.equal(await scroll.evaluate(e=>e.scrollLeft),0);
  await page.locator('.charts-bucket').last().focus();await page.keyboard.press('Enter');
  assert.match(await page.locator('.charts-detail h4').textContent(),/diciembre/i);
  assert.match(await page.locator('.charts-detail').textContent(),/Sin datos|Sin comidas/);
  const focus=await page.evaluate(()=>getComputedStyle(document.activeElement).outlineWidth);
  assert.ok(parseFloat(focus)>=2);
  await snapshot(page,'375-annual-end-dark');
  assert.ok(explored>=0);
  await page.evaluate(()=>window.__homeQA.switchAccount('B'));await go(page,'Datos');await period(page,'Año');
  await page.locator('.charts-empty').waitFor();
  assert.equal(await page.locator('.charts-bucket').count(),0);
  await snapshot(page,'375-year-empty-dark');
  await page.evaluate(()=>window.__homeQA.switchAccount('A'));await go(page,'Datos');await period(page,'Año');
  assert.ok((await metrics(page)).buckets.some(b=>b.visible&&b.energy),'Returning to account A reveals its activity');
 });
 await scenario('Zero intake is distinct from missing records','zeros',393,async page=>{
  await go(page,'Datos');
  const buttons=page.locator('.charts-bucket');
  await buttons.nth(1).click();
  assert.match(await page.locator('.charts-detail dd').first().textContent(),/^0 kcal/);
  const zero=page.locator('.charts-bar[data-zero=true]');
  assert.ok(await zero.count()>0,'The zero series is explicitly visible');
  await snapshot(page,'393-zero-intake-light');
  await buttons.first().click();
  assert.match(await page.locator('.charts-detail dd').first().textContent(),/Sin comidas/);
  await snapshot(page,'393-absent-intake-light');
 });
 await scenario('Weekly seven days, comparison eligibility and exact month dates','main',393,async page=>{
  await go(page,'Datos');
  const m=await metrics(page);
  assert.equal(m.buckets.filter(b=>b.visible).length,7);
  assert.ok(m.buckets.every(b=>b.width>=44-0.2));
  const summary=page.locator('.charts-summary');
  assert.match(await summary.textContent(),/1 día.*comidas/s);
  assert.match(await page.locator('.charts-summary-note').textContent(),/distint|mism|rest/i);
  const comparison=page.locator('.charts-comparison');
  assert.equal(await comparison.count(),0,'Existing comparison needs two food days in both periods');
  await page.locator('.charts-summary').scrollIntoViewIfNeeded();await snapshot(page,'393-week-coverage-light');
  await period(page,'Mes');
  const labels=await page.locator('.charts-bucket-label').allTextContents();
  assert.ok(labels.every(label=>/\d/.test(label)&&!/^Sem /.test(label)));
  await page.locator('.charts-energy').scrollIntoViewIfNeeded();await snapshot(page,'393-month-labels-light');
  const monthComparison=await comparison.textContent();
  assert.match(monthComparison,/1.*17.*nov/s);
  assert.match(monthComparison,/1.*31.*oct/s);
  await comparison.scrollIntoViewIfNeeded();await snapshot(page,'393-month-comparison-light');
 });

 await scenario('Annual plot recreated after empty records on the same synthetic account','main',375,async page=>{
  await go(page,'Datos');await period(page,'Año');
  assert.ok((await metrics(page)).buckets.some(b=>b.visible&&b.energy));
  await page.evaluate(()=>{
    const q=window.__homeQA;q.savedForReadScenario=structuredClone(q.profiles.A.records);
    q.profiles.A={...q.profiles.A,records:{}};q.store=q.makeStore();q.notify();
  });
  await page.locator('.charts-empty').waitFor();
  await page.evaluate(()=>{
    const q=window.__homeQA;q.profiles.A={...q.profiles.A,records:q.savedForReadScenario};q.store=q.makeStore();q.notify();
  });
  await page.locator('.charts-plot-scroll').waitFor();await settled(page);
  assert.ok((await metrics(page)).buckets.some(b=>b.visible&&b.energy),'Recreated annual plot reveals first recorded activity');
 });

}finally{
 await browser.close();writeFileSync(path.join(directory,'results.json'),JSON.stringify(results,null,2)+'\n');
}
console.log(JSON.stringify(results.map(({name,status,error})=>({name,status,error}))));
assert.ok(results.every(r=>r.status==='passed'));
