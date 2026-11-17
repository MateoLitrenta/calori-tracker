import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {before,evidence,go,heights,metrics,open,period,start} from './browser.mjs';
const phase=before?'before':'after',directory=path.join(evidence,phase);
mkdirSync(directory,{recursive:true});
const results=[],browser=await start();
const shouldCapture=width=>[375,393,1440].includes(width);
async function row(page,width,theme,view){
  const value={theme,view,...await metrics(page)};
  if(shouldCapture(width)){
    value.image=[width,theme,view].join('-')+'.jpg';
    if(view!=='inicio')await page.locator('.charts-energy').scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(directory,value.image),quality:85,animations:'disabled'});
    if(view==='semana'){
      await page.locator('.charts-header').scrollIntoViewIfNeeded();
      await page.screenshot({path:path.join(directory,[width,theme,'resumen'].join('-')+'.jpg'),quality:85,animations:'disabled'});
    }
  }
  results.push(value);
  if(!before){
    assert.equal(value.bodyWidth,width);assert.ok(value.mainScrollWidth<=value.mainWidth+1);
    assert.deepEqual(value.offenders,[]);assert.deepEqual(value.small,[]);
    assert.equal(value.ai,0);assert.equal(value.writes,0);assert.equal(value.external,0);
    if(value.scroll)assert.equal(value.scrollHints.length>0,value.scroll.total>value.scroll.width+1,'Scroll affordance follows actual overflow');
    if(view==='semana'&&width>=375)assert.equal(value.buckets.filter(b=>b.visible).length,7);
    if(view==='anual')assert.ok(value.buckets.some(b=>b.visible&&b.energy),'Visible annual activity');
  }
}
try{
  for(const width of Object.keys(heights).map(Number)){
    for(const theme of ['light','dark']){
      const {page,context,errors}=await open(browser,width,theme);
      try{
        await row(page,width,theme,'inicio');
        await go(page,'Datos');
        await row(page,width,theme,'semana');
        await period(page,'Mes');await row(page,width,theme,'mensual');
        await period(page,'Año');await row(page,width,theme,'anual');
        assert.deepEqual(errors,[]);
      }finally{await context.close();}
    }
    console.log(phase,width,results.length);
  }
  assert.equal(results.length,48);
}finally{
  await browser.close();
  writeFileSync(path.join(directory,'matrix.json'),JSON.stringify(results,null,2)+'\n');
}
