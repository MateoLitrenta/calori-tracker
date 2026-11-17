import {mkdirSync,readFileSync} from 'node:fs';
import path from 'node:path';
import {evidence,start} from './browser.mjs';
const titles={inicio:'Inicio',resumen:'Resumen y cobertura','section-semana':'Semana','section-mensual':'Mes','section-anual':'Año','section-comparison':'Comparación con el período anterior'};
const browser=await start(),directory=path.join(evidence,'comparisons');mkdirSync(directory,{recursive:true});
try{
 for(const width of [375,1440])for(const section of ['inicio','resumen','section-semana','section-mensual','section-anual','section-comparison']){
  const page=await browser.newPage({viewport:{width:width===375?806:1540,height:900},deviceScaleFactor:1});
  const cells=[];
  for(const theme of ['light','dark'])for(const phase of ['before','after']){
   const image=readFileSync(path.join(evidence,phase,width+'-'+theme+'-'+section+'.jpg'));
   cells.push('<section><h2>'+(phase==='before'?'Antes · c365e1e':'Después')+' · '+(theme==='light'?'Claro':'Oscuro')+'</h2><img src="data:image/jpeg;base64,'+image.toString('base64')+'"></section>');
  }
  await page.setContent('<style>*{box-sizing:border-box}body{margin:16px;background:#eeece6;color:#212820;font:14px Arial}h1{font-size:20px}h2{font-size:14px}main{display:grid;grid-template-columns:1fr 1fr;gap:16px}img{width:100%;display:block;border:1px solid #c5c5be}</style><h1>'+titles[section]+' · '+width+' px · datos sintéticos</h1><main>'+cells.join('')+'</main>');
  await page.locator('img').evaluateAll(images=>Promise.all(images.map(image=>image.decode())));
  await page.locator('body').screenshot({path:path.join(directory,width+'-'+section+'.jpg'),quality:90});
  await page.close();
 }
}finally{await browser.close();}
