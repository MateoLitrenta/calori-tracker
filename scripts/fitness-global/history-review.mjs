import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rmdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { before, open, origin, repo, start } from './browser.mjs';

const themesOrder=theme=>theme==='light'?0:1;
const out = path.join(repo, 'docs/evidence/historial-datos', before ? 'before' : 'after');
const heights = {320:568,375:812,768:1024,1024:768,1440:900,1920:1080};
const root = '[data-history-root]';
const detail = '.history-day-detail';
const day = (page,number) => page.locator('.ah-day[data-date="2026-11-'+number+'"]');
const period = (page,name) => page.locator('.ah-view-switch').getByRole('button',{name,exact:true});
const frames = page=>page.evaluate(async()=>{await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});
async function ready(page,width) {
  await page.setViewportSize({width,height:heights[width]});
  assert.equal(await page.evaluate(()=>window.__homeQA.phase),before?'history-data-before':'history-data-after');
  const toggle=page.locator('.home-history-toggle');
  if(await toggle.isVisible() && await toggle.getAttribute('aria-expanded')==='false')await toggle.click();
  await page.locator(root).waitFor();await frames(page);
}
async function shot(page, section, file) {
  await page.locator(section).evaluate(el=>el.scrollIntoView({block:'start',behavior:'instant'}));
  await frames(page);
  await page.screenshot({path:path.join(out,'history-'+file+'.jpg'),quality:88});
}
async function overview(browser,width,theme) {
  const {page,context,errors}=await open(browser,375,theme,theme);
  try {
    await ready(page,width);
    await shot(page,root,width+'-'+theme+'-mes');
    if(width===375 && theme==='dark')await shot(page,detail,width+'-'+theme+'-detalle');
    assert.deepEqual(errors,[]);
  } finally {await context.close();}
}
const states = [['08','empty','empty'],['09','with-meals','deficit-high'],['10','with-meals','neutral'],['11','partial','empty'],['12','with-meals','surplus-high'],['13','with-meals','deficit-high']];
async function geometry(page) {
  return page.locator(root).evaluate(el=>{
    const box=n=>{const r=n.getBoundingClientRect();return {w:Math.round(r.width),h:Math.round(r.height)}};
    const main=document.querySelector('.app-main');
    const surface=el.querySelector('.ah-calendar-surface');
    const controls=[...el.querySelectorAll('button:not(:disabled),summary')].filter(b=>b.getClientRects().length);
    const small=controls.filter(n=>{const r=n.getBoundingClientRect();return r.width<43.99||r.height<43.99}).map(n=>n.getAttribute('aria-label')||n.textContent.trim());
    const clipped=[...el.querySelectorAll('.ah-day-number,.ah-day-balance,.ah-month-name,.ah-entry-metric,.ah-day-energy dd,.ah-open,.ah-view-switch button,.ah-day-status,.ah-period-summary p,.ah-habits dd,.ah-nav-actions button,.ah-month-coverage,.ah-month-caption')].filter(n=>{
      if(!n.getClientRects().length)return false;
      const owner=n.closest('.ah-day,.ah-month,.ah-entries li,.ah-day-energy,.ah-detail,.ah-period-summary,.ah-view-switch,.ah-navigation');
      if(!owner)return false;
      const range=document.createRange();range.selectNodeContents(n);const b=owner.getBoundingClientRect();
      return [...range.getClientRects()].some(r=>r.width>0 && (r.right>b.right+1||r.left<b.left-1));
    }).map(n=>n.className+': '+n.innerText);
    return {section:box(el),detail:box(el.querySelector('.ah-detail')),calendar:box(el.querySelector('.ah-calendar')),
      overflow:Math.max(document.documentElement.scrollWidth-innerWidth,main.scrollWidth-main.clientWidth),
      localCalendarScroll:surface?Math.max(0,surface.scrollWidth-surface.clientWidth):0,shortTargets:small,clipped};
  });
}
async function scaleText(page,enable) {
  await page.locator(root).evaluate((el,enable)=>{
    if(enable) {
      const nodes=[el,...el.querySelectorAll('*')].filter(n=>n instanceof HTMLElement);
      const sizes=nodes.map(n=>parseFloat(getComputedStyle(n).fontSize));
      window.__historyOriginal=nodes.map(n=>[n,n.getAttribute('style')]);
      nodes.forEach((n,i)=>n.style.setProperty('font-size',sizes[i]*2+'px','important'));
    } else for(const [n,old] of window.__historyOriginal){if(old===null)n.removeAttribute('style');else n.setAttribute('style',old);}
  },enable);
  await frames(page);
}
// Sample the painted background so translucent balance fills and selection are included.
async function contrast(page,locator) {
  const el=locator.first();
  const {fg,large}=await el.evaluate(n=>{const s=getComputedStyle(n);
    const ctx=document.createElement('canvas').getContext('2d');ctx.fillStyle=s.color;ctx.fillRect(0,0,1,1);
    return {fg:[...ctx.getImageData(0,0,1,1).data].slice(0,3),large:parseFloat(s.fontSize)>=(parseFloat(s.fontWeight)>=700?18.67:24)};});
  const png=await el.screenshot();
  return page.evaluate(async({png,fg,large})=>{
    const im=new Image();im.src='data:image/png;base64,'+png;await im.decode();
    const c=document.createElement('canvas');c.width=im.width;c.height=im.height;
    const ctx=c.getContext('2d');ctx.drawImage(im,0,0);
    const pixels=ctx.getImageData(0,0,c.width,c.height).data;const histogram=new Map();
    for(let i=0;i<pixels.length;i+=4){const rgb=pixels.slice(i,i+3).join(',');histogram.set(rgb,(histogram.get(rgb)||0)+1);}
    const bg=[...histogram.entries()].sort((a,b)=>b[1]-a[1])[0][0].split(',').map(Number);
    const lum=rgb=>rgb.map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0);
    const [lo,hi]=[lum(fg),lum(bg)].sort((a,b)=>a-b);
    return {ratio:+((hi+.05)/(lo+.05)).toFixed(2),minimum:large?3:4.5,fg,bg};
  },{png:png.toString('base64'),fg,large});
}
async function selected(page,number) {
  const d=day(page,number);await d.click();
  assert.equal(await d.getAttribute('aria-pressed'),'true');
  const date=await page.locator('.home-date-context time').getAttribute('datetime');
  assert.equal(date,'2026-11-13');
  const cell={date:'2026-11-'+number,state:await d.getAttribute('data-completeness'),balance:await d.getAttribute('data-balance'),
    current:await d.getAttribute('aria-current'),label:await d.getAttribute('aria-label')};
  assert.match(await page.locator(detail+' h3').first().innerText(),new RegExp('\\b'+Number(number)+'\\b'));
  cell.events=await page.locator(detail+' .ah-entries li strong').allTextContents();
  return cell;
}
async function matrix(browser,width,theme) {
  const {page,context,errors}=await open(browser,375,theme,theme);
  const result={width,theme,days:[],views:{},contrast:{}};
  try {
    await ready(page,width);
    for(const [n,state,category] of states) {
      const cell=await selected(page,n);result.days.push(cell);
      assert.equal(cell.state,state);assert.equal(cell.balance,category);
      assert.equal(cell.current,n==='13'?'date':null);
      if(!before && state==='with-meals') {
        const channels=await page.locator(detail+' .ah-day-channels dd').allTextContents();
        const [intake,spent]=channels.map(s=>Number(s.replace(/\D/g,'')));
        const expected={'09':[740,1843],'10':[1679,1679],'12':[3100,2449],'13':[1250,2281]};
        assert.deepEqual([intake,spent],expected[n],'day energy on '+n);
      }
      if(state==='partial') {
        assert.match(await page.locator(detail).innerText(),/sin comidas|falta registrar comidas/i);
        assert.doesNotMatch(await page.locator(detail).innerText(),/déficit (leve|moderado|alto)/i);
      }
      if(width===375&&theme==='light'&&n==='11')await shot(page,detail,'375-light-parcial');
    }
    const focused=day(page,'13');
    await focused.focus();await page.keyboard.press('ArrowLeft');
    assert.equal(await day(page,'12').evaluate(n=>document.activeElement===n&&n.matches(':focus-visible')),true);
    assert.equal(await day(page,'12').getAttribute('aria-pressed'),'true');
    assert.equal(await day(page,'13').getAttribute('aria-current'),'date');
    result.focus=await day(page,'12').evaluate(n=>{const s=getComputedStyle(n);return s.outlineStyle!=='none'||s.boxShadow!=='none';});
    assert.ok(result.focus);
    await page.keyboard.press('Home');assert.equal(await day(page,'08').getAttribute('aria-pressed'),'true');
    await page.keyboard.press('End');assert.equal(await day(page,'13').getAttribute('aria-pressed'),'true');
    if([375,1440].includes(width)) {
      for(const n of ['08','10','11','12','13']) {
        const r=await contrast(page,day(page,n).locator('.ah-day-number'));result.contrast[n]=r;
        if(!before)assert.ok(r.ratio>=r.minimum,'day contrast '+JSON.stringify({n,width,theme,r}));
      }
      for(const sel of ['.ah-navigation h3','.ah-detail-heading h3','.ah-day-status','.ah-open']) {
        const r=await contrast(page,page.locator(sel));result.contrast[sel]=r;
        if(!before)assert.ok(r.ratio>=r.minimum,'text contrast '+JSON.stringify({sel,width,theme,r}));
      }
    }
    for(const [view,label] of [['month','Mes'],['week','Semana'],['year','Año']]) {
      await period(page,label).click();await frames(page);
      assert.equal(await period(page,label).getAttribute('aria-pressed'),'true');
      assert.equal(await page.locator('[data-history-motion]').count(),0,'motion in reduced mode');
      if(view==='week')assert.equal(await page.locator('.ah-day').count(),7);
      if(view==='year')assert.equal(await page.locator('.ah-month:visible').count(),12);
      const normal=await geometry(page);
      if(width===375&&theme==='light'&&view==='week')await shot(page,root,'375-light-semana');
      if(width===1440&&theme==='dark'&&view==='year')await shot(page,root,'1440-dark-anual');
      await scaleText(page,true);const doubled=await geometry(page);
      if(!before && width<=375) {
        const segment=await page.locator('.ah-view-switch').evaluate(group=>{
          const selected=group.querySelector('button[aria-pressed=true]').getBoundingClientRect();
          const marker=group.querySelector('.segmented-control-indicator').getBoundingClientRect();
          const lineCounts=[...group.querySelectorAll('button')].map(b=>{
            const r=document.createRange();r.selectNodeContents(b);return r.getClientRects().length;
          });
          return {centerError:Math.abs((selected.left+selected.right-marker.left-marker.right)/2),
            leftInset:selected.left-marker.left,rightInset:marker.right-selected.right,lineCounts};
        });
        assert.ok(segment.centerError<=1 && Math.abs(segment.leftInset)<=4 && Math.abs(segment.rightInset)<=4,'indicator geometry '+JSON.stringify(segment));
        assert.deepEqual(segment.lineCounts,[1,1,1],'period words wrap '+JSON.stringify({width,theme,view,segment}));
        doubled.selector=segment;
      }
      if(width===320&&theme==='light'&&view==='month')await shot(page,root,'320-light-mes-200');
      await scaleText(page,false);result.views[view]={normal,doubled};
      for(const g of [normal,doubled]) {
        if(!before) {
          assert.equal(g.overflow,0,'page overflow '+JSON.stringify({width,theme,view,g}));
          assert.deepEqual(g.shortTargets,[],'touch targets '+JSON.stringify({width,theme,view}));
          assert.deepEqual(g.clipped,[],'clipped '+JSON.stringify({width,theme,view}));
        }
      }
    }
    await page.locator('.ah-month[data-month="2026-10"]').click();
    await page.locator('.ah-calendar-surface--month').waitFor();
    await page.locator('.ah-today').click();await selected(page,'12');
    const jump=page.locator('.ah-detail-jump');
    if(await jump.isVisible()) {
      await jump.click();assert.equal(await page.locator(detail).evaluate(n=>document.activeElement===n),true);
    }
    await page.locator('[data-history-open]').click();
    await page.waitForFunction(()=>document.activeElement?.id==='fitness-daily-entries');
    assert.equal(await page.locator('.home-date-context time').getAttribute('datetime'),'2026-11-12');
    assert.deepEqual(await page.evaluate(()=>[window.__homeQA.writes.length,window.__homeQA.aiCalls.length,window.__homeQA.externalRequests]),[0,0,0]);
    assert.deepEqual(errors,[]);
    result.exploreThenOpen=true;
    if(width===375 && theme==='light' && !before) {
      await page.evaluate(()=>window.__homeQA.switchAccount('B'));
      await ready(page,width);
      await selected(page,'12');
      assert.equal(await day(page,'12').getAttribute('data-completeness'),'empty');
      assert.equal(await page.locator(detail+' .ah-entries li').count(),0);
      await selected(page,'13');
      assert.equal(await day(page,'13').getAttribute('data-completeness'),'partial');
      assert.equal(await page.locator(detail+' .ah-entries li').count(),0);
      result.secondAccountHasOwnHistory=true;
      await page.evaluate(()=>{
        const q=window.__homeQA,p=q.store.activeProfile;
        const waterOnly={...p.records[q.today],steps:0,water:500,meals:[],workouts:[],dateStr:'2026-11-12'};
        q.setProfile({records:{...p.records,'2026-11-12':waterOnly}});
      });
      await selected(page,'12');
      assert.match(await page.locator(detail+' .ah-day-energy').innerText(),/sin datos energéticos/i);
      assert.doesNotMatch(await page.locator(detail+' .ah-day-energy').innerText(),/déficit|superávit|0 kcal/i);
      result.waterOnlyEnergyMissing=true;
    }
    console.log('Historial',before?'base':'candidato',width,theme,'OK');
    return result;
  } finally {await context.close();}
}
async function walkthrough(browser) {
  const temp=await mkdtemp(path.join(tmpdir(),'calori-historial-'));
  const viewport={width:1440,height:900};
  const context=await browser.newContext({viewport,colorScheme:'light',reducedMotion:'no-preference',
    locale:'es-AR',timezoneId:'America/Buenos_Aires',recordVideo:{dir:temp,size:viewport}});
  const errors=[];
  await context.route('**/*',r=>{if(new URL(r.request().url()).origin===origin)return r.continue();errors.push('external');return r.abort();});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  const recording=page.video();let start,finish,tail,motion;
  const hold=ms=>page.waitForTimeout(ms);
  try {
    await page.goto(origin+'/qa?controls=0&theme=light');await ready(page,1440);
    await page.locator(root).evaluate(el=>el.scrollIntoView({block:'start',behavior:'instant'}));await frames(page);
    await page.evaluate(()=>{
      window.__historyAnimations=[];
      const surface=document.querySelector('.ah-motion-surface');
      new MutationObserver(()=>{
        const name=surface.getAttribute('data-history-motion');
        for(const animation of surface.getAnimations()) {
          const duration=animation.effect.getTiming().duration;
          if(name)window.__historyAnimations.push({name,duration});
        }
      }).observe(surface,{attributes:true,attributeFilter:['data-history-motion']});
    });
    start=performance.now();await hold(650);
    await selected(page,'12');await hold(750);
    await selected(page,'11');await hold(750);
    await period(page,'Semana').click();await hold(800);
    await period(page,'Año').click();await hold(850);
    await page.locator('.ah-month[data-month="2026-11"]').click();await hold(550);
    await selected(page,'12');await hold(650);
    await page.locator('[data-history-open]').click();await page.waitForFunction(()=>document.activeElement?.id==='fitness-daily-entries');await hold(750);
    finish=performance.now();
    assert.equal(await page.locator('.home-date-context time').getAttribute('datetime'),'2026-11-12');
    motion=await page.evaluate(()=>window.__historyAnimations);
    assert.ok(motion.length>=2&&motion.every(v=>v.duration>=150&&v.duration<=250),JSON.stringify(motion));
    assert.deepEqual(errors,[]);
    assert.deepEqual(await page.evaluate(()=>[window.__homeQA.writes.length,window.__homeQA.aiCalls.length,window.__homeQA.externalRequests]),[0,0,0]);
    tail=performance.now();
  } finally {await context.close();}
  const require=createRequire(process.env.PLAYWRIGHT_MODULE || path.resolve(repo,'../qa-tools/node_modules/playwright/index.mjs'));
  const {registry}=require('playwright-core/lib/server/registry/index');
  const ffmpeg=registry.findExecutable('ffmpeg').executablePath();
  const duration=(finish-start)/1000;
  execFileSync(ffmpeg,['-hide_banner','-loglevel','error','-sseof','-'+((tail-start)/1000).toFixed(3),
    '-i',await recording.path(),'-t',duration.toFixed(3),'-an','-c:v','libvpx','-threads','1','-b:v','1700k','-crf','10','-y',path.join(out,'history-recorrido.webm')]);
  await recording.delete();await rmdir(temp);
  await writeFile(path.join(out,'history-recorrido.json'),JSON.stringify({browser:await browser.version(),viewport,duration:+duration.toFixed(2),motion,
    sequence:['Mes','Superávit','Parcial','Semana','Año','Noviembre','Superávit','Ver y editar el 12 de noviembre'],writes:0},null,2)+'\n');
}
async function main() {
  await mkdir(out,{recursive:true});const browser=await start();
  try {
    if(process.argv.includes('--video')) {await walkthrough(browser);return;}
    if(!process.argv.includes('--matrix')) {
      for(const width of [1440,375])for(const theme of ['light','dark'])await overview(browser,width,theme);
    }
    if(process.argv.includes('--overview'))return;
    const mobile=process.argv.includes('--mobile');
    const cases=mobile ? JSON.parse(await readFile(path.join(out,'history-matrix.json'),'utf8')).cases.filter(row=>row.width>375) : [];
    const widths=mobile?[320,375]:[320,375,768,1024,1440,1920];
    for(const w of widths)for(const theme of ['light','dark'])cases.push(await matrix(browser,w,theme));
    cases.sort((a,b)=>a.width-b.width||themesOrder(a.theme)-themesOrder(b.theme));
    if(!before) {
      const baseline=JSON.parse(await readFile(path.join(out,'../before/history-matrix.json'),'utf8'));
      for(const c of cases)assert.deepEqual(c.days,baseline.cases.find(b=>b.width===c.width&&b.theme===c.theme).days,'semantics '+c.width+' '+c.theme);
    }
    await writeFile(path.join(out,'history-matrix.json'),JSON.stringify({baseline:'4694914ddd5363815faf77168e3cd85bbcc69a44',browser:await browser.version(),cases},null,2)+'\n');
  } finally {await browser.close();}
}
await main();
