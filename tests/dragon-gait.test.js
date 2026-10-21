import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { gaitSample, motionState, solveLeg, skinLegPoint, strideScale } from '../packages/cortico-world-desktop-pet/web/dragon/motion.js';
const model=JSON.parse(readFileSync(new URL('../packages/cortico-world-desktop-pet/web/dragon/model.json',import.meta.url),'utf8'));
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const direction=(a,b)=>Math.atan2(b[1]-a[1],b[0]-a[0]);

describe('dragon walking and running legs',()=>{
  it('scales stride horizontally while retaining lift, bone lengths and shoe shape',()=>{
    for(const value of [25,50,100,150,200])for(const mode of ['walk','run'])for(let i=0;i<60;i++){
      const frame={mode,t:0,phase:i/60*2*Math.PI},normal=motionState(frame);
      const st=motionState({...frame,strideScale:strideScale(`n${value}`)});
      for(const index of [0,1]){
        expect(st.feet[index].dx).toBeCloseTo(normal.feet[index].dx*value/100,8);
        expect(st.feet[index].lift).toBe(normal.feet[index].lift);
      }
      for(const leg of model.legs){
        const p=solveLeg(leg,model.poses.stand,st);
        expect(p.clamped).toBe(false);
        expect(distance(p.H,p.K)).toBeCloseTo(distance(p.hip,p.knee),6);
        expect(distance(p.K,p.A)).toBeCloseTo(distance(p.knee,p.ankle),6);
      }
    }
  });
  it('keeps bones and shoes intact while knees flex on the forward branch',()=>{
    for(const mode of ['walk','run'])for(let i=0;i<120;i++){
      const st=motionState({mode,t:0,phase:i/120*2*Math.PI});
      for(const leg of model.legs){
        const p=solveLeg(leg,model.poses.stand,st);
        expect(distance(p.H,p.K)).toBeCloseTo(distance(p.hip,p.knee),6);
        expect(distance(p.K,p.A)).toBeCloseTo(distance(p.knee,p.ankle),6);
        expect(p.A[1]).toBeLessThanOrEqual(p.ankle[1]);
        const axis=direction(p.hip,p.ankle);
        const upper=direction(p.H,p.K)-(2*axis-direction(p.hip,p.knee));
        const lower=direction(p.K,p.A)-(2*axis-direction(p.knee,p.ankle));
        expect(Math.abs(upper)).toBeLessThan(10*Math.PI/180);
        expect(Math.abs(lower)).toBeLessThan(10*Math.PI/180);
        expect(p.clamped).toBe(false);
        const cross=(h,k,a)=>(a[0]-h[0])*(k[1]-h[1])-(a[1]-h[1])*(k[0]-h[0]);
        expect(cross(p.H,p.K,p.A)*cross(p.hip,p.knee,p.ankle)).toBeLessThan(0);
        const left=[p.ankle[0]-10,p.ankle[1]+5],right=[p.ankle[0]+15,p.ankle[1]+12];
        expect(distance(skinLegPoint(...left,p),skinLegPoint(...right,p))).toBeCloseTo(distance(left,right),8);
      }
    }
  });
  it('keeps the leg mesh locally upright without strong stretching at knees or ankles',()=>{
    for(const mode of ['walk','run'])for(let i=0;i<60;i++)for(const leg of model.legs){
      const p=solveLeg(leg,model.poses.stand,motionState({mode,t:0,phase:i/60*2*Math.PI}));
      for(let y=p.hip[1];y<p.ankle[1]+15;y+=2)for(let x=p.knee[0]-8;x<p.knee[0]+8;x+=4){
        const a=skinLegPoint(x,y,p),b=skinLegPoint(x+1,y,p),c=skinLegPoint(x,y+1,p);
        for(const d of [distance(a,b),distance(a,c)]){
          expect(d).toBeGreaterThan(.9);expect(d).toBeLessThan(1.1);
        }
        expect((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])).toBeGreaterThan(.9);
      }
    }
  });
  it('uses engine foot positions rather than a separate animation clock',()=>{
    const legs=[[104,212,111,238],[150,212,143,241]];
    const a=motionState({mode:'walk',t:0,legs}),b=motionState({mode:'walk',t:123,legs});
    expect(a.feet).toEqual(b.feet);
    expect(a.feet[0].dx).toBeGreaterThan(0);
    expect(a.feet[1].dx).toBeLessThan(0);
    expect(a.feet[1].lift).toBe(0);
  });
  it('has a planted foot throughout walking and a flight interval during running',()=>{
    for(const run of [false,true]){
      let airborne=0;
      for(let i=0;i<240;i++){
        const ph=i/240*2*Math.PI,feet=[0,1].map(j=>gaitSample(ph,j,run,run?12:7,run?10:5));
        if(feet.every(p=>!p.planted))airborne++;
        for(const f of feet)if(f.planted)expect(f.lift).toBe(0);
        const next=motionState({mode:run?'run':'walk',phase:ph+.0001,t:0});
        const st=motionState({mode:run?'run':'walk',phase:ph,t:0});
        expect(Math.abs(next.bob-st.bob)).toBeLessThan(.001);
        for(const leg of model.legs){
          const p=solveLeg(leg,model.poses.stand,st),q=solveLeg(leg,model.poses.stand,next);
          expect(distance(p.K,q.K)).toBeLessThan(.02);
          expect(distance(p.A,q.A)).toBeLessThan(.02);
        }
      }
      expect(airborne>0).toBe(run);
    }
  });
});
