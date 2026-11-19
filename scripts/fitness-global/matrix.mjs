import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { before, evidence, go, heights, open, start, tabs } from './browser.mjs';

// The four combinations distinguish an explicit choice from a preference
// resolved by matchMedia. One isolated browser context per combination/size.
const modes = [['light','dark'],['dark','light'],['system','light'],['system','dark']];
const phase = before ? 'before' : 'after';
const dir = path.join(evidence,phase);
mkdirSync(dir,{recursive:true});
const selectedArg=process.argv.find(arg=>arg.startsWith('--tabs='));
const selected=selectedArg?selectedArg.slice(7).split(','):Object.keys(tabs);
assert.ok(selected.length>0&&selected.every(tab=>Object.hasOwn(tabs,tab)),'Unknown tab in --tabs');
const reportFile=path.join(dir,'matrix.json');
const results=selectedArg?JSON.parse(readFileSync(reportFile,'utf8')).filter(row=>!selected.includes(row.tab)):[];
const browser = await start();
async function inspect(page,tab) {
  return page.evaluate(tab=>{
    const visible = el => el.checkVisibility() && el.getBoundingClientRect().width > 0;
    const nav = Array.from(document.querySelectorAll('nav[aria-label="Navegación principal"]')).find(visible);
    const boxes = Array.from(nav.querySelectorAll('button')).map(el=>el.getBoundingClientRect());
    const main = document.querySelector('main');
    const rect = main.getBoundingClientRect();
    const scrollRegion=el=>{
      for(let parent=el.parentElement;parent&&parent!==main;parent=parent.parentElement){
        if(!['auto','scroll'].includes(getComputedStyle(parent).overflowX) || parent.scrollWidth<=parent.clientWidth) continue;
        const b=parent.getBoundingClientRect();
        if(b.left>=-1 && b.right<=innerWidth+1) return true;
      }
      return false;
    };
    const xOffenders = Array.from(main.querySelectorAll('button,input:not([type=hidden]),select,textarea,[role=dialog]'))
      .filter(visible).filter(el=>{
        const b=el.getBoundingClientRect();
        return (b.right > innerWidth+1 || b.left < -1) && !scrollRegion(el);
      }).map(el => (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0,45));
    const elements = Array.from(main.querySelectorAll('button,input,textarea,select,summary')).filter(visible);
    const small = elements.filter(el=>{
      const b=el.getBoundingClientRect();
      return b.width < 24 || b.height < 24;
    }).map(el=> (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0,45));
    const surface=main.querySelector({Inicio:'.fitness-score',Coach:'.chat-proactive',Datos:'.charts-summary',Perfil:'.profile-panel'}[tab]);
    const pixel=document.createElement('canvas').getContext('2d',{willReadFrequently:true});
    const stack=[];
    for(let node=surface;node;node=node.parentElement)stack.push(getComputedStyle(node).backgroundColor);
    pixel.fillStyle='#fff';pixel.fillRect(0,0,1,1);
    for(const color of stack.reverse()){pixel.fillStyle=color;pixel.fillRect(0,0,1,1);}
    const surfaceRgb=[...pixel.getImageData(0,0,1,1).data].slice(0,3);
    const composer=main.querySelector('textarea');
    const mobileNav=nav.closest('.app-bottom-nav');
    const historyFill=tab==='Inicio' ? main.querySelector('.history-day[data-date="2026-11-13"] .ah-day-fill') : null;
    return {dark:document.documentElement.classList.contains('dark'), preference:localStorage.getItem('calori-theme'),
      bodyWidth:document.documentElement.scrollWidth, mainWidth:Math.round(rect.width), mainScrollWidth:main.scrollWidth,
      minNavHeight:Math.round(Math.min(...boxes.map(b=>b.height))), minNavWidth:Math.round(Math.min(...boxes.map(b=>b.width))),
      composerCovered:!!(composer&&mobileNav&&composer.getBoundingClientRect().bottom>nav.getBoundingClientRect().top+1),
      xOffenders, below24:small, surfaceRgb, ...(historyFill?{historyDeficitFill:getComputedStyle(historyFill).backgroundColor}:{}),
      ai:window.__homeQA.aiCalls.length, remote:window.__homeQA.externalRequests};
  },tab);
}
async function capture(width, preference, system) {
  const {context,page,errors} = await open(browser,width,preference,system);
  try {
    for(const tab of selected) {
      await go(page,tab);
      const mode = preference==='system' ? 'system-'+system : preference;
      const measurements = await inspect(page,tab);
      const row = {width,mode,tab,...measurements};
      if(width===375 || width===1440) {
        row.image = [width,mode,tab.toLowerCase()].join('-')+'.jpg';
        await page.screenshot({path:path.join(dir,row.image), quality:85, animations:'disabled'});
      }
      results.push(row);
      assert.equal(measurements.dark,(preference==='system'?system:preference)==='dark',JSON.stringify(row));
      assert.equal(measurements.preference,preference);
      assert.equal(measurements.ai,0);
      assert.equal(measurements.remote,0);
      if(!before&&tab==='Inicio') assert.equal(measurements.historyDeficitFill,measurements.dark?'rgb(57, 104, 78)':'rgb(159, 217, 178)');
    }
    assert.deepEqual(errors,[]);
  } finally { await context.close(); }
}
try {
  for (const width of Object.keys(heights).map(Number)) {
    await Promise.all(modes.map(([pref,system])=>capture(width,pref,system)));
    console.log(phase,width,results.length);
  }
  assert.equal(results.length,96);
} finally {
  await browser.close();
  results.sort((a,b)=>a.width-b.width || a.mode.localeCompare(b.mode) || a.tab.localeCompare(b.tab));
  writeFileSync(reportFile,JSON.stringify(results,null,2)+'\n');
}
if (!before) {
  const broken=results.filter(row=>row.bodyWidth>row.width+1 || row.mainScrollWidth>row.mainWidth+1 ||
    (row.surfaceRgb.reduce((sum,c)=>sum+c,0)/3<128)!==row.dark ||
    row.composerCovered || row.xOffenders.length || row.below24.length || row.minNavWidth<24 || row.minNavHeight<24);
  assert.deepEqual(broken,[], 'Check clipped controls, target size, surface appearance and navigation overlap');
}
