// BARRAGE shared deterministic battlefield engine. No libraries or browser APIs.
// Coordinates: 1280x720 logical pixels, 4px material cells.
export const WIDTH=1280, HEIGHT=720, CELL=4, CW=320, CH=180;
export const MATERIAL={EMPTY:0,DIRT:1,ROCK:2,CONCRETE:3,ROCK_DAMAGED:4,ROCK_CRACKED:5};
export const WEAPONS={
  single:{name:"Single Shot",damage:25,radius:55,drag:.00035,color:"#f7d774"},
  bertha:{name:"Big Bertha",damage:30,radius:75,drag:.00015,color:"#ff956a"},
  triple:{name:"Triple Burst",damage:12,radius:40,drag:.00035,color:"#ffcd78"},
  splitter:{name:"Splitter",damage:8,radius:30,drag:.0008,color:"#b5fbef"},
  roller:{name:"Roller",damage:28,radius:50,drag:.00035,color:"#e8e4e2"},
  bouncer:{name:"Bouncer",damage:24,radius:50,drag:.00035,color:"#b2aaff"},
  mole:{name:"Mole",damage:26,radius:50,drag:.00035,color:"#d4ac79"},
  rail:{name:"Rail Slug",damage:30,radius:25,drag:.0001,color:"#7be5ff"},
  napalm:{name:"Napalm",damage:18,radius:20,drag:.0005,color:"#ff754b"},
  dirt:{name:"Dirt Ball",damage:0,radius:60,drag:.0005,color:"#9ab66b"},
  excavator:{name:"Excavator",damage:0,radius:80,drag:.0005,color:"#74e6b9"},
  quake:{name:"Earthquake",damage:20,radius:0,drag:.00035,color:"#ffe19d"}
};
export function rng(seed){let n=seed>>>0||1;return ()=>{n^=n<<13;n^=n>>>17;n^=n<<5;return (n>>>0)/4294967296;};}
export function encode(grid){let s="";for(let i=0;i<grid.length;i+=8192)s+=String.fromCharCode(...grid.subarray(i,i+8192));return btoa(s);}
export function decode(text){return Uint8Array.from(atob(text),c=>c.charCodeAt(0));}
const at=(g,x,y)=>{const i=Math.floor(x/CELL),j=Math.floor(y/CELL);return i<0||i>=CW||j>=CH?MATERIAL.CONCRETE:j<0?MATERIAL.EMPTY:g[j*CW+i];};
const set=(g,x,y,v)=>{if(x>=0&&x<CW&&y>=0&&y<CH)g[y*CW+x]=v;};
const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));
export function baseHeight(x,map="forts"){
 const mirrorX=Math.min(x,WIDTH-x);
 const wave=19*Math.sin(mirrorX/74)+12*Math.sin(mirrorX/32);
 if(map==="canyon")return 490+wave-135*Math.exp(-(((x-640)/185)**4));
 if(map==="hollow")return 495+wave-168*Math.exp(-(((x-640)/240)**2));
 return 475+wave-132*Math.exp(-(((x-640)/178)**2));
}
export const SPAWN_X=[90,185,275,365,450,535];
export function generate(map="forts",seed=1){
 const g=new Uint8Array(CW*CH);
 for(let i=0;i<CW;i++){
  const x=i*CELL+CELL/2,top=Math.floor(baseHeight(x,map)/CELL);
  for(let j=top;j<CH;j++){
   const sym=Math.min(i,CW-1-i),h=(Math.imul(sym+1,73856093)^Math.imul(j+1,19349663)^seed)>>>0;
   g[j*CW+i]=(j>top+36&&((h^(h>>>13))%100)<25)?MATERIAL.ROCK:MATERIAL.DIRT;
  }
 }
 const rect=(x1,y1,x2,y2,m)=>{
  for(let y=Math.floor(y1/CELL);y<=Math.floor(y2/CELL);y++)
   for(let x=Math.floor(x1/CELL);x<=Math.floor(x2/CELL);x++)set(g,x,y,m);
 };
 // Build only the left half and reflect its exact cells onto Blue's side.
 // All slots are separated by at least 80px, eliminating spawn-time splash stacking.
 if(map==="forts"){
  for(const slot of [2,5]){
   const x=SPAWN_X[slot-1],ground=baseHeight(x,map);
   rect(x-35,ground-84,x+35,ground-72,3); // concrete roof
   rect(x-35,ground-72,x-25,ground-8,3); // rear wall, opening faces centre
  }
  {const x=SPAWN_X[2],ground=baseHeight(x,map);
   rect(x+31,ground-64,x+53,ground-8,2); // tall rock mesa in front of S3
  }
  {const x=SPAWN_X[3],ground=baseHeight(x,map);
   rect(x-27,ground-24,x+27,ground+36,0); // dug trench at S4
  }
 }else if(map==="canyon"){
  for(const slot of [1,3,4]){
   const x=SPAWN_X[slot-1],ground=baseHeight(x,map);
   rect(x+30,ground-94,x+42,ground-10,2); // rock pillar in front
   rect(x-15,ground-106,x+43,ground-97,2); // overhead ledge
  }
 }else if(map==="hollow"){
  for(const slot of [3,4]){
   const x=SPAWN_X[slot-1],ground=baseHeight(x,map);
   rect(x-34,ground+13,x+52,ground+67,0); // underground pocket
   rect(x-34,ground+69,x+52,ground+78,3); // unbreakable floor support
   // A corridor and outlet allow actual projectiles to exit into daylight.
   rect(x+52,ground+16,x+78,ground+64,0);
   rect(x+72,ground-12,x+83,ground+64,0);
  }
 }
 for(let row=0;row<CH;row++)for(let x=0;x<CW/2;x++)g[row*CW+(CW-1-x)]=g[row*CW+x];
 return g;
}
export function surfaceBelow(g,x,y=0){const col=clamp(Math.floor(x/CELL),0,CW-1);
 for(let row=clamp(Math.floor(y/CELL),0,CH-1);row<CH;row++)if(g[row*CW+col])return row*CELL;
 return HEIGHT;
}
export function spawn(g,side,slot,map="forts"){
 const left=SPAWN_X[Math.max(0,Math.min(5,slot-1))];
 const x=side===0?left:WIDTH-left,top=baseHeight(x,map);
 // Tunnel spawns stand on their dug floor; surface spawns stand below their roof.
 const searchY=map==="hollow"&&(slot===3||slot===4)?top+20:top-14;
 return {x,y:surfaceBelow(g,x,searchY)-12};
}
export function coverMultiplier(g,x,y,tank){
 const sample=[[0,0],[-20,-10],[20,-10],[-20,10],[20,10]];
 let blocked=0;
 for(const [dx,dy] of sample){
  const tx=tank.x+dx,ty=tank.y+dy,dist=Math.hypot(tx-x,ty-y),steps=Math.ceil(dist/3);
  let occluded=false;
  for(let s=1;s<steps-1;s++){const q=s/steps;if(at(g,x+(tx-x)*q,y+(ty-y)*q)){occluded=true;break;}}
  if(occluded)blocked++;
 }
 return 1-blocked/5;
}
export function ballistic(power,angle,gravity=500){const v=250+7.5*power,a=angle*Math.PI/180;return {vx:v*Math.cos(a),vy:-v*Math.sin(a),range:v*v*Math.sin(2*a)/gravity};}
function applyDamage(t,amount,totals){if(!t.alive||amount<=0)return 0;const previous=totals[t.id]||0;const actual=Math.max(0,Math.min(40-previous,Math.round(amount),t.hp));t.hp-=actual;totals[t.id]=previous+actual;if(t.hp<=0)t.alive=false;return actual;}
function carve(g,cx,cy,r,kind,tanks){
 if(r<=0)return;const cr=Math.ceil(r/CELL),gx=Math.floor(cx/CELL),gy=Math.floor(cy/CELL);
 for(let y=gy-cr;y<=gy+cr;y++)for(let x=gx-cr;x<=gx+cr;x++){
  if(x<0||x>=CW||y<0||y>=CH||Math.hypot(x*CELL+2-cx,y*CELL+2-cy)>r)continue;
  const ix=y*CW+x,m=g[ix];
  if(kind==="dirt"){if(m===0&&!tanks.some(t=>t.alive&&Math.abs(t.x-(x*CELL+2))<24&&Math.abs(t.y-(y*CELL+2))<16))g[ix]=1;}
  else if(m===1)g[ix]=0;else if(m===2)g[ix]=4;else if(m===4)g[ix]=5;else if(m===5)g[ix]=0;
 }
}
function roofTop(g,x,y){
 let row=Math.floor((y-17)/CELL),col=clamp(Math.floor(x/CELL),0,CW-1);
 if(row<0||!g[row*CW+col])return y;
 while(row>0&&g[(row-1)*CW+col])row--;
 return row*CELL-8;
}
export function napalmPool(g,x,y,reach=70){
 const startY=surfaceBelow(g,x,Math.max(0,y-23)),segments=[{x,y:startY}],steps=Math.floor(reach/CELL);
 if(startY>=HEIGHT||at(g,x,startY+2)===3)return [];
 for(const direction of [-1,1]){
  let previous=startY;
  for(let i=1;i<=steps;i++){
   const px=x+i*CELL*direction;
   if(px<0||px>=WIDTH)break;
   const top=surfaceBelow(g,px,Math.max(0,previous-16));
   if(top>=HEIGHT||top<previous-6||top>previous+28||at(g,px,top+2)===3)break;
   segments.push({x:px,y:top});previous=top;
  }
 }
 return segments.sort((a,b)=>a.x-b.x);
}
export function quakePath(g,x,y,range=200){
 const root=surfaceBelow(g,x,Math.max(0,y-20));
 if(root>=HEIGHT||at(g,x,root+2)===3)return [];
 const result=[{x,y:root}];
 for(const dir of [-1,1]){
  let prior=root;
  for(let i=CELL;i<=range;i+=CELL){
   const xx=x+i*dir;
   if(xx<0||xx>=WIDTH)break;
   const yy=surfaceBelow(g,xx,Math.max(0,prior-16));
   if(yy>=HEIGHT||yy<prior-14||yy>prior+24||at(g,xx,yy+2)===3)break;
   result.push({x:xx,y:yy});prior=yy;
  }
 }
 return result;
}
function settle(g,tanks,totals){
 for(const t of tanks){if(!t.alive)continue;
  const before=t.y,under=surfaceBelow(g,t.x,Math.max(0,t.y+10)),foot=under-12;
  if(foot>t.y){t.y=Math.min(HEIGHT-14,foot);const drop=t.y-before;if(drop>40)applyDamage(t,Math.min(20,(drop-40)/4),totals);}
  if(t.buried&&!at(g,t.x,t.y-19)&&!at(g,t.x-18,t.y-19)&&!at(g,t.x+18,t.y-19))t.buried=false;
  // If terrain is placed around the tank, raise onto clear surface.
  if(at(g,t.x,t.y)||at(g,t.x-17,t.y)||at(g,t.x+17,t.y)){let safe=t.y;while(safe>15&&(at(g,t.x,safe)||at(g,t.x-17,safe)||at(g,t.x+17,safe)))safe-=4;t.y=safe;}
 }
}
export function moveTank(g,tanks,id,dx,fuel){
 const t=tanks.find(p=>p.id===id);if(!t?.alive||t.buried||fuel<=0)return {moved:0};
 const step=Math.sign(dx)*Math.min(8,Math.abs(dx),fuel);if(!step)return {moved:0};
 const nx=clamp(t.x+step,35,WIDTH-35),dy=surfaceBelow(g,nx,Math.max(0,t.y-28))-12-t.y;
 if(Math.abs(dy)>Math.abs(step)*Math.tan(55*Math.PI/180)+3||tanks.some(p=>p.alive&&p.id!==id&&Math.abs(p.x-nx)<44&&Math.abs(p.y-(t.y+dy))<28)||at(g,nx,t.y-15))return {moved:0};
 const moved=Math.abs(nx-t.x);t.x=nx;t.y+=dy;return {moved};
}
export function simulateVolley({grid,players,shots,wind=0,seed=1}){
 const g=grid.slice(),tanks=players.map(p=>({...p})),totals={},damageBy={},killsBy={},events=[],trace=[];
 const prng=rng(seed),live=[],step=1/120;let serial=0;
 const launch=(p,shot,delta=0,kind=shot.weapon)=>{
  const weapon=WEAPONS[kind]||WEAPONS.single;
  const a=(shot.angle+delta)*Math.PI/180,v=(250+7.5*shot.power)*(kind==="rail"?1.6:1);
  const originY=p.buried?roofTop(g,p.x,p.y):p.y;
  const sx=p.x+26*Math.cos(a),sy=originY-26*Math.sin(a);
  live.push({id:serial++,owner:p.id,team:p.team,kind,x:sx,y:sy,vx:v*Math.cos(a),vy:-v*Math.sin(a),r:4,mode:"air",bounce:0,distance:0,age:0,alive:true,split:false,seed:prng()});
 };
 for(const s of shots){const p=tanks.find(t=>t.id===s.playerId&&t.alive);if(!p)continue;
  if(s.weapon==="triple")for(const d of [-2,0,2])launch(p,s,d);
  else launch(p,s);
 }
 let maxT=0;
 const award=(projectile,target,raw)=>{
  const wasAlive=target.alive,actual=applyDamage(target,raw,totals);
  if(target.team!==projectile.team)damageBy[projectile.owner]=(damageBy[projectile.owner]||0)+actual;
  if(wasAlive&&!target.alive&&target.team!==projectile.team)killsBy[projectile.owner]=(killsBy[projectile.owner]||0)+1;
  return actual;
 };
 const detonate=(p,t)=>{
  if(!p.alive)return;p.alive=false;const w=WEAPONS[p.kind],x=clamp(p.x,0,WIDTH),y=clamp(p.y,0,HEIGHT);
  events.push({type:"boom",t:+t.toFixed(3),x,y,kind:p.kind,r:w.radius});
  if(p.kind==="quake"){
   const path=quakePath(g,x,y);
   events.push({type:"shock",t:+t.toFixed(3),points:path});
   for(const target of tanks){
    if(!target.alive)continue;
    const near=path.some(point=>Math.abs(point.x-target.x)<CELL+8&&Math.abs(point.y-(target.y+12))<17);
    if(near)award(p,target,w.damage*(target.team===p.team?.5:1));
   }
  }else if(p.kind==="napalm"){
   const pool=napalmPool(g,x,y);
   events.push({type:"pool",t:+t.toFixed(3),points:pool});
   for(const target of tanks){
    if(!target.alive)continue;
    if(pool.some(point=>Math.abs(point.x-target.x)<12&&Math.abs(point.y-(target.y+12))<18)){
     award(p,target,18*(target.team===p.team?.5:1));
    }
   }
   carve(g,x,y,20,"blast",tanks);
  }else{
   for(const target of tanks){
    if(!target.alive||w.damage===0)continue;
    const dist=Math.hypot(target.x-x,target.y-y);
    if(dist>w.radius+12)continue;
    const fall=clamp(1-Math.max(0,dist-12)/w.radius,0,1);
    award(p,target,w.damage*fall*coverMultiplier(g,x,y,target)*(target.team===p.team?.5:1));
   }
   carve(g,x,y,w.radius,p.kind==="dirt"?"dirt":p.kind==="excavator"?"excavator":"blast",tanks);
   if(p.kind==="dirt"){
    for(const target of tanks)if(target.alive&&Math.hypot(target.x-x,target.y-y)<=42){
     const roof=at(g,target.x,target.y-19);
     const left=at(g,target.x-24,target.y),right=at(g,target.x+24,target.y);
     if(roof&&(left||right))target.buried=true;
    }
   }
  }
  settle(g,tanks,totals);
 };
 for(let frame=0;frame<960&&live.some(p=>p.alive);frame++){
  const t=frame*step;maxT=t;
  for(const p of live.slice()){
   if(!p.alive)continue;p.age+=step;const w=WEAPONS[p.kind];
   if(p.mode==="burrow"){p.x+=p.vx*step;p.y+=p.vy*step;p.distance+=Math.hypot(p.vx,p.vy)*step;if(at(g,p.x,p.y)!==1||p.distance>=180)detonate(p,t);}
   else if(p.mode==="roll"){
    const nx=p.x+p.vx*step,ground=surfaceBelow(g,nx,Math.max(0,p.y-12));const diff=ground-(p.y+4);
    if(Math.abs(diff)>10||at(g,nx,p.y)){detonate(p,t);continue;}
    p.x=nx;p.y=ground-4;p.vx+=(-Math.sign(p.vx)*120+Math.sign(diff)*Math.abs(diff)*12)*step;p.distance+=Math.abs(p.vx)*step;if(Math.abs(p.vx)<12||p.age>4)detonate(p,t);
   }else{
    const drag=w.drag,mag=Math.hypot(p.vx,p.vy);
    p.vx+=(wind*(drag/.00035)-drag*mag*p.vx)*step;
    p.vy+=(500-drag*mag*p.vy)*step;
    const lastX=p.x,lastY=p.y;p.x+=p.vx*step;p.y+=p.vy*step;
    if(p.kind==="splitter"&&!p.split&&p.vy>=0){p.alive=false;p.split=true;for(let i=-2;i<=2;i++){const a=Math.atan2(p.vy,p.vx)+i*(Math.PI/60);live.push({...p,id:serial++,x:p.x,y:p.y,vx:Math.cos(a)*Math.max(180,mag*.75),vy:Math.sin(a)*Math.max(180,mag*.75),split:true,alive:true,kind:"splitter"});}continue;}
    if(p.x<0||p.x>=WIDTH||p.y<0){p.alive=false;continue;}
    let hitTank=tanks.find(k=>k.alive&&(k.id!==p.owner||p.age>.075)&&Math.abs(k.x-p.x)<22&&Math.abs(k.y-p.y)<12);
    if(hitTank){detonate(p,t);continue;}
    // Swept collision: sample every 2 px along this timestep, including fast Rail Slugs.
    // This prevents thin walls from being skipped between 120 Hz samples.
    const distance=Math.hypot(p.x-lastX,p.y-lastY),segments=Math.max(1,Math.ceil(distance/2));
    let encountered=0;
    for(let k=1;k<=segments;k++){
     const q=k/segments,px=lastX+(p.x-lastX)*q,py=lastY+(p.y-lastY)*q;
     const material=at(g,px,py);
     if(material){p.x=px;p.y=py;encountered=material;break;}
    }
    const m=encountered;
    if(m){
     if(p.kind==="mole"&&m===1){p.mode="burrow";const len=Math.hypot(p.vx,p.vy)||1;p.vx=p.vx/len*420;p.vy=p.vy/len*420;continue;}
     if(p.kind==="roller"){p.mode="roll";p.x=lastX;p.y=surfaceBelow(g,p.x,Math.max(0,lastY-12))-4;p.vx=Math.sign(p.vx)*Math.max(120,Math.abs(p.vx)*.55);continue;}
     if(p.kind==="bouncer"&&p.bounce<2){p.x=lastX;p.y=lastY;p.vy=-Math.abs(p.vy)*.55;p.vx*=.78;p.bounce++;continue;}
     detonate(p,t);
    }
   }
   if(p.alive&&frame%4===0)trace.push([+t.toFixed(3),p.id,Math.round(p.x),Math.round(p.y),p.kind]);
  }
  // Collision among projectiles fired together.
  for(let i=0;i<live.length;i++){const a=live[i];if(!a.alive)continue;
   for(let j=i+1;j<live.length;j++){const b=live[j];if(!b.alive||a.owner===b.owner||a.mode!=="air"||b.mode!=="air")continue;
    if(Math.hypot(a.x-b.x,a.y-b.y)<12){const x=(a.x+b.x)/2,y=(a.y+b.y)/2;a.x=b.x=x;a.y=b.y=y;detonate(a,t);detonate(b,t);}
   }
  }
 }
 for(const p of live)if(p.alive)p.alive=false;
 return {grid:g,players:tanks,events,trace,damageBy,killsBy,totals,duration:maxT};
}
