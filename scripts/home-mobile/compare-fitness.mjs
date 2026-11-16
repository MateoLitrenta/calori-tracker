import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repo = fileURLToPath(new URL('../../', import.meta.url));
const output = path.join(repo, 'docs/evidence/fitness-moderno');
const prototype = process.env.CALORI_B_HTML || path.resolve(repo, '../../outputs/calori-design-lab/phone.html');
const browserModule = process.env.PLAYWRIGHT_MODULE || path.resolve(repo, '../qa-tools/node_modules/playwright/index.mjs');
const { chromium } = await import(pathToFileURL(browserModule).href);
const sources = process.argv.slice(2);
assert.ok(sources.length && sources.every(s => ['before', 'concept', 'integrated', 'boards'].includes(s)),
  'Choose before, concept, integrated or boards');
const sizes = [[320,740], [375,812], [393,852], [440,900], [768,1024], [1440,900]];
const labels = { before: 'PR anterior · 1fafb3e', concept: 'Concepto B original', integrated: 'Implementación integrada' };
const sections = { home: 'Inicio', habits: 'Agua, pasos y peso', records: 'Registros del día', meal: 'Comida', exercise: 'Ejercicio', calendar: 'Calendario mensual' };
const themes = ['light','dark'];
const temp = await mkdtemp(path.join(tmpdir(), 'calori-visual-'));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
await mkdir(output, { recursive: true });

async function measureForm(page, scene, mode) {
  const prefix=mode+'-'+(scene==='meal'?'meal':'workout')+'-';
  const fieldIds=scene==='meal'?['calories','time']:['duration','calories','time'];
  const rectangles=await page.locator('#'+prefix+fieldIds[0]).evaluate((_, {prefix,fieldIds}) => {
    return fieldIds.map(id => {
      const input=document.getElementById(prefix+id);
      const label=document.querySelector('label[for="'+prefix+id+'"]');
      const rect = el => {
        const r=el.getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height};
      };
      return {id,input:rect(input),label:rect(label)};
    });
  },{prefix,fieldIds});
  for(let i=0;i<rectangles.length;i++) for(let j=i+1;j<rectangles.length;j++) {
    for(const type of ['label','input']) {
      const a=rectangles[i][type], b=rectangles[j][type];
      const x=Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x);
      const y=Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y);
      assert.ok(x<=1||y<=1, [mode,scene,type,rectangles[i].id,rectangles[j].id,'overlap',x,y].join(' '));
    }
  }
  return rectangles;
}

