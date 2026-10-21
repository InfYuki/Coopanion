/** Render the skirt/leg overlap through complete walking and running cycles. */
import { browserCheck } from './browser-runner.mjs';
const result=await browserCheck(page=>page.evaluate(async()=>{
  const kit=await import('/web/kit/body.js');
  const {createDragonFigure}=await import('/web/dragon/figure.js');
  const {point}=await import('/web/dragon/motion.js');
  const base=new URL('/web/dragon/',location.href),model=await(await fetch(new URL('model.json',base))).json();
  const figure=await createDragonFigure(base,{model,kit,scheme:'origin-s'}),host=document.getElementById('pet');
  figure.snapshot(host,{}, {mode:'idle',still:true,t:0},{res:1/model.poses.stand.S,frames:1});
  const c=document.createElement('canvas');c.width=figure.canvas.width;c.height=figure.canvas.height;
  const ctx=c.getContext('2d',{willReadFrequently:true});
  const capture=()=>{ctx.clearRect(0,0,c.width,c.height);ctx.drawImage(figure.canvas,0,0);return ctx.getImageData(0,0,c.width,c.height).data;};
  const index=(x,y)=>{
    const p=point(model.poses.stand,x,y),v=model.view;
    return (Math.round((p[1]-v[1])/(v[3]-v[1])*c.height)*c.width+Math.round((p[0]-v[0])/(v[2]-v[0])*c.width))*4+3;
  };
  const rest=capture(),samples=[];
  for(let y=992;y<=1080;y+=4)for(let x=475;x<=615;x+=4){const i=index(x,y);if(rest[i]>250)samples.push({x,y});}
  let minimum=255,frames=0;
  for(const mode of ['walk','run'])for(let n=0;n<60;n++){
    for(let j=0;j<2;j++)figure.draw(host,{}, {mode,t:frames++/60,phase:n/60*2*Math.PI,face:'neutral'});
    c.width=figure.canvas.width;c.height=figure.canvas.height;
    const pixels=capture();
    for(const {x,y}of samples){
      const alpha=pixels[index(x,y)];minimum=Math.min(minimum,alpha);
      if(alpha<245)throw Error(`${mode} skirt opening at source (${x},${y}), phase ${n}/60: alpha=${alpha}`);
    }
  }
  figure.dispose();return {frames,samples:samples.length,minimumAlpha:minimum};
}));
console.log(result);console.log('SKIRT OVERLAP OK');
