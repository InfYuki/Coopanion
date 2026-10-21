/** Motion and figure settings in the original artwork's rig space. */
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const finite = (v, d = 0) => Number.isFinite(v) ? v : d;
const smooth = (a, b, x) => { const k = clamp((x - a) / (b - a), 0, 1); return k * k * (3 - 2 * k); };
export const SIZES = { s: 1, md: 1.18, lg: 1.32, xl: 1.5 };
export const STRIDES = { normal: 1, short: .5, long: 1.5 };
export function strideScale(id) {
  if (Object.hasOwn(STRIDES, id)) return STRIDES[id];
  const n = /^n[0-9]+$/.test(id) ? Number(id.slice(1)) : NaN;
  return Number.isSafeInteger(n) && n >= 25 && n <= 200 ? n / 100 : null;
}
export function sizeScale(id) {
  if (Object.hasOwn(SIZES, id)) return SIZES[id];
  const n = /^n[0-9]+$/.test(id) ? Number(id.slice(1)) : NaN;
  return Number.isSafeInteger(n) && n >= 25 && n <= 200 ? n / 100 : null;
}
export const point = (pose, px, py) => [128 + (px - pose.x0) * pose.S, 256 + (py - pose.feet) * pose.S];
export function poseBox(pose) {
  const a = point(pose, 0, 0);
  return [...a, pose.size[0] * pose.S, pose.size[1] * pose.S];
}
/**
 * One deterministic gait cycle. phase in radians, index 0/1 are a half-cycle apart.
 * Each foot has a planted (linear roll-back) section and a raised swing section.
 * run stance is < 1/2 cycle, permitting a brief period with both feet airborne.
 * Returns offsets in *kit logo units*; this is a trajectory request, not a joint angle.
 */
export function gaitSample(phase, index, run, stride, lift) {
  const stance = run ? 0.38 : 0.64;
  const u = ((phase / (2 * Math.PI) + index * .5) % 1 + 1) % 1;
  if (u < stance) return { dx: stride * (1 - 2 * u / stance), lift: 0, planted: true };
  const q = (u - stance) / (1 - stance), ease = q*q*(3 - 2*q);
  return { dx: stride * (2 * ease - 1), lift: lift * Math.sin(Math.PI*q), planted: false };
}

export function motionState(frame = {}) {
  frame = frame && typeof frame === 'object' ? frame : {};
  const t = finite(frame.t), walking = frame.mode === 'walk' || frame.mode === 'run';
  const run = frame.mode === 'run';
  const phase = finite(frame.phase, finite(frame.modeT,t) * Math.PI * 2 * (run ? 1.65 : 1.05));
  const feet = [0, 1].map(i => {
    const l = frame.legs?.[i];
    if (Array.isArray(l) && l.length >= 4 && l.slice(0,4).every(Number.isFinite)) {
      // The actual frame.legs are hip-X/Y + foot-X/Y, NOT joint angles.
      return {
        dx: clamp(l[2]-l[0], -(run?18:12), run?18:12),
        lift: clamp(241-l[3], 0, run?16:10),
        planted: l[3] >= 240.85,
      };
    }
    return gaitSample(phase,i,run,run?12:7,run?10:5);
  }).map(f=>({...f,dx:f.dx*clamp(finite(frame.strideScale,1),.25,2)}));
  const g = frame.gesture && typeof frame.gesture === 'object' ? frame.gesture : {};
  const k = clamp(finite(g.k), 0, 1), envelope = Math.sin(k * Math.PI);
  const look = Array.isArray(frame.look) ? frame.look : [0, 0];
  let head = clamp(finite(look[0]) * .22, -1.8, 1.8);
  head += ({sad:1.2,cry:1.5,shy:1.4,thinking:-1.6,smug:-.8,confused:-1.5}[frame.face] ?? 0);
  if (g.kind === 'nod') head += Math.sin(k * Math.PI * 4) * 1.8 * envelope;
  if (g.kind === 'shake') head += Math.sin(k * Math.PI * 6) * 3 * envelope;
  if (g.kind === 'bow') head += 5 * envelope;
  if (frame.mode === 'sleep') head += 2 + Math.sin(t * 1.3) * .8;
  const happy = ['happy', 'love', 'excited'].includes(frame.face);
  const swingPhase = ((phase / (2*Math.PI)) % 1 + 1) % 1;
  const flight = run && feet.every(p => !p.planted);
  return {
    t, walking, run, phase, feet, flight, head, still: !!frame.still,
    breath: (Math.sin(t * 1.5) + 1) * .12,
    bob: walking ? (run ? .35 : .25) * Math.cos(swingPhase*Math.PI*4) : 0,
    sway: clamp(finite(frame.swing) / 30, -1, 1),
    dance: frame.mode === 'dance' ? Math.sin(t * 5) : 0,
    tail: Math.sin(t * (happy ? 3 : 1.4)) * (happy ? 1.3 : .65),
    held: frame.mode === 'drag' ? 1 : 0,
    wave: g.kind === 'wave' ? Math.min(1, envelope * 5) : 0,
    waveAngle: g.kind === 'wave' ? (68 + Math.sin(k * Math.PI * 8) * 10) * Math.min(1, envelope * 5) : 0,
  };
}

