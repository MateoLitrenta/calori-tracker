import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
export const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
export const evidence=path.join(repo,'docs/evidence/ux-stage1');
export const before=process.argv.includes('--before');
export const origin='http://127.0.0.1:'+(before?'5195':'5196');
export const heights={320:568,375:812,393:852,440:956,768:1024,1440:900};
const pw=process.env.PLAYWRIGHT_MODULE||path.resolve(repo,'../qa-tools/node_modules/playwright/index.mjs');
const {chromium}=await import(pathToFileURL(pw));
export const start=()=>chromium.launch({channel:process.env.QA_BROWSER_CHANNEL||'chrome',headless:true});
export async function open(browser,width,theme='light',scenario='main',system='light',url=origin){
  assert.ok(['http://127.0.0.1:5195','http://127.0.0.1:5196'].includes(url));
  const context=await browser.newContext({viewport:{width,height:heights[width]},colorScheme:system,timezoneId:'America/Buenos_Aires',locale:'es-AR',reducedMotion:'reduce'});
  const errors=[];
  await context.route('**/*',route=>{
    if(new URL(route.request().url()).origin===url)return route.continue();
    errors.push('Blocked external request');return route.abort();
  });
  const page=await context.newPage();
  page.setDefaultTimeout(30000);
  page.on('pageerror',err=>errors.push(err.message));
  page.on('console',msg=>{if(msg.type()==='error')errors.push(msg.text());});
  await page.goto(url+'/qa?controls=0&theme='+theme+'&scenario='+scenario,{waitUntil:'commit',timeout:90000});
  await page.locator('.fitness-home').waitFor({timeout:90000});
  await settled(page);
  return {page,context,errors};
}
export async function settled(page){
  await page.evaluate(async()=>{await document.fonts.ready;await new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)));});
}
export async function go(page,tab){
  await page.getByRole('navigation',{name:'Navegación principal'}).getByRole('button',{name:tab,exact:true}).click();
  await page.locator(tab==='Inicio'?'.fitness-home':'.charts-insights').waitFor();
  await settled(page);
}
export async function period(page,value){
  await page.getByRole('group',{name:'Período'}).getByRole('button',{name:value,exact:true}).click();
  await settled(page);
}
export async function metrics(page){
  return page.evaluate(()=>{
    const visible=e=>e.checkVisibility()&&e.getBoundingClientRect().width>0;
    const main=document.querySelector('.app-main'),scope=document.querySelector('.charts-view')||document.querySelector('.fitness-home');
    const local=e=>{
      for(let p=e.parentElement;p&&p!==main;p=p.parentElement){
        if(['auto','scroll'].includes(getComputedStyle(p).overflowX)&&p.scrollWidth>p.clientWidth)return true;
      }
      return false;
    };
    const offenders=[...scope.querySelectorAll('button,summary,input')].filter(visible).filter(e=>{
      const r=e.getBoundingClientRect();return (r.left<-1||r.right>innerWidth+1)&&!local(e);
    }).map(e=>(e.getAttribute('aria-label')||e.textContent).trim().slice(0,70));
    const small=[...scope.querySelectorAll('button,summary')].filter(visible).filter(e=>{
      const r=e.getBoundingClientRect();return r.width<24||r.height<24;
    }).map(e=>(e.getAttribute('aria-label')||e.textContent).trim().slice(0,70));
    const scroll=document.querySelector('.charts-plot-scroll'),range=scroll?.getBoundingClientRect();
    const buckets=[...document.querySelectorAll('.charts-bucket')].map(e=>{
      const r=e.getBoundingClientRect();
      return {name:e.getAttribute('aria-label'),label:e.querySelector('.charts-bucket-label')?.textContent,visible:!!range&&r.left>=range.left-1&&r.right<=range.right+1,width:r.width,height:r.height,energy:!!e.querySelector('.charts-bar-expenditure')};
    });
    return {width:innerWidth,bodyWidth:document.documentElement.scrollWidth,mainWidth:main.clientWidth,mainScrollWidth:main.scrollWidth,offenders,small,
      dark:document.documentElement.classList.contains('dark'),colorScheme:getComputedStyle(document.documentElement).colorScheme,
      scroll:scroll?{left:scroll.scrollLeft,width:scroll.clientWidth,total:scroll.scrollWidth}:null,buckets,
      scrollHints:[...document.querySelectorAll('.charts-scroll-hint')].filter(visible).map(e=>e.textContent.trim()),
      ai:window.__homeQA.aiCalls.length,writes:window.__homeQA.writes.length,external:window.__homeQA.externalRequests};
  });
}
