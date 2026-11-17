import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import path from 'node:path';
import {evidence,go,open,period,settled,start} from './browser.mjs';
const browser=await start();
try {
 for(const width of [375,1440])for(const theme of ['light','dark'])for(const phase of (process.argv.includes('--after-only')?['after']:['before','after'])){
  const directory=path.join(evidence,phase);mkdirSync(directory,{recursive:true});
  const {page,context,errors}=await open(browser,width,theme,'main','light','http://127.0.0.1:'+(phase==='before'?'5195':'5196'));
  try{
   // Extend only height so the fixed mobile navigation cannot cover the cropped panel.
   // Viewport screenshots and geometry remain in matrix.mjs at the original sizes.
   await page.setViewportSize({width,height:3000});await settled(page);
   await go(page,'Datos');
   for(const value of ['Semana','Mes','Año']){
    await period(page,value);
    const name=value==='Semana'?'semana':value==='Mes'?'mensual':'anual';
    await page.locator('.charts-energy').screenshot({path:path.join(directory,width+'-'+theme+'-section-'+name+'.jpg'),quality:90,animations:'disabled'});
    if(value==='Mes')await page.locator('.charts-comparison').screenshot({path:path.join(directory,width+'-'+theme+'-section-comparison.jpg'),quality:90,animations:'disabled'});
   }
   assert.deepEqual(errors,[]);
  }finally{await context.close();}
 }
}finally{await browser.close();}