export function deformPoint(x, y, st, sitting = false) {
  if (st.still) return [x, y];
  const headW = 1 - smooth(72, 91, y);
  const a = st.head * Math.PI / 180, px = x - 130, py = y - 79;
  let dx = ((px * Math.cos(a) - py * Math.sin(a)) - px) * headW;
  let dy = ((px * Math.sin(a) + py * Math.cos(a)) - py) * headW;
  const hairW = (1 - smooth(103, 122, x)) + smooth(151, 168, x);
  const hairY = smooth(45, 90, y) * (1 - smooth(138, 164, y));
  dx += hairW * hairY * (Math.sin(st.t * 1.6 + y * .02) * .38 + st.sway * .8);
  const tailW = (1 - smooth(91, 112, x)) * smooth(130, 170, y);
  dx += tailW * st.tail * (sitting ? .55 : 1);
  const footLock = 1 - smooth(180, 256, y);
  dx += st.dance * .8 * footLock;
  dy += (st.bob - st.breath * smooth(256, 90, y)) * footLock;
  if (st.held) dx += Math.sin(st.t * 6 + y * .04) * smooth(95, 230, y) * .6;
  return [x + dx, y + dy];
}

/**
 * Stable two-bone IK in logo coordinates: actual hip, knee and ankle are read
 * from model.json through point(...). Target foot offsets come from frame.legs.
 * Preserve the image's original bone lengths,
 * and the original neutral pose. No rigid translation of the whole leg.
 *
 * NOTE: A single 2-D source image cannot reveal hidden geometry. The requested
 * ankle offset is scaled to stay within a small, artistically safe range.
 */
export function solveLeg(leg, pose, st) {
  const hip=point(pose,...leg.hip), knee=point(pose,...leg.knee), ankle=point(pose,...leg.ankle);
  if (!st.walking || st.still) {
    return { hip, knee, ankle,
      H:deformPoint(...hip,st,false),
      K:deformPoint(...knee,st,false),
      A:deformPoint(...ankle,st,false),
      planted:true };
  }
  const f=st.feet[leg.kitIndex] ?? {dx:0,lift:0,planted:true};
  const L1=Math.hypot(knee[0]-hip[0],knee[1]-hip[1]);
  const L2=Math.hypot(ankle[0]-knee[0],ankle[1]-knee[1]);
  const H=deformPoint(...hip,st,false);
  // The artwork's nearly straight rest legs have little extension reserve;
  // use bounded small offsets to avoid tearing the bitmap at the skirt seam.
  const kx=st.run?.225:.15, ky=.05;
  const target=[ankle[0]+f.dx*kx,ankle[1]-f.lift*ky];
  const minR=Math.abs(L1-L2)+.02, maxR=L1+L2-.02;
  // The original stance art is close to maximum leg extension. Permit a
  // concealed hip compression before clipping ankle reach.
  const initialReach=Math.hypot(target[0]-H[0],target[1]-H[1]);
  if (initialReach > maxR && target[1] > H[1]) H[1]+=Math.min(2.3,initialReach-maxR+.04);
  let vx=target[0]-H[0],vy=target[1]-H[1];
  const requested=Math.hypot(vx,vy);
  const d=clamp(requested,minR,maxR), ratio=d/(requested||1);
  vx*=ratio;vy*=ratio;
  const A=[H[0]+vx,H[1]+vy];
  const ux=vx/d,uy=vy/d;
  const along=(L1*L1-L2*L2+d*d)/(2*d);
  const sideways=Math.sqrt(Math.max(0,L1*L1-along*along));
  const cross=(ankle[0]-hip[0])*(knee[1]-hip[1])-(ankle[1]-hip[1])*(knee[0]-hip[0]);
  // Forward flexion uses the opposite side of the standing pose's hip–ankle line.
  const side=cross>=0?-1:1;
  const K=[H[0]+ux*along-side*uy*sideways,H[1]+uy*along+side*ux*sideways];
  return {hip,knee,ankle,H,K,A,target,planted:f.planted,requested,clamped:Math.abs(requested-d)>.025};
}
function onBone(x,y,from,to,angle) {
  const dx=x-from[0],dy=y-from[1],c=Math.cos(angle),s=Math.sin(angle);
  return [to[0]+dx*c-dy*s,to[1]+dx*s+dy*c];
}
export function skinLegPoint(x,y,p) {
  const angle=(a,b)=>Math.atan2(b[1]-a[1],b[0]-a[0]);
  const upper=onBone(x,y,p.hip,p.H,angle(p.H,p.K)-angle(p.hip,p.knee));
  const lower=onBone(x,y,p.knee,p.K,angle(p.K,p.A)-angle(p.knee,p.ankle));
  // Blend above the shoe's highest source pixels so the entire slipper translates rigidly.
  const shoe=[x+p.A[0]-p.ankle[0],y+p.A[1]-p.ankle[1]];
  const kneeBlend=smooth(p.knee[1]-28,p.knee[1]+28,y);
  const shoeBlend=smooth(p.ankle[1]-30,p.ankle[1]-5,y);
  return [0,1].map(i=>(upper[i]*(1-kneeBlend)+lower[i]*kneeBlend)*(1-shoeBlend)+shoe[i]*shoeBlend);
}
