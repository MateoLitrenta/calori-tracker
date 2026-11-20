import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rmdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { before, go, open, origin, repo, start } from './browser.mjs';

const root = path.join(repo, 'docs/evidence/home-composition/habitos');
const phase = before ? 'before' : 'after';
const out = path.join(root, phase);
const sizes = [[320,568],[375,812],[1280,900],[1440,900]];
const themes = ['light','dark'];
const fixtures = ['cero','uno','varios'];
const block = '.daily-habits-block';
const saved = '✓ Guardado';
const btn = (p,name) => p.getByRole('button',{name,exact:true});
const signal = p => p.locator(block+' .daily-habits-heading [role=status]');
const frame = p => p.evaluate(async () => {
  await document.fonts.ready;
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
});
const dimensions = [];
const stress = [];
const skeletons = [];
const browser = await start();
await mkdir(out,{recursive:true});

async function fixture(page, state, long = false) {
  await page.evaluate(({state,long}) => {
    const q = window.__homeQA;
    q.habitInitial ??= structuredClone(q.profiles.A.records[q.today]);
    const record = structuredClone(q.habitInitial);
    if (state === 'cero') Object.assign(record, {meals:[],workouts:[],water:0,steps:0,weight:null});
    if (state === 'uno') Object.assign(record, {meals:record.meals.slice(0,1),workouts:[],weight:null});
    if (long) Object.assign(record, {water:1234567,steps:12345678,weight:112.4});
    q.setProfile({records:{...q.profiles.A.records,[q.today]:record}});
  },{state,long});
  await frame(page);
}

async function geometry(page) {
  return page.evaluate(() => {
    const section = document.querySelector('.daily-habits-block');
    const list = section.querySelector('.daily-habits');
    const rect = node => {
      const {x,y,width:w,height:h} = node.getBoundingClientRect();
      return {x,y,w,h};
    };
    const cards = [...list.querySelectorAll('.habit-card')];
    return {
      band:rect(section), records:rect(document.querySelector('.daily-logs')),
      visibleEntries:[...document.querySelectorAll('.daily-record-open')].filter(el=>el.getClientRects().length).length,
      heading:rect(section.querySelector('.daily-habits-heading')),
      cards:cards.map(card => ({
        rect:rect(card), label:card.querySelector('.habit-label').textContent,
        text:card.querySelector('.habit-metric').innerText.replace(/\s+/g,' ').trim(),
        value:rect(card.querySelector('.habit-metric')), action:rect(card.querySelector('.habit-controls,.habit-edit')),
        buttons:[...card.querySelectorAll('button,input')].map(button => ({
          label:button.getAttribute('aria-label') || button.textContent, ...rect(button)
        }))
      })),
      overflow:[...list.querySelectorAll('.habit-card,.habit-header,.habit-metric,.habit-value,.habit-controls,.habit-controls button,.habit-edit')]
        .filter(node => node.scrollWidth > node.clientWidth+1).map(node => node.className),
      pageOverflow:Math.max(0,document.documentElement.scrollWidth-innerWidth,
        document.querySelector('.app-main').scrollWidth-document.querySelector('.app-main').clientWidth)
    };
  });
}

function checkGeometry(g) {
  assert.equal(g.pageOverflow,0,'document overflow');
  assert.deepEqual(g.overflow,[],'control overflow');
  for (const card of g.cards) {
    for (const control of card.buttons) {
      assert.ok(control.w>=44 && control.h>=44,'small target '+JSON.stringify(control));
      assert.ok(control.x>=card.rect.x-1 && control.x+control.w<=card.rect.x+card.rect.w+1,'control escapes card '+control.label);
    }
    if (card.buttons.length>=3) {
      const [minus,plus] = card.buttons.slice(-2);
      assert.ok(Math.abs(minus.y-plus.y)<1 && plus.x-(minus.x+minus.w)>=3,'separated increment pair '+card.label);
    }
  }
}

