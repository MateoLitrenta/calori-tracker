import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {evidence,go,open,period,start} from './browser.mjs';
const directory=path.join(evidence,'parity');mkdirSync(directory,{recursive:true});
const browser=await start(),samples=[];
async function sample(url,scenario,account){
  const {page,context,errors}=await open(browser,393,'light',scenario,'light',url);
  try{
    if(account==='B')await page.evaluate(()=>window.__homeQA.switchAccount('B'));
    await go(page,'Datos');
    const values=[];
    for(const value of ['Semana','Mes','Año']){
      await period(page,value);
      const raw=await page.evaluate(async period=>{
        const {buildChartStats}=await import('/src/utils/chartStats.ts');
        const q=window.__homeQA;
        const {start,end,summary,buckets,comparison,currentStreak}=buildChartStats(q.store.activeProfile,period,q.today);
        return {start,end,summary,buckets,comparison,currentStreak};
      },value);
      const display=await page.evaluate(()=>({
        balance:document.querySelector('.charts-balance-value').firstChild.textContent.trim(),
        means:[...document.querySelectorAll('.charts-summary-metrics dd')].map(e=>e.firstChild.textContent.trim()),
        comparison:[...document.querySelectorAll('.charts-comparison dd')].map(e=>e.firstChild.textContent.trim()),
      }));
      const numbers=n=>n===null?'Sin datos':n.toLocaleString('es-AR');
      assert.equal(display.balance,raw.summary.balance===null?'Sin datos':(raw.summary.balance>0?'+':'')+numbers(raw.summary.balance));
      assert.deepEqual(display.means,[raw.summary.consumed,raw.summary.expenditure].map(numbers));
      const detail=[];
      const buttons=page.locator('.charts-bucket');
      for(let i=0;i<await buttons.count();i++){
        await buttons.nth(i).click();
        const dd=await page.locator('.charts-detail dd').allTextContents();
        const item=raw.buckets[i].summary;
        const numeric=dd.map(s=>/^[+-]?[\d.,]+/.exec(s)?.[0]??null);
        assert.deepEqual(numeric,[item.consumed,item.expenditure,item.balance].map((n,index)=>n===null?null:(n>0&&index===2?'+':'')+numbers(n)));
        detail.push({index:i,values:numeric,empty:item.energyDays===0,foodDays:item.mealDays,energyDays:item.energyDays});
      }
      values.push({period:value,raw,display,detail});
    }
    assert.deepEqual(errors,[]);
    assert.equal(await page.evaluate(()=>window.__homeQA.writes.length+window.__homeQA.aiCalls.length+window.__homeQA.externalRequests),0);
    return values;
  }finally{await context.close();}
}
try{
  for(const scenario of ['main','empty','zeros','yearBoundary','monthBoundary']){
    for(const account of scenario==='main'?['A','B']:['A']){
      const previous=await sample('http://127.0.0.1:5195',scenario,account);
      const current=await sample('http://127.0.0.1:5196',scenario,account);
      assert.deepEqual(current,previous,'Numeric parity '+scenario+' '+account);
      samples.push({scenario,account,status:'passed',periods:current});
      console.log(scenario,account,'passed');
    }
  }
}finally{
  await browser.close();
  writeFileSync(path.join(directory,'numbers.json'),JSON.stringify(samples,null,2)+'\n');
}
