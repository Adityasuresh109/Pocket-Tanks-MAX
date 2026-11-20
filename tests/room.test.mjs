
import test from "node:test";
import assert from "node:assert/strict";
import {BarrageRoom} from "../worker/index.js";

const mockSocket=(role,id,peers)=>{
 const ws={attachment:{role,id,gridEpoch:-1},frames:[],
  deserializeAttachment(){return this.attachment;},
  serializeAttachment(value){this.attachment=value;},
  send(text){this.frames.push(JSON.parse(text));},
  close(){this.closed=true;}};
 peers.push(ws);
 return ws;
};
async function roomWith(teamSize=6){
 const peers=[],storage={
  saved:null,alarm:null,
  async get(){return null;},
  async put(k,v){this.saved=v;},
  async setAlarm(n){this.alarm=n;},
  async deleteAlarm(){this.alarm=null;}
 };
 const ctx={storage,blockConcurrencyWhile(fn){return fn();},getWebSockets(){return peers;}};
 const room=new BarrageRoom(ctx,{});
 await room.ready;
 const init=await room.fetch(new Request("https://room.internal/init",{method:"POST",body:JSON.stringify({code:"ABC123",hostToken:"host-secret"})}));
 assert.equal(init.status,201);
 for(let team=0;team<2;team++)for(let i=0;i<teamSize;i++){
  room.room.players.push({id:`${team}-${i}`,token:`token-${team}-${i}`,name:`P${team}${i}`,team,slot:i+1,squad:0,x:0,y:0,hp:120,alive:true,locked:false,connected:true,inventory:{},fuel:60,aim:null,stats:{shots:0,hits:0,damage:0,kills:0}});
 }
 room.assignSquads();
 return {room,peers,storage};
}
test("6v6 squad rotation runs 3/3 alternating teams without waiting for unlocked players",async()=>{
 const {room}=await roomWith(6);
 await room.startMatch();
 const actual=[];
 for(let i=0;i<6;i++){
  actual.push([room.room.turn.team,room.room.turn.squad,room.firing().length]);
  await room.fire();
  assert.equal(room.room.phase,"replay");
  await room.alarm();
 }
 assert.deepEqual(actual,[[0,0,3],[1,0,3],[0,1,3],[1,1,3],[0,0,3],[1,0,3]]);
});
test("5v5 and 4v4 squad sizes are 3/2 and 2/2 respectively",async()=>{
 for(const [size,want]of [[5,[3,3,2,2]],[4,[2,2,2,2]]]){
  const {room}=await roomWith(size);await room.startMatch();const actual=[];
  for(let i=0;i<4;i++){actual.push(room.firing().length);await room.fire();await room.alarm();}
  assert.deepEqual(actual,want);
 }
});
test("only firing-squad phones can receive aim and weapon data during aiming",async()=>{
 const {room,peers}=await roomWith(4);
 const shooter=room.room.players.find(p=>p.team===0&&p.squad===0);
 const squadmate=room.room.players.find(p=>p.team===0&&p.squad===0&&p.id!==shooter.id);
 const other=room.room.players.find(p=>p.team===0&&p.squad===1);
 const enemy=room.room.players.find(p=>p.team===1);
 const ownWS=mockSocket("player",shooter.id,peers),mateWS=mockSocket("player",squadmate.id,peers),otherWS=mockSocket("player",other.id,peers),enemyWS=mockSocket("player",enemy.id,peers),hostWS=mockSocket("host","host",peers);
 await room.startMatch();
 await room.webSocketMessage(ownWS,JSON.stringify({type:"aim",angle:71,power:63,weapon:"bertha"}));
 const last=ws=>ws.frames.filter(x=>x.type==="state").at(-1);
 assert.equal(last(ownWS).you.angle,71);
 assert.equal(last(mateWS).squadAim.find(p=>p.id===shooter.id).angle,71);
 for(const ws of [otherWS,enemyWS]){
  assert.equal(last(ws).squadAim,undefined);
  assert.equal(last(ws).turretAngles,undefined,"Angle is public only on the TV, not other phones");
  assert.ok(!JSON.stringify(last(ws)).includes('"angle":71'));
  assert.ok(!JSON.stringify(last(ws)).includes('"power":63'));
  assert.ok(!JSON.stringify(last(ws)).includes('"weapon":"bertha"'));
 }
 const hostState=last(hostWS);
 assert.equal(hostState.squadAim,undefined);
 assert.ok(hostState.turretAngles.some(t=>t.id===shooter.id&&t.angle===71));
 assert.ok(!JSON.stringify(hostState).includes('"power":63'));
 assert.ok(!JSON.stringify(hostState).includes('"weapon":"bertha"'));
 assert.deepEqual(Object.keys(hostState.turretAngles.find(t=>t.id===shooter.id)).sort(),["angle","id"]);
 // The TV changes immediately with each angle input, without waiting for lock-in.
 await room.webSocketMessage(ownWS,JSON.stringify({type:"aim",angle:119,power:7,weapon:"rail"}));
 assert.equal(last(hostWS).turretAngles.find(t=>t.id===shooter.id).angle,119);
 assert.equal(last(enemyWS).turretAngles,undefined);
 assert.equal(last(otherWS).turretAngles,undefined);
 assert.ok(!JSON.stringify(last(hostWS)).includes('"power":7'));
 assert.ok(!JSON.stringify(last(hostWS)).includes('"weapon":"rail"'));
});
test("skipping a stuck turn rotates to other team and host can pause/resume countdown",async()=>{
 const {room}=await roomWith(2);
 const host=mockSocket("host","host",[]);
 await room.startMatch();
 await room.hostAction(host,{action:"pause"});assert.equal(room.room.paused,true);
 await room.hostAction(host,{action:"pause"});assert.equal(room.room.paused,false);
 await room.hostAction(host,{action:"skip"});
 assert.equal(room.room.turn.team,1);
 assert.equal(room.room.turnIndex,1);
});

test("host disconnect during aim freezes the alarm and retains the remaining timer",async()=>{
 const {room,peers,storage}=await roomWith(4);
 const host=mockSocket("host","host",peers);
 await room.startMatch();
 assert.equal(room.room.phase,"aim");
 assert.ok(room.room.deadline>Date.now());
 await room.webSocketClose(host);
 assert.equal(room.room.paused,true);
 assert.equal(room.room.deadline,0);
 assert.ok(room.room.remaining>0);
 assert.equal(storage.alarm,null);
 await room.alarm();
 assert.equal(room.room.phase,"aim","No shot may fire while the host is disconnected");
});
