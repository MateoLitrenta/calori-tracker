import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { evidence, go, open, start } from './browser.mjs';

const browser=await start();
const result=[];
async function sample(localOrigin) {
  const {page,context,errors}=await open(browser,375,'light','dark',localOrigin);
  const values=[];
  for(const account of ['A','B']){
    await page.evaluate(key=>window.__homeQA.switchAccount(key),account);
    await go(page,'Datos');
    for(const period of ['Semana','Mes','Año']){
      await page.getByRole('group',{name:'Período'}).getByRole('button',{name:period,exact:true}).click();
      const display=await page.evaluate(()=>{
        const firstText=elem=>elem?.firstChild?.textContent.trim()??null;
        return {
          balance:firstText(document.querySelector('.charts-balance-value')),
          averages:[...document.querySelectorAll('.charts-summary-metrics dd')].map(firstText),
          denominators:[...document.querySelectorAll('.charts-average-base')].map(el=>el.textContent.trim()),
          coverage:document.querySelector('.charts-coverage')?.textContent.trim(),
          buckets:[...document.querySelectorAll('.charts-bucket')].map(el=>el.getAttribute('aria-label')?.match(/[−-]?\d+(?:[.,]\d+)*/g)||[]),
        };
      });
      assert.equal(display.averages.length,2);
      values.push({account,period,...display});
    }
  }
  assert.deepEqual(errors,[]);
  await context.close();
  return values;
}
try {
  const reference=await sample('http://127.0.0.1:5193');
  const after=await sample('http://127.0.0.1:5194');
  for(let i=0;i<reference.length;i++){
    assert.deepEqual(after[i],reference[i]);
    result.push({status:'passed',...after[i]});
  }
} finally {await browser.close();}
writeFileSync(path.join(evidence,'numerical-parity.json'),JSON.stringify(result,null,2)+'\n');
console.log('Matched summary, denominators, coverage and bucket numbers:',result.length,'account/period combinations');
