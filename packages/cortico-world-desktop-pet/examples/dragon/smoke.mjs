/** Real WebGL regression: artwork, motion, scaling, blink, floor and remount. */
import { browserCheck } from './browser-runner.mjs';
const result=await browserCheck(page=>page.evaluate(async()=>{
  const assert=(value,message)=>{if(!value)throw new Error(message);};
  const kit=await import('/web/kit/body.js');
  const {createDragonFigure}=await import('/web/dragon/figure.js');
  const {point,deformPoint,motionState}=await import('/web/dragon/motion.js');
  const base=new URL('/web/dragon/',location.href),model=await(await fetch(new URL('model.json',base))).json();
  const f=await createDragonFigure(base,{model,kit,scheme:'origin-s'}),host=document.getElementById('pet');
  const fc={eyes:[{shape:'ring',rx:16,ry:16},{shape:'ring',rx:16,ry:16}],gap:[40,40],blush:0};
  const frame=extra=>({t:0,face:'neutral',mode:'idle',look:[0,0],blink:0,eyeClose:0,sit:0,...extra});
  f.snapshot(host,fc,frame({still:true}),{res:1/model.poses.stand.S,frames:1});
  assert(f.canvas.width>0,'no canvas');
  const pixels=()=>{const c=document.createElement('canvas');c.width=f.canvas.width;c.height=f.canvas.height;const g=c.getContext('2d');g.drawImage(f.canvas,0,0);return {data:g.getImageData(0,0,c.width,c.height).data,w:c.width,h:c.height};};
  const at=(px,py,p= pixels())=>{const [x,y]=point(model.poses.stand,px,py),v=model.view;const X=Math.round((x-v[0])/(v[2]-v[0])*p.w),Y=Math.round((y-v[1])/(v[3]-v[1])*p.h);return [...p.data.slice((Y*p.w+X)*4,(Y*p.w+X)*4+4)];};
  const rest=pixels();assert(rest.data[3]===0,'background is not transparent');
  const original=await new Promise((ok,bad)=>{const im=new Image();im.onload=()=>ok(im);im.onerror=bad;im.src=new URL(model.poses.stand.source,base);});
  const source=document.createElement('canvas');source.width=1024;source.height=1536;const sg=source.getContext('2d');sg.drawImage(original,0,0);
  let maxColorError=0;
  for(const [x,y]of [[512,650],[512,900],[530,365],[510,1120],[650,1410]]){
    const actual=[0,0,0],expected=[0,0,0];
    // Compare local color means: GL's bilinear sampling may shift an outline by a fraction of a pixel.
    for(let dx=-5;dx<=5;dx++)for(let dy=-5;dy<=5;dy++){
      const a=at(x+dx,y+dy,rest),b=sg.getImageData(x+dx,y+dy,1,1).data;
      for(let i=0;i<3;i++){actual[i]+=a[i]/121;expected[i]+=b[i]/121;}
    }
    for(let i=0;i<3;i++)maxColorError=Math.max(maxColorError,Math.abs(actual[i]-expected[i]));
  }
  assert(maxColorError<12,`original RGB changed: ${maxColorError}`);
  const iris=p=>{let n=0;for(let x=484;x<=502;x+=2)for(let y=267;y<=279;y+=2){const c=at(x,y,p);if(c[2]-c[0]>28&&c[1]-c[0]>7)n++;}return n;};
  const open=iris(rest);f.draw(host,fc,frame({blink:1,still:true}));const shut=iris(pixels());
  assert(open>3,`open eye not visible: ${open}`);assert(shut<open*.75,`blink failed to cover iris: ${open}/${shut}`);
  const signature=extra=>{f.reset();f.draw(host,fc,frame({...extra,still:true}));return f.canvas.toDataURL();};
  const neutral=signature({});
  for(const face of ['happy','sad','angry','surprised','love','flustered'])assert(signature({face})!==neutral,`expression ${face} unchanged`);
  assert(signature({talk:1})!==neutral,'mouth does not respond to speech');
  const modes=['idle','walk','run','jump','air','crouch','land','drag','sit','sleep','dance','dizzy','turn','spin'];
  const faces=['neutral','happy','wink','love','shy','surprised','angry','sad','sleepy','thinking','smug','pout','worried','determined','flustered','scared','excited','cry','confused','sleep','listening','waking','dizzy'];
  let frames=0;
  for(const mode of modes)for(const face of faces)for(let i=0;i<40;i++){
    const fr=frame({t:frames++/60,mode,face,sit:['sit','sleep'].includes(mode)?1:0,blink:i===3?1:0,look:[Math.sin(i),Math.cos(i)]});
    f.draw(host,fc,fr);
    const st=motionState(fr);
    for(const x of [117,128,145])assert(deformPoint(x,256,st,false)[1]<=256.001,'standing shoe below floor');
  }
  for(const bad of [null,{}, {t:NaN,face:{},mode:undefined,look:null,blink:Infinity,sit:'bad',gesture:{kind:[],k:NaN}}])f.draw(host,null,bad);
  const ratio=(256-f.V(93))/(f.V(352)-f.V(93));assert(ratio>5.2&&ratio<5.8,`proportion changed: ${ratio}`);
  for(const name of ['stand','sit']){
    assert(Math.abs(point(model.poses[name],512,model.poses[name].feet)[1]-256)<1e-9,'shoe calibration changed');
  }
  const extent=f.extent,hit=f.hits[0];
  for(const percent of [25,118,132,150,173,200]){
    await f.setScheme(`origin-n${percent}`);const k=percent/100;
    assert(f.drawScale===k,'custom scale not applied');
    assert(Math.abs(f.hits[0][2]-hit[2]*k)<1e-8,'hit radius not scaled');
    assert(f.extent.every((v,i)=>Math.abs(v-((i%2?256:128)+(extent[i]-(i%2?256:128))*k))<1e-8),'extent not scaled');
    f.draw(host,fc,frame({}));
  }
  const other=await createDragonFigure(base,{model,kit,scheme:'origin-n173'});
  await f.setScheme('origin-xl');assert(other.drawScale===1.73&&f.drawScale===1.5,'instances share their scale');other.dispose();
  for(const invalid of ['n0','n201','nNaN']){await f.setScheme(`origin-${invalid}`);assert(f.drawScale===1.5,'invalid scale accepted');}
  f.dispose();assert(host.children.length===0,'dispose left canvas behind');f.draw(host,fc,frame({}));assert(host.children.length===1,'remount failed');f.dispose();
  return {frames,maxColorError,openIris:open,closedIris:shut,headRatio:ratio,customSizes:true,remount:true};
}));
console.log(result);console.log('ALL CHECKS PASSED');
