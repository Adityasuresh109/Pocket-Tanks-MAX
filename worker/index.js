import {generate,spawn,moveTank,simulateVolley,WEAPONS,encode} from "../shared/engine.js";

const MAX_PLAYERS=12, MAX_NAME=20;
const json=(obj,status=200)=>new Response(JSON.stringify(obj),{status,headers:{"content-type":"application/json; charset=utf-8","access-control-allow-origin":"*","cache-control":"no-store"}});
const codeFrom=()=>{const chars="ABCDEFGHJKLMNPQRSTUVWXYZ23456789",b=new Uint8Array(6);crypto.getRandomValues(b);return Array.from(b,x=>chars[x%chars.length]).join("");};
const token=()=>crypto.randomUUID()+"-"+crypto.randomUUID();
const rand=(seed,n=1)=>{let x=(seed|0)^n*2654435761;x^=x<<13;x^=x>>>17;x^=x<<5;return(x>>>0)/4294967296};
const parse=(text)=>{try{return JSON.parse(text)}catch{return null}};
const validCode=s=>/^[A-HJ-NP-Z2-9]{6}$/.test(s);
const cleanName=n=>String(n||"").replace(/[<>]/g,"").replace(/\s+/g," ").trim().slice(0,MAX_NAME);
const publicPlayer=p=>({id:p.id,name:p.name,team:p.team,squad:p.squad,slot:p.slot,x:p.x,y:p.y,hp:p.hp,alive:p.alive,locked:p.locked,connected:p.connected,buried:!!p.buried,stats:p.stats});
const sanitize=(p)=>({angle:Math.round(Math.max(0,Math.min(180,Number(p?.angle)||0))),power:Math.round(Math.max(0,Math.min(100,Number(p?.power)||0))),weapon:WEAPONS[p?.weapon]?p.weapon:"single"});
export default {
 async fetch(request,env){
  const url=new URL(request.url),path=url.pathname;
  if(request.method==="OPTIONS")return new Response(null,{status:204,headers:{"access-control-allow-origin":"*","access-control-allow-headers":"content-type","access-control-allow-methods":"GET,POST,OPTIONS"}});
  if(path==="/health")return json({ok:true,service:"BARRAGE",version:"r3"});
  if(path==="/api/rooms"&&request.method==="POST"){
   // 6-char codes have ample entropy for ephemeral party rooms. Retry if ever allocated.
   for(let i=0;i<5;i++){
    const code=codeFrom(),hostToken=token(),id=env.ROOMS.idFromName(code),stub=env.ROOMS.get(id);
    const response=await stub.fetch("https://room.internal/init",{method:"POST",body:JSON.stringify({code,hostToken})});
    if(response.status===201)return json({code,hostToken,wsBase:url.origin.replace(/^http/,"ws")});
   }
   return json({error:"Unable to create a room. Please retry."},503);
  }
  if(path.startsWith("/ws/")){
   const code=path.slice(4).toUpperCase();
   if(!validCode(code))return json({error:"Invalid room code."},400);
   return env.ROOMS.get(env.ROOMS.idFromName(code)).fetch("https://room.internal/connect"+url.search,{headers:request.headers});
  }
  return json({error:"Not found. Use /health, POST /api/rooms, or /ws/ROOMCODE."},404);
 }
};

