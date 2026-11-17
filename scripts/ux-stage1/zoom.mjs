import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {evidence,go,heights,metrics,open,period,settled,start} from './browser.mjs';
const directory=path.join(evidence,'zoom');mkdirSync(directory,{recursive:true});
const results=[],browser=await start();
async function enlarge(page){
  return page.evaluate(()=>{
    // Text-only enlargement. Resolve each authored size before changing it so
    // nested spans do not compound the scale. Line boxes scale with the text.
    const elements=[...document.querySelectorAll('.app-main *')].filter(e=>e instanceof HTMLElement);
    const original=elements.map(e=>({e,size:parseFloat(getComputedStyle(e).fontSize),line:getComputedStyle(e).lineHeight}));
    for(const {e,size,line} of original){e.style.fontSize=size*2+'px';if(line!=='normal')e.style.lineHeight=parseFloat(line)*2+'px';}
    return {elements:elements.length,method:'Computed font-size and line-height x2 on every main descendant; no viewport transform'};
  });
}
async function inspectText(page){
  return page.evaluate(()=>{
    const main=document.querySelector('.app-main');
    return [...main.querySelectorAll('*')].filter(e=>e instanceof HTMLElement&&e.checkVisibility()&&!e.children.length&&e.textContent.trim()).filter(e=>{
      const text=document.createRange();text.selectNodeContents(e);
      const box=e.getBoundingClientRect(),rect=text.getBoundingClientRect();
      if(rect.width<=box.width+1)return false;
      return getComputedStyle(e).whiteSpace!=='nowrap';
    }).map(e=>({text:e.textContent.trim().slice(0,70),className:e.className,width:e.clientWidth,scroll:e.scrollWidth}));
  });
}
try{
 for(const width of Object.keys(heights).map(Number)){
  for(const theme of ['light','dark']){
   for(const view of ['semana','mensual','anual']){
    const {page,context,errors}=await open(browser,width,theme);
    try{
     await go(page,'Datos');if(view==='anual')await period(page,'Año');if(view==='mensual')await period(page,'Mes');
     const method=await enlarge(page);await settled(page);
     const geometry=await metrics(page),text=await inspectText(page);
     const labelSpacing=await page.locator('.charts-bucket-label').evaluateAll(labels=>labels.slice(1).map((label,i)=>label.getBoundingClientRect().left-labels[i].getBoundingClientRect().right));
     const scrollHintMatches=!!geometry.scrollHints.length===(geometry.scroll.total>geometry.scroll.width+1);
     const row={width,theme,view,...method,geometry,text,labelSpacing,scrollHintMatches};
     if([375,1440].includes(width)){
       await page.locator('.charts-energy').scrollIntoViewIfNeeded();
       row.image=[width,theme,view].join('-')+'.jpg';
       await page.screenshot({path:path.join(directory,row.image),quality:85,animations:'disabled'});
     }
     row.status=geometry.bodyWidth===width&&geometry.mainScrollWidth<=geometry.mainWidth+1&&!geometry.offenders.length&&!text.length&&labelSpacing.every(gap=>gap>=2)&&scrollHintMatches&&!errors.length?'passed':'failed';
     row.errors=errors;results.push(row);
    }finally{await context.close();}
   }
  }
  console.log('zoom',width,results.length);
 }
}finally{
 await browser.close();writeFileSync(path.join(directory,'results.json'),JSON.stringify(results,null,2)+'\n');
}
assert.ok(results.every(row=>row.status==='passed'),JSON.stringify(results.filter(row=>row.status!=='passed')));
