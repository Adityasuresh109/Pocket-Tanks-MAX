import {BarrageRoom} from "../worker/index.js";
import {WEAPONS,WIDTH,HEIGHT,CELL,CW,coverMultiplier} from "../shared/engine.js";

// Full-match automated playtest using the real room turn and shot functions.
// Predicts projectile impact with the actual drag, gravity, wind and terrain.
function rand(seed){let s=seed>>>0;return()=>{s^=s<<13;s^=s>>>17;s^=s<<5;return(s>>>0)/4294967296;};}
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function material(grid,x,y){
 const cx=Math.floor(x/CELL),cy=Math.floor(y/CELL);
 if(cx<0||cx>=CW||cy>=HEIGHT/CELL)return 3;
 return cy<0?0:grid[cy*CW+cx];
}
function predict(grid,shooter,players,weapon,power,angle,wind){
 const drag=WEAPONS[weapon].drag;
 const a=angle*Math.PI/180,speed=250+7.5*power;
 let vx=speed*Math.cos(a),vy=-speed*Math.sin(a);
 let x=shooter.x+26*Math.cos(a),y=shooter.y-26*Math.sin(a),age=0;
 const dt=1/120;
 for(let frame=0;frame<700;frame++){
  const v=Math.hypot(vx,vy);
  vx+=(wind*(drag/.00035)-drag*v*vx)*dt;
  vy+=(500-drag*v*vy)*dt;
  const oldX=x,oldY=y;x+=vx*dt;y+=vy*dt;age+=dt;
  if(x<0||x>=WIDTH||y<0||y>=HEIGHT)return {x,y,missing:true};
  const pieces=Math.max(1,Math.ceil(Math.hypot(x-oldX,y-oldY)/5));
  for(let i=1;i<=pieces;i++){
   const q=i/pieces,xx=oldX+(x-oldX)*q,yy=oldY+(y-oldY)*q;
   if(material(grid,xx,yy))return {x:xx,y:yy};
   const direct=players.find(p=>p.alive&&(p.id!==shooter.id||age>.075)&&Math.abs(p.x-xx)<22&&Math.abs(p.y-yy)<12);
   if(direct)return {x:xx,y:yy,hitId:direct.id};
  }
 }
 return {x,y,missing:true};
}
function chooseShot(room,player,rng,noise){
 const opponents=room.room.players.filter(p=>p.alive&&p.team!==player.team);
 const candidates=["bertha","single"].filter(k=>k==="single"||player.inventory[k]>0);
 const angles=player.team===0?[24,34,44,54,64,74,84]:[156,146,136,126,116,106,96];
 let best={score:-Infinity,angle:player.team===0?45:135,power:60,weapon:"single"};
 function evaluate(weapon,angle,power){
  const projected=predict(room.room.grid,player,room.room.players,weapon,power,angle,room.room.wind);
  if(projected.missing)return;
  for(const target of opponents){
   const dist=Math.hypot(projected.x-target.x,projected.y-target.y);
   const w=WEAPONS[weapon],fall=clamp(1-Math.max(0,dist-12)/w.radius,0,1);
   const dmg=fall>0?w.damage*fall*coverMultiplier(room.room.grid,projected.x,projected.y,target):0;
   const score=dmg*(target.hp<=40?1.28:1)+(dmg===0?-Math.min(1400,dist)*.02:0)+(dmg>0&&target.hp<=dmg?15:0);
   if(score>best.score)best={score,angle,power,weapon};
  }
 }
 for(const weapon of candidates)for(const angle of angles)for(let power=18;power<=100;power+=7)evaluate(weapon,angle,power);
 const center={...best};
 for(const a of [-5,-2,0,2,5])for(const dp of [-8,-4,0,4,8]){
  const angle=clamp(center.angle+a,0,180),power=clamp(center.power+dp,0,100);
  evaluate(center.weapon,angle,power);
 }
 const angle=clamp(Math.round(best.angle+(rng()-.5)*noise*2),0,180);
 const power=clamp(Math.round(best.power+(rng()-.5)*noise*2.5),0,100);
 return {angle,power,weapon:best.weapon,forecast:Math.round(best.score)};
}
async function play({seed,noise,match}){
 const peers=[],storage={async get(){return null},async put(){},async setAlarm(){},async deleteAlarm(){}};
 const ctx={storage,blockConcurrencyWhile:fn=>fn(),getWebSockets:()=>peers};
 const game=new BarrageRoom(ctx,{});
 await game.ready;
 await game.fetch(new Request("https://room.internal/init",{method:"POST",body:JSON.stringify({code:"ABC123",hostToken:"private-host-test"})}));
 const r=game.room;r.seed=seed;r.match=match-1;r.settings.timer=0;
 for(let side=0;side<2;side++)for(let i=0;i<6;i++){
  r.players.push({id:side+"-"+i,name:"Bot "+side+"-"+i,token:"test"+side+i,team:side,slot:i+1,squad:0,x:0,y:0,hp:120,alive:true,locked:false,connected:true,inventory:{},fuel:60,aim:null,stats:{shots:0,hits:0,damage:0,kills:0}});
 }
 game.assignSquads();await game.startMatch();
 const rng=rand(seed^3907),history=[];
 while(r.phase!=="over"&&r.turnIndex<50){
  const turn=r.turnIndex,firing=game.firing();
  for(const player of firing){
   const choice=chooseShot(game,player,rng,noise);
   player.aim={angle:choice.angle,power:choice.power,weapon:choice.weapon};player.locked=true;
  }
  const team=r.turn.team;
  await game.fire();
  history.push({turn:turn+1,team,shots:firing.length,hp:[0,1].map(s=>r.players.filter(p=>p.team===s&&p.alive).reduce((sum,p)=>sum+p.hp,0)),alive:[0,1].map(s=>r.players.filter(p=>p.team===s&&p.alive).length)});
  await game.alarm();
 }
 const hp=[0,1].map(s=>r.players.filter(p=>p.team===s&&p.alive).reduce((sum,p)=>sum+p.hp,0));
 const alive=[0,1].map(s=>r.players.filter(p=>p.team===s&&p.alive).length);
 return {seed,noise,match,turns:r.turnIndex,winner:r.winner,winType:alive.includes(0)?"wipe":r.turnIndex<40?"mercy":"limit",hp,alive,startingTeam:(match-1)%2,shots:r.players.reduce((n,p)=>n+p.stats.shots,0),finalTable:r.players.map(p=>({id:p.id,team:p.team,hp:p.hp,alive:p.alive,damage:p.stats.damage})),history};
}
const cases=[{seed:101,noise:0.5,match:1},{seed:202,noise:1.5,match:2},{seed:303,noise:2.5,match:3}];
let failed=0;
for(const spec of cases){
 const res=await play(spec);
 console.log("MATCH RESULT",JSON.stringify({...res,history:res.history.filter(p=>[12,20,26,30,35,40].includes(p.turn))}));
 if(res.turns>=40||res.winType==="limit")failed++;
}
if(failed)console.log("PACING DIAGNOSTIC:",failed,"out of 3 matches reached 40-turn decision. This cannot be called check 6 passed.");
