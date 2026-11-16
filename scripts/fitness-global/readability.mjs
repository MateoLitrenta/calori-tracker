import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { go, open, start, evidence } from './browser.mjs';

// Computed text and painted solid ancestor colors. The test deliberately
// chooses solid surfaces; gradients/selection underlays require a visual check.
const selectors={
  Inicio:['.energy-number','.fitness-readout h4','.home-date-context time'],
  Coach:['.chat-heading h2','.chat-heading-title p','.chat-proactive-title','.chat-proactive-action'],
  Datos:['.charts-heading h1','.charts-range','.charts-summary dt','.charts-coverage','.charts-secondary'],
  Perfil:['.profile-page-title','#profile-name','.profile-facts dt','.profile-facts dd','.profile-muted','.profile-button-neutral'],
};
const results=[];
const browser=await start();
try {
  for(const theme of ['light','dark']) {
    const {context,page}=await open(browser,375,theme,theme);
    for(const [tab,samples] of Object.entries(selectors)){
      await go(page,tab);
      const rows=await page.evaluate(samples=>{
        const ctx=document.createElement('canvas').getContext('2d',{willReadFrequently:true});
        const rgba=color=>{
          ctx.clearRect(0,0,1,1);
          ctx.fillStyle=color;ctx.fillRect(0,0,1,1);
          const [r,g,b,a]=ctx.getImageData(0,0,1,1).data;
          return [r,g,b,a/255];
        };
        const mix=(fg,bg)=>[0,1,2].map(i=>fg[i]*fg[3]+bg[i]*(1-fg[3]));
        const luminance=rgb=>rgb.map(c=>c/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4)
          .reduce((sum,c,i)=>sum+c*[.2126,.7152,.0722][i],0);
        return samples.flatMap(selector=>{
          const el=Array.from(document.querySelectorAll(selector)).find(e=>e.checkVisibility()&&e.getBoundingClientRect().width>0);
          if(!el)return [];
          const style=getComputedStyle(el), stack=[];
          let node=el;
          while(node) {
            const css=getComputedStyle(node);
            const bg=rgba(css.backgroundColor);
            if(css.backgroundImage!=='none')throw Error('Sample above non-solid paint: '+selector);
            stack.push(bg);
            if(bg[3]===1)break;
            node=node.parentElement;
          }
          const bg=stack.reverse().reduce((base,color)=>mix(color,base),[255,255,255]);
          const fg=mix(rgba(style.color),bg);
          const lum=[luminance(bg),luminance(fg)].sort((a,b)=>a-b);
          const ratio=(lum[1]+.05)/(lum[0]+.05);
          const px=parseFloat(style.fontSize), bold=parseInt(style.fontWeight)>=700;
          return [{selector,text:el.textContent.trim().slice(0,45),foreground:fg.map(Math.round),background:bg.map(Math.round),
            fontSize:px,ratio:Number(ratio.toFixed(2)),minimum:px>=24||(px>=18.67&&bold)?3:4.5}];
        });
      },samples);
      assert.ok(rows.length>=2,'Insufficient on-screen samples for '+tab);
      results.push(...rows.map(row=>({theme,tab,...row})));
    }
    await context.close();
  }
}finally{
  await browser.close();
  writeFileSync(path.join(evidence,'contrast.json'),JSON.stringify(results,null,2)+'\n');
}
const failed=results.filter(row=>row.ratio<row.minimum);
console.log(results.length,'text samples;',failed.length,'failures');
assert.deepEqual(failed,[]);