function compactResult(g) {
  const gaps=g.cards.slice(0,2).map(card=>{
    const [minus,plus]=card.buttons.slice(-2);
    return Math.abs(minus.y-plus.y)<1 ? Math.floor(plus.x-minus.x-minus.w) : null;
  });
  return {
    height:Math.round(g.band.h), bandWidth:Math.round(g.band.w),
    columns:new Set(g.cards.map(c => Math.round(c.rect.x))).size,
    rangeOfActionY:Math.round(Math.max(...g.cards.map(c=>c.action.y))-Math.min(...g.cards.map(c=>c.action.y))),
    smallestTarget:Math.floor(Math.min(...g.cards.flatMap(c=>c.buttons.map(b=>Math.min(b.h,b.w))))),
    minPairGap:gaps.includes(null)?null:Math.min(...gaps),
    recordsShown:g.visibleEntries, horizontalOverflow:g.pageOverflow, clipped:g.overflow
  };
}

async function place(page,mobile) {
  await page.evaluate(mobile=>{
    const scroller=document.querySelector('.app-main');
    scroller.scrollTop=0;
    if(mobile) scroller.scrollTop+=document.querySelector('.daily-habits-block').getBoundingClientRect().top-135;
  },mobile);
  await frame(page);
}

async function screenshot(page,name) {
  await place(page,page.viewportSize().width<768);
  await page.screenshot({path:path.join(out,name+'.jpg'),quality:88});
}

async function doubled(page) {
  await page.evaluate(()=>{
    const elements=[...document.querySelectorAll('.daily-habits-block,.daily-habits-block *')].filter(n=>n instanceof HTMLElement);
    const sizes=elements.map(el=>parseFloat(getComputedStyle(el).fontSize));
    elements.forEach((el,i)=>el.style.setProperty('font-size',2*sizes[i]+'px','important'));
  });
  await frame(page);
}

// Measure the rendered digits with the input's actual font. The computed font
// shorthand can be empty when tabular numerals are enabled.
function measureDigits(el) {
  const css=getComputedStyle(el), sample=document.createElement('span');
  for (const key of ['fontFamily','fontSize','fontWeight','fontStyle','fontVariantNumeric','letterSpacing'])
    sample.style[key]=css[key];
  Object.assign(sample.style,{position:'absolute',visibility:'hidden',whiteSpace:'pre'});
  sample.textContent=el.value;
  document.body.append(sample);
  const textWidth=Math.ceil(sample.getBoundingClientRect().width);
  sample.remove();
  // Reserve room for the native numeric stepper even when it is hidden until hover.
  const stepperAllowance=16;
  return {characters:el.value.length,fontSize:parseFloat(css.fontSize),textWidth,stepperAllowance,
    available:Math.floor(el.clientWidth-parseFloat(css.paddingLeft)-parseFloat(css.paddingRight)-stepperAllowance)};
}

