import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { mkdir, mkdtemp, readFile, rmdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { before, go, open, origin, repo, start } from './browser.mjs';

const out = process.argv.includes('--noviembre') ? path.join(repo, 'docs/evidence/datos-noviembre/despues')
  : path.join(repo, 'docs/evidence/historial-datos', before ? 'before' : 'after');
const browser = await start();
const periods = ['Semana','Mes','Año'];
const widths = [[320,568],[375,812],[768,1024],[1024,768],[1440,900],[1920,1080]];
const button = (page,name) => page.getByRole('button',{name,exact:true});
const frames = page => page.evaluate(async () => {
  await document.fonts.ready;
  await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
});
async function fixture(page, mode) {
  await page.evaluate(mode => {
    const q=window.__homeQA, records={}, today=q.today;
    const day = n => {const d=new Date(today+'T12:00:00'); d.setDate(d.getDate()-n);return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');};
    const total=mode==='sparse'?1:mode==='empty'?0:260;
    for(let n=0;n<total;n++){
      if(n%9===8) continue;
      const date=day(n), calories=mode==='extreme' && n===1?987654:1500+(n*379)%1450;
      records[date]={dateStr:date,date:date+'T12:00:00',version:'1',generation:q.store.activeProfile.recordGeneration,
        meals:n%5===3?[]:[{id:'meal-'+n,name:'Almuerzo de prueba',calories,type:'Almuerzo',time:'13:30'}],
        workouts:n%3===0?[{id:'workout-'+n,activity:'Gimnasio',duration:45,calories:240,time:'17:30',muscles:[]}]:[],
        steps:2100+(n*661)%10000,water:750,weight:null};
    }
    q.setProfile({records});
  },mode);
  await frames(page);
}
async function snap(page,name,selector) {
  await page.evaluate(selector=>{
    const main=document.querySelector('.app-main');
    main.scrollTop=0;
    if(selector)main.scrollTop+=document.querySelector(selector).getBoundingClientRect().top-main.getBoundingClientRect().top-12;
  },selector);
  await frames(page);
  await page.screenshot({path:path.join(out,'data-'+name+'.jpg'),quality:87});
}
async function photos(){
  for(const [width,height] of [[375,812],[1440,900]])for(const theme of ['light','dark']){
    const {context,page,errors}=await open(browser,375,theme,theme);
    try {
      await page.setViewportSize({width,height});
      await fixture(page,'rich');await go(page,'Datos');await snap(page,width+'-'+theme+'-semana');
      await button(page,'Mes').click();await page.locator('.charts-bucket').first().click();
      await snap(page,width+'-'+theme+'-mes','.charts-energy');
      if(theme==='light')await snap(page,width+'-'+theme+'-actividad','.charts-activity-panel');
      if(width===375 && theme==='dark'){await fixture(page,'empty');await snap(page,'375-dark-vacio');}
      assert.deepEqual(errors,[]);
    } finally {await context.close();}
    console.log('capturas',width,theme);
  }
}
const summaryRows=[];
const geometryRows=[];
const samples=new Map();

async function geometry(page) {
  return page.evaluate(()=>{
    const root=document.querySelector('.charts-insights'), main=document.querySelector('.app-main');
    const rect=el=>{const r=el.getBoundingClientRect();return {x:Math.round(r.x),width:Math.round(r.width),height:Math.round(r.height)};};
    const overflow=Math.max(0,document.documentElement.scrollWidth-innerWidth,main.scrollWidth-main.clientWidth);
    const clipped=[...root.querySelectorAll('h1,h2,h3,h4,dt,dd,.charts-activity-value,.charts-bucket-label,.charts-bucket-balance,.charts-scale span,.charts-unit,.charts-activity-months')]
      .filter(e=>e.clientWidth>0 && e.scrollWidth>e.clientWidth+1).map(e=>e.className||e.tagName);
    const targets=[...root.querySelectorAll('button:not([disabled]),summary')].filter(e=>e.getClientRects().length)
      .map(e=>({label:e.getAttribute('aria-label')||e.textContent.trim(),...rect(e)}));
    const small=targets.filter(r=>r.width<44||r.height<44).map(r=>[r.label.slice(0,35),r.width,r.height]);
    const boxes=Object.fromEntries(['charts-summary','charts-energy','charts-activity-panel'].map(c=>[c,rect(root.querySelector('.'+c))]));
    const buckets=[...root.querySelectorAll('.charts-bucket')];
    const overlaps=[];
    for(let i=1;i<buckets.length;i++)for(const cls of ['.charts-bucket-balance','.charts-bucket-label']){
      const textBox=el=>{const range=document.createRange();range.selectNodeContents(el);return range.getBoundingClientRect();};
      const a=textBox(buckets[i-1].querySelector(cls)), b=textBox(buckets[i].querySelector(cls));
      if(a.right>b.left+1 && a.bottom>b.top+1 && b.bottom>a.top+1) overlaps.push([i,cls]);
    }
    const splitAxis=[...root.querySelectorAll('.charts-scale span')].filter(el=>{
      const range=document.createRange();range.selectNodeContents(el);return range.getClientRects().length!==1;
    }).map(el=>el.textContent);
    return {overflow,clipped,small,overlaps,splitAxis,boxes};
  });
}
async function numericSample(page,period) {
  return page.evaluate(async period=>{
    const {buildChartStats}=await import('/src/utils/chartStats.ts');
    const q=window.__homeQA, data=buildChartStats(q.store.activeProfile,period,q.today);
    const values=selector=>[...document.querySelectorAll(selector)].map(e=>e.textContent.trim().match(/^[+−-]?[\d.,]+/)?.[0]??null);
    return {range:[data.start,data.end],summary:data.summary,comparison:data.comparison,streak:data.currentStreak,
      labels:[...document.querySelectorAll('.charts-bucket')].map(e=>e.getAttribute('aria-label')),
      barHeights:[...document.querySelectorAll('.charts-bar')].map(e=>[e.style.height,e.dataset.zero]),
      scale:[...document.querySelectorAll('.charts-scale span')].map(e=>e.textContent),
      balance:values('.charts-balance-value'),means:values('.charts-summary-metrics dd'),delta:values('.charts-comparison dd')};
  },period);
}
async function zoom(page) {
  // Enlarge fixed-pixel labels as well as rem-based text at the original viewport width.
  await page.evaluate(()=>{
    const elements=[...document.querySelectorAll('.charts-insights,.charts-insights *')].filter(n=>n instanceof HTMLElement);
    const sizes=elements.map(el=>parseFloat(getComputedStyle(el).fontSize));
    window.__dataText=elements.map(e=>[e,e.getAttribute('style')]);
    elements.forEach((el,i)=>el.style.setProperty('font-size',sizes[i]*2+'px','important'));
  });
  await frames(page);
}
async function restoreText(page) {
  await page.evaluate(()=>{for(const [el,style] of window.__dataText){if(style===null)el.removeAttribute('style');else el.setAttribute('style',style);}delete window.__dataText;});
}
async function matrix(){
  for(const [width,height] of widths) for(const theme of ['light','dark']){
    const {context,page,errors}=await open(browser,375,theme,theme);
    try{
      await page.setViewportSize({width,height});await go(page,'Datos');
      for(const mode of ['rich','sparse','empty','extreme']){
        await fixture(page,mode);
        for(const period of periods){
          await button(page,period).click();
          await frames(page);
          const g=await geometry(page);
          summaryRows.push({width,theme,mode,period,...g});
          if(!before){
            assert.equal(g.overflow,0,JSON.stringify({width,theme,mode,period,page:g.overflow}));
            assert.deepEqual([...g.small,...g.clipped,...g.overlaps,...g.splitAxis],[],JSON.stringify({width,theme,mode,period,g}));
          }
          if(width===375 && theme==='light'){
            const sample=await numericSample(page,period);
            assert.equal(sample.labels.length, mode==='empty'?0:({Semana:7,Mes:5,Año:12})[period]);
            const expected=n=>n===null?null:n.toLocaleString('es-AR');
            assert.deepEqual(sample.means,[sample.summary.consumed,sample.summary.expenditure].map(expected));
            samples.set(mode+'-'+period,sample);
          }
          if(mode==='extreme'){
            if(period!=='Año')await page.locator('.charts-bucket').nth(1).press('Enter');
            await zoom(page);
            const enlarged=await geometry(page);
            geometryRows.push({width,theme,period,...enlarged});
            if(!before) assert.deepEqual([enlarged.overflow,...enlarged.clipped,...enlarged.small,...enlarged.overlaps,...enlarged.splitAxis],[0],JSON.stringify({width,period,enlarged}));
            if(width===320 && theme==='light' && period==='Semana')await snap(page,'320-light-extremo-200','.charts-energy');
            await restoreText(page);
          }
        }
      }
      assert.deepEqual(errors,[]);
      assert.deepEqual(await page.evaluate(()=>[window.__homeQA.writes.length,window.__homeQA.aiCalls.length,window.__homeQA.externalRequests]),[0,0,0]);
    }finally{await context.close();}
    console.log('matriz',width,theme);
  }
  const ref=Object.fromEntries(samples);
  if(!before)assert.deepEqual(ref,JSON.parse(await readFile(path.join(out,'../before/data-values.json'),'utf8')),'parity across four fixtures and three periods');
  await writeFile(path.join(out,'data-values.json'),JSON.stringify(ref,null,2)+'\n');
  const lines = rows => '[\n'+rows.map(row=>'    '+JSON.stringify(row)).join(',\n')+'\n  ]';
  await writeFile(path.join(out,'data-geometry.json'),'{\n  "browser": '+JSON.stringify(await browser.version())+',\n  "normal": '+lines(summaryRows)+',\n  "text200": '+lines(geometryRows)+'\n}\n');
}

function contrastSamples(){
  const ctx=document.createElement('canvas').getContext('2d');
  const rgba=s=>{ctx.clearRect(0,0,1,1);ctx.fillStyle=s;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data];};
  const luminance=rgb=>rgb.slice(0,3).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0);
  const samples=[];
  for(const selector of ['.charts-balance-value','.charts-summary-metrics dt','.charts-summary-metrics dd','.charts-range','.charts-legend span','.charts-scale span','.charts-bucket-label','.charts-detail dd','.charts-activity-value','.charts-comparison dd','.charts-period button[aria-pressed=true]']){
    const el=[...document.querySelectorAll(selector)].find(e=>e.getClientRects().length);
    if(!el)continue;
    const css=getComputedStyle(el),fg=luminance(rgba(css.color));
    const layers=[];
    if(el.closest('.charts-period') && el.getAttribute('aria-pressed')==='true')
      layers.push(rgba(getComputedStyle(el.parentElement.querySelector('.segmented-control-indicator')).backgroundColor));
    for(let p=el;p;p=p.parentElement)layers.push(rgba(getComputedStyle(p).backgroundColor));
    const rgb=layers.reverse().reduce((bg,layer)=>bg.map((v,i)=>layer[i]*(layer[3]/255)+v*(1-layer[3]/255)),[255,255,255]);
    const bg=luminance(rgb),ratio=(Math.max(fg,bg)+.05)/(Math.min(fg,bg)+.05);
    const minimum=parseFloat(css.fontSize)>=(parseFloat(css.fontWeight)>=700?18.67:24)?3:4.5;
    samples.push({selector,ratio:+ratio.toFixed(2),minimum});
  }
  return samples;
}
async function interactions(){
  const evidence=[];
  for(const theme of ['dark','light']){
    const {context,page,errors}=await open(browser,375,theme,theme);
    try{
      await fixture(page,'rich');await go(page,'Datos');
      const periodButton=button(page,'Semana');await periodButton.focus();await page.keyboard.press('Tab');await page.keyboard.press('Enter');
      assert.equal(await button(page,'Mes').getAttribute('aria-pressed'),'true');
      const bucket=page.locator('.charts-bucket').nth(1);
      await bucket.focus();await page.keyboard.press('Enter');
      const detail=page.locator('#charts-bucket-detail');
      assert.equal(await detail.getAttribute('data-selected'),'true');
      const focus=await bucket.evaluate(el=>el.matches(':focus-visible')&&getComputedStyle(el).outlineStyle!=='none');
      assert.ok(focus);
      const contrast=await page.evaluate(contrastSamples);
      if(!before)assert.ok(contrast.every(c=>c.ratio>=c.minimum),JSON.stringify(contrast));
      await page.keyboard.press('Escape');assert.equal(await detail.getAttribute('data-selected'),'false');
      await bucket.hover();assert.equal(await detail.getAttribute('data-selected'), before ? 'true' : 'false');
      await bucket.click();
      await button(page,'Quitar selección del gráfico').click();assert.equal(await detail.getAttribute('data-selected'),'false');
      const motion=await page.locator('.charts-period .segmented-control-indicator').evaluate(el=>getComputedStyle(el).transitionDuration);
      assert.equal(parseFloat(motion),0);
      await page.emulateMedia({reducedMotion:'no-preference'});
      const normalMotion=await page.locator('.charts-period .segmented-control-indicator').evaluate(el=>getComputedStyle(el).transitionDuration);
      assert.ok(parseFloat(normalMotion)>0&&parseFloat(normalMotion)<=.25);
      // One old meal: the week and month are empty although the year has a real zero.
      await page.evaluate(()=>{const q=window.__homeQA, day='2026-10-11',src=q.profiles.A.records[q.today];
        q.setProfile({records:{[day]:{...src,dateStr:day,date:day+'T12:00:00',steps:0,workouts:[],meals:[{...src.meals[0],calories:0}]}}});});
      for(const period of ['Semana','Mes']){await button(page,period).click();await page.locator('.charts-empty').waitFor();}
      await page.setViewportSize({width:1440,height:900});await button(page,'Año').click();
      const buckets=page.locator('.charts-bucket');assert.equal(await buckets.count(),12);
      await page.setViewportSize({width:375,height:812});await frames(page);
      const scroll=page.locator('.charts-plot-scroll');
      const active=buckets.nth(9);
      await page.waitForFunction(()=>{const p=document.querySelector('.charts-plot-scroll').getBoundingClientRect(), b=document.querySelector('.charts-bucket[data-has-energy=true]').getBoundingClientRect();return b.left>=p.left-1 && b.right<=p.right+1;});
      await active.press('Enter');assert.match(await detail.locator('dd').first().textContent(),/^0\s*kcal/);
      const zero=await page.locator('.charts-bar[data-zero=true]').count();assert.ok(zero>=1);
      await button(page,'Ver meses anteriores').click();
      await page.waitForTimeout(360);const chosen=await scroll.evaluate(el=>el.scrollLeft);
      await page.setViewportSize({width:1440,height:900});await frames(page);
      await page.setViewportSize({width:375,height:812});await frames(page);
      const restored=await scroll.evaluate(el=>el.scrollLeft);
      assert.ok(Math.abs(chosen-restored)<2,'restore annual scroll '+[chosen,restored]);
      assert.equal(await active.getAttribute('aria-pressed'),'true');
      await page.evaluate(()=>window.__homeQA.switchAccount('B'));
      await go(page,'Datos');
      // B has habit-only records in this fixture. A closed session must never leak A's meal.
      assert.equal(await page.locator('.charts-balance-value').textContent(),'Sin datos');
      assert.deepEqual(await page.evaluate(()=>[window.__homeQA.writes.length,window.__homeQA.aiCalls.length,window.__homeQA.externalRequests]),[0,0,0]);
      assert.deepEqual(errors,[]);
      evidence.push({theme,focus,zero,annualBuckets:12,chosen,restored,normalMotion,reducedMotion:motion,contrast});
    }finally{await context.close();}
  }
  await writeFile(path.join(out,'data-interactions.json'),JSON.stringify(evidence,null,2)+'\n');
}

