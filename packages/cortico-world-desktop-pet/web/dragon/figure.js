/** Original-resolution standing/sitting artwork on continuous meshes, with local expression patches. */
import { clamp, deformPoint, motionState, point, poseBox, sizeScale, strideScale, SIZES, solveLeg, skinLegPoint } from './motion.js';
const SVG = 'http://www.w3.org/2000/svg', HTML = 'http://www.w3.org/1999/xhtml';
const finite = (n, d = 0) => Number.isFinite(n) ? n : d;
const faceIndex = { happy: 2, love: 7, shy: 0, surprised: 5, angry: 4, sad: 3, sleepy: 1,
  thinking: 0, smug: 0, pout: 4, worried: 3, determined: 4, flustered: 6, scared: 5,
  excited: 5, cry: 3, confused: 5, sleep: 1, dizzy: 6, listening: 0, waking: 0 };
const nearArmPath = [[432,440],[474,463],[486,520],[511,598],[547,677],[570,724],[561,768],
  [542,792],[538,824],[523,871],[497,882],[474,863],[463,831],[435,812],[410,781],
  [393,748],[388,706],[391,657],[401,586],[413,506]];
function canvas(w, h) {
  const c = document.createElementNS(HTML, 'canvas'); c.width = w; c.height = h; return c;
}
function polygon(ctx, points) {
  ctx.beginPath(); points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath();
}
/** Keep original RGB; the generated image supplies alpha only. */
function originalTexture(source, alpha, armFree = false) {
  const c = canvas(source.width, source.height), g = c.getContext('2d');
  g.drawImage(source, 0, 0); g.globalCompositeOperation = 'destination-in'; g.drawImage(alpha, 0, 0, c.width, c.height);
  if (armFree) { g.globalCompositeOperation = 'destination-out'; polygon(g, nearArmPath); g.fill(); }
  return c;
}
/** Partition the original pixels once, with the near shoe retaining overlap ownership. */
function splitLegs(texture, legs) {
  const {width:w,height:h}=texture, source=texture.getContext('2d').getImageData(0,0,w,h);
  const masks=legs.map(leg=>{
    const c=canvas(w,h),g=c.getContext('2d');polygon(g,leg.mask);g.fill();
    const seed=g.getImageData(0,0,w,h).data;
    g.lineJoin='round';g.lineWidth=12;g.stroke();
    const shoeMask=g.getImageData(0,0,w,h).data;
    g.lineJoin='round';g.lineWidth=28;g.stroke();
    const mask=g.getImageData(0,0,w,h).data;
    for(let y=leg.ankle[1]-60;y<h;y++)for(let x=0;x<w;x++)mask[(y*w+x)*4+3]=shoeMask[(y*w+x)*4+3];
    return {seed,mask};
  });
  for(const [legIndex,leg]of legs.entries()){
    const {mask}=masks[legIndex];
    // Skin row spans include the fine cool-coloured outline, while skirt cloth stays out of the leg.
    for(let y=0;y<leg.ankle[1]-60;y++){
      let nearRight=-1,farLeft=w;
      for(let x=0;x<w;x++){
        const i=(y*w+x)*4+3;
        if(masks[0].seed[i]>=128)nearRight=x;
        if(masks[1].seed[i]>=128)farLeft=Math.min(farLeft,x);
      }
      const divide=nearRight>=0&&farLeft<w?(nearRight+farLeft)/2:Infinity;
      let left=w,right=-1;
      for(let x=0;x<w;x++){
        const i=(y*w+x)*4,p=source.data;
        const owns=legIndex===0?x<=divide:x>divide;
        if(owns&&mask[i+3]>=128&&p[i+3]>0&&p[i]>p[i+2]+1&&p[i]>p[i+1]+1){left=Math.min(left,x);right=x;}
      }
      for(let x=0;x<w;x++)if(x<left-2||x>right+2||right<0)mask[(y*w+x)*4+3]=0;
    }
  }
  const data=legs.map(()=>new ImageData(w,h));
  for(let i=0;i<source.data.length;i+=4) {
    const owner=masks.findIndex(({mask})=>mask[i+3]>=128);
    if(owner<0)continue;
    data[owner].data.set(source.data.subarray(i,i+4),i);source.data[i+3]=0;
  }
  texture.getContext('2d').putImageData(source,0,0);
  return Object.fromEntries(legs.map((leg,i)=>{const c=canvas(w,h);c.getContext('2d').putImageData(data[i],0,0);return [leg.id,c];}));
}
function cutRegion(texture, points) {
  const {width:w,height:h}=texture,c=canvas(w,h),g=c.getContext('2d');
  polygon(g,points);g.fill();
  const mask=g.getImageData(0,0,w,h).data,source=texture.getContext('2d').getImageData(0,0,w,h),part=new ImageData(w,h);
  for(let i=0;i<mask.length;i+=4)if(mask[i+3]>=128){part.data.set(source.data.subarray(i,i+4),i);source.data[i+3]=0;}
  texture.getContext('2d').putImageData(source,0,0);g.putImageData(part,0,0);return c;
}
function completeThigh(textures,leg) {
  const fill=leg.thighFill,w=1024,h=1536;
  const reference=textures[fill.reference].getContext('2d').getImageData(0,0,w,h).data;
  const g=textures[leg.id].getContext('2d'),image=g.getImageData(0,0,w,h),original=image.data.slice();
  const span=(data,y)=>{
    let left=w,right=-1;
    for(let x=0;x<w;x++)if(data[(y*w+x)*4+3]>=200){left=Math.min(left,x);right=x;}
    return [left,right];
  };
  for(let y=fill.top;y<fill.fadeUntil;y++){
    const [left,right]=span(original,y),[refLeft,refRight]=span(reference,y+fill.rowOffset);
    if(right<left||refRight<refLeft)continue;
    const k=clamp((fill.fadeUntil-y)/(fill.fadeUntil-fill.fullUntil),0,1);
    const width=Math.max(right-left+1,Math.round((right-left+1)+(refRight-refLeft-right+left)*k));
    if(width<=right-left+1)continue;
    const start=right-width+1;
    for(let x=start;x<Math.min(left+12,right+1);x++){
      const sample=refLeft+Math.round(clamp((x-start)/(width-1),0,1)*(refRight-refLeft));
      const i=(y*w+x)*4,j=((y+fill.rowOffset)*w+sample)*4;
      const edge=x-start;
      const ownSample=clamp(edge<3?right-edge:Math.min(left+8+Math.max(0,left-x-3),right-4),left,right);
      const own=(y*w+ownSample)*4,blend=x<=left+2?1:clamp((left+12-x)/10,0,1);
      // Match the outline's width, but extend the far leg's own lighting and skin tone.
      for(let channel=0;channel<3;channel++)image.data[i+channel]=Math.round(original[own+channel]*blend+original[i+channel]*(1-blend));
      image.data[i+3]=Math.round(reference[j+3]*blend+original[i+3]*(1-blend));
    }
  }
  g.putImageData(image,0,0);
}
function imageLoader(url) {
  return new Promise((resolve, reject) => {
    const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => resolve(im);
    im.onerror = () => reject(new Error(`Dragon texture failed: ${url}`)); im.src = String(url);
  });
}
function eyeTransform(from, to) {
  const [a, b] = from, [p, q] = to;
  const x = b[0] - a[0], y = b[1] - a[1], X = q[0] - p[0], Y = q[1] - p[1];
  const den = x*x + y*y, r = (X*x + Y*y) / den, s = (Y*x - X*y) / den;
  return [r, s, -s, r, p[0] - r*a[0] + s*a[1], p[1] - s*a[0] - r*a[1]];
}
export async function createDragonFigure(base = new URL('./', import.meta.url), opts = {}) {
  const model = opts.model ?? await (await fetch(new URL('model.json', base))).json();
  const load = opts.loadImage ?? imageLoader, asset = opts.asset ?? (p => new URL(p, base));
  const paths = [...new Set([...Object.values(model.poses).flatMap(p => [p.source, p.alpha]), ...Object.values(model.atlas)])];
  const loaded = Object.fromEntries(await Promise.all(paths.map(async p => [p, await load(asset(p))])));
  const makeRig = opts.kit?.createRig ?? opts.createRig ?? (await import(new URL('/web/kit/rig.js', base))).createRig;
  const textures = {};
  for (const [name, pose] of Object.entries(model.poses)) textures[name] = originalTexture(loaded[pose.source], loaded[pose.alpha]);
  textures.rest=canvas(1024,1536);textures.rest.getContext('2d').drawImage(textures.stand,0,0);
  textures['rest@mix']=originalTexture(loaded[model.poses.stand.source],loaded[model.poses.stand.alpha],true);
  Object.assign(textures,splitLegs(textures.stand,model.legs));
  for(const leg of model.legs)if(leg.thighFill)completeThigh(textures,leg);
  const backSkirt=cutRegion(textures.stand,model.backSkirtMask);
  textures['stand@mix'] = canvas(1024,1536);
  const armFree=textures['stand@mix'].getContext('2d');armFree.drawImage(textures.stand,0,0);
  armFree.globalCompositeOperation='destination-out';polygon(armFree,nearArmPath);armFree.fill();
  textures.parts = loaded[model.atlas.parts];
  for(const leg of model.legs)if(leg.shoeFill){
    const c=canvas(1024,1536),g=c.getContext('2d'),fill=leg.shoeFill;
    g.save();
    g.beginPath();g.ellipse(...fill.ellipse,0,0,Math.PI*2);g.clip();
    g.drawImage(textures.parts,...fill.atlasBox,...fill.targetBox);g.restore();
    const mask=canvas(1024,1536),mg=mask.getContext('2d');polygon(mg,model.legs[0].mask);mg.fill();mg.lineWidth=12;mg.lineJoin='round';mg.stroke();
    g.globalCompositeOperation='destination-in';g.drawImage(mask,0,0);g.globalCompositeOperation='source-over';
    g.drawImage(textures[leg.id],0,0);textures[leg.id]=c;
  }
  // Restore the rear skirt hidden by the source legs, behind both animated legs.
  const skirt=canvas(1024,1536),skirtCtx=skirt.getContext('2d');
  skirtCtx.save();polygon(skirtCtx,model.skirtFill.mask);skirtCtx.clip();
  skirtCtx.drawImage(loaded[model.atlas.torso],...model.skirtFill.sourceBox,...model.skirtFill.targetBox);skirtCtx.restore();
  const skirtMask=canvas(1024,1536),skirtMaskCtx=skirtMask.getContext('2d');
  for(const leg of model.legs)skirtMaskCtx.drawImage(textures[leg.id],0,0);
  skirtCtx.globalCompositeOperation='destination-in';skirtCtx.drawImage(skirtMask,0,0);
  skirtCtx.globalCompositeOperation='source-over';skirtCtx.drawImage(backSkirt,0,0);
  textures.skirt=skirt;
  const fill = canvas(1024,1536), fillCtx = fill.getContext('2d');
  fillCtx.save(); polygon(fillCtx,nearArmPath); fillCtx.clip();
  fillCtx.drawImage(textures.parts,0,0,512,512,-68,45,768,768);
  fillCtx.drawImage(loaded[model.atlas.torso],0,0,1024,1536); fillCtx.restore();
  textures.torso = fill;
  const patches = {};
  const patchRect = [437, 211, 184, 144];
  for (const name of ['stand', 'sit']) { patches[name] = canvas(patchRect[2], patchRect[3]); textures[`${name}Face`] = patches[name]; }
  const alphaMask = canvas(patchRect[2], patchRect[3]);
  let scale = sizeScale(String(opts.scheme ?? '').split('-')[1]) ?? SIZES.lg;
  let stride = strideScale(String(opts.scheme ?? '').split('-')[2]) ?? 1;
  let mountRoot = null, foreign = null, cv = null, rig = null, lastT = null, poseMix = 0, gaitMix = 0, patchKey = '';
  let state = motionState();
  let snapshotResolution = 0;
  const scaled = ([x, y]) => [128 + (x - 128) * scale, 256 + (y - 256) * scale];
  const scaledRect = rect => [...scaled(rect.slice(0, 2)), ...scaled(rect.slice(2, 4))];
  const fullBox = poseBox(model.poses.stand);
  const armBox = [...point(model.poses.stand, ...model.nearArm.sourceBox.slice(0,2)), ...model.nearArm.sourceBox.slice(2).map(n => n*model.poses.stand.S)];
  function layoutModel() {
    const deformers = {
      root: { kind: 'rot', pivot: [128, 256] },
      stand: { kind: 'warp', parent: 'root', rect: model.view },
      sit: { kind: 'warp', parent: 'root', rect: model.view },
      arm: { kind: 'rot', parent: 'stand', pivot: point(model.poses.stand, ...model.nearArm.pivot) },
    };
    for(const leg of model.legs)deformers[leg.id]={kind:'warp',parent:'root',rect:model.view};
    const parts = [
      { id: 'torso', tex: 'torso', box: fullBox, grid: [12,24], parent: 'stand', z: -1 },
      { id: 'skirt', tex: 'skirt', box: fullBox, grid: [24,40], parent: 'stand', z: -.3 },
      { id: 'stand', tex: 'stand', box: fullBox, grid: [24,40], parent: 'stand', z: 0 },
      { id: 'rest', tex: 'rest', box: fullBox, grid: [24,40], parent: 'stand', z: .1 },
      { id: 'arm', tex: 'parts', box: armBox, uvBox: model.nearArm.uv, grid: [8,14], parent: 'arm', z: 1 },
      { id: 'sit', tex: 'sit', box: poseBox(model.poses.sit), grid: [24,40], parent: 'sit', z: 2 },
    ];
    for(const [i,leg]of model.legs.entries()){
      const [x,y,w,h]=leg.bounds,pose=model.poses.stand;
      parts.push({id:leg.id,tex:leg.id,parent:leg.id,z:i===0?-.1:-.2,
        box:[...point(pose,x,y),w*pose.S,h*pose.S],uvBox:[x/1024,y/1536,(x+w)/1024,(y+h)/1536],grid:[10,32]});
    }
    for (const name of ['stand', 'sit']) parts.push({ id: `${name}Face`, tex: `${name}Face`,
      box: [...point(model.poses[name], ...patchRect.slice(0,2)), patchRect[2]*model.poses[name].S, patchRect[3]*model.poses[name].S],
      grid: [12,10], parent: name, z: 3 });
    return { deformers, parts, view: scaledRect(model.view) };
  }
  function mount(host) {
    rig?.dispose(); if (foreign?.parentNode) foreign.parentNode.removeChild(foreign);
    cv = canvas(1024, 1536);
    cv.style.cssText = 'width:100%;height:100%;display:block';
    foreign = document.createElementNS(SVG, opts.raster ? 'image' : 'foreignObject');
    if (!opts.raster) foreign.appendChild(cv);
    host.appendChild(foreign); mountRoot = host;
    rig = makeRig(cv, layoutModel());
    for (const [key, texture] of Object.entries(textures)) rig.upload(key, texture);
    resize(); patchKey = '';
  }
  function resize() {
    if (!foreign) return;
    const view = scaledRect(model.view); rig.setView(view);
    for (const [key, value] of Object.entries({x:view[0],y:view[1],width:view[2]-view[0],height:view[3]-view[1]})) foreign.setAttribute(key, value);
    const ctm = mountRoot.getScreenCTM?.();
    const px = snapshotResolution || Math.max(2, Math.min(6.4, Math.hypot(ctm?.c ?? 0, ctm?.d ?? 1) * (globalThis.devicePixelRatio || 1) * 1.5));
    const h = Math.min(2048, Math.ceil((view[3]-view[1]) * px));
    const w = Math.ceil(h * (view[2]-view[0]) / (view[3]-view[1]));
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  }
  function paintFace(fc, frame) {
    const sleeping = frame.mode === 'sleep' || frame.face === 'sleep';
    const shut = sleeping || finite(frame.blink) > .52 || finite(frame.eyeClose) > .65;
    const wink = frame.face === 'wink';
    const face = frame.face || 'neutral';
    let index = faceIndex[face] ?? 0;
    if (shut) index = 1;
    const talk = !sleeping && (finite(frame.talk) > .18 || (face === 'sleepy' && Math.sin(finite(frame.t)*1.4)>.85));
    const blush = face === 'shy' || face === 'pout';
    const key = `${index}:${shut}:${wink}:${talk}:${blush}`;
    if (key === patchKey) return index !== 0 || wink || talk || blush;
    patchKey = key;
    const atlas = loaded[model.atlas.faces];
    for (const name of ['stand', 'sit']) {
      const pose = model.poses[name], g = patches[name].getContext('2d');
      g.clearRect(0,0,patchRect[2],patchRect[3]);
      const layer = canvas(patchRect[2],patchRect[3]), lg=layer.getContext('2d');
      const drawRegion = (idx, region, eye = null) => {
        const features=model.faceAtlas.features[idx];
        const m=eyeTransform(features.eyes,pose.eyes);
        if(region==='mouth') {
          const [x,y]=features.mouth;
          m[4]+=pose.mouth[0]-(m[0]*x+m[2]*y+m[4]);
          m[5]+=pose.mouth[1]-(m[1]*x+m[3]*y+m[5]);
        }
        lg.clearRect(0,0,layer.width,layer.height);
        lg.save();lg.translate(-patchRect[0],-patchRect[1]);lg.transform(...m);lg.drawImage(atlas,0,0);lg.restore();
        const mg=alphaMask.getContext('2d');mg.clearRect(0,0,alphaMask.width,alphaMask.height);
        mg.fillStyle='#fff';mg.filter='blur(1px)';
        if(region==='eyes') for(const i of eye==null?[0,1]:[eye]) {
          const [x,y]=pose.eyes[i];mg.beginPath();mg.ellipse(x-patchRect[0],y-patchRect[1]+1,34,16,-.17,0,Math.PI*2);mg.fill();
        }
        else {
          const [x,y]=pose.mouth;mg.beginPath();mg.ellipse(x-patchRect[0],y-patchRect[1],11,7.5,0,0,Math.PI*2);mg.fill();
        }
        mg.filter='none';lg.globalCompositeOperation='destination-in';lg.drawImage(alphaMask,0,0);lg.globalCompositeOperation='source-over';
        g.drawImage(layer,0,0);
      };
      if(index!==0||wink) drawRegion(wink&&!shut?1:index,'eyes',wink&&!shut?0:null);
      if(talk)drawRegion(8,'mouth');
      else if(index!==0&&index!==1)drawRegion(index,'mouth');
      if (blush) for (const [x,y] of pose.eyes) {
        const cx=x-patchRect[0],cy=y-patchRect[1]+23;
        const gradient=g.createRadialGradient(cx,cy,0,cx,cy,21);
        gradient.addColorStop(0,'rgba(232,114,160,.24)');gradient.addColorStop(1,'rgba(232,114,160,0)');
        g.fillStyle=gradient;g.fillRect(cx-21,cy-15,42,30);
      }
      if (rig) rig.upload(`${name}Face`,patches[name]);
    }
    return index !== 0 || wink || talk || blush;
  }
  function draw(host, fc = {}, frame = {}) {
    if (!host) return;
    fc = fc && typeof fc === 'object' ? fc : {}; frame = frame && typeof frame === 'object' ? frame : {};
    if (!rig || mountRoot !== host || foreign.parentNode !== host) mount(host);
    state = motionState({...frame,strideScale:stride});
    const t = finite(frame.t), dt = lastT == null ? 1/60 : clamp(t-lastT,0,.05); lastT=t;
    gaitMix+=((state.walking&&!state.still?1:0)-gaitMix)*(1-Math.exp(-dt*14));
    const split=state.walking&&!state.still||gaitMix>.001;
    const wantSit = ['sit','sleep'].includes(frame.mode) ? 1 : clamp(finite(frame.sit),0,1);
    poseMix += (wantSit-poseMix)*(1-Math.exp(-dt*14));
    if (Math.abs(poseMix-wantSit)<.001) poseMix=wantSit;
    const hasFace = paintFace(fc,frame), wave=state.wave*(1-poseMix);
    resize();
    const legStates=Object.fromEntries(model.legs.map(leg=>{
      const p=solveLeg(leg,model.poses.stand,state);
      return [leg.id,{fn:(u,v,x,y)=>{
        const rest=deformPoint(x,y,state,false),walk=skinLegPoint(x,y,p);
        return [rest[0]+(walk[0]-rest[0])*gaitMix-x,rest[1]+(walk[1]-rest[1])*gaitMix-y];
      }}];
    }));
    const legAlpha=Object.fromEntries(model.legs.map(leg=>[leg.id,split?1-poseMix:0]));
    rig.render({
      ...legStates,
      root: { s: scale },
      stand: { fn: (u,v,x,y) => { const p=deformPoint(x,y,state,false); return [p[0]-x,p[1]-y]; } },
      sit: { fn: (u,v,x,y) => { const p=deformPoint(x,y,state,true); return [p[0]-x,p[1]-y]; } },
      arm: { a: state.waveAngle }, mix: wave,
      alpha: { ...legAlpha,skirt: split?1-poseMix:0,rest: split?0:1-poseMix,torso: wave, stand: split?1-poseMix:0, arm: wave,
        sit: poseMix, standFace: hasFace ? 1-poseMix : 0, sitFace: hasFace ? poseMix : 0 },
    });
    if (opts.raster) foreign.setAttribute('href',cv.toDataURL('image/png'));
  }
  return {
    draw, gait: 'biped', gestures: ['wave','nod','shake','bow'], colors: { z: '#729be5' }, model,
    units: model.units, U: x=>point(model.poses.stand,x,0)[0], V: y=>point(model.poses.stand,0,y)[1],
    schemes: [{ id:'origin', brand:'原版', accent:'#4a72d8' }], get scheme(){return 'origin';},
    async setScheme(id) {
      if(id==='origin'){scale=SIZES.lg;stride=1;resize();return;}
      const parts=String(id??'').split('-'),next=sizeScale(parts[1]);
      if(next){scale=next;stride=strideScale(parts[2])??1;resize();}
    },
    setSkin(){}, preload:()=>Promise.resolve(paths), painted:Promise.resolve(),
    get drawScale(){return scale;}, get strideScale(){return stride;}, get extent(){return scaledRect(model.extent);},
    get hits(){return [[...scaled([128,150]),76*scale]];},
    get anchors(){ const pose=model.poses[poseMix>.5?'sit':'stand'];
      const to=(px,py)=>scaled(deformPoint(...point(pose,px,py),state,poseMix>.5));
      return {gaze:to(...pose.eyes[0]),tear:to(...pose.eyes[0]),tears:pose.eyes.map(p=>to(...p)),z:scaled([160,15]),hearts:scaled([126,84]).concat(20*scale),bubble:scaled([128,14])}; },
    reset(){lastT=null;poseMix=0;gaitMix=0;state=motionState();patchKey='';},
    snapshot(host,fc,frame,{res=6,frames=70}={}){snapshotResolution=res;for(let i=0;i<frames;i++)draw(host,fc,{...frame,t:finite(frame.t)+i/60});const href=cv.toDataURL('image/png');snapshotResolution=0;return {href,view:scaledRect(model.view)};},
    dispose(){rig?.dispose();rig=null;if(foreign?.parentNode)foreign.parentNode.removeChild(foreign);foreign=null;cv=null;mountRoot=null;lastT=null;patchKey='';},
    get canvas(){return cv;},
  };
}
export async function createDragonBody(base, opts) {
  if (!opts?.kit?.createBody || !opts?.host) throw new Error('Dragon requires kit.createBody and host');
  return opts.kit.createBody(opts.host,{figure:await createDragonFigure(base,opts)});
}
