/** Match the completed thigh width and inspect the standing hem over a breathing cycle. */
import { browserCheck } from './browser-runner.mjs';
const result=await browserCheck(page=>page.evaluate(async()=>{
  const kit=await import('/web/kit/body.js'),{createDragonFigure}=await import('/web/dragon/figure.js');
  const {point,deformPoint,motionState}=await import('/web/dragon/motion.js');
  const textures={},recordingKit={...kit,createRig(...args){
    const rig=kit.createRig(...args),upload=rig.upload;
    rig.upload=(id,texture)=>{textures[id]=texture;return upload.call(rig,id,texture);};return rig;
  }};
  const base=new URL('/web/dragon/',location.href),model=await(await fetch(new URL('model.json',base))).json();
  const figure=await createDragonFigure(base,{model,kit:recordingKit,scheme:'origin-s'}),host=document.getElementById('pet');
  figure.draw(host,{}, {mode:'idle',t:0});
  const pixels=id=>textures[id].getContext('2d').getImageData(0,0,1024,1536).data;
  const near=pixels('nearLeg'),far=pixels('farLeg'),fill=model.legs[1].thighFill;
  const width=(data,y)=>{let left=1024,right=-1;for(let x=0;x<1024;x++)if(data[(y*1024+x)*4+3]>=200){left=Math.min(left,x);right=x;}return right-left+1;};
  let widthError=0;
  for(let y=1000;y<=fill.fullUntil;y++){
    const error=Math.abs(width(near,y+fill.rowOffset)-width(far,y));widthError=Math.max(widthError,error);
    if(error>1)throw Error(`Unequal thigh width at row ${y}: ${error}px`);
  }
  const rawModel=structuredClone(model);delete rawModel.legs[1].thighFill;
  const rawHost=host.parentNode.appendChild(document.createElementNS('http://www.w3.org/2000/svg','g'));
  const rawFigure=await createDragonFigure(base,{model:rawModel,kit:recordingKit,scheme:'origin-s'});
  rawFigure.draw(rawHost,{}, {mode:'idle',t:0});const raw=pixels('farLeg');rawFigure.dispose();rawHost.remove();
  let colorDifference=0;
  for(let y=1000;y<=fill.fullUntil;y++){
    let oldLeft=1024,newLeft=1024,right=-1;
    for(let x=0;x<1024;x++){
      if(raw[(y*1024+x)*4+3]>=200){oldLeft=Math.min(oldLeft,x);right=x;}
      if(far[(y*1024+x)*4+3]>=200)newLeft=Math.min(newLeft,x);
    }
    if(oldLeft-newLeft<8)continue;
    for(let channel=0;channel<3;channel++){
      let added=0,original=0,a=0,b=0;
      for(let x=newLeft+3;x<oldLeft;x++){added+=far[(y*1024+x)*4+channel];a++;}
      for(let x=oldLeft+6;x<=Math.min(oldLeft+24,right-3);x++){original+=raw[(y*1024+x)*4+channel];b++;}
      const delta=Math.abs(added/a-original/b);colorDifference=Math.max(colorDifference,delta);
      if(delta>12)throw Error(`Thigh colour discontinuity at row ${y}: ${delta}`);
    }
  }
  const c=document.createElement('canvas'),ctx=c.getContext('2d',{willReadFrequently:true});
  let minimumAlpha=255,darkPixels=0;
  for(let i=0;i<240;i++){
    const frame={mode:'idle',t:i/60,face:'neutral',look:[0,0]};
    figure.snapshot(host,{},frame,{res:5,frames:1});
    c.width=figure.canvas.width;c.height=figure.canvas.height;ctx.drawImage(figure.canvas,0,0);
    const data=ctx.getImageData(0,0,c.width,c.height).data,st=motionState(frame),v=model.view;
    for(let y=974;y<=1004;y+=2)for(let x=480;x<=540;x+=2){
      const p=deformPoint(...point(model.poses.stand,x,y),st);
      const X=Math.round((p[0]-v[0])/(v[2]-v[0])*c.width),Y=Math.round((p[1]-v[1])/(v[3]-v[1])*c.height),j=(Y*c.width+X)*4;
      minimumAlpha=Math.min(minimumAlpha,data[j+3]);
      if(data[j+3]>128&&Math.max(data[j],data[j+1],data[j+2])<120)darkPixels++;
    }
  }
  if(minimumAlpha<245||darkPixels)throw Error(`Standing seam: alpha=${minimumAlpha}, dark=${darkPixels}`);
  figure.dispose();return {thighWidthError:widthError,colorDifference,idleFrames:240,minimumAlpha,darkPixels};
}));
console.log(result);console.log('THIGH + IDLE SEAM OK');