async function recordVideo(){
  const temp=await mkdtemp(path.join(tmpdir(),'calori-datos-'));
  const viewport={width:375,height:812};
  const context=await browser.newContext({viewport,recordVideo:{dir:temp,size:viewport},colorScheme:'light',locale:'es-AR',timezoneId:'America/Buenos_Aires'});
  const page=await context.newPage();
  const video=page.video(), errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  let startAt,endAt,closedAt;
  try{
    await page.goto(origin+'/qa?controls=0&theme=light');
    await page.locator('.fitness-home').waitFor();await fixture(page,'rich');await go(page,'Datos');
    await frames(page);startAt=performance.now();
    const pause=ms=>page.waitForTimeout(ms);
    await pause(650);await button(page,'Mes').click();await pause(800);
    const energy=page.locator('.charts-energy');
    await energy.evaluate(el=>el.scrollIntoView({block:'start',behavior:'smooth'}));await pause(800);
    const bucket=page.locator('.charts-bucket').nth(1);
    await bucket.click();await pause(1100);
    assert.equal(await bucket.getAttribute('aria-pressed'),'true');
    await page.keyboard.press('Tab');await pause(900);
    await page.keyboard.press('Escape');await pause(800);
    assert.equal(await page.locator('.charts-detail').getAttribute('data-selected'),'false');
    endAt=performance.now();
    assert.deepEqual(errors,[]);
  }finally{closedAt=performance.now();await context.close();}
  const require=createRequire(process.env.PLAYWRIGHT_MODULE||path.resolve(repo,'../qa-tools/node_modules/playwright/index.mjs'));
  const {registry}=require('playwright-core/lib/server/registry/index');
  execFileSync(registry.findExecutable('ffmpeg').executablePath(),['-hide_banner','-loglevel','error','-sseof','-'+((closedAt-startAt)/1000).toFixed(3),
    '-i',await video.path(),'-t',((endAt-startAt)/1000).toFixed(3),'-an','-c:v','libvpx','-threads','1','-b:v','850k','-crf','10','-y',path.join(out,'data-periodos.webm')]);
  await video.delete();await rmdir(temp);
}

await mkdir(out,{recursive:true});
try {
  const flags=process.argv.slice(2).filter(v=>v!=='--before');
  if(!flags.length || flags.includes('--photos'))await photos();
  if(!flags.length || flags.includes('--matrix'))await matrix();
  if(!flags.length || flags.includes('--interactions'))await interactions();
  if(!before && (!flags.length || flags.includes('--video')))await recordVideo();
} finally {await browser.close();}
