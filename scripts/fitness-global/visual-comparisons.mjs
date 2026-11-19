import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { repo, start } from './browser.mjs';

const dir = path.join(repo,'docs/evidence/visual-consistency');
const browser = await start();
const page = await browser.newPage({viewport:{width:802,height:880},deviceScaleFactor:1});
async function board(file, cells) {
  const articles = [];
  for (const [image, label, height] of cells) {
    const data = await readFile(path.join(dir,image));
    articles.push('<article><h2>'+label+'</h2><div style="height:'+height+'px"><img src="data:image/jpeg;base64,'+data.toString('base64')+'"></div></article>');
  }
  await page.setContent('<!doctype html><style>*{box-sizing:border-box}body{margin:0;color:#202620;font:14px system-ui}main{padding:14px;display:inline-grid;grid-template-columns:375px 375px;gap:12px 18px;background:#efeee8}h2{margin:0 0 5px;font-size:13px}article div{overflow:hidden;border-radius:4px}img{display:block;width:375px}</style><main>'+articles.join('')+'</main>');
  await page.locator('img').evaluateAll(images=>Promise.all(images.map(img=>img.decode())));
  await page.locator('main').screenshot({path:path.join(dir,file+'.jpg'),quality:90});
}
try {
  await board('titulos-375',['inicio','coach','datos','perfil'].flatMap((screen,i)=>
    ['light','dark'].map(theme=>['after/375-'+theme+'-'+screen+'.jpg',['Inicio','Coach','Datos','Perfil'][i]+' · '+(theme==='light'?'Claro':'Oscuro'),104])));
  await board('carga-375',['light','dark'].flatMap(theme=>['carga','inicio'].map(scene=>
    ['after/375-'+theme+'-'+scene+'.jpg',(scene==='carga'?'Carga':'Inicio cargado')+' · '+(theme==='light'?'Claro':'Oscuro'),812])));
  await board('separador-375',['light','dark'].flatMap(theme=>['before','after'].map(phase=>
    [phase+'/375-'+theme+'-limite-3-cerrado.jpg',(phase==='before'?'Antes':'Después')+' · '+(theme==='light'?'Claro':'Oscuro'),230])));
  const movie = await readFile(path.join(dir,'after/recorrido.webm'));
  const playback = await page.evaluate(async src => {
    const video = document.createElement('video');
    video.muted=true; video.src=src; video.playbackRate=3;
    document.body.replaceChildren(video);
    await video.play();
    await new Promise((resolve,reject)=>{video.onended=resolve;video.onerror=reject;});
    return {width:video.videoWidth,height:video.videoHeight,seconds:video.currentTime,frames:video.getVideoPlaybackQuality().totalVideoFrames};
  }, 'data:video/webm;base64,'+movie.toString('base64'));
  // The WebM encoder rounds an odd viewport width down to an even pixel.
  assert.ok([374,375].includes(playback.width) && playback.height===812 && playback.seconds>=6 && playback.frames>10,JSON.stringify(playback));
  await writeFile(path.join(dir,'after/video.json'),JSON.stringify(playback,null,2)+'\n');
  console.log(playback);
} finally { await browser.close(); }