async function layout(width,height,theme) {
  const {page,context,errors} = await open(browser,375,theme,theme);
  try {
    assert.equal(await page.evaluate(()=>window.__homeQA.phase),'compact-habits-'+phase);
    await page.setViewportSize({width,height});
    for (const state of fixtures) {
      await fixture(page,state);
      const g=await geometry(page), result=compactResult(g);
      assert.equal(result.recordsShown, {cero:0,uno:1,varios:4}[state]);
      assert.equal(await btn(page,state==='varios'?'Editar peso':'Registrar peso').count(),1);
      const win=width>=1280;
      if(win) assert.ok(g.records.x>g.band.x+g.band.w-1);
      else assert.ok(g.records.y+g.records.h<=g.band.y+1);
      if (!before) {
        checkGeometry(g);
        if (width>=375) {
          assert.equal(result.columns,3,'columns at '+width+' '+state);
          assert.ok(result.rangeOfActionY<=1,'action alignment');
        }
      }
      dimensions.push({width,theme,state,...result});
      if ((width===375 && theme==='dark' && state==='varios') ||
          (width===320 && theme==='light' && state==='cero') ||
          (width===1280 && theme==='light' && state==='varios') ||
          (width===1440 && theme==='dark' && state==='uno'))
        await screenshot(page,width+'-'+theme+'-'+state);
    }

    await page.evaluate(()=>window.__homeQA.setLoading(true));
    const loading=page.locator('.home-placeholder-habits');
    await loading.waitFor();
    const skeleton=await loading.evaluate(el=>({height:el.getBoundingClientRect().height,
      columns:new Set([...el.querySelectorAll('.placeholder-habit')].map(n=>Math.round(n.getBoundingClientRect().x))).size}));
    if(!before) assert.equal(skeleton.columns,dimensions.at(-1).columns,'skeleton columns');
    skeletons.push({width,theme,...skeleton});
    await page.evaluate(()=>window.__homeQA.setLoading(false));
    await page.locator(block).waitFor();await frame(page);
    await fixture(page,'varios',true);
    const normalEditorFont={};
    for (const zoom of [1,2]) {
      if(zoom===2) await doubled(page);
      const g=await geometry(page);
      if(!before) checkGeometry(g);
      const result={width,theme,text:100*zoom,longValues:compactResult(g),edits:[]};
      if(width===375 && theme==='light' && zoom===2) await screenshot(page,'375-light-largos-200');
      for (const [name,input,number] of [['Editar cantidad de agua','Cantidad de agua (ml)','1234567'],['Editar total de pasos','Total de pasos','12345678']]) {
        await btn(page,name).click();
        const field=page.getByRole('spinbutton',{name:input});
        if(zoom===1) normalEditorFont[name]=await field.evaluate(el=>parseFloat(getComputedStyle(el).fontSize));
        else await field.evaluate((el,size)=>el.style.setProperty('font-size',size+'px','important'),2*normalEditorFont[name]);
        assert.equal(await field.inputValue(),number);
        assert.ok(await field.evaluate(el=>el===document.activeElement));
        const editor=await geometry(page);
        if(!before) checkGeometry(editor);
        const fit=await field.evaluate(measureDigits);
        if(!before) assert.ok(fit.available>=fit.textWidth,'input value clipped '+width+' '+zoom+' '+JSON.stringify(fit));
        result.edits.push({input,...compactResult(editor),fit});
        await field.press('Enter');
      }
      stress.push(result);
    }
    assert.deepEqual(errors,[]);
    assert.deepEqual(await page.evaluate(()=>[window.__homeQA.aiCalls.length,window.__homeQA.externalRequests]),[0,0]);
  } finally { await context.close(); }
  console.log(phase,width,theme,'OK');
}

