// Sample computed solid colors at the text position, including ancestor opacity.
export async function measureControl(locator) {
  return locator.evaluate(el => {
    const canvas = document.createElement('canvas').getContext('2d');
    function rgba(color) {
      canvas.clearRect(0,0,1,1);
      canvas.fillStyle = color;
      canvas.fillRect(0,0,1,1);
      const [r,g,b,a] = canvas.getImageData(0,0,1,1).data;
      return [r/255,g/255,b/255,a/255];
    }
    function over(top,bottom) {
      const alpha = top[3]+bottom[3]*(1-top[3]);
      return [...top.slice(0,3).map((v,i)=>alpha ? (v*top[3]+bottom[i]*bottom[3]*(1-top[3]))/alpha : 0),alpha];
    }
    function composite(pixel) {
      for(let n=el;n;n=n.parentElement) {
        const style = getComputedStyle(n);
        pixel = over(pixel,rgba(style.backgroundColor));
        pixel[3] *= Number(style.opacity);
        // A native modal paints in the top layer above the inert app shell.
        if(n.matches(':modal')) break;
      }
      return over(pixel,[1,1,1,1]).slice(0,3);
    }
    function lum(rgb) {
      const c = rgb.map(v=>v<=0.04045 ? v/12.92 : ((v+0.055)/1.055)**2.4);
      return c[0]*0.2126+c[1]*0.7152+c[2]*0.0722;
    }
    const s=getComputedStyle(el);
    const fg=composite(rgba(s.color)), bg=composite([0,0,0,0]);
    const [lo,hi]=[lum(fg),lum(bg)].sort((a,b)=>a-b);
    const hex=rgb=>'#'+rgb.map(x=>Math.round(x*255).toString(16).padStart(2,'0')).join('');
    return {foreground:hex(fg),background:hex(bg),contrast:+((hi+0.05)/(lo+0.05)).toFixed(2),
      opacity:Number(s.opacity),outline:s.outlineStyle+' '+s.outlineWidth+' '+s.outlineColor};
  });
}