async function capture(source) {
  const isConcept = source === 'concept';
  const port = source === 'before' ? 5191 : 5192;
  const origin = 'http://127.0.0.1:' + port;
  const evidence = [];
  const errors = [];
  const requests = new Set();
  for (const theme of themes) {
    const context = await browser.newContext({ timezoneId: 'America/Buenos_Aires', reducedMotion: 'reduce', deviceScaleFactor: 1 });
    await context.route('**/*', route => {
      const url = route.request().url();
      if (isConcept ? url.startsWith('file:') : url.startsWith(origin + '/')) return route.continue();
      requests.add(new URL(url).origin); return route.abort();
    });
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    page.setDefaultNavigationTimeout(120000);
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
    for (const [width,height] of sizes) {
      await page.setViewportSize({ width, height });
      let frame = page.mainFrame();
      if (isConcept) {
        const url = pathToFileURL(prototype).href + '?c=B&theme=' + theme;
        if (width >= 768) {
          // The study is mobile-only. Center its original 393 px viewport on the
          // same desktop canvas without inventing a desktop design or scaling pixels.
          const wrapper = path.join(temp, 'concept-' + theme + '.html');
          await writeFile(wrapper, '<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:' + (theme === 'dark' ? '#121616' : '#dddeda') + '}iframe{display:block;margin:auto;border:0;width:393px;height:100vh}</style><iframe src="' + url + '"></iframe>');
          await page.goto(pathToFileURL(wrapper).href);
          frame = page.frames().find(f => f.url().startsWith(pathToFileURL(prototype).href));
          assert.ok(frame, 'Original study must load in the viewport');
        } else {
          await page.goto(url);
        }
      } else {
        await page.goto(origin + '/qa?theme=' + theme + '&controls=0&reset=1', {waitUntil:'domcontentloaded'});
      }
      const day = frame.locator(isConcept ? '.b-readout' : '.energy-card');
      await day.waitFor();
      await frame.evaluate(() => document.fonts.ready);
      if (!isConcept) {
        assert.equal(await frame.locator('.home-date-context time').getAttribute('datetime'), '2026-11-13');
        const fixture = await frame.evaluate(() => {
          const r = window.__homeQA.store.activeProfile.records['2026-11-13'];
          return [r.meals.reduce((sum,m) => sum + m.calories,0), r.workouts.length, r.water, r.steps, r.weight];
        });
        assert.deepEqual(fixture, [1250,2,1750,6300,72.8]);
      }
      const energyText = (await frame.locator(isConcept ? '.b-score-inner' : '.energy-card').innerText()).replaceAll('.', '');
      assert.match(energyText, /1031/); assert.match(energyText, /1250/); assert.match(energyText, /2281/);
      const homeShots = async scene => {
        await page.screenshot({ path: path.join(output, [source,width,theme,scene].join('-') + '.jpg'), quality: 88, animations: 'disabled' });
      };
      const geometry = await frame.evaluate(original => {
        const rect = selector => {
          const e = document.querySelector(selector);
          const b = e.getBoundingClientRect();
          return { x:Math.round(b.x), y:Math.round(b.y), w:Math.round(b.width), h:Math.round(b.height) };
        };
        const main = original ? document.documentElement : document.querySelector('.app-main');
        return { viewport:innerWidth, documentWidth:document.documentElement.scrollWidth, mainOverflow:main.scrollWidth-main.clientWidth,
          scroll:main.scrollTop, energy:rect(original?'.b-score-inner':'.energy-card'),
          weekDay:rect(original?'.week-day':'.home-week-days button'), actions:rect(original?'.quick-actions':'.daily-quick-actions'),
          habits:rect(original?'.b-habits':'.daily-habits-block'), records:rect(original?'.b-log':'.daily-logs') };
      },isConcept);
      await homeShots('home');
      assert.equal(geometry.scroll, 0);
      assert.equal(geometry.mainOverflow, 0);
      assert.equal(geometry.documentWidth, geometry.viewport);
      const result = { width, height, theme, ...geometry };
      if (source === 'integrated') assert.ok(geometry.weekDay.w >= 44 && geometry.weekDay.h >= 44);
      if (width === 375) {
        for (const [scene,selector] of Object.entries({ habits: isConcept?'.b-habits':'.daily-habits-block', records:isConcept?'.b-log':'.daily-logs' })) {
          await frame.locator(selector).evaluate(e=>e.scrollIntoView({block:'start',behavior:'instant'}));
          await homeShots(scene);
        }
        for (const [scene,name] of [['meal',/Comida/i],['exercise',/Ejercicio/i],['calendar',/Abrir calendario mensual/i]]) {
          await frame.evaluate(original => (original ? document.scrollingElement : document.querySelector('.app-main')).scrollTo({top:0,behavior:'instant'}),isConcept);
          const anchor = isConcept ? frame.locator('[data-act="' + scene + '"]').first() :
            scene === 'calendar' ? frame.getByRole('button',{name}) : frame.locator('.daily-quick-actions').getByRole('button',{name});
          await anchor.click();
          const dlg=frame.getByRole('dialog');
          await dlg.waitFor();
          await homeShots(scene);
          if (scene === 'calendar') {
            result.calendarDay=await dlg.locator(isConcept?'[data-act="select-day"]:not(:disabled)':'[data-calendar-day]:not(:disabled)').first().evaluate(e=>({w:e.offsetWidth,h:e.offsetHeight}));
            if (!isConcept) assert.ok(result.calendarDay.w >= 44 && result.calendarDay.h >= 44);
          }
          await page.keyboard.press('Escape');
          await dlg.waitFor({state:'hidden'});
        }
      }
      if (source === 'integrated') {
        const trigger = frame.getByRole('button',{name:'Abrir calendario mensual'});
        await trigger.click();
        const picker = frame.getByRole('dialog',{name:'Elegir fecha'});
        result.calendar = await picker.evaluate(el => {
          const day = el.querySelector('[data-calendar-day]:not(:disabled)');
          return { w:day.offsetWidth, h:day.offsetHeight, focusInside:el.contains(document.activeElement) };
        });
        assert.ok(result.calendar.w >= 44 && result.calendar.h >= 44 && result.calendar.focusInside);
        await page.keyboard.press('Escape');
        await picker.waitFor({state:'hidden'});
        result.focusReturned = await trigger.evaluate(el => document.activeElement === el);
        assert.ok(result.focusReturned);
        result.targets = await frame.evaluate(() => {
          const measure = selector => Array.from(document.querySelectorAll(selector)).map(el => {
            const r = el.getBoundingClientRect();
            return { w:Math.round(r.width), h:Math.round(r.height) };
          }).filter(r => r.w && r.h);
          return { actions:measure('.daily-quick-actions button'), habitControls:measure('.habit-controls button, .habit-edit'), records:measure('.daily-record-open') };
        });
        if (width < 768) for (const [kind,targets] of Object.entries(result.targets)) {
          assert.ok(targets.length > 0 && targets.every(t => t.w >= 44 && t.h >= 44), kind + ' touch targets at ' + width + ': ' + JSON.stringify(targets));
        }
        result.formGeometry = {};
        for (const scene of ['meal','exercise']) {
          const action=frame.locator('.daily-quick-actions').getByRole('button',{name:scene==='meal'?/Comida/i:/Ejercicio/i});
          await action.click();
          result.formGeometry['add-'+scene]=await measureForm(frame,scene,'add');
          if (width < 768) await page.keyboard.press('Escape'); else await action.click();
          await frame.locator('.daily-record-open').filter({hasText:scene==='meal'?'Yogur, fruta y avena':'Gimnasio'}).first().click();
          await frame.getByRole('button',{name:'Editar',exact:true}).filter({visible:true}).last().click();
          result.formGeometry['edit-'+scene]=await measureForm(frame,scene,'edit');
          await page.keyboard.press('Escape');
        }
      }
      evidence.push(result);
    }
    await context.close();
  }
  assert.deepEqual(errors, []);
  assert.deepEqual([...requests], []);
  await writeFile(path.join(output,source+'.json'), JSON.stringify({source,browser:'Chrome headless',timezone:'America/Buenos_Aires',date:'2026-11-13',externalRequests:[...requests],browserErrors:errors,results:evidence},null,2)+'\n');
  console.log(source + ' · ' + evidence.length + ' viewport/theme checks');
}

