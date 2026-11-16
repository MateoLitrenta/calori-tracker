import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { evidence, start, tabs } from './browser.mjs';

const out=path.join(evidence,'comparisons');
mkdirSync(out,{recursive:true});
const browser=await start();
try {
  for(const width of [375,1440]) {
    const imageWidth=width===375?375:760;
    const imageHeight=width===375?812:475;
    const page=await browser.newPage({viewport:{width:2*imageWidth+48,height:2*imageHeight+174}, deviceScaleFactor:1});
    for(const tab of Object.keys(tabs)){
      const cells=[];
      for(const [theme,label] of [['light','Claro'],['dark','Oscuro']]){
        for(const [version,title] of [['before','Antes · 1011721'],['after','Después']]){
          const image=readFileSync(path.join(evidence,version,[width,theme,tab.toLowerCase()].join('-')+'.jpg'));
          cells.push('<section><h2>'+title+' / '+label+'</h2><img src="data:image/jpeg;base64,'+image.toString('base64')+'"></section>');
        }
      }
      await page.setContent('<style>*{box-sizing:border-box}body{margin:16px;background:#eceae6;color:#242526;font:14px Segoe UI,Arial}h1{font-size:20px;margin:0 0 10px}main{display:grid;grid-template-columns:1fr 1fr;gap:12px 16px}h2{font-size:14px;margin:0 0 6px}img{display:block;width:100%;outline:1px solid #c5c5c5}</style><h1>'+tab+' · '+width+' px</h1><main>'+cells.join('')+'</main>');
      await page.locator('img').evaluateAll(images=>Promise.all(images.map(img=>img.decode())));
      await page.locator('body').screenshot({path:path.join(out,width+'-'+tab.toLowerCase()+'.jpg'),quality:90});
    }
    await page.close();
  }
}finally{await browser.close();}
