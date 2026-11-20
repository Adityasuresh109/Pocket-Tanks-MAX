import test from "node:test";
import assert from "node:assert/strict";
import {BarrageRoom} from "../worker/index.js";
import {WIDTH,CW,CH,simulateVolley} from "../shared/engine.js";

const plain=()=>{
 const g=new Uint8Array(CW*CH);
 for(let j=150;j<CH;j++)for(let i=0;i<CW;i++)g[j*CW+i]=1;
 return g;
};
const player=(id,team,x)=>({id,team,x,y:588,hp:120,alive:true});
async function room(count=6){
 const sockets=[],storage={async get(){return null},async put(){},async setAlarm(){},async deleteAlarm(){}};
 const ctx={storage,blockConcurrencyWhile:fn=>fn(),getWebSockets:()=>sockets};
 const r=new BarrageRoom(ctx,{});
 await r.ready;
 await r.fetch(new Request("https://room.internal/init",{method:"POST",body:JSON.stringify({code:"ABC123",hostToken:"secret"})}));
 for(let team=0;team<2;team++)for(let i=0;i<count;i++)
  r.room.players.push({id:team+"-"+i,token:"seat",name:"Player "+team+i,team,slot:i+1,squad:0,x:0,y:0,hp:120,alive:true,locked:false,connected:true,inventory:{},fuel:60,aim:null,stats:{shots:0,hits:0,damage:0,kills:0}});
 r.assignSquads();return r;
}
test("The Forts best-of series alternates the starting side Red/Blue/Red",async()=>{
 const r=await room(2);
 for(const [match,side]of [[1,0],[2,1],[3,0]]){
  await r.startMatch();
  assert.equal(r.room.match,match);
  assert.equal(r.room.turn.team,side);
  assert.equal(r.room.turn.squad,0);
  r.room.phase="over";
 }
});
test("at turn 16, living tanks combine into one firing group, including both former squads",async()=>{
 const r=await room(6);await r.startMatch();
 for(let i=0;i<16;i++){await r.fire();await r.alarm();}
 assert.equal(r.room.turnIndex,16);
 assert.equal(r.room.turn.squad,2);
 assert.equal(r.firing().length,6);
 const formerA=r.room.players.find(p=>p.team===r.room.turn.team&&p.squad===0);
 const formerB=r.room.players.find(p=>p.team===r.room.turn.team&&p.squad===1);
 for(const p of [formerA,formerB])assert.equal(r.isActiveFirer(p),true);
 const other=r.room.players.find(p=>p.team!==r.room.turn.team);
 assert.equal(r.isActiveFirer(other),false);
});
test("combined-team secret aim is visible only to that team, never enemy or host",async()=>{
 const r=await room(4);await r.startMatch();
 r.room.turnIndex=16;r.room.turn.squad=2;
 const team=r.room.players.filter(p=>p.team===r.room.turn.team),enemy=r.room.players.find(p=>p.team!==r.room.turn.team);
 const sockets=[];
 const mk=(role,id)=>{const ws={deserializeAttachment:()=>({role,id,gridEpoch:-1}),serializeAttachment(){},send(x){this.message=JSON.parse(x);}};sockets.push(ws);return ws;};
 r.ctx.getWebSockets=()=>sockets;
 const first=mk("player",team[0].id),second=mk("player",team[3].id),opponent=mk("player",enemy.id),host=mk("host","host");
 await r.webSocketMessage(first,JSON.stringify({type:"aim",angle:77,power:33,weapon:"bertha"}));
 assert.equal(second.message.squadAim.find(p=>p.id===team[0].id).angle,77);
 for(const ws of [opponent,host]){
  assert.equal(ws.message.squadAim,undefined);
  assert.ok(!JSON.stringify(ws.message).includes('"angle":77'));
 }
});
test("Roller travels along the surface and detonates at the near lip of a trench",()=>{
 const g=plain();
 for(let j=150;j<CH;j++)for(let i=100;i<111;i++)g[j*CW+i]=0; // 400px through 444px pit
 const r=simulateVolley({grid:g,players:[player("a",0,100),player("b",1,900)],shots:[{playerId:"a",weapon:"roller",angle:20,power:20}],seed:1,wind:0});
 assert.equal(r.events[0].type,"roll");
 assert.equal(r.events.at(-1).type,"boom");
 const end=r.events.at(-1);
 assert.ok(end.x>=394&&end.x<=404,"Roller must stop at near lip, got "+end.x);
 assert.equal(r.players[1].hp,120);
});
test("Bouncer produces exactly two ricochets then explodes on the third ground hit",()=>{
 const r=simulateVolley({grid:plain(),players:[player("a",0,100),player("b",1,900)],shots:[{playerId:"a",weapon:"bouncer",angle:20,power:20}],seed:1});
 assert.deepEqual(r.events.filter(e=>e.type==="bounce").map(e=>e.count),[1,2]);
 assert.equal(r.events.filter(e=>e.type==="boom").length,1);
 assert.ok(r.events[2].t>r.events[1].t&&r.events[1].t>r.events[0].t);
});

