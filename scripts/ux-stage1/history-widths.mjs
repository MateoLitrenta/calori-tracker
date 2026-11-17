import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {evidence,heights,metrics,open,settled,start} from './browser.mjs';

const directory=path.join(evidence,'history-daily');
mkdirSync(directory,{recursive:true});
const browser=await start(),rows=[];
const {context,page,errors}=await open(browser,320,'system');
try{
  await page.locator('.home-history-toggle').click();
  const history=page.locator('[data-history-root]');
  await history.getByRole('group',{name:'Período del historial'}).getByRole('button',{name:'Semana',exact:true}).click();
  const records=await page.evaluate(()=>JSON.stringify(window.__homeQA.store.activeProfile.records));
  for(const width of Object.keys(heights).map(Number))for(const theme of ['light','dark']){
    const row={width,theme,status:'passed'};
    try{
      await page.setViewportSize({width,height:heights[width]});
      await page.emulateMedia({colorScheme:theme});await settled(page);
      await history.locator('.ah-day[aria-pressed="true"]').focus();
      await page.keyboard.press('ArrowLeft');await page.keyboard.press('ArrowRight');
      row.focus=await page.evaluate(()=>({date:document.activeElement?.dataset.date,outline:getComputedStyle(document.activeElement).outlineWidth}));
      assert.equal(row.focus.date,'2026-11-17');assert.ok(parseFloat(row.focus.outline)>=2);
      assert.equal(await page.locator('.daily-active-date').getAttribute('datetime'),'2026-11-17');
      row.touch=await history.locator('button,summary').evaluateAll(elements=>elements.filter(e=>e.checkVisibility()).map(e=>({name:(e.getAttribute('aria-label')||e.textContent).trim(),width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height})));
      assert.ok(row.touch.every(item=>item.width>=43.8&&item.height>=43.8),'History controls keep 44 px targets');
      row.geometry=await metrics(page);
      assert.equal(row.geometry.dark,theme==='dark');
      assert.equal(row.geometry.bodyWidth,width);assert.ok(row.geometry.mainScrollWidth<=row.geometry.mainWidth+1);
      assert.deepEqual(row.geometry.offenders,[]);assert.deepEqual(row.geometry.small,[]);
      assert.equal(row.geometry.ai+row.geometry.writes+row.geometry.external,0);
      assert.deepEqual(errors,[]);
      assert.equal(await page.evaluate(()=>JSON.stringify(window.__homeQA.store.activeProfile.records)),records);
      if(width===375){
        await history.locator('.ah-period-summary').evaluate(e=>e.scrollIntoView({block:'center'}));
        row.image=`normal-${width}-${theme}-history.jpg`;
        await page.screenshot({path:path.join(directory,row.image),quality:85,animations:'disabled'});
      }
    }catch(error){row.status='failed';row.error=error.stack;}
    rows.push(row);console.log(width,theme,row.status,row.error?.split('\n')[0]??'');
  }
}finally{
  await context.close();await browser.close();
  writeFileSync(path.join(directory,'normal-widths.json'),JSON.stringify(rows,null,2)+'\n');
}
assert.equal(rows.length,12);assert.ok(rows.every(row=>row.status==='passed'),JSON.stringify(rows.filter(row=>row.status==='failed')));