async function observeFeedback(page) {
  await page.evaluate(()=>{
    const section=document.querySelector('.daily-habits-block');
    window.__habitEvents=[];
    window.__habitAcks=[];
    const q=window.__homeQA, seen=new Set();
    q.listeners.add(()=>{
      for (const write of q.writes) if(write.status==='confirmed' && !seen.has(write)) {
        seen.add(write);window.__habitAcks.push(performance.now());
      }
    });
    const sample=()=>{
      const at=Math.round(performance.now());
      const status=section.querySelector('.daily-habits-heading [role=status]');
      const text=status?.textContent.trim()||'';
      if(window.__habitEvents.at(-1)?.text===text) return;
      const box=s=>document.querySelector(s).getBoundingClientRect();
      const card=box('.daily-habits'), heading=box('.daily-habits-heading'), body=box('.daily-habits-block');
      window.__habitEvents.push({text,at,height:body.height,cardY:card.y-heading.y});
    };
    sample();
    new MutationObserver(sample).observe(section,{childList:true,subtree:true,characterData:true});
  });
}
const hold=page=>page.evaluate(()=>{window.__homeQA.habitWriteGate=new Promise(resolve=>{window.__releaseWrite=resolve;});});
const release=page=>page.evaluate(()=>{window.__releaseWrite();window.__homeQA.habitWriteGate=null;});
const hasText=(locator,text)=>locator.filter({hasText:text}).waitFor();
const showsSaved=page=>hasText(signal(page),/Guardado/);
const done=page=>page.waitForFunction(()=>document.querySelector('.daily-habits-heading [role=status]')?.textContent==='');
const since=async (page,selector,time)=>{
  await page.waitForFunction(({selector,time})=>{
    const point=window.__habitEvents.filter(e=>e.text===selector).at(-1);
    return point && performance.now()-point.at >= time;
  },{selector,time});
};
async function captureJourney() {
  const temp=await mkdtemp(path.join(tmpdir(),'calori-habits-'));
  const options={viewport:{width:375,height:812},colorScheme:'dark',reducedMotion:'reduce',locale:'es-AR',timezoneId:'America/Buenos_Aires'};
  const context=await browser.newContext({...options,recordVideo:{dir:temp,size:options.viewport}});
  const errors=[];
  await context.route('**/*',route=>{
    if(new URL(route.request().url()).origin===origin) return route.continue();
    errors.push(route.request().url());return route.abort();
  });
  const page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));
  page.setDefaultTimeout(10000);
  const video=page.video();
  let begin,end,finish,result;
  try {
    await page.goto(origin+'/qa?controls=0&theme=dark');
    await page.locator(block).waitFor();
    await fixture(page,'varios');
    await place(page,true);
    await observeFeedback(page);
    const plus=btn(page,'Sumar 250 ml de agua');
    const steps=btn(page,'Sumar 500 pasos');
    const read=()=>page.evaluate(()=>window.__homeQA.store.activeProfile.records[window.__homeQA.today]);
    begin=performance.now();
    await page.waitForTimeout(500);
    await hold(page);await plus.click();
    await hasText(signal(page),'Guardando');
    await page.waitForTimeout(600);
    assert.equal((await read()).water,1750,'pending write');
    await release(page);await showsSaved(page);
    assert.equal((await read()).water,2000);
    await done(page);
    const events=await page.evaluate(()=>window.__habitEvents);
    const confirmed=events.find(e=>e.text===saved);
    assert.ok(confirmed,JSON.stringify(events));
    const duration=events.at(-1).at-confirmed.at;
    const ack=await page.evaluate(()=>window.__habitAcks[0]);
    const elapsed=Math.round(events.at(-1).at-ack);
    assert.ok(elapsed>=2980 && elapsed<=3600,'expiry after canonical receipt '+elapsed+' ms; DOM '+JSON.stringify(events));
    assert.equal(new Set(events.map(e=>e.height)).size,1,'band height changes during success');
    assert.equal(new Set(events.map(e=>e.cardY)).size,1,'controls move during success');
    assert.ok(await plus.evaluate(el=>el===document.activeElement),'announcement moved focus');
    await page.waitForTimeout(650);
    end=performance.now();

    // The first deadline passes while the second write is awaiting its receipt.
    await steps.click();await showsSaved(page);
    await hold(page);await plus.click();await hasText(signal(page),'Guardando');
    await since(page,saved,3150);
    assert.match(await signal(page).innerText(),/Guardando/);
    await release(page);await showsSaved(page);
    assert.equal((await read()).water,2250);
    // A newer success must keep its own full presentation interval.
    await since(page,saved,950);
    await steps.click();await showsSaved(page);
    await since(page,saved,2200);
    assert.match(await signal(page).innerText(),/Guardado/);
    await done(page);

    await plus.click();await showsSaved(page);
    await page.evaluate(()=>{window.__homeQA.failed=true;});
    await steps.click();
    const alert=page.locator(block+' [role=alert]');
    await hasText(alert,/borrador/i);
    await since(page,saved,3150);
    assert.ok(await btn(page,'Comprobar y reintentar').isVisible());
    assert.equal((await read()).steps,7300,'failed optimistic edit reached canonical record');
    await page.evaluate(()=>{window.__homeQA.failed=false;});
    await btn(page,'Comprobar y reintentar').click();await showsSaved(page);
    assert.equal((await read()).steps,7800);
    // The edit captures a version before a concurrent synthetic canonical write.
    await btn(page,'Editar cantidad de agua').click();
    await page.evaluate(()=>{
      const q=window.__homeQA, record=q.profiles.A.records[q.today];
      q.setProfile({records:{...q.profiles.A.records,[q.today]:{...record,version:String(Number(record.version)+1)}}});
    });
    const waterInput=page.getByRole('spinbutton',{name:'Cantidad de agua (ml)'});
    await waterInput.fill('3000');await waterInput.press('Enter');
    await hasText(alert,/conflicto/i);
    await since(page,saved,3150);
    assert.ok(await btn(page,'Revisar borrador').isVisible());
    await btn(page,'Revisar borrador').click();
    await btn(page,'Descartar cambios').click();
    assert.equal((await read()).water,2500);

    // Navigate while the controller still holds the original receipt.
    await plus.click();await showsSaved(page);
    await page.locator('[data-day="2026-11-12"]').click();
    assert.equal(await signal(page).innerText(),'');
    await page.locator('[data-day="2026-11-13"]').click();
    await showsSaved(page);
    await go(page,'Perfil');
    await page.waitForTimeout(3150);
    await go(page,'Inicio');
    assert.equal(await signal(page).innerText(),'');
    assert.deepEqual(await page.evaluate(()=>[window.__homeQA.aiCalls.length,window.__homeQA.externalRequests]),[0,0]);
    assert.deepEqual(errors,[]);
    result={states:events.map(e=>({text:e.text,ms:e.at-events[0].at,bandHeight:e.height,controlsTopFromHeading:e.cardY})),
      receiptToExpiryMs:elapsed,visibleSuccessMs:duration,retainedFocus:true,secondPendingSurvivesFirstDeadline:true,secondSuccessKeepsOwnDeadline:true,
      failedWriteRetainsDraft:true,retryConfirmed:true,conflictSurvivesPreviousDeadline:true,dateScoped:true,expiredOnReturn:true};
  } finally {
    finish=performance.now();
    await context.close();
    if (!result) { await video.delete(); await rmdir(temp); }
  }
  const require=createRequire(process.env.PLAYWRIGHT_MODULE || path.resolve(repo,'../qa-tools/node_modules/playwright/index.mjs'));
  const {registry}=require('playwright-core/lib/server/registry/index');
  const duration=(end-begin)/1000;
  const ffmpeg=registry.findExecutable('ffmpeg').executablePath();
  execFileSync(ffmpeg,['-hide_banner','-loglevel','error','-sseof','-'+((finish-begin)/1000).toFixed(3),
    '-i',await video.path(),'-t',duration.toFixed(3),'-an','-c:v','libvpx','-threads','1','-b:v','900k','-crf','10','-y',path.join(out,'guardado.webm')]);
  await video.delete();
  await rmdir(temp);
  return result;
}

