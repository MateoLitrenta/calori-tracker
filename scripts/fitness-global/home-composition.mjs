import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { before, open, repo, start } from './browser.mjs';

const output = path.join(repo,'docs/evidence/home-composition', before ? 'before' : 'after');
const browser = await start();
await mkdir(output,{recursive:true});
const rows = [], loading = [], accessibility = [], breakpoints = [];
const reflow = process.argv.includes('--reflow');
const sizes = [[320,568],[375,812],[1440,900],[768,1024],[1024,768],[1920,1080]];
const selectors = {
  header:'.home-header',date:'.home-date-nav',score:'.fitness-score',actions:'.daily-quick-actions',
  records:'.daily-logs',first:'.daily-record-open',habits:'.daily-habits-block',history:'.home-history',
};
const frames = page => page.evaluate(async()=>{
  await document.fonts.ready;
  await new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)));
});
async function fixture(page, state) {
  await page.evaluate(state=>{
    const q=window.__homeQA, today=q.today;
    const meal=(id,name,calories,time,type='Almuerzo')=>({id,name,calories,time,type});
    const workout=(id,activity,calories,time)=>({id,activity,calories,time,duration:40,muscles:[]});
    const soup='Sopa de calabaza con semillas tostadas, jengibre y pan de masa madre';
    const photo='synthetic-home-a/synthetic-meal.png';
    if (!q.files.has(photo)) {
      const canvas=document.createElement('canvas'); canvas.width=canvas.height=60;
      const ctx=canvas.getContext('2d');
      ctx.fillStyle='#89755f';ctx.fillRect(0,0,60,60);
      for(const [r,color] of [[26,'#eae6d6'],[21,'#c17129']]) {
        ctx.fillStyle=color;ctx.beginPath();ctx.arc(30,30,r,0,Math.PI*2);ctx.fill();
      }
      for(const [x,y] of [[25,27],[31,30],[35,25],[26,33]]) {
        ctx.fillStyle='#546438';ctx.beginPath();ctx.ellipse(x,y,2,1,1,0,Math.PI*2);ctx.fill();
      }
      q.files.set(photo,canvas.toDataURL());
    }
    const base={...q.profiles.A.records[today],steps:0,water:0,weight:null,meals:[],workouts:[]};
    const meals=[
      {...meal('soup-early',soup,420,'12:15'),photo_path:photo},
      meal('oats','Avena con yogur, pera y almendras',350,'08:05','Desayuno'),
      meal('soup-late',soup,375,'20:10','Cena'),
      meal('snack','Tostadas con ricota',210,'16:30','Merienda'),
    ];
    const workouts=[workout('walk','Caminata por la costanera con intervalos de ritmo sostenido',220,'09:50'),
      workout('gym','Gimnasio',290,'18:40')];
    if(state==='una') base.meals=[meal('zero','Comida registrada con balance neutro',1679,'13:00')];
    if(state==='cuatro'||state==='larga') {
      base.meals=state==='larga'?meals:meals.slice(0,2);
      base.workouts=workouts;base.weight=72.8;base.steps=6300;base.water=1750;
    }
    if(state==='actividad') {base.steps=3400;base.workouts=[workouts[0]];}
    q.setProfile({records:{...q.profiles.A.records,[today]:base}});
  },state);
  await frames(page);
}
async function resetScroll(page) {
  await page.evaluate(()=>{document.activeElement?.blur?.();document.querySelector('.app-main').scrollTop=0;});
  await frames(page);
}
async function measure(page) {
  return page.evaluate(selectors=>{
    const box=el=>{if(!el || !el.getClientRects().length)return null;
      const r=el.getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)};};
    const home=document.querySelector('.fitness-home');
    const el=s=>home.querySelector(s);
    const visible=[...home.querySelectorAll('.daily-record-open')].filter(e=>e.getClientRects().length);
    const main=document.querySelector('.app-main');
    return {
      areas:Object.fromEntries(Object.entries(selectors).map(([k,s])=>[k,box(document.querySelector(s))])),
      visible:visible.length, entryIds:visible.map(e=>e.dataset.entryId),
      pageOverflow:Math.max(document.documentElement.scrollWidth-innerWidth,main.scrollWidth-main.clientWidth),
      scoreState:el('.fitness-score').dataset.energyState,readout:el('.energy-number').innerText.trim(),
      date:el('.home-date-context time').dateTime,
      controls:[...el('.daily-habits').querySelectorAll('button')].map(el=>({label:el.getAttribute('aria-label')||el.innerText,...box(el)})),
      collidingRows:visible.filter(row=>{
        const name=row.querySelector('.fitness-record-copy').getBoundingClientRect(),amount=row.querySelector('.fitness-record-kcal').getBoundingClientRect();
        return name.right>amount.left+1 && name.bottom>amount.top+1 && amount.bottom>name.top+1;
      }).map(el=>el.dataset.entryId)
    };
  },selectors);
}

