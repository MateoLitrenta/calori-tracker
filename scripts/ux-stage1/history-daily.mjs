import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {evidence,metrics,open,settled,start} from './browser.mjs';

const directory=path.join(evidence,'history-daily');
mkdirSync(directory,{recursive:true});
const zoomOnly=process.argv.includes('--zoom-only');
const results=zoomOnly?JSON.parse(readFileSync(path.join(directory,'results.json'),'utf8')).filter(row=>row.status==='passed'&&!row.text200):[];
if(zoomOnly)assert.equal(results.length,13,'Keep the completed functional run, replace every zoom result');
const browser=await start();
const locale=n=>n.toLocaleString('es-AR');
const picture=async(page,name)=>{
  await page.screenshot({path:path.join(directory,name+'.jpg'),quality:85,animations:'disabled'});
  return name+'.jpg';
};
async function history(page){
  const toggle=page.locator('.home-history-toggle');
  if(await toggle.isVisible()&&await toggle.getAttribute('aria-expanded')==='false')await toggle.click();
  const section=page.locator('[data-history-root]');
  await section.waitFor({state:'visible'});return section;
}
async function raw(page){
  return page.evaluate(async()=>{
    const h=await import('/src/utils/helpers.ts');
    const {homeWeek}=await import('/src/utils/homeDateNavigation.ts');
    const {getHistoryPeriod}=await import('/src/utils/historyPresentation.ts');
    const q=window.__homeQA,p=q.store.activeProfile;
    const date=document.querySelector('.daily-active-date').dateTime,r=p.records[date];
    const dates=homeWeek(q.today);
    return {date,today:q.today,dates,daily:{consumed:h.getCaloriesIngested(r),expenditure:h.calculateDailyExpenditure(p,r),balance:h.getNetBalance(r,p),energy:h.hasEnergyData(r),meals:r?.meals.length??0},week:getHistoryPeriod(p.records,dates,p,q.today)};
  });
}
async function observeDaily(page,after){
  const values=await raw(page);
  const display=await page.evaluate(()=>({
    headline:document.querySelector('.energy-number').textContent,
    metrics:[...document.querySelectorAll('.fitness-channel dd:first-of-type')].map(e=>e.textContent.trim()),
  }));
  assert.equal(display.metrics[1],values.daily.energy?locale(values.daily.expenditure)+' kcal':'—');
  if(values.daily.meals){
    assert.equal(display.metrics[0],locale(values.daily.consumed)+' kcal');
    assert.equal(display.headline,(values.daily.balance>0?'+':'')+locale(values.daily.balance)+' kcal');
    if(after)assert.match(await page.locator('.energy-qualifier').textContent(),/día puede estar incompleto/);
  }else if(after){
    assert.equal(display.headline,values.daily.energy?'Sin comidas registradas':'Sin datos de energía');
    assert.doesNotMatch(await page.locator('.fitness-readout').textContent(),/kcal|déficit/i);
  }
  if(after)assert.equal(await page.locator('.fitness-scale-note').textContent(),'Comparación en kcal · misma escala');
  return {values,metrics:display.metrics};
}
async function observeWeek(page,after){
  const section=await history(page);
  await section.getByRole('group',{name:'Período del historial'}).getByRole('button',{name:'Semana',exact:true}).click();
  const values=await raw(page),summary=section.locator('.ah-period-summary');
  const dates=await section.locator('.ah-day').evaluateAll(els=>els.map(e=>e.dataset.date));
  assert.deepEqual(dates,values.dates);
  const displayed=await summary.locator('.ah-balance-reading b').textContent();
  assert.equal(displayed,values.week.summary.averageBalance===null?'Sin datos energéticos':(values.week.summary.averageBalance>0?'+':'')+locale(values.week.summary.averageBalance)+' kcal/día');
  if(after){
    assert.equal(await section.locator('.ah-period-boundary').textContent(),'Lunes a domingo');
    assert.ok((await summary.textContent()).includes(`${values.week.foodDays}/${values.week.elapsedDays} ${values.week.elapsedDays===1?'día':'días'} con comidas · Base: ${values.week.summary.days} ${values.week.summary.days===1?'día':'días'} con datos energéticos`));
    const basis=await summary.locator('.ah-average-basis').textContent();
    if(values.week.provisional)assert.match(basis,/Historial incluye .*sin comidas.*Datos usa sólo días con comidas/);
    else if(values.week.summary.days)assert.match(basis,/Pueden faltar otras comidas/);
    else assert.match(basis,/Todavía no hay días con datos energéticos/);
  }
  return {dates,week:values.week,displayed};
}
async function scenario(name,width,theme,run,source='http://127.0.0.1:5196'){
  const {context,page,errors}=await open(browser,width,theme,name,'light',source);
  const row={scenario:name,width,theme,source,status:'passed',recordedAt:new Date().toISOString()};
  try{
    const initial=await page.evaluate(()=>JSON.stringify(window.__homeQA.store.activeProfile.records));
    Object.assign(row,await run(page));
    assert.equal(await page.evaluate(()=>JSON.stringify(window.__homeQA.store.activeProfile.records)),initial,'Read-only interactions preserve every synthetic record');
    row.geometry=await metrics(page);row.errors=errors;
    assert.equal(row.geometry.ai+row.geometry.writes+row.geometry.external,0);
    assert.deepEqual(errors,[]);
    assert.equal(row.geometry.bodyWidth,width);
    assert.ok(row.geometry.mainScrollWidth<=row.geometry.mainWidth+1);
    assert.deepEqual(row.geometry.offenders,[]);
  }catch(e){row.status='failed';row.error=e.stack;}
  finally{await context.close();results.push(row);console.log(name,width,theme,row.status,row.error?.split('\n')[0]??'');}
  return row;
}
async function keyboard(page){
  const today=await page.locator('.daily-active-date').getAttribute('datetime');
  const strip=page.locator('.home-week-days');
  await strip.locator('[aria-pressed="true"]').focus();
  await page.keyboard.press('ArrowLeft');
  assert.equal(await page.locator('.daily-active-date').getAttribute('datetime'),today);
  await page.keyboard.press('Home');
  await page.keyboard.press('End');
  assert.equal(await page.locator('.daily-active-date').getAttribute('datetime'),today);
  await page.getByRole('button',{name:'Abrir calendario mensual'}).click();
  const dialog=page.getByRole('dialog');await dialog.waitFor();
  await page.keyboard.press('ArrowLeft');await page.keyboard.press('PageUp');
  assert.equal(await page.locator('.daily-active-date').getAttribute('datetime'),today);
  await page.keyboard.press('Escape');
  assert.equal(await dialog.count(),0);
  assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('aria-label')),'Abrir calendario mensual');
  const section=await history(page);
  await section.locator('.ah-day[aria-pressed="true"]').focus();
  await page.keyboard.press('ArrowLeft');
  const focus=await page.evaluate(()=>({day:document.activeElement?.dataset.date,outline:getComputedStyle(document.activeElement).outlineWidth}));
  assert.ok(parseFloat(focus.outline)>=2,'Visible keyboard focus');
  assert.equal(await page.locator('.daily-active-date').getAttribute('datetime'),today);
  await page.keyboard.press('Home');
  assert.equal(await page.evaluate(()=>document.activeElement?.dataset.date),'2026-11-15');
  await page.keyboard.press('End');
  assert.equal(await page.evaluate(()=>document.activeElement?.dataset.date),today,'Future dates clamp to today');
  await page.keyboard.press('PageUp');
  assert.equal(await page.evaluate(()=>document.activeElement?.dataset.date),'2026-10-17');
  assert.equal(await page.locator('.daily-active-date').getAttribute('datetime'),today);
  return {keys:['ArrowLeft','Home','End','PageUp','Escape'],historyExplorationKeepsWriter:true,focus};
}
async function enlarge(page){
  return page.evaluate(()=>{
    const elements=[...document.querySelectorAll('.app-main *')].filter(e=>e instanceof HTMLElement);
    const original=elements.map(e=>({e,size:parseFloat(getComputedStyle(e).fontSize),line:getComputedStyle(e).lineHeight}));
    for(const {e,size,line} of original){e.style.fontSize=size*2+'px';if(line!=='normal')e.style.lineHeight=parseFloat(line)*2+'px';}
    return {method:'Computed font-size and line-height x2 once per main descendant; viewport, transform and page zoom unchanged',elements:elements.length};
  });
}
async function normalCalendar(page){
  return page.evaluate(()=>[...document.querySelectorAll('.home-week-days button,.ah-day')].map(e=>({day:e.dataset.date??e.dataset.day,width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height})));
}
async function textGeometry(page){
  return page.evaluate(()=>{
    const scope=document.querySelector('.fitness-home');
    const local=e=>{for(let p=e.parentElement;p&&p!==scope;p=p.parentElement)if(['auto','scroll'].includes(getComputedStyle(p).overflowX)&&p.scrollWidth>p.clientWidth)return true;return false;};
    const visuallyHidden=e=>{for(let p=e;p&&p!==scope;p=p.parentElement){const s=getComputedStyle(p);if(p.classList.contains('sr-only')||s.clipPath==='inset(50%)'||s.clip==='rect(0px, 0px, 0px, 0px)')return true;}return false;};
    const leaves=[...scope.querySelectorAll('*')].filter(e=>e instanceof HTMLElement&&e.checkVisibility()&&!e.children.length&&e.textContent.trim()&&!visuallyHidden(e));
    const overflow=leaves.flatMap(e=>{
      const range=document.createRange();range.selectNodeContents(e);const r=range.getBoundingClientRect(),box=e.getBoundingClientRect();
      return r.width>box.width+1||(!local(e)&&(r.left<-1||r.right>innerWidth+1))?[{text:e.textContent.trim().slice(0,70),className:e.className,textWidth:r.width,boxWidth:box.width,inScope:!!e.closest('.fitness-score,.home-date-nav,[data-history-root]')}]:[];
    });
    const overlapping=[];
    for(const selector of ['.fitness-comparison','.home-date-heading','.ah-header','.ah-navigation','.ah-view-switch','.ah-period-note','.ah-habits']){
      for(const row of scope.querySelectorAll(selector)){
        const els=[...row.children].filter(e=>e.checkVisibility());
        for(let i=0;i<els.length;i++)for(let j=i+1;j<els.length;j++){
          const a=els[i].getBoundingClientRect(),b=els[j].getBoundingClientRect();
          if(Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1)overlapping.push({selector,a:els[i].textContent.trim().slice(0,50),b:els[j].textContent.trim().slice(0,50)});
        }
      }
    }
    const calendarText=[];
    for(const button of scope.querySelectorAll('.ah-day,.home-week-days button')){
      const box=button.getBoundingClientRect();
      for(const text of button.querySelectorAll('.ah-day-number,.ah-day-balance,:scope > span,:scope > strong')){
        if(!text.checkVisibility()||!text.textContent.trim())continue;
        const range=document.createRange();range.selectNodeContents(text);const r=range.getBoundingClientRect();
        if(r.left<box.left+1||r.right>box.right-1)calendarText.push({day:button.dataset.date??button.dataset.day,text:text.textContent,width:r.width,cellWidth:box.width});
      }
    }
    return {overflow,overlapping,calendarText};
  });
}
try{
 if(!zoomOnly){
  for(const name of ['main','zeros','empty','yearBoundary']){
    const baseline=await scenario(name,375,'light',async page=>({daily:await observeDaily(page,false),history:await observeWeek(page,false)}),'http://127.0.0.1:5195');
    for(const theme of ['light','dark'])await scenario(name,375,theme,async page=>{
      const daily=await observeDaily(page,true);
      const shots=[await picture(page,`${name}-375-${theme}-daily`)];
      const h=await observeWeek(page,true);
      assert.deepEqual(daily,baseline.daily,'Daily arithmetic and displayed values match the base');
      assert.deepEqual(h,baseline.history,'Weekly grouping, averages, coverage and values match the base');
      await page.locator('.ah-period-summary').evaluate(e=>e.scrollIntoView({block:'center'}));shots.push(await picture(page,`${name}-375-${theme}-history`));
      return {daily,history:h,parity:'exact',images:shots};
    });
  }
  await scenario('main',375,'system',async page=>{
    await observeWeek(page,true);const keys=await keyboard(page);
    await page.emulateMedia({colorScheme:'dark'});await settled(page);assert.equal((await metrics(page)).dark,true);
    await page.emulateMedia({colorScheme:'light'});await settled(page);assert.equal((await metrics(page)).dark,false);
    await page.locator('.home-week-days [data-day="2026-11-16"]').click();
    await observeDaily(page,true);
    const details=page.locator('.fitness-breakdown');assert.equal(await details.getAttribute('open'),null);
    assert.doesNotMatch(await page.locator('.fitness-readout').textContent(),/kcal|déficit/i);
    await details.locator('summary').click();
    assert.match(await details.textContent(),/Saldo calculado con la ingesta registrada: -1\.783 kcal/);
    await details.scrollIntoViewIfNeeded();const shot=await picture(page,'main-375-partial-disclosure');
    return {keyboard:keys,systemChanges:['dark','light'],partialBalance:'-1.783 kcal appears in user-opened breakdown only',images:[shot]};
  });
 }
  for(const width of [320,375,1440])for(const theme of ['light','dark']){
    const baseline=await scenario('main',width,theme,async page=>{
      await observeWeek(page,false);const normal=await normalCalendar(page);const method=await enlarge(page);await settled(page);
      const text=await textGeometry(page);
      await page.locator('.daily-habits').evaluate(e=>e.scrollIntoView({block:'center'}));
      const images=[await picture(page,`${width}-${theme}-text200-before-habits`)];
      if(width<400&&theme==='light'){
        await page.locator('.ah-calendar-surface').evaluate(e=>e.scrollIntoView({block:'center'}));
        images.push(await picture(page,`${width}-${theme}-text200-before-calendar`));
      }
      return {text200:method,normalCalendar:normal,textGeometry:text,images,inheritedIssues:text.overflow.filter(item=>!item.inScope)};
    },'http://127.0.0.1:5195');
    await scenario('main',width,theme,async page=>{
    await observeWeek(page,true);
    const normal=await normalCalendar(page);assert.deepEqual(normal,baseline.normalCalendar,'Normal calendar cell dimensions and dates stay unchanged');
    const method=await enlarge(page);await settled(page);
    const geometry=await textGeometry(page);
    await page.locator('.fitness-score').scrollIntoViewIfNeeded();const images=[await picture(page,`${width}-${theme}-text200-daily`)];
    await page.locator('.ah-period-summary').evaluate(e=>e.scrollIntoView({block:'center'}));images.push(await picture(page,`${width}-${theme}-text200-history`));
    await page.locator('.ah-calendar-surface').evaluate(e=>e.scrollIntoView({block:'center'}));images.push(await picture(page,`${width}-${theme}-text200-calendar`));
    await page.locator('.home-date-nav').evaluate(e=>e.scrollIntoView({block:'start'}));images.push(await picture(page,`${width}-${theme}-text200-week-strip`));
    await page.locator('.daily-habits').evaluate(e=>e.scrollIntoView({block:'center'}));images.push(await picture(page,`${width}-${theme}-text200-after-habits`));
    assert.deepEqual(geometry.overflow.filter(item=>item.inScope),[],'In-scope text must remain within its layout or an explicit local scroller');
    assert.deepEqual(geometry.overflow.filter(item=>!item.inScope),baseline.inheritedIssues,'Out-of-scope issues must match the baseline exactly');
    assert.deepEqual(geometry.overlapping,[],'Independent siblings must not overlap');
    assert.deepEqual(geometry.calendarText,[],'Calendar text must remain inside its own cell even in a local scroller');
    return {text200:method,normalCalendar:normal,textGeometry:geometry,images,inheritedIssues:geometry.overflow.filter(item=>!item.inScope)};
  });
  }
}finally{
  await browser.close();writeFileSync(path.join(directory,'results.json'),JSON.stringify(results,null,2)+'\n');
}
assert.ok(results.every(row=>row.status==='passed'),JSON.stringify(results.filter(row=>row.status!=='passed').map(({scenario,width,theme,error})=>({scenario,width,theme,error}))));
