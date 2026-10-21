/** Exercise the real kit controller, including its foot smoothing and phase handoff. */
import { browserCheck } from './browser-runner.mjs';
const result=await browserCheck(page=>page.evaluate(async()=>{
  const {createPet}=await import('/web/kit/body.js');
  const {motionState,solveLeg}=await import('/web/dragon/motion.js');
  const model=await(await fetch('/web/dragon/model.json')).json();
  const assert=(v,msg)=>{if(!v)throw Error(msg);};
  const ns='http://www.w3.org/2000/svg',results=[];
  for(const mode of ['walk','run'])for(const gait of [undefined,'biped']){
    const svg=document.createElementNS(ns,'svg');document.body.append(svg);
    const [petG,shadowEl,fxG]=['g','ellipse','g'].map(tag=>svg.appendChild(document.createElementNS(ns,tag)));
    let frame;
    const ctl=createPet({petG,shadowEl,fxG},{figure:{gait,draw:(host,fc,f)=>frame=f},
      bounds:()=>({W:10000,H:1000,floorY:950,S:1}),startX:500,enter:'',roam:'off',sfx:{play(){}}});
    ctl.walkTo(9000,mode==='run','gait-check');
    let airborne=0;
    for(let i=0;i<600;i++){
      ctl.step(1/120);ctl.render();
      assert(frame.phase===ctl.pet.phase,'figure received a different phase');
      if(gait&&i>120){
        const st=motionState(frame);
        if(st.feet.every(f=>!f.planted))airborne++;
        for(const leg of model.legs){
          const p=solveLeg(leg,model.poses.stand,st);
          assert(!p.clamped,'actual kit step exceeded leg reach');
          assert(p.A.every(Number.isFinite),'non-finite ankle');
        }
      }
    }
    if(gait)assert((airborne>0)===(mode==='run'),'incorrect stance/flight intervals');
    results.push({mode,gait:gait??'default',speed:ctl.pet.speed,cycles:ctl.pet.phase/(2*Math.PI),airborne});
    svg.remove();
  }
  for(const mode of ['walk','run']){
    const [regular,biped]=results.filter(r=>r.mode===mode);
    assert(biped.speed<regular.speed,'biped travel was not slowed');
    assert(biped.cycles<regular.cycles,'biped cadence was not slowed');
  }
  return results;
}));
console.log(result);console.log('KIT GAIT OK');
