import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import React,{act} from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import ts from 'typescript';
import { formatDateStr,getNetBalance,getHeatmapColor } from '../src/utils/helpers.ts';

const css=await readFile(new URL('../src/components/HomeVariants.css',import.meta.url),'utf8');
const rawSource=await readFile(new URL('../src/components/Heatmap.tsx',import.meta.url),'utf8');
const source=rawSource.replace(/import ['"][^'"]+\.css['"];?/g,'');
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2023}}).outputText
  .replace(/from ["']([^"']+)["']/g,(_,specifier)=>`from ${JSON.stringify(specifier.startsWith('../utils/')?new URL(`../src/utils/${specifier.slice(9)}.ts`,import.meta.url).href:import.meta.resolve(specifier))}`);
const {default:Heatmap}=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const today=formatDateStr(new Date());
const profile={age:30,sex:'Masculino',height:170,weight:70,goal:'Mantenimiento'};

test('weekday labels remain outside the scrollport; date selection keeps title, colors and scroll position',async t=>{
  const dom=new JSDOM('<style>'+css+'</style><div class="home-variants" id="root"></div>',{pretendToBeVisual:true});
  const saved={window:globalThis.window,document:globalThis.document,act:globalThis.IS_REACT_ACT_ENVIRONMENT};
  globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  // JSDOM has no native matchMedia; this fixture models the desktop surface.
  window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
  const root=createRoot(dom.window.document.getElementById('root'));
  t.after(async()=>{await act(()=>root.unmount());dom.window.close();globalThis.window=saved.window;globalThis.document=saved.document;globalThis.IS_REACT_ACT_ENVIRONMENT=saved.act;});
  let selection={type:'day',dates:[today]},selects=0;
  const record={dateStr:today,meals:[{calories:1500}],workouts:[],steps:7000,water:0};
  const props={records:{[today]:record},selectedDateStr:today,selectedGroup:selection,profile,
    onSelectDate:date=>{selection={type:'day',dates:[date]};selects++;},onSelectGroup:(type,_label,dates)=>{selection={type,dates};}};
  await act(()=>root.render(React.createElement(Heatmap,props)));
  const scroll=document.querySelector('.heatmap-scroll'),labels=document.querySelector('.heatmap-weekdays');
  assert.ok(!scroll.contains(labels));assert.equal(labels.parentElement,scroll.parentElement);
  assert.deepEqual([...labels.children].map(node=>node.textContent),['','Lun','','Mié','','Vie','']);
  assert.equal(scroll.tabIndex,0);assert.equal(scroll.getAttribute('role'),'region');
  scroll.scrollLeft=123;
  const day=document.querySelector(`.heatmap-date[aria-label^="Seleccionar ${today}"]`);
  assert.ok(day.title.includes(String(getNetBalance(record,profile))));
  const square=day.querySelector('span.heatmap-cell');
  assert.ok(square,'The visual square is separate from the semantic hit target');
  assert.equal(square.getAttribute('aria-hidden'),'true');
  assert.ok(square.classList.contains(getHeatmapColor(getNetBalance(record,profile))));
  assert.equal(square.dataset.border,'selected');
  assert.equal(day.querySelectorAll('span.heatmap-cell').length,1);
  assert.equal(document.querySelectorAll('button.heatmap-date[data-date="'+today+'"]').length,1);
  assert.equal(document.querySelector('.history-day-strip'),null);
  assert.equal(document.querySelector('.history-full-toggle'),null);
  await act(()=>day.click());assert.equal(selects,1);assert.equal(selection.dates[0],today);assert.equal(scroll.scrollLeft,123);
  const initialColumns=document.querySelectorAll('.heatmap-column').length;assert.ok(initialColumns>=52);
  assert.equal(document.querySelector('.heatmap-frame').style.getPropertyValue('--history-columns'),String(initialColumns));
  assert.equal(document.querySelector('.heatmap-frame').dataset.period,'day');
  assert.ok([...document.querySelectorAll('.heatmap-column')].every(column=>column.children.length===7));
  const selector=document.querySelector('[aria-label="Período del historial"]');
  assert.equal(selector.style.getPropertyValue('--active-index'),'3');
  let resets=0;let left=123;
  Object.defineProperty(scroll,'scrollWidth',{value:800});
  Object.defineProperty(scroll,'scrollLeft',{get:()=>left,set:value=>{left=value;resets++;}});
  for(const [label,type,index] of [['Semana','week','2'],['Mes','month','1'],['Año','year','0'],['Día','day','3']]) {
    await act(()=>[...selector.querySelectorAll('button')].find(button=>button.textContent===label).click());
    assert.equal(selection.type,'day');assert.ok(selection.dates.length>0);
    assert.equal(document.querySelector('.heatmap-frame').dataset.period,type);
    assert.equal(selector.style.getPropertyValue('--active-index'),index);
    assert.equal(selector.querySelectorAll('[aria-pressed="true"]').length,1);
    const calls=resets;
    left=111;await act(()=>[...selector.querySelectorAll('button')].find(button=>button.textContent===label).click());
    assert.equal(resets,calls);assert.equal(left,111,'No delayed reset when reselecting a period');
  }
});

test('shared period motion, heatmap row geometry and Coach control contracts are scoped and motion-safe',async()=>{
  const selectorCSS=await readFile(new URL('../src/components/PeriodSelector.css',import.meta.url),'utf8');
  const premiumCSS=await readFile(new URL('../src/components/PremiumViews.css',import.meta.url),'utf8');
  const charts=await readFile(new URL('../src/components/ChartsView.tsx',import.meta.url),'utf8');
  assert.match(rawSource,/PeriodSelector\.css/);assert.match(charts,/PeriodSelector\.css/);
  assert.match(selectorCSS,/prefers-reduced-motion: reduce/);assert.match(selectorCSS,/transition: none/);
  assert.match(selectorCSS,/transform: translateX/);
  assert.match(css,/\.heatmap-weekdays[^}]+gap: var\(--history-gap\)/);
  assert.match(css,/\.heatmap-column[^}]+gap: var\(--history-gap\)/);
  assert.match(css,/\.heatmap-grid[^}]+width: var\(--history-cell\); height: var\(--history-cell\)/);
  assert.match(css,/\.heatmap-scroll[^}]+overflow-x: auto/);
  assert.doesNotMatch(source,/overflow-x-hidden|setTimeout|window.innerWidth/);
  assert.match(css,/daily-quick-actions[^}]+repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(premiumCSS,/chat-composer :is\([^}]+border-radius: var\(--radius-control\)/);
  assert.match(premiumCSS,/chat-suggestion[^}]+min-height: 44px/);
  assert.match(css,/overflow-wrap: anywhere/);
});