try {
  if (!process.argv.includes('--feedback-only')) {
    for(const [w,h] of sizes) for(const theme of themes) await layout(w,h,theme);
    const results={baseline:'8bb158d46a703f321dddbb2aac608477c355cc96',browser:await browser.version(),dimensions,stress,skeletons};
    if (!before) {
      const baseline=JSON.parse(await readFile(path.join(root,'before','mediciones.json'),'utf8'));
      for(const row of dimensions) {
        const match=baseline.dimensions.find(old=>old.width===row.width && old.theme===row.theme && old.state===row.state);
        assert.equal(match.recordsShown,row.recordsShown);
        assert.ok(row.height<match.height,'expected a shorter band '+JSON.stringify(row));
      }
    }
    const json=Object.entries(results).map(([key,value])=>JSON.stringify(key)+': '+(Array.isArray(value)?
      '[\n'+value.map(item=>'  '+JSON.stringify(item)).join(',\n')+'\n]':JSON.stringify(value,null,2)));
    await writeFile(path.join(out,'mediciones.json'),'{\n'+json.join(',\n')+'\n}\n');
  }
  if (!before && !process.argv.includes('--layout-only')) {
    const feedback=await captureJourney();
    await writeFile(path.join(out,'guardado.json'),JSON.stringify(feedback,null,2)+'\n');
  }
} finally {await browser.close();}
