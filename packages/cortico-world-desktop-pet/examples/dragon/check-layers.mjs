/** Actual uploaded pixels must keep skin in the leg layers and skirt cloth behind them. */
import { browserCheck } from './browser-runner.mjs';
const result=await browserCheck(page=>page.evaluate(async()=>{
  const kit=await import('/web/kit/body.js'),{createDragonFigure}=await import('/web/dragon/figure.js');
  const textures={};
  const recordingKit={...kit,createRig(...args){
    const rig=kit.createRig(...args),upload=rig.upload;
    rig.upload=(id,texture)=>{textures[id]=texture;return upload.call(rig,id,texture);};return rig;
  }};
  const figure=await createDragonFigure(new URL('/web/dragon/',location.href),{kit:recordingKit,scheme:'origin-s'});
  figure.draw(document.getElementById('pet'),{}, {mode:'idle',still:true,t:0});
  const data=id=>textures[id].getContext('2d').getImageData(0,0,1024,1536).data;
  const front=data('stand'),rear=data('skirt'),near=data('nearLeg'),far=data('farLeg');
  const warm=(p,i)=>p[i+3]>128&&p[i]>p[i+2]+1&&p[i]>p[i+1]+1;
  let stationarySkin=0,backSkin=0;
  for(let y=1005;y<=1310;y++)for(let x=475;x<=615;x++){
    const i=(y*1024+x)*4;if(warm(front,i))stationarySkin++;if(warm(rear,i))backSkin++;
  }
  if(stationarySkin||backSkin)throw Error(`Skin left in stationary layers: front=${stationarySkin}, rear=${backSkin}`);
  for(const leg of [near,far])for(let y=1010;y<1310;y+=5){
    let left=1024,right=-1;
    for(let x=400;x<650;x++)if(leg[(y*1024+x)*4+3]>250){left=Math.min(left,x);right=x;}
    if(right<left)throw Error(`Missing leg row ${y}`);
    for(let x=left;x<=right;x++)if(leg[(y*1024+x)*4+3]<200)throw Error(`Split leg outline at (${x},${y})`);
  }
  for(const [x,y]of [[590,1050],[585,1080],[575,1150],[570,1250]]){
    const i=(y*1024+x)*4;
    if(far[i+3]<250||front[i+3]>0||near[i+3]>0)throw Error(`Far leg ownership/occlusion at (${x},${y})`);
  }
  figure.dispose();return {stationarySkin,backSkin,farLegOwnership:true};
}));
console.log(result);console.log('LEG LAYERS OK');