export class BarrageRoom {
 constructor(ctx,env){this.ctx=ctx;this.env=env;this.room=null;this.ready=this.ctx.blockConcurrencyWhile(async()=>{this.room=await this.ctx.storage.get("room")||null;});}
 async save(){await this.ctx.storage.put("room",this.room);}
 message(ws,data){try{ws.send(JSON.stringify(data));}catch{}}
 attachment(ws){try{return ws.deserializeAttachment()||{}}catch{return{}}}
 connections(){return this.ctx.getWebSockets()}
 sock(id,role){return this.connections().filter(ws=>{const a=this.attachment(ws);return a.id===id&&a.role===role;});}
 sendTo(id,role,payload){for(const ws of this.sock(id,role))this.message(ws,payload);}
 sendHost(payload){for(const ws of this.connections().filter(s=>this.attachment(s).role==="host"))this.message(ws,payload);}
 error(ws,detail){this.message(ws,{type:"error",message:detail});}
 active(){return this.room?.players.filter(p=>p.alive)||[];}
 // From turn 16 onward, all remaining tanks fire together.
 isActiveFirer(p){
  const r=this.room;
  return !!(p?.alive&&p.team===r.turn.team&&(r.turn.squad===2||p.squad===r.turn.squad));
 }
 visibleSeat(p){return {...publicPlayer(p),inventory:{...p.inventory},fuel:p.fuel,angle:p.aim?.angle??45,power:p.aim?.power??55,weapon:p.aim?.weapon||"single"};}
 terrainSnapshot(){
  if(!this.room.grid)return null;
  if(this.cachedEpoch!==this.room.gridEpoch){this.cachedEpoch=this.room.gridEpoch;this.cachedGrid=encode(this.room.grid);}
  return this.cachedGrid;
 }
 summary(){
  const r=this.room;
  return {type:"state",code:r.code,phase:r.phase,map:r.map,turn:r.turn,turnIndex:r.turnIndex,finalBarrage:r.turn.squad===2,wind:r.wind,deadline:r.deadline,paused:r.paused,reason:r.reason||"",series:r.series,match:r.match,players:r.players.map(publicPlayer),grid:this.terrainSnapshot(),events:r.lastVolley||null,winner:r.winner||null,settings:r.settings};
 }
 update(extra){
  if(!this.room)return;
  const base=this.summary();
  for(const ws of this.connections()){
   const auth=this.attachment(ws);
   const view={...base,...extra};
   if(auth.role==="player"){
    const p=this.room.players.find(p=>p.id===auth.id);
    if(!p)continue;
    view.you=this.visibleSeat(p);
    if(this.room.phase==="aim"&&this.isActiveFirer(p)){
     view.squadAim=this.room.players.filter(t=>this.isActiveFirer(t)).map(t=>({id:t.id,name:t.name,locked:t.locked,...(t.aim?{angle:t.aim.angle,power:t.aim.power,weapon:t.aim.weapon}:{})}));
    }
   }else{
    // The host never sees private aim data during the aim phase.
    view.you={role:"host"};
   }
   const epoch=this.attachment(ws).gridEpoch??-1;
   if(epoch===this.room.gridEpoch)view.grid=null;
   else ws.serializeAttachment({...auth,gridEpoch:this.room.gridEpoch});
   this.message(ws,view);
  }
 }
 async fetch(request){
  const path=new URL(request.url);
  if(path.pathname==="/init"){
   if(this.room)return json({error:"Room code already exists."},409);
   const {code,hostToken}=await request.json();
   this.room={code,hostToken,phase:"lobby",map:"forts",players:[],series:{red:0,blue:0,bestOf:3},match:0,turnIndex:0,turn:{team:0,squad:0},nextSquad:[0,0],wind:0,deadline:0,paused:false,reason:"",gridEpoch:0,grid:null,winner:null,lastVolley:null,settings:{timer:45},log:[],seed:Math.floor(Math.random()*4294967295)};
   await this.save();return json({ok:true},201);
  }
  if(path.pathname!=="/connect")return json({error:"Not found"},404);
  if(!this.room)return json({error:"Room not found. Check the room code."},404);
  if(request.headers.get("Upgrade")?.toLowerCase()!=="websocket")return json({error:"WebSocket upgrade required."},426);
  const params=path.searchParams,role=params.get("role")==="host"?"host":"player";
  const credentials=params.get("token")||"";
  let id="host",seat=null;
  if(role==="host"){
   if(credentials!==this.room.hostToken)return json({error:"Invalid host key."},403);
  }else{
   seat=this.room.players.find(p=>p.token===credentials&&p.id===params.get("id"));
   if(!seat){
    if(this.room.phase!=="lobby")return json({error:"Match in progress. Only existing players can reconnect."},409);
    if(this.room.players.length>=MAX_PLAYERS)return json({error:"Room full (12 players)."},409);
    const name=cleanName(params.get("name"));
    if(name.length<1)return json({error:"Enter your name to join."},400);
    const team=this.room.players.filter(p=>p.team===0).length<=this.room.players.filter(p=>p.team===1).length?0:1;
    const slot=1+this.room.players.filter(p=>p.team===team).length;
    seat={id:crypto.randomUUID(),token:token(),name,team,slot,squad:0,x:0,y:0,hp:120,alive:true,locked:false,connected:true,inventory:{},fuel:60,aim:null,stats:{shots:0,hits:0,damage:0,kills:0}};
    this.room.players.push(seat);this.assignSquads();
   }
   id=seat.id;
  }
  const pair=new WebSocketPair(),client=pair[0],server=pair[1];
  this.ctx.acceptWebSocket(server);
  server.serializeAttachment({role,id,gridEpoch:-1});
  // Drop stale connections to the same seat after reconnect.
  for(const old of this.sock(id,role))if(old!==server)try{old.close(4001,"Session reclaimed")}catch{}
  if(seat){seat.connected=true;await this.save();this.message(server,{type:"welcome",id:seat.id,token:seat.token,code:this.room.code});}
  else {this.message(server,{type:"welcome",role:"host",code:this.room.code});if(this.room.paused&&this.room.reason==="Host disconnected — game paused."){this.room.paused=false;this.room.reason="";this.room.deadline=this.room.settings.timer?Date.now()+Math.max(1000,this.room.remaining||30000):0;await this.arm();await this.save();}}
  this.update();
  return new Response(null,{status:101,webSocket:client});
 }
 assignSquads(){for(const side of [0,1]){const members=this.room.players.filter(p=>p.team===side);const first=Math.ceil(members.length/2);
  members.forEach((p,i)=>{p.slot=i+1;p.squad=i<first?0:1;});}}
 async webSocketMessage(ws,msg){
  const actor=this.attachment(ws);const r=this.room;if(!r)return;
  const data=parse(typeof msg==="string"?msg:"");if(!data||typeof data.type!=="string")return this.error(ws,"Invalid message.");
  const isHost=actor.role==="host",p=r.players.find(p=>p.id===actor.id);
  if(!isHost&&!p)return this.error(ws,"Seat not found. Rejoin the room.");
  try{
   if(data.type==="ping"){this.message(ws,{type:"pong",at:Date.now()});return;}
   if(data.type==="host"&&isHost)await this.hostAction(ws,data);
   else if(data.type==="aim"&&p&&r.phase==="aim"&&!r.paused&&this.isActiveFirer(p)){
    if(p.locked)return this.error(ws,"Unlock to change your aim.");
    p.aim=sanitize(data);this.update();
   }
   else if(data.type==="move"&&p&&r.phase==="aim"&&!r.paused&&!p.locked&&this.isActiveFirer(p)){
    const step=Math.max(-8,Math.min(8,Number(data.dx)||0));
    const result=moveTank(r.grid,r.players,p.id,step,p.fuel);p.fuel=Math.max(0,p.fuel-result.moved);await this.save();this.update();
   }
   else if(data.type==="lock"&&p&&r.phase==="aim"&&!r.paused&&this.isActiveFirer(p)){
    p.aim=p.aim||sanitize({angle:45,power:55,weapon:"single"});const weapon=p.aim.weapon;
    if(weapon!=="single"&&!(p.inventory[weapon]>0))return this.error(ws,"You're out of that weapon. Select another.");
    p.locked=!!data.locked;await this.save();this.update();
    if(this.firing().length&&this.firing().every(t=>t.locked))await this.fire();
   }
   else if(!isHost)this.error(ws,"Action not available right now.");
  }catch(err){console.error("room message failure",err);this.error(ws,"Something went wrong. Please retry.");}
 }
 async hostAction(ws,data){
  const r=this.room,action=data.action;
  if(action==="map"&&r.phase==="lobby"){if(["forts","canyon","hollow"].includes(data.value))r.map=data.value;}
  else if(action==="timer"&&r.phase==="lobby"){if([0,30,45,60].includes(Number(data.value)))r.settings.timer=Number(data.value);}
  else if(action==="bestOf"&&r.phase==="lobby"){if([1,3,5].includes(Number(data.value)))r.series.bestOf=Number(data.value);}
  else if(action==="swap"&&r.phase==="lobby"){const p=r.players.find(p=>p.id===data.id);if(p){const other=r.players.filter(x=>x.team!==p.team);if(other.length>=6)return this.error(ws,"Other team is full.");p.team=1-p.team;this.assignSquads();}}
  else if(action==="remove"){
   const i=r.players.findIndex(p=>p.id===data.id);
   if(i>=0){const[p]=r.players.splice(i,1);for(const sock of this.sock(p.id,"player"))try{sock.close(4002,"Removed by host")}catch{}
    if(r.phase==="lobby")this.assignSquads();else if(r.phase==="aim"&&this.firing().every(x=>x.locked))await this.fire();
   }
  }
  else if(action==="start"&&r.phase==="lobby"){if(!this.balanced())return this.error(ws,"Teams need at least one player each and must be balanced.");await this.startMatch();return;}
  else if(action==="pause"&&r.phase==="aim"){r.paused=!r.paused;if(r.paused){r.remaining=r.deadline?Math.max(0,r.deadline-Date.now()):0;r.deadline=0;r.reason="Host paused the game.";}else{r.reason="";r.deadline=r.settings.timer?Date.now()+Math.max(1000,r.remaining):0;await this.arm();}}
  else if(action==="skip"&&r.phase==="aim"){r.turnIndex++;await this.advance();return;}
  else if(action==="force"&&r.phase==="aim"){await this.fire();return;}
  else if(action==="restartVolley"&&r.phase==="aim"){for(const p of this.firing()){p.locked=false;p.aim=null;}r.deadline=r.settings.timer?Date.now()+r.settings.timer*1000:0;await this.arm();}
  else if(action==="end"&&["aim","replay"].includes(r.phase)){await this.finish(1-r.turn.team,true);return;}
  else if(action==="rematch"&&r.phase==="over"){await this.startMatch();return;}
  else if(action==="reshuffle"&&r.phase==="over"){r.phase="lobby";r.match=0;r.series.red=0;r.series.blue=0;r.winner=null;r.players.sort(()=>Math.random()-.5);r.players.forEach((p,i)=>p.team=i%2);this.assignSquads();}
  else return this.error(ws,"Action unavailable in this phase.");
  await this.save();this.update();
 }
 balanced(){const reds=this.room.players.filter(p=>p.team===0).length,blues=this.room.players.length-reds;return reds>=1&&blues>=1&&Math.abs(reds-blues)<=1&&reds<=6&&blues<=6;}
 firing(){const r=this.room;return r.players.filter(p=>this.isActiveFirer(p));}
 async startMatch(){
  const r=this.room;if(!this.balanced())return;
  r.match++;r.grid=generate(r.map,r.seed+r.match);r.gridEpoch++;r.phase="aim";r.turnIndex=0;r.turn={team:(r.match-1)%2,squad:0};r.nextSquad=[0,0];r.winner=null;r.lastVolley=null;r.log=[];r.suddenDeath=false;
  // Match-level mirrored weapons by slot.
  const pool=Object.keys(WEAPONS).filter(x=>!["single","dirt","excavator"].includes(x));
  const packs={};for(let slot=1;slot<=6;slot++){const shuffled=[...pool].sort((a,b)=>rand(r.seed+r.match+slot,a.charCodeAt(0))-rand(r.seed+r.match+slot,b.charCodeAt(0)));packs[slot]=shuffled.slice(0,5);}
  for(const p of r.players){const pos=spawn(r.grid,p.team,p.slot,r.map);
   Object.assign(p,{...pos,hp:120,alive:true,buried:false,locked:false,aim:null,fuel:60,stats:{shots:0,hits:0,damage:0,kills:0},inventory:{single:-1,dirt:2,excavator:2}});
   for(const w of packs[p.slot])p.inventory[w]=2;
  }
  await this.beginTurn();
 }
 async beginTurn(){
  const r=this.room;
  const aliveTeam=s=>r.players.some(p=>p.alive&&p.team===s);
  if(!aliveTeam(0)||!aliveTeam(1)){await this.finish(aliveTeam(0)?0:1);return;}
  // Decisive advantage: 3 tanks' worth of HP plus two living tanks.
  // No weapon's 30 HP maximum or 40 HP volley cap is modified.
  const hp=side=>r.players.filter(p=>p.team===side&&p.alive).reduce((sum,p)=>sum+p.hp,0);
  const alive=side=>r.players.filter(p=>p.team===side&&p.alive).length;
  const redHP=hp(0),blueHP=hp(1),redAlive=alive(0),blueAlive=alive(1);
  // R3: finish genuinely one-sided games, not routine 40-turn HP calls.
  if(r.turnIndex>=24){
   const lead=Math.abs(redHP-blueHP);
   const lower=Math.max(1,Math.min(redHP,blueHP));
   const aliveLead=Math.abs(redAlive-blueAlive);
   const crushing=lead>=360&&aliveLead>=2;
   const commanding=r.turnIndex>=30&&lead>=110&&aliveLead>=2&&lead/lower>=.6;
   const lastStand=r.turnIndex>=34&&lead>=65&&aliveLead>=1&&lead/lower>=.65;
   if(crushing||commanding||lastStand){await this.finish(redHP>blueHP?0:1);return;}
  }
  if(r.turnIndex>=40){
   if(redHP!==blueHP){await this.finish(redHP>blueHP?0:1);return;}
   if(redAlive!==blueAlive){await this.finish(redAlive>blueAlive?0:1);return;}
   r.suddenDeath=true;
  }
  
  r.phase="aim";r.paused=false;r.reason="";r.lastVolley=null;
  const team=r.turn.team;
  let squad=r.nextSquad[team];
  if(r.turnIndex>=16){
   squad=2; // FINAL BARRAGE: all surviving tanks fire every team turn.
  }else{
   if(!r.players.some(p=>p.alive&&p.team===team&&p.squad===squad))squad=1-squad;
   if(!r.players.some(p=>p.alive&&p.team===team&&p.squad===squad)){await this.finish(1-team);return;}
   r.nextSquad[team]=1-squad;
  }
  r.turn={team,squad};
  r.wind=Math.round(rand(r.seed+r.match*991,r.turnIndex+11)*100-50);
  for(const p of r.players){p.locked=false;p.aim=null;p.fuel=60;}
  r.deadline=r.settings.timer?Date.now()+r.settings.timer*1000:0;
  await this.arm();await this.save();this.update();
 }
 async arm(){if(this.room.deadline)await this.ctx.storage.setAlarm(this.room.deadline);else await this.ctx.storage.deleteAlarm();}
 async alarm(){const r=this.room;if(!r)return;if(r.phase==="replay"){await this.advance();return;}if(r.phase!=="aim"||r.paused||!r.deadline)return;if(Date.now()+100<r.deadline){await this.arm();return;}await this.fire();}
 async fire(){
  const r=this.room;if(r.phase!=="aim"||r.paused)return;
  r.phase="replay";r.deadline=0;await this.ctx.storage.deleteAlarm();
  const primaries=this.firing().filter(p=>p.locked).map(p=>({playerId:p.id,...p.aim}));
  // Twinshot Finale: from turn 16, every surviving locked tank gets a
  // complimentary standard shell at a 2-degree offset. Damage still caps at
  // 40 HP per target per volley; no extra inventory is consumed.
  const echoes=r.turnIndex>=16?primaries.map(s=>({
   playerId:s.playerId,weapon:s.weapon==="bertha"?"bertha":"single",angle:Math.max(0,Math.min(180,s.angle+(s.angle<=90?2:-2))),power:s.power
  })):[];
  const shots=[...primaries,...echoes];
  for(const s of primaries){const p=r.players.find(p=>p.id===s.playerId);if(s.weapon!=="single"&&p.inventory[s.weapon]>0)p.inventory[s.weapon]--;p.stats.shots++;}
  for(const s of echoes){const p=r.players.find(p=>p.id===s.playerId);p.stats.shots++;}
  const before=r.players.map(p=>({id:p.id,hp:p.hp,alive:p.alive}));
  const seed=(r.seed+r.match*1009+r.turnIndex*19)>>>0;
  const result=simulateVolley({grid:r.grid,players:r.players,shots,wind:r.wind,seed});
  r.grid=result.grid;r.gridEpoch++;for(const t of result.players){const p=r.players.find(p=>p.id===t.id);p.x=t.x;p.y=t.y;p.hp=t.hp;p.alive=t.alive;p.buried=!!t.buried;}
  for(const[id,dmg]of Object.entries(result.damageBy)){const p=r.players.find(p=>p.id===id);if(p){p.stats.damage+=dmg;if(dmg>0)p.stats.hits++;}}
  for(const [id,kills]of Object.entries(result.killsBy||{})){
   const scorer=r.players.find(p=>p.id===id);if(scorer)scorer.stats.kills+=kills;
  }
  r.log.push({turn:r.turnIndex,seed,wind:r.wind,shots,before,after:r.players.map(p=>({id:p.id,hp:p.hp,x:p.x,y:p.y,alive:p.alive})),events:result.events});
  r.lastVolley={seed,wind:r.wind,shots:shots.map(s=>({playerId:s.playerId,weapon:s.weapon,angle:s.angle,power:s.power})),trace:result.trace,events:result.events,duration:Math.max(1,result.duration),turn:r.turnIndex};
  r.turnIndex++;
  // Immediate server state is resolved. Clients replay the public flight log.
  await this.save();this.update();
  const duration=Math.max(1200,Math.min(9000,Math.ceil(result.duration*1000)+1100));
  await this.ctx.storage.setAlarm(Date.now()+duration);
 }
 async advance(){
  const r=this.room;r.phase="aim";r.turn={team:1-r.turn.team,squad:r.nextSquad[1-r.turn.team]};await this.beginTurn();
 }
 async finish(winner,forfeit=false){
  const r=this.room;r.phase="over";r.deadline=0;r.paused=false;r.winner=winner;r.series[winner===0?"red":"blue"]++;
  r.reason=forfeit?"Match ended by host.":"";await this.ctx.storage.deleteAlarm();await this.save();this.update();
 }
 async webSocketClose(ws){await this.depart(ws);}
 async webSocketError(ws){await this.depart(ws);}
 async depart(ws){
  const a=this.attachment(ws),r=this.room;if(!r)return;
  if(a.role==="player"){const p=r.players.find(p=>p.id===a.id);if(p){p.connected=this.sock(p.id,"player").some(s=>s!==ws);}}
  else if(a.role==="host"&&!this.sock("host","host").some(s=>s!==ws)&&r.phase==="aim"&&!r.paused){r.paused=true;r.reason="Host disconnected — game paused.";r.remaining=r.deadline?Math.max(0,r.deadline-Date.now()):0;r.deadline=0;await this.ctx.storage.deleteAlarm();}
  await this.save();this.update();
 }
}
