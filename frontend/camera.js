/**
 * Pure, deterministic camera target for the public replay trace.
 * Positive offset means moving the world downward to reveal sky above y=0.
 * Trace points are [seconds, projectileId, x, y, weapon]; timestamps ascend.
 * A recently updated projectile is live; stale last samples are discarded.
 */
export function cameraTargetForTrace(trace,elapsed,viewportTop=172){
 if(!Array.isArray(trace)||!Number.isFinite(elapsed)||elapsed<0)return 0;
 // Each projectile's newest sample supersedes older positions; otherwise
 // the camera can momentarily chase a ghost at the previous high point
 // while the real shell is already descending.
 const latest=new Map();
 for(const point of trace){
  const time=point?.[0];
  if(!Number.isFinite(time))continue;
  if(time>elapsed)break;
  latest.set(point[1],point);
 }
 let high=Infinity;
 for(const point of latest.values()){
  if(elapsed-point[0]>.125)continue; // no longer in flight
  const y=point[3];
  if(Number.isFinite(y)&&y<high)high=y;
 }
 if(high===Infinity)return 0;
 return Math.min(800,Math.max(0,viewportTop-high));
}
