// BARRAGE shared deterministic battlefield engine. No libraries or browser APIs.
// Coordinates: 1280x720 logical pixels, 4px material cells.
export const WIDTH=1280, HEIGHT=720, CELL=4, CW=320, CH=180;
export const MATERIAL={EMPTY:0,DIRT:1,ROCK:2,CONCRETE:3};
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
 const wave=19*Math.sin(x/74)+12*Math.sin(x/32);
 if(map==="canyon")return 490+wave-135*Math.exp(-(((x-640)/185)**4));
 if(map==="hollow")return 495+wave-168*Math.exp(-(((x-640)/240)**2));
 return 475+wave-132*Math.exp(-((x-640)/178)**2);
}
export function generate(map="forts",seed=1){
 const g=new Uint8Array(CW*CH),rand=rng(seed);
 for(let i=0;i<CW;i++){const x=i*CELL,top=Math.floor(baseHeight(x,map)/CELL);
  for(let j=top;j<CH;j++)g[j*CW+i]=(j>top+36&&rand()<.25)?2:1;
 }
 const rect=(x1,y1,x2,y2,m)=>{for(let y=Math.floor(y1/CELL);y<=Math.floor(y2/CELL);y++)for(let x=Math.floor(x1/CELL);x<=Math.floor(x2/CELL);x++)set(g,x,y,m);};
 for(let side=0;side<2;side++){const mx=x=>side?WIDTH-x:x;
  if(map==="forts"){
   const left=Math.min(mx(210),mx(275)),right=Math.max(mx(210),mx(275)),ground=baseHeight(mx(242),map);
   rect(left,ground-83,right,ground-70,3);rect(side?left:right-9,ground-83,side?left+9:right,ground-10,3);
   rect(Math.min(mx(350),mx(375)),baseHeight(mx(360),map)-55,Math.max(mx(350),mx(375)),baseHeight(mx(360),map)-6,2);
  }else if(map==="canyon"){
   const x=mx(330),ground=baseHeight(x,map);rect(x-10,ground-110,x+10,ground-5,2);
   const xx=mx(180),gg=baseHeight(xx,map);rect(xx-28,gg-100,xx+28,gg-89,2);
  }else{
   const left=Math.min(mx(205),mx(340)),right=Math.max(mx(205),mx(340)),ground=baseHeight(mx(270),map);
   rect(left,ground+18,right,ground+67,0);
   rect(side?left:right-14,ground-5,side?left+14:right,ground+67,0);
   rect(left,ground+67,right,ground+75,3);
  }
 }
 // Preserve concrete-only border as a collision rule, rather than cells.
 return g;
}
export function surfaceBelow(g,x,y=0){const col=clamp(Math.floor(x/CELL),0,CW-1);
 for(let row=clamp(Math.floor(y/CELL),0,CH-1);row<CH;row++)if(g[row*CW+col])return row*CELL;
 return HEIGHT;
}
export function spawn(g,side,slot,map="forts"){const x=side===0?116+(slot-1)*56:WIDTH-(116+(slot-1)*56),y=baseHeight(x,map)-12;return {x,y};}
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
  else if(m===1)g[ix]=0;else if(m===2)g[ix]=kind==="excavator"?1:0;
 }
}
function settle(g,tanks,totals){
 for(const t of tanks){if(!t.alive)continue;
  const before=t.y,under=surfaceBelow(g,t.x,Math.max(0,t.y+10)),foot=under-12;
  if(foot>t.y){t.y=Math.min(HEIGHT-14,foot);const drop=t.y-before;if(drop>40)applyDamage(t,Math.min(20,(drop-40)/4),totals);}
  // If terrain is placed around the tank, raise onto clear surface.
  if(at(g,t.x,t.y)||at(g,t.x-17,t.y)||at(g,t.x+17,t.y)){let safe=t.y;while(safe>15&&(at(g,t.x,safe)||at(g,t.x-17,safe)||at(g,t.x+17,safe)))safe-=4;t.y=safe;}
 }
}
export function moveTank(g,tanks,id,dx,fuel){
 const t=tanks.find(p=>p.id===id);if(!t?.alive||fuel<=0)return {moved:0};
 const step=Math.sign(dx)*Math.min(8,Math.abs(dx),fuel);if(!step)return {moved:0};
 const nx=clamp(t.x+step,35,WIDTH-35),dy=surfaceBelow(g,nx,Math.max(0,t.y-28))-12-t.y;
 if(Math.abs(dy)>Math.abs(step)*Math.tan(55*Math.PI/180)+3||tanks.some(p=>p.alive&&p.id!==id&&Math.abs(p.x-nx)<44&&Math.abs(p.y-(t.y+dy))<28)||at(g,nx,t.y-15))return {moved:0};
 t.x=nx;t.y+=dy;return {moved:Math.abs(nx-(nx-step))};
}
export function simulateVolley({grid,players,shots,wind=0,seed=1}){
 const g=grid.slice(),tanks=players.map(p=>({...p})),totals={},damageBy={},events=[],trace=[];
 const prng=rng(seed),live=[],step=1/120;let serial=0;
 const launch=(p,shot,delta=0,kind=shot.weapon)=>{
  const weapon=WEAPONS[kind]||WEAPONS.single;
  const a=(shot.angle+delta)*Math.PI/180,v=(250+7.5*shot.power)*(kind==="rail"?1.6:1);
  const sx=p.x+26*Math.cos(a),sy=p.y-26*Math.sin(a);
  live.push({id:serial++,owner:p.id,team:p.team,kind,x:sx,y:sy,vx:v*Math.cos(a),vy:-v*Math.sin(a),r:4,mode:"air",bounce:0,distance:0,age:0,alive:true,split:false,seed:prng()});
 };
 for(const s of shots){const p=tanks.find(t=>t.id===s.playerId&&t.alive);if(!p)continue;
  if(s.weapon==="triple")for(const d of [-2,0,2])launch(p,s,d);
  else launch(p,s);
 }
 let maxT=0;
 const detonate=(p,t)=>{
  if(!p.alive)return;p.alive=false;const w=WEAPONS[p.kind],x=clamp(p.x,0,WIDTH),y=clamp(p.y,0,HEIGHT);
  events.push({type:"boom",t:+t.toFixed(3),x,y,kind:p.kind,r:w.radius});
  if(p.kind==="quake"){
   for(const target of tanks){if(!target.alive||Math.abs(target.x-x)>200||Math.abs(target.y-y)>100)continue;
    let connected=true;for(let q=Math.min(x,target.x);q<=Math.max(x,target.x);q+=4){const c=at(g,q,surfaceBelow(g,q,Math.max(0,target.y-30))+1);if(c===3||c===0){connected=false;break;}}
    if(connected){const amount=applyDamage(target,w.damage*(target.team===p.team?.5:1),totals);damageBy[p.owner]=(damageBy[p.owner]||0)+(target.team===p.team?0:amount);}
   }
  }else if(p.kind==="napalm"){
   for(const target of tanks){if(!target.alive)continue;const yDiff=Math.abs(target.y-surfaceBelow(g,target.x,Math.max(0,target.y-25))+12);
    if(Math.abs(target.x-x)<=70&&yDiff<35){
     const amount=applyDamage(target,18*(target.team===p.team?.5:1)*coverMultiplier(g,x,y,target),totals);
     damageBy[p.owner]=(damageBy[p.owner]||0)+(target.team===p.team?0:amount);
    }
   }
   carve(g,x,y,20,"blast",tanks);
  }else{
   for(const target of tanks){if(!target.alive||w.damage===0)continue;
    const dist=Math.hypot(target.x-x,target.y-y);
    if(dist>w.radius+20)continue;
    const fall=clamp(1-Math.max(0,dist-12)/w.radius,0,1);
    const amount=applyDamage(target,w.damage*fall*coverMultiplier(g,x,y,target)*(target.team===p.team?.5:1),totals);
    damageBy[p.owner]=(damageBy[p.owner]||0)+(target.team===p.team?0:amount);
   }
   carve(g,x,y,w.radius,p.kind==="dirt"?"dirt":p.kind==="quake"?"none":p.kind==="excavator"?"excavator":"blast",tanks);
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
    if(p.kind==="splitter"&&!p.split&&p.vy>=0){p.alive=false;p.split=true;for(let i=-2;i<=2;i++){const a=Math.atan2(p.vy,p.vx)+i*.105;live.push({...p,id:serial++,x:p.x,y:p.y,vx:Math.cos(a)*Math.max(180,mag*.75),vy:Math.sin(a)*Math.max(180,mag*.75),split:true,alive:true,kind:"splitter"});}continue;}
    if(p.x<0||p.x>=WIDTH||p.y<0){p.alive=false;continue;}
    let hitTank=tanks.find(k=>k.alive&&k.id!==p.owner&&Math.abs(k.x-p.x)<22&&Math.abs(k.y-p.y)<12);
    if(hitTank){detonate(p,t);continue;}
    const m=at(g,p.x,p.y);
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
 return {grid:g,players:tanks,events,trace,damageBy,totals,duration:maxT};
}
