/** The actual kit body in a CSP sandbox, driven by body-host, with custom size and pack words. */
import { browserCheck } from './browser-runner.mjs';
const result=await browserCheck(page=>page.evaluate(async()=>{
  const {loadBody}=await import('/web/body-host.js');
  const m=await(await fetch('/web/dragon/figure.json')).json();
  const pack={...m,base:'/web/dragon/'};
  const errors=[];const bounds={W:1280,H:1000,floorY:950,S:.6};
  const body=await loadBody({layer:document.getElementById('sandbox'),pack,theme:'dark',bounds,
    start:{x:640,enter:'',skin:{figure:'dragon',scheme:'origin-n173-n125'},scheme:'origin-n173-n125'},
    onEvent(){},onSound(){},onError:e=>errors.push(e.message)});
  const assert=(v,msg)=>{if(!v)throw new Error(msg);};
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  for(let i=0;i<90;i++){body.tick(1/60);await sleep(1);}
  assert(body.layout?.box.w>0,'sandbox produced no layout');
  const normal=body.layout.box.h;
  await body.setScheme('origin-n100-n175');for(let i=0;i<5;i++){body.tick(1/60);await sleep(5);}
  assert(body.layout.box.h<normal*.7,'custom size did not reach sandbox');
  for(const word of ['happy','sad','angry','surprised','love','flustered','wave','walk','run','sit','sleep','stand']){
    body.do(word);for(let i=0;i<24;i++){body.tick(1/60);await sleep(1);}
  }
  assert(errors.length===0,errors.join('; '));
  const iframe=document.querySelector('#sandbox iframe');assert(iframe?.getAttribute('sandbox')==='allow-scripts','sandbox was bypassed');
  const layout=body.layout;body.dispose();assert(!document.querySelector('#sandbox iframe'),'sandbox leaked on dispose');
  return {sandbox:true,initialHeight:normal,layout,words:m.vocab.length,errors};
}));
console.log(result);console.log('ENTRY POINT OK');
