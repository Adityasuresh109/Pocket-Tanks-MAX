
import {generate,spawn,decode,WIDTH,HEIGHT,CELL,CW,CH,WEAPONS} from "./shared/engine.js";
const $=id=>document.getElementById(id);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const args=new URLSearchParams(location.search), SERVER=(window.BARRAGE_WORKER_URL||"https://pocket-tanks-max.adityasuresh2110.workers.dev").replace(/\/$/,""),WS=SERVER.replace(/^http/,"ws");
const PAGE=location.origin+location.pathname,MAPS={forts:"THE FORTS",canyon:"CANYON CROSS",hollow:"THE HOLLOW"};
const team=n=>n===0?"RED":"BLUE",turnLabel=r=>r.turnIndex>=28?team(r.turn.team)+" / TWINSHOT FINALE":r.turn.squad===2?team(r.turn.team)+" / FINAL BARRAGE":team(r.turn.team)+" / SQUAD "+(r.turn.squad?"B":"A"),playerKey=c=>"barrage-seat-"+c,hostKey=c=>"barrage-host-"+c;
let role="",code="",secret="",seatId="",state=null,ws=null,retry=0,reconnectTimer=0,roomFailed=false;
let localAim={angle:45,power:60,weapon:"single"},controlKey="",grid=null,terrainBitmap=null,terrainRef=null;
let muted=localStorage.getItem("barrage-muted")==="yes",audio=null,playback=null,seenVolley=-1,drawTime=0;
const previewGrid=generate("forts",7),previewTanks=Array.from({length:12},(_,i)=>{const side=i>=6?1:0,p=spawn(previewGrid,side,i%6+1);return {id:String(i),name:["NOVA","GHOST","ECHO","JINX","BOLT","MARS","HEX","ATOM","PIXEL","BOOM","FLUX","ONYX"][i],team:side,...p,hp:120,alive:true};});
function show(name){for(const p of ["landing","join","host","player"])$(p).classList.toggle("hidden",name!==p);}
function notice(text){const t=$("toast");t.textContent=text;t.classList.remove("hidden");clearTimeout(notice.timer);notice.timer=setTimeout(()=>t.classList.add("hidden"),4300);}
function status(text,good=false){$("connection").innerHTML='<span class="pulse" style="background:'+(good?"#7edaa0":"#eea663")+'"></span>'+esc(text);}
function sound(kind="tap"){if(muted)return;try{audio ||= new (window.AudioContext||window.webkitAudioContext)();audio.resume();const o=audio.createOscillator(),g=audio.createGain(),t=audio.currentTime;o.connect(g);g.connect(audio.destination);o.type=kind==="boom"?"sawtooth":"sine";o.frequency.setValueAtTime(kind==="boom"?150:720,t);o.frequency.exponentialRampToValueAtTime(kind==="boom"?34:510,t+.2);g.gain.setValueAtTime(.04,t);g.gain.exponentialRampToValueAtTime(.0001,t+.24);o.start(t);o.stop(t+.25);}catch{}}
$("sound").textContent=muted?"♪̸":"♫";
$("sound").onclick=()=>{muted=!muted;localStorage.setItem("barrage-muted",muted?"yes":"no");$("sound").textContent=muted?"♪̸":"♫";if(!muted)sound();};
$("fullscreen").onclick=()=>{if(document.fullscreenElement)document.exitFullscreen?.();else document.documentElement.requestFullscreen?.().catch(()=>notice("Fullscreen unavailable."));};
$("showJoin").onclick=()=>{show("join");$("roomCode").focus();};
$("backHome").onclick=()=>{history.replaceState(null,"",PAGE);show("landing");};
$("create").onclick=async()=>{const b=$("create");b.disabled=true;b.textContent="CREATING ROOM…";try{const resp=await fetch(SERVER+"/api/rooms",{method:"POST",cache:"no-store"}),data=await resp.json();if(!resp.ok)throw Error(data.error||"Room unavailable.");code=data.code;secret=data.hostToken;role="host";localStorage.setItem(hostKey(code),secret);history.replaceState(null,"","?host="+code);show("host");connect();sound();}catch(err){notice("Can't reach the server: "+err.message);}finally{b.disabled=false;b.innerHTML="HOST A BATTLE <span>↗</span>";}};
$("joinForm").onsubmit=e=>{e.preventDefault();code=$("roomCode").value.toUpperCase().trim();window.joinName=$("playerName").value.trim();if(!/^[A-HJ-NP-Z2-9]{6}$/.test(code))return notice("Check the room code.");if(!window.joinName)return notice("Enter a callsign.");const old=JSON.parse(localStorage.getItem(playerKey(code))||"null");role="player";seatId=old?.id||"";secret=old?.token||"";history.replaceState(null,"","?room="+code);connect();};
function connect(){
 if(!role||!code)return;clearTimeout(reconnectTimer);if(ws)try{ws.close();}catch{}
 const query=new URLSearchParams({role});if(role==="host")query.set("token",secret);else if(seatId&&secret){query.set("id",seatId);query.set("token",secret);}else query.set("name",window.joinName||"COMMANDER");
 const socket=new WebSocket(WS+"/ws/"+code+"?"+query);ws=socket;status("CONNECTING");
 socket.onopen=()=>{if(ws!==socket)return;retry=0;roomFailed=false;status("CONNECTED",true);};
 socket.onmessage=event=>{if(ws!==socket)return;let m;try{m=JSON.parse(event.data);}catch{return;}
  if(m.type==="welcome"){if(m.id){seatId=m.id;secret=m.token;localStorage.setItem(playerKey(code),JSON.stringify({id:seatId,token:secret}));}show(role==="host"?"host":"player");}
  else if(m.type==="error")notice(m.message);
  else if(m.type==="state")applyState(m);
 };
 socket.onerror=()=>status("CONNECTION ERROR");
 socket.onclose=e=>{if(ws!==socket)return;status("RECONNECTING");
  if(e.code===4001)return;
  if(e.code===4002){localStorage.removeItem(playerKey(code));roomFailed=true;show("join");notice("Host removed your tank.");return;}
  if(role==="player"&&!seatId&&retry>=3){roomFailed=true;show("join");notice("Room unavailable. Check the code and try again.");return;}
  if(!roomFailed){reconnectTimer=setTimeout(connect,Math.min(9000,650*Math.pow(1.6,retry++)));}
 };
}
function send(type,data={}){if(ws?.readyState===1)ws.send(JSON.stringify({type,...data}));else notice("Reconnecting to your room…");}
function host(action,data={}){send("host",{action,...data});sound();}
function applyState(m){
 const prev=state;if(m.grid){grid=decode(m.grid);terrainBitmap=null;}
 if(m.phase==="replay"&&m.events&&m.events.turn!==seenVolley){seenVolley=m.events.turn;playback={start:performance.now(),data:m.events,before:prev?.players||m.players,after:m.players};sound("boom");}
 if(m.phase!=="replay")playback=null;state=m;
 if(role==="host"){show("host");renderHost();}else{show("player");renderPhone();}
}
function seconds(){return state?.deadline&&!state.paused?Math.max(0,Math.ceil((state.deadline-Date.now())/1000)):null;}
function renderQR(url){
 const root=$("qrcode");if(!root)return;root.innerHTML="";
 if(typeof QRCode==="function"){try{new QRCode(root,{text:url,width:162,height:162,correctLevel:QRCode.CorrectLevel.M});return;}catch{}}
 const image=new Image();image.alt="QR code: scan to join this room";image.width=162;image.height=162;image.src="https://api.qrserver.com/v1/create-qr-code/?size=162x162&margin=2&data="+encodeURIComponent(url);root.append(image);
}
function renderHost(){
 const r=state;
 $("hostTopLabel").textContent=r.phase==="lobby"?"BATTLEFIELD / WAITING ROOM":r.phase==="over"?"BATTLEFIELD / FINISHED":"BATTLEFIELD / MATCH "+r.match+" / TURN "+(r.turnIndex+1);
 $("hostHeading").textContent=r.phase==="lobby"?"Gather your squad.":r.phase==="over"?team(r.winner)+" TEAM VICTORIOUS":"Let the shells fly.";
 $("timerPill").textContent=r.phase==="lobby"?"LOBBY":r.phase==="over"?"GAME OVER":r.paused?"PAUSED":r.phase==="replay"?"IMPACT":seconds()===null?"∞":seconds()+"S";
 $("fieldCaption").textContent=MAPS[r.map]+" / "+r.players.length+" TANKS";
 $("turnWind").textContent="WIND "+(r.wind<0?"◀ ":r.wind>0?"▶ ":"· ")+Math.abs(r.wind);
 const banner=$("stageBanner");banner.classList.toggle("hidden",r.phase==="lobby");banner.textContent=r.phase==="over"?team(r.winner)+" WINS":r.paused?"PAUSED":r.phase==="replay"?"SHELLS IN FLIGHT":turnLabel(r)+" · TAKE AIM";
 $("volleyOverlay").classList.toggle("hidden",r.phase!=="replay");
 const aside=$("hostSide");let key;
 if(r.phase==="lobby"){
  key=["lobby",r.code,r.players.map(p=>p.id+":"+p.team).join("."),r.map,r.settings.timer,r.series.bestOf].join("/");
  if(aside.dataset.key===key)return;aside.dataset.key=key;
  const link=PAGE+"?room="+r.code;
  aside.innerHTML=`<div class="eyebrow">01 / YOUR ROOM</div><h3>CALL YOUR CREW.</h3>
   <div class="room-code">${r.code}</div><div class="qr-area" id="qrcode"></div><div class="join-link">${esc(link)}</div>
   <div class="host-buttons"><button class="btn btn-outline wide" id="copyLink">⧉ COPY JOIN LINK</button></div>
   <div class="divider"></div><div class="eyebrow">02 / BATTLE SETTINGS</div>
   <div class="fieldrow"><label>MAP<select id="mapPick"><option value="forts">The Forts</option><option value="canyon">Canyon Cross</option><option value="hollow">The Hollow</option></select></label><label>TURN TIME<select id="timerPick"><option value="30">30 sec</option><option value="45">45 sec</option><option value="60">60 sec</option><option value="0">No limit</option></select></label></div>
   <div class="fieldrow"><label>SERIES<select id="seriesPick"><option value="1">Single match</option><option value="3">Best of 3</option><option value="5">Best of 5</option></select></label><label>PLAYERS<span style="padding-top:13px;color:var(--gold);font:800 20px var(--cond)">${r.players.length} / 12</span></label></div>
   <div class="divider"></div><div class="eyebrow">03 / THE ROSTER</div>
   <div class="roster-scroll">${r.players.length?r.players.map(p=>`<div class="playerline"><span class="teamchip ${p.team?"blue":"red"}">${team(p.team)} ${p.squad?"B":"A"}</span><strong>${esc(p.name)}</strong><button class="icon-button" data-swap="${p.id}" title="Swap teams" style="height:27px;width:27px;font-size:12px">⇄</button><button class="icon-button" data-remove="${p.id}" title="Remove player" style="height:27px;width:27px;font-size:12px">×</button></div>`).join(""):"<p>Your first challenger is one scan away.</p>"}</div>
   <div class="host-buttons"><button id="startMatch" class="btn btn-gold wide" ${r.players.length<2?"disabled":""}>START THE BATTLE →</button></div><p class="micro">Requires two balanced teams. Swap players with ⇄.</p>`;
  $("mapPick").value=r.map;$("timerPick").value=String(r.settings.timer);$("seriesPick").value=String(r.series.bestOf);
  $("mapPick").onchange=e=>host("map",{value:e.target.value});$("timerPick").onchange=e=>host("timer",{value:Number(e.target.value)});$("seriesPick").onchange=e=>host("bestOf",{value:Number(e.target.value)});
  $("copyLink").onclick=()=>navigator.clipboard?.writeText(link).then(()=>notice("Join link copied!")).catch(()=>notice(link));
  $("startMatch").onclick=()=>host("start");
  aside.querySelectorAll("[data-swap]").forEach(b=>b.onclick=()=>host("swap",{id:b.dataset.swap}));
  aside.querySelectorAll("[data-remove]").forEach(b=>b.onclick=()=>{if(confirm("Remove this tank?"))host("remove",{id:b.dataset.remove});});
  renderQR(link);
 }else if(r.phase==="over"){
  key="over/"+r.match+"/"+r.winner;if(aside.dataset.key===key)return;aside.dataset.key=key;
  const top=[...r.players].sort((a,b)=>(b.stats?.damage||0)-(a.stats?.damage||0))[0];
  aside.innerHTML=`<div class="eyebrow">THE AFTERMATH</div><h3 class="result-title">${team(r.winner)} WINS!</h3><div class="scores"><span class="red">RED ${r.series.red}</span><span class="blue">${r.series.blue} BLUE</span></div>
  <p style="text-align:center">MVP: <b style="color:var(--gold)">${esc(top?.name||"—")}</b> / ${top?.stats?.damage||0} DMG</p>
  <table class="hp-table"><thead><tr><th>TANK</th><th>TEAM</th><th>HP</th><th>DMG</th></tr></thead><tbody>${r.players.map(p=>`<tr><td>${esc(p.name)}</td><td>${team(p.team)}</td><td>${p.hp}</td><td>${p.stats?.damage||0}</td></tr>`).join("")}</tbody></table>
  <div class="host-buttons"><button data-action="rematch" class="btn btn-gold wide">REMATCH →</button><button data-action="reshuffle" class="btn btn-outline wide">NEW TEAMS</button></div>`;
  aside.querySelectorAll("[data-action]").forEach(b=>b.onclick=()=>host(b.dataset.action));
 }else{
  key=["match",r.turnIndex,r.phase,r.paused,r.players.map(p=>p.hp+":"+p.locked).join("/")].join("/");
  if(aside.dataset.key===key)return;aside.dataset.key=key;
  aside.innerHTML=`<div class="eyebrow">LIVE MATCH / BEST OF ${r.series.bestOf}</div><h3>${turnLabel(r)}</h3>
   <p>${r.phase==="replay"?"Shots are flying. Wait for impact.":r.paused?"Paused by host.":"Commanders are choosing shots."}</p>
   <div class="scores"><span class="red">${r.series.red} RED</span><span class="blue">BLUE ${r.series.blue}</span></div><div class="divider"></div><div class="eyebrow">TANK STATUS</div>
   <div class="roster-scroll">${r.players.map(p=>`<div class="playerline"><span class="teamchip ${p.team?"blue":"red"}">${team(p.team)} ${p.squad?"B":"A"}</span><strong>${esc(p.name)}</strong><small>${p.alive?p.hp+" HP":"OUT"}</small><small>${p.locked?"✓":""}</small></div>`).join("")}</div>
   <div class="divider"></div><div class="eyebrow">HOST COMMAND CENTER</div><div class="host-buttons">
   <button class="btn btn-outline" data-action="pause" ${r.phase!=="aim"?"disabled":""}>${r.paused?"RESUME":"PAUSE"}</button>
   <button class="btn btn-outline" data-action="force" ${r.phase!=="aim"?"disabled":""}>FIRE LOCKED</button>
   <button class="btn btn-outline" data-action="skip" ${r.phase!=="aim"?"disabled":""}>SKIP SQUAD</button>
   <button class="btn btn-outline" data-action="restartVolley" ${r.phase!=="aim"?"disabled":""}>RESET TURN</button>
   <button class="btn btn-danger wide" data-action="end">END MATCH</button></div><p class="micro">Aim choices stay hidden from opponents and the host until fire.</p>`;
  aside.querySelectorAll("[data-action]").forEach(b=>b.onclick=()=>{if(b.dataset.action==="end"&&!confirm("End this match?"))return;host(b.dataset.action);});
 }
}
function squadHTML(mates){return `<div class="eyebrow">SQUAD COORDINATION / PRIVATE</div>${mates.length?mates.map(m=>`<div class="playerline"><strong>${esc(m.name)}</strong><small>${m.angle===undefined?"AIMING…":m.angle+"° / "+m.power+" / "+esc(WEAPONS[m.weapon]?.name||"Single Shot")}</small><small>${m.locked?"✓":""}</small></div>`).join(""):"<p class='micro'>Your squadmates appear here.</p>"}`;}
function renderPhone(){
 const r=state,p=r.you;if(!p){$("phoneContent").textContent="Joining room…";return;}
 const firing=r.phase==="aim"&&!r.paused&&p.alive&&p.team===r.turn.team&&(r.turn.squad===2||p.squad===r.turn.squad);
 const key=[r.phase,r.turnIndex,r.paused,firing,p.locked,p.alive,!!p.buried].join("/");
 if(controlKey===key){if($("hpValue"))$("hpValue").textContent=p.hp+" / 120 HP";if($("hpBar"))$("hpBar").style.width=p.hp/120*100+"%";if($("squadPanel")&&r.squadAim)$("squadPanel").innerHTML=squadHTML(r.squadAim);const fuel=$("fuelValue");if(fuel)fuel.textContent=Math.round(p.fuel)+" PX FUEL";return;}
 controlKey=key;
 if(firing&&Number($("phoneContent").dataset.turn)!==r.turnIndex)localAim={angle:p.team===0?45:135,power:60,weapon:"single"};
 const label=r.phase==="lobby"?"WAITING ROOM":r.phase==="over"?"MATCH COMPLETE":r.phase==="replay"?"SHELLS IN FLIGHT":r.paused?"MATCH PAUSED":turnLabel(r);
 let body="";
 if(r.phase==="lobby")body=`<div class="spectate"><div class="spectate-icon">⌖</div><h2>YOU'RE ENLISTED.</h2><p>Waiting for the host. Keep your phone open.</p><div class="room-code" style="font-size:35px">${esc(r.code)}</div></div>`;
 else if(r.phase==="over")body=`<div class="spectate"><div class="spectate-icon">★</div><h2 style="color:var(--gold)">${team(r.winner)} WINS!</h2><p>${p.team===r.winner?"GLORIOUS VICTORY":"A NOBLE DEFEAT"}</p><div class="scores"><span class="red">RED ${r.series.red}</span><span class="blue">BLUE ${r.series.blue}</span></div><p>${p.stats?.shots||0} SHOTS · ${p.stats?.damage||0} DAMAGE · ${p.stats?.kills||0} KILLS</p></div>`;
 else if(firing){
  const entries=Object.entries(WEAPONS).filter(([k])=>k==="single"||p.inventory?.[k]>0);
  if(!entries.some(([k])=>k===localAim.weapon))localAim.weapon="single";
  body=`<div class="phone-controls"><div class="control-box"><div class="control-top"><span class="control-label">TURRET ANGLE</span><span class="control-value" id="angleValue">${localAim.angle}°</span></div><input class="range" type="range" id="angle" min="0" max="180" step="1" value="${localAim.angle}"><div class="fine-row"><button data-fine="-1">− 1°</button><button data-fine="1">+ 1°</button></div></div>
  <div class="control-box"><div class="control-top"><span class="control-label">LAUNCH POWER</span><span class="control-value" id="powerValue">${localAim.power}%</span></div><input class="range" type="range" id="power" min="0" max="100" step="1" value="${localAim.power}"></div>
  <div class="control-box"><div class="control-top"><span class="control-label">TANK MOVEMENT${p.buried?" / BURIED":""}</span><span class="small-note" id="fuelValue">${Math.round(p.fuel)} PX FUEL</span></div><div class="fine-row"><button class="move-button" data-move="-1" ${p.buried?"disabled":""}>◀ LEFT</button><button class="move-button" data-move="1" ${p.buried?"disabled":""}>RIGHT ▶</button></div></div>
  <div class="control-box"><div class="control-top"><span class="control-label">CHOOSE YOUR WEAPON</span><span class="small-note">SINGLE SHOT ∞</span></div><div class="weapon-grid">${entries.map(([k,w])=>`<button class="weapon-card ${k===localAim.weapon?"active":""}" data-weapon="${k}"><b>${esc(w.name)}</b><small>${k==="single"?"∞":p.inventory[k]+" LEFT"}</small></button>`).join("")}</div></div>
  ${r.turnIndex>=28?'<p class="small-note" style="color:var(--gold);text-align:center">TWINSHOT FINALE: YOUR SHOT + 1 FREE ECHO SHELL. DAMAGE CAP UNCHANGED.</p>':""}<button id="lock" class="lock-button ${p.locked?"locked":""}">${p.locked?"✓ LOCKED IN / TAP TO EDIT":"LOCK IN YOUR SHOT →"}</button><div class="squadmates" id="squadPanel">${squadHTML(r.squadAim||[])}</div></div>`;
 }else body=`<div class="spectate"><div class="spectate-icon">${p.alive?"◎":"✕"}</div><h2>${r.phase==="replay"?"WATCH THE SKIES.":r.paused?"GAME PAUSED":p.alive?"STAND BY.":"TANK DESTROYED."}</h2><p>${p.alive?"Watch the TV. Your squad will fire soon.":"Spectate until the rematch."}</p></div>`;
 $("phoneContent").dataset.turn=r.turnIndex;
 $("phoneContent").innerHTML=`<div class="phone-header"><div><div class="eyebrow">CALLSIGN / ${esc(r.code)}</div><strong>${esc(p.name)}</strong></div><span class="teamchip ${p.team?"blue":"red"}">${team(p.team)} · SQUAD ${p.squad?"B":"A"}</span></div>
 <div class="tank-status"><div><b id="hpValue">${p.hp} / 120 HP</b><div class="small-note">HULL INTEGRITY</div></div><small>SLOT ${p.slot}</small></div><div class="bar-track" style="margin:10px 0 19px"><span id="hpBar" style="width:${p.hp/120*100}%"></span></div>
 <div class="turn-card"><div class="eyebrow">${esc(label)}</div><h2>${firing?"FIRE AT WILL.":r.phase==="lobby"?"HOLD POSITION.":r.phase==="over"?"GAME OVER.":r.phase==="replay"?"INCOMING!":"EYES ON THE FIELD."}</h2><p>WIND ${r.wind<0?"◀ LEFT":r.wind>0?"RIGHT ▶":"· CALM"} ${Math.abs(r.wind)} <span style="float:right" id="phoneClock">${r.phase==="aim"?(seconds()??"∞")+" SEC":""}</span></p></div>${body}`;
 if(firing)bindPhone(p);
}
function bindPhone(p){
 const angle=$("angle"),power=$("power"),aim=()=>send("aim",localAim);
 angle.oninput=()=>{localAim.angle=Number(angle.value);$("angleValue").textContent=angle.value+"°";aim();};
 power.oninput=()=>{localAim.power=Number(power.value);$("powerValue").textContent=power.value+"%";aim();};
 document.querySelectorAll("[data-fine]").forEach(b=>b.onclick=()=>{localAim.angle=Math.max(0,Math.min(180,localAim.angle+Number(b.dataset.fine)));angle.value=localAim.angle;$("angleValue").textContent=angle.value+"°";aim();});
 document.querySelectorAll("[data-weapon]").forEach(b=>b.onclick=()=>{localAim.weapon=b.dataset.weapon;document.querySelectorAll("[data-weapon]").forEach(x=>x.classList.toggle("active",x===b));aim();sound();});
 document.querySelectorAll("[data-move]").forEach(b=>{let interval;const sendMove=()=>send("move",{dx:Number(b.dataset.move)*8});b.onpointerdown=e=>{e.preventDefault();b.setPointerCapture?.(e.pointerId);sendMove();interval=setInterval(sendMove,110);};const stop=()=>clearInterval(interval);b.onpointerup=stop;b.onpointercancel=stop;b.onlostpointercapture=stop;});
 $("lock").onclick=()=>{aim();send("lock",{locked:!p.locked});sound();};aim();
}
function terrainImage(g){
 const canvas=document.createElement("canvas");canvas.width=CW;canvas.height=CH;const context=canvas.getContext("2d"),pixels=context.createImageData(CW,CH),pal=[[0,0,0,0],[85,101,80,255],[114,122,132,255],[129,151,170,255]];
 for(let i=0;i<g.length;i++){const v=g[i],p=pal[v]||pal[2],variation=((i*9127+31)>>>4)%23-11;for(let k=0;k<3;k++)pixels.data[4*i+k]=Math.max(0,p[k]+variation);pixels.data[4*i+3]=p[3];}context.putImageData(pixels,0,0);return canvas;
}
function drawTank(c,p){
 c.save();c.translate(p.x,p.y);
 if(!p.alive){c.fillStyle="#1d2734";c.fillRect(-18,2,36,7);c.fillStyle="#d8b19a";c.font="21px Arial";c.fillText("×",-5,-7);c.restore();return;}
 const color=p.team===0?"#ed756c":"#65baf1";c.shadowColor=color;c.shadowBlur=17;c.fillStyle=color;c.strokeStyle="#152031";c.lineWidth=2;
 c.beginPath();c.roundRect(-23,-7,46,21,5);c.fill();c.stroke();c.shadowBlur=0;c.fillStyle="#172539";c.beginPath();c.roundRect(-22,6,44,9,4);c.fill();
 c.fillStyle="#bfc9d2";for(let dx=-12;dx<=12;dx+=12){c.beginPath();c.arc(dx,10,4,0,7);c.fill();}
 c.fillStyle=color;c.beginPath();c.roundRect(-12,-15,24,14,6);c.fill();c.save();c.translate(0,-10);c.rotate(p.team===0?-.65:-2.5);c.fillStyle="#b9ccdc";c.fillRect(0,-3,29,6);c.restore();
 c.textAlign="center";c.fillStyle="#fff9e6";c.shadowColor="#000";c.shadowBlur=5;c.font="bold 15px Arial";c.fillText((p.name||"TANK").slice(0,12),0,-31);c.shadowBlur=0;
 c.fillStyle="#101d2d";c.fillRect(-24,-25,48,6);c.fillStyle=color;c.fillRect(-23,-24,46*p.hp/120,4);if(p.buried){c.font="bold 12px Arial";c.fillStyle="#f7d78d";c.fillText("BURIED",0,-45);}c.restore();
}
function drawScene(canvas,g,tanks,play,now,mini=false,map="forts"){
 const c=canvas.getContext("2d");c.clearRect(0,0,WIDTH,HEIGHT);
 const sky=c.createLinearGradient(0,0,0,HEIGHT);sky.addColorStop(0,"#0d1e33");sky.addColorStop(.65,"#284962");sky.addColorStop(1,"#64727a");c.fillStyle=sky;c.fillRect(0,0,WIDTH,HEIGHT);
 const glow=c.createRadialGradient(642,237,5,642,237,350);glow.addColorStop(0,"#f0d59855");glow.addColorStop(1,"#f0d59800");c.fillStyle=glow;c.fillRect(0,0,WIDTH,HEIGHT);
 c.fillStyle="#e4c99b99";c.beginPath();c.arc(642,239,39,0,7);c.fill();
 for(let i=0;i<115;i++){const x=(i*137.7+43)%WIDTH,y=(i*79.3)%360;c.fillStyle="rgba(255,241,205,"+(.1+i%7*.015)+")";c.fillRect(x,y,i%10?1:2,i%10?1:2);}
 for(let z=0;z<3;z++){c.fillStyle=["#304b60","#283f52","#21384a"][z];c.beginPath();c.moveTo(0,HEIGHT);for(let x=0;x<=WIDTH;x+=20)c.lineTo(x,418+z*45+36*Math.sin(x/(65+z*21)+z)+18*Math.cos(x/39+z));c.lineTo(WIDTH,HEIGHT);c.fill();}
 if(g){if(terrainRef!==g||!terrainBitmap){terrainRef=g;terrainBitmap=terrainImage(g);}c.imageSmoothingEnabled=false;c.drawImage(terrainBitmap,0,0,WIDTH,HEIGHT);c.imageSmoothingEnabled=true;}
 c.fillStyle="#07132266";c.fillRect(0,0,WIDTH,51);c.fillStyle="#f8d69c";c.font="bold 17px Arial";c.textAlign="left";c.fillText(map.toUpperCase()+" / BARRAGE",21,32);c.textAlign="right";c.fillStyle="#a8c5d3";c.fillText("AD ARCADE / NO MERCY",1255,32);
 let actors=tanks;if(play){const t=Math.max(0,(now-play.start)/1000),v=play.data;actors=t<v.duration+.2?play.before:play.after;
  for(const point of v.trace||[]){const [time,id,x,y,kind]=point;if(time>t||time<t-.47)continue;c.globalAlpha=.6*(1-(t-time)/.47);c.fillStyle=WEAPONS[kind]?.color||"#fff";c.beginPath();c.arc(x,y,4,0,7);c.fill();}c.globalAlpha=1;
  const active=new Map();for(const point of v.trace||[])if(point[0]<=t)active.set(point[1],point);
  for(const p of active.values()){if(t-p[0]>.23)continue;c.save();c.shadowBlur=19;c.shadowColor=WEAPONS[p[4]]?.color||"#ffe1a2";c.fillStyle=WEAPONS[p[4]]?.color||"#ffe1a2";c.beginPath();c.arc(p[2],p[3],6,0,7);c.fill();c.restore();}
  for(const e of v.events||[]){
   const age=t-e.t;if(age<0||age>.9)continue;
   if(e.type==="pool"||e.type==="shock"){
    c.save();c.globalAlpha=Math.max(0,1-age/.9);c.lineWidth=e.type==="pool"?8:5;
    c.strokeStyle=e.type==="pool"?"#ff672d":"#fce19b";c.shadowBlur=18;c.shadowColor=c.strokeStyle;
    c.beginPath();for(const point of e.points||[]){c.moveTo(point.x-2,point.y-3);c.lineTo(point.x+2,point.y-3);}c.stroke();c.restore();continue;
   }
   if(e.type!=="boom")continue;
   const radius=Math.max(10,e.r*(.2+age));const rad=c.createRadialGradient(e.x,e.y,0,e.x,e.y,radius);
   rad.addColorStop(0,"rgba(255,241,180,"+(.9-age)+")");rad.addColorStop(.5,"rgba(255,144,71,"+(.7-age*.8)+")");rad.addColorStop(1,"#fa661100");
   c.fillStyle=rad;c.beginPath();c.arc(e.x,e.y,radius,0,7);c.fill();
  }
 }
 for(const p of actors||[])drawTank(c,p);
 if(mini){const x=640+Math.cos(now/1000)*190,y=254-Math.abs(Math.sin(now/950))*125;c.shadowColor="#f7d477";c.shadowBlur=22;c.fillStyle="#ffe1a0";c.beginPath();c.arc(x,y,6,0,7);c.fill();c.shadowBlur=0;}
}
function frame(now){
 if(now-drawTime>15){drawTime=now;
  if(!$("landing").classList.contains("hidden"))drawScene($("preview"),previewGrid,previewTanks,null,now,true);
  if(role==="host"&&state&&!$("host").classList.contains("hidden"))drawScene($("battlefield"),grid||previewGrid,state.players,playback,now,false,MAPS[state.map]);
  if(state?.phase==="aim"&&!state.paused){if(role==="host")$("timerPill").textContent=seconds()===null?"∞":seconds()+"S";const clock=$("phoneClock");if(clock)clock.textContent=(seconds()??"∞")+" SEC";}
  if(playback&&state?.phase==="replay"&&now-playback.start>(playback.data.duration+1.5)*1000)$("volleyOverlay").classList.add("hidden");
 }
 requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
function route(){
 const h=(args.get("host")||"").toUpperCase(),r=(args.get("room")||"").toUpperCase();
 if(h){const key=localStorage.getItem(hostKey(h));if(key){role="host";code=h;secret=key;show("host");connect();return;}notice("Host key missing. Create a new room.");}
 if(r){$("roomCode").value=r;const saved=JSON.parse(localStorage.getItem(playerKey(r))||"null");if(saved?.id&&saved?.token){role="player";code=r;seatId=saved.id;secret=saved.token;show("player");connect();return;}show("join");return;}
 show("landing");
}
route();