// Capture the real nested scroller at its original viewport size. The top frame
// supplies the sidebar and the last supplies the mobile bar, each exactly once.
async function fullHome(page, file) {
  await resetScroll(page);
  const {left,top,end,bg}=await page.evaluate(()=>{
    const main=document.querySelector('.app-main').getBoundingClientRect();
    const nav=document.querySelector('.app-bottom-nav');
    return {left:Math.round(main.left),top:Math.round(main.top),
      end:Math.round(nav?.getClientRects().length?Math.min(main.bottom,nav.getBoundingClientRect().top):main.bottom),
      bg:getComputedStyle(document.querySelector('.app-sidebar')).backgroundColor};
  });
  const shots=[];
  let at=0;
  while(true) {
    shots.push({at,data:(await page.screenshot({type:'png'})).toString('base64')});
    const next=await page.locator('.app-main').evaluate((el,step)=>{el.scrollTop+=step;return el.scrollTop;},end-top);
    if(next<=at)break;
    at=next;await frames(page);
  }
  const jpg=await page.evaluate(async({shots,left,top,end,bg})=>{
    const canvas=document.createElement('canvas');canvas.width=innerWidth;canvas.height=innerHeight+shots.at(-1).at;
    const ctx=canvas.getContext('2d');ctx.fillStyle=bg;ctx.fillRect(0,0,canvas.width,canvas.height);
    for(const [index,{at,data}] of shots.entries()) {
      const img=new Image();img.src='data:image/png;base64,'+data;await img.decode();
      if(!index)ctx.drawImage(img,0,0,innerWidth,end,0,0,innerWidth,end);
      else ctx.drawImage(img,left,top,innerWidth-left,end-top,left,at+top,innerWidth-left,end-top);
      if(index===shots.length-1 && end<innerHeight)
        ctx.drawImage(img,0,end,innerWidth,innerHeight-end,0,at+end,innerWidth,innerHeight-end);
    }
    return canvas.toDataURL('image/jpeg',.86).split(',')[1];
  },{shots,left,top,end,bg});
  await writeFile(file,Buffer.from(jpg,'base64'));
  await resetScroll(page);
}
async function previousDay(page) {
  const disclosure=page.locator('.home-history-toggle');
  if(await disclosure.isVisible() && await disclosure.getAttribute('aria-expanded')==='false')await disclosure.click();
  await page.locator('.ah-day[data-date="2026-11-09"]').click();
  assert.equal(await page.locator('.home-date-context time').getAttribute('datetime'),'2026-11-13');
  await page.locator('[data-history-open]').click();
  await page.waitForFunction(()=>document.activeElement?.id==='fitness-daily-entries');
  if(await disclosure.isVisible())await disclosure.click();
  await resetScroll(page);
}
async function skeleton(page,width,theme) {
  const ready=await measure(page);
  const nav=page.getByRole('navigation',{name:'Navegación principal'});
  const navigation=await nav.boundingBox();
  await page.evaluate(()=>window.__homeQA.setLoading(true));
  await page.locator('.view-skeleton-home').waitFor();
  if([375,1440].includes(width)&&theme==='light') {
    await page.waitForFunction(()=>getComputedStyle(document.querySelector('.view-skeleton-home')).opacity==='1');
    await page.screenshot({path:path.join(output,width+'-light-carga.jpg'),quality:86});
  }
  assert.deepEqual(await nav.boundingBox(),navigation,'navigation during loading');
  const result=await page.evaluate(()=>{
    const box=s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)};};
    return Object.fromEntries(Object.entries({header:'.home-header',date:'.home-placeholder-date',score:'.home-placeholder-balance',
      actions:'.home-placeholder-actions',records:'.home-placeholder-records',habits:'.home-placeholder-habits'}).map(([k,v])=>[k,box(v)]));
  });
  await page.evaluate(()=>window.__homeQA.setLoading(false));await page.locator('.fitness-home').waitFor();await frames(page);
  assert.deepEqual(ready.areas.header,result.header);
  if(!before) {
    for(const region of ['date','score','actions','records','habits'])
      assert.ok(Math.abs(result[region].x-ready.areas[region].x)<=1 && Math.abs(result[region].w-ready.areas[region].w)<=2,'skeleton frame '+region+' at '+width);
    if(width<1280)assert.ok(result.actions.y<result.records.y && result.records.y<result.habits.y);
    else assert.ok(result.records.x>result.habits.x);
  }
  loading.push({width,theme,placeholder:result,ready:ready.areas});
}
async function accessible(page,width,theme) {
  const contrast=await page.evaluate(()=>{
    const ctx=document.createElement('canvas').getContext('2d');
    const rgba=color=>{ctx.clearRect(0,0,1,1);ctx.fillStyle=color;ctx.fillRect(0,0,1,1);return ctx.getImageData(0,0,1,1).data;};
    const luma=color=>color.slice(0,3).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((v,c,i)=>v+c*[.2126,.7152,.0722][i],0);
    const results={};
    for(const selector of ['.energy-number','.energy-qualifier','.fitness-channel dt','.fitness-channel dd','.fitness-breakdown summary',
      '.habit-label','.habit-value','.habit-controls button','.daily-record-title','.daily-record-meta','.fitness-record-kcal','.daily-quick-actions button']) {
      const el=document.querySelector(selector);
      if(!el?.getClientRects().length)continue;
      const style=getComputedStyle(el), fg=Array.from(rgba(style.color));
      let bg;
      for(let parent=el;parent;parent=parent.parentElement) {
        const color=Array.from(rgba(getComputedStyle(parent).backgroundColor));
        if(color[3]===255) { bg=color;break; }
      }
      if(!bg)bg=[255,255,255];
      const [min,max]=[luma(bg),luma(fg)].sort((a,b)=>a-b);
      const large=parseFloat(style.fontSize)>=(parseFloat(style.fontWeight)>=700?18.67:24);
      results[selector]={ratio:Math.round(100*(max+.05)/(min+.05))/100,minimum:large?3:4.5};
    }
    return results;
  });
  for(const [selector,{ratio,minimum}] of Object.entries(contrast))assert.ok(ratio>=minimum,selector+' contrast '+ratio);
  const order=await page.evaluate(()=>{
    const sections=['.home-date-nav','.fitness-score','.daily-quick-actions','.daily-logs','.daily-habits-block','.home-history'];
    return sections.sort((a,b)=>document.querySelector(a).compareDocumentPosition(document.querySelector(b))&Node.DOCUMENT_POSITION_FOLLOWING?-1:1);
  });
  assert.deepEqual(order,['.home-date-nav','.fitness-score','.daily-quick-actions','.daily-logs','.daily-habits-block','.home-history']);
  const focusOrder=[];
  await page.locator('.daily-quick-actions button').first().focus();
  for(let i=0;i<25;i++) {
    await page.keyboard.press('Tab');
    const point=await page.evaluate(()=>{
      const el=document.activeElement;
      const selector=['.daily-quick-actions','.daily-logs','.daily-habits-block','.home-history'].find(s=>el.closest(s));
      const outline=getComputedStyle(el);
      return {selector,visible:el.matches(':focus-visible') && (outline.outlineStyle!=='none' || outline.boxShadow!=='none')};
    });
    if(!point.selector)continue;
    assert.ok(point.visible,JSON.stringify(point));
    if(focusOrder.at(-1)!==point.selector)focusOrder.push(point.selector);
    if(point.selector==='.daily-habits-block')break;
  }
  assert.deepEqual(focusOrder,['.daily-quick-actions','.daily-logs','.daily-habits-block']);
  await resetScroll(page);
  // Double computed text sizes at fixed viewport dimensions, including fixed-pixel labels.
  await page.evaluate(()=>{
    const elements=[...document.querySelectorAll('.home-header *, .fitness-home, .fitness-home *')].filter(node=>node instanceof HTMLElement);
    const sizes=elements.map(node=>parseFloat(getComputedStyle(node).fontSize));
    window.__restoreCompositionText=elements.map(el=>[el,el.getAttribute('style')]);
    elements.forEach((el,i)=>el.style.setProperty('font-size',2*sizes[i]+'px','important'));
  });
  await frames(page);
  const doubled=await measure(page);
  assert.equal(doubled.pageOverflow,0,width+' text 200% page overflow');
  assert.deepEqual(doubled.collidingRows,[]);
  assert.ok(doubled.controls.every(c=>c.w>=44&&c.h>=44));
  const clipped=await page.evaluate(()=>[...document.querySelectorAll('.daily-quick-actions button, .fitness-readout, .fitness-channel dt, .daily-record-title, .daily-record-meta, .fitness-record-kcal, .habit-label, .habit-controls button, .habit-edit')].filter(el=>el.clientWidth>0 && el.scrollWidth>el.clientWidth+1).map(el=>[el.className,el.clientWidth,el.scrollWidth]));
  assert.deepEqual(clipped,[],width+' text 200% clipping');
  const wrappedHabits=await page.evaluate(()=>[...document.querySelectorAll('.habit-label, .habit-value, .habit-unit')].flatMap(el=>{
    const node=[...el.childNodes].find(n=>n.nodeType===Node.TEXT_NODE && n.textContent.trim());
    if(!node)return [];
    const range=document.createRange();range.selectNodeContents(node);
    range.setEnd(node,node.textContent.trimEnd().length);
    return range.getClientRects().length>1?[node.textContent.trim()]:[];
  }));
  assert.deepEqual(wrappedHabits,[],width+' split habit number, unit or label');
  if([320,1440].includes(width) && theme==='light')
    await fullHome(page,path.join(output,width+'-light-texto-200.jpg'));
  accessibility.push({width,theme,contrast,focusOrder,text200:{overflow:doubled.pageOverflow,areas:doubled.areas,clipped}});
  await page.evaluate(()=>{
    for(const [el,style] of window.__restoreCompositionText) {
      if(style===null)el.removeAttribute('style');else el.setAttribute('style',style);
    }
    delete window.__restoreCompositionText;
  });
  await resetScroll(page);
}
async function breakpoint(page,theme) {
  const bounds=[];
  for(const width of [1279,1280,1279,1280]) {
    await page.setViewportSize({width,height:900});await frames(page);await resetScroll(page);
    const {areas,pageOverflow}=await measure(page);
    assert.equal(pageOverflow,0);
    assert.equal(areas.header.x,areas.date.x);
    assert.equal(areas.header.w,areas.date.w);
    assert.equal(areas.date.x,areas.score.x);
    assert.equal(areas.date.w,areas.score.w);
    if(width===1279) {
      assert.equal(areas.records.x,areas.habits.x);
      assert.ok(areas.records.y>areas.actions.y && areas.habits.y>areas.records.y);
    } else {
      assert.equal(areas.actions.x,areas.habits.x);
      assert.equal(areas.actions.y,areas.records.y);
      assert.ok(areas.records.x>areas.habits.x);
      assert.equal(areas.records.x+areas.records.w,areas.header.x+areas.header.w);
    }
    bounds.push({width,frame:areas.header,actions:areas.actions,records:areas.records,habits:areas.habits});
  }
  await page.setViewportSize({width:1440,height:900});await resetScroll(page);
  return {theme,bounds};
}
async function run(width,height,theme) {
  const {context,page,errors}=await open(browser,375,theme,theme);
  try {
    await page.setViewportSize({width,height});
    const mainPair=[375,1440].includes(width);
    for(const state of ['larga','vacío','una','cuatro','actividad','historial']) {
      await fixture(page,state);
      if(state==='historial')await previousDay(page);
      await resetScroll(page);
      const m=await measure(page);
      assert.equal(m.date,state==='historial'?'2026-11-09':'2026-11-13');
      assert.equal(m.pageOverflow,0);
      assert.deepEqual(m.collidingRows,[]);
      assert.equal(m.scoreState,{larga:'recorded',vacío:'empty',una:'recorded',cuatro:'recorded',actividad:'partial',historial:'recorded'}[state]);
      if(state==='una')assert.match(m.readout,/^0\s*kcal$/i);
      if(!before) {
        assert.equal(m.visible,({larga:4,vacío:0,una:1,cuatro:4,actividad:1,historial:1})[state]);
        assert.ok(m.controls.every(c=>c.w>=44&&c.h>=44),'small habit target '+JSON.stringify(m.controls));
        if(width===375)assert.ok(m.areas.records.y<m.areas.habits.y);
        if(width>=1440)assert.ok(m.areas.records.x>m.areas.habits.x);
      }
      rows.push({width,height,theme,state,...m});
      if(!reflow && mainPair && (['larga','vacío'].includes(state)||theme==='light')) {
        await fullHome(page,path.join(output,width+'-'+theme+'-'+state+'.jpg'));
      }
      if(!before && state==='larga') {
        if(width===1440)breakpoints.push(await breakpoint(page,theme));
        await accessible(page,width,theme);
      }
      if(state==='cuatro')await skeleton(page,width,theme);
    }
    assert.deepEqual(errors,[]);
    assert.deepEqual(await page.evaluate(()=>[window.__homeQA.externalRequests,window.__homeQA.aiCalls.length]),[0,0]);
    console.log(width,theme,'OK');
  } finally {await context.close();}
}
try {
  for (const [w,h] of sizes)for(const theme of ['light','dark'])await run(w,h,theme);
  if(!before) {
    const base=JSON.parse(await readFile(path.join(output,'../before/mediciones.json'),'utf8'));
    for(const row of rows) {
      const reference=base.rows.find(r=>r.width===row.width && r.theme===row.theme && r.state===row.state);
      assert.equal(row.date,reference.date);
      assert.equal(row.scoreState,reference.scoreState);
      assert.equal(row.readout.replace(/\s/g,''),reference.readout.replace(/\s/g,''));
      assert.deepEqual(row.entryIds,reference.entryIds.slice(0,4),'chronology for '+row.state);
    }
  }
  const sections={rows,loading,accessibility,breakpoints};
  const entries=Object.entries(sections).map(([name,values])=>'  "'+name+'": [\n'+values.map(value=>'    '+JSON.stringify(value)).join(',\n')+'\n  ]');
  await writeFile(path.join(output,'mediciones.json'),'{\n  "browser": '+JSON.stringify(await browser.version())+',\n'+entries.join(',\n')+'\n}\n');
} finally {await browser.close();}
