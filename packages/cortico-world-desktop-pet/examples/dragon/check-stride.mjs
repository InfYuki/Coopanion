/** Independent saved size/stride settings, rendered by the real figure and kit. */
import { browserCheck } from './browser-runner.mjs';
const result=await browserCheck(page=>page.evaluate(async()=>{
  const kit=await import('/web/kit/body.js');
  const {createDragonFigure}=await import('/web/dragon/figure.js');
  const base=new URL('/web/dragon/',location.href),host=document.getElementById('pet');
  const f=await createDragonFigure(base,{kit,scheme:'origin-n173-n25'});
  const assert=(v,msg)=>{if(!v)throw Error(msg);};
  const extent=JSON.stringify(f.extent),images=[];
  for(const percent of [25,200]){
    await f.setScheme(`origin-n173-n${percent}`);
    assert(f.drawScale===1.73&&f.strideScale===percent/100,'size and stride changed together');
    assert(JSON.stringify(f.extent)===extent,'stride changed figure extent');
    f.reset();images.push(f.snapshot(host,{}, {mode:'walk',phase:.2*Math.PI,t:0},{res:3,frames:30}).href);
  }
  assert(images[0]!==images[1],'stride did not change the rendered walk');
  await f.setScheme('origin-n173');assert(f.strideScale===1,'old size-only scheme did not default to normal stride');
  await f.setScheme('origin-s-long');assert(f.drawScale===1&&f.strideScale===1.5,'preset stride failed');
  const other=await createDragonFigure(base,{kit,scheme:'origin-xl-short'});
  assert(other.drawScale===1.5&&other.strideScale===.5,'second instance settings failed');
  assert(f.drawScale===1&&f.strideScale===1.5,'instances shared settings');
  await f.setScheme('origin');assert(f.drawScale===1.32&&f.strideScale===1,'default preset did not restore size and stride');
  f.dispose();other.dispose();return {customStride:true,legacyScheme:true,independentSize:true,independentInstances:true};
}));
console.log(result);console.log('STRIDE SETTINGS OK');