test("Twinshot Finale fires a free Single Shot after turn 16 without double charging inventory or exceeding damage cap",async()=>{
 const r=await room(2);await r.startMatch();
 const shooter=r.room.players.find(p=>p.team===0&&p.squad===0);
 r.room.turnIndex=28;r.room.turn={team:0,squad:2};
 const hadBertha=shooter.inventory.bertha||0;
 shooter.aim={angle:45,power:65,weapon:hadBertha?"bertha":"single"};shooter.locked=true;
 const before=r.room.players.map(p=>({id:p.id,hp:p.hp}));
 await r.fire();
 assert.equal(r.room.lastVolley.shots.length,2);
 assert.equal(r.room.lastVolley.shots[1].weapon,hadBertha?"bertha":"single");
 assert.equal(r.room.lastVolley.shots[0].playerId,r.room.lastVolley.shots[1].playerId);
 if(hadBertha)assert.equal(shooter.inventory.bertha,hadBertha-1);
 for(const p of r.room.players){
  const prior=before.find(x=>x.id===p.id);
  assert.ok(prior.hp-p.hp<=40,"Per-volley cap must hold even for twin shots");
 }
});

test("Sudden Death redeploys all remaining teams at turn 30 without changing HP, inventories or team assignments",async()=>{
 const r=await room(6);await r.startMatch();
 const original=new Map(r.room.players.map(p=>[p.id,{hp:p.hp,team:p.team,inventory:JSON.stringify(p.inventory)}]));
 for(let i=0;i<30;i++){await r.fire();await r.alarm();}
 assert.equal(r.room.turnIndex,30);
 assert.equal(r.room.converged,true);
 assert.equal(r.room.phase,"aim");
 assert.equal(r.room.grid[100*CW+80],0,"open firing sky");
 assert.equal(r.room.grid[160*CW+80],1,"solid flat dirt arena");
 for(const side of [0,1]){
  const positions=r.room.players.filter(p=>p.team===side&&p.alive).map(p=>p.x).sort((a,b)=>a-b);
  assert.ok(positions.every(x=>x>=300&&x<=980));
  for(let i=1;i<positions.length;i++)assert.ok(positions[i]-positions[i-1]>=50);
 }
 for(const p of r.room.players){
  const old=original.get(p.id);
  assert.equal(p.hp,old.hp);assert.equal(p.team,old.team);
  assert.equal(JSON.stringify(p.inventory),old.inventory);
  assert.equal(p.y,588);assert.equal(p.buried,false);
 }
 const moved=r.room.players.map(p=>p.x);
 await r.fire();await r.alarm();
 assert.equal(r.room.converged,true);
 assert.deepEqual(r.room.players.map(p=>p.x),moved,"Sudden Death must not teleport every turn");
});