async function boards(){
  const page = await browser.newPage({ viewport:{width:1185,height:912}, deviceScaleFactor:1 });
  for(const theme of themes) for(const [scene, title] of Object.entries(sections)){
    const cards = [];
    for(const [source,label] of Object.entries(labels)){
      const data=await readFile(path.join(output,source+'-375-'+theme+'-'+scene+'.jpg'));
      cards.push('<section><h2>'+label+'</h2><img width="375" height="812" src="data:image/jpeg;base64,'+data.toString('base64')+'"></section>');
    }
    await page.setContent('<!doctype html><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;padding:12px 15px;background:#efeee9;color:#252821;font:15px Segoe UI,Arial,sans-serif}header{display:flex;justify-content:space-between;align-items:baseline;border-bottom:1px solid #c5c5b9;padding-bottom:6px}h1{margin:0;font:29px Georgia,serif}main{display:grid;grid-template-columns:repeat(3,375px);gap:15px}h2{font-size:16px;font-weight:600;margin:10px 0 7px}img{display:block}</style><header><h1>'+title+'</h1><span>375 × 812 px · '+(theme==='dark'?'Oscuro':'Claro')+' · 13 nov 2026</span></header><main>'+cards.join('')+'</main>');
    await page.locator('img').evaluateAll(imgs=>Promise.all(imgs.map(i=>i.decode())));
    await page.screenshot({path:path.join(output,'compare-'+scene+'-'+theme+'.jpg'), quality:90});
  }
  await page.close();
}
try {
  for(const source of sources) { if(source === 'boards') await boards(); else await capture(source); }
} finally { await browser.close(); await rm(temp,{recursive:true,force:true}); }
