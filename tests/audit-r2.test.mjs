
import test from "node:test";
import assert from "node:assert/strict";
import {CELL,CW,CH,WIDTH,SPAWN_X,generate,spawn,surfaceBelow,WEAPONS,simulateVolley,napalmPool,quakePath,moveTank} from "../shared/engine.js";

const flat=()=>{
 const grid=new Uint8Array(CW*CH);
 for(let row=150;row<CH;row++)for(let col=0;col<CW;col++)grid[row*CW+col]=1;
 return grid;
};
const tank=(id,team,x,hp=120)=>({id,team,x,y:588,hp,alive:true});
const shoot=(grid,players,weapon)=>simulateVolley({grid,players,shots:[{playerId:"shooter",angle:0,power:0,weapon}],wind:0,seed:1});

test("six distinct defensive spawn positions per side are mirrored on all three maps",()=>{
 assert.equal(new Set(SPAWN_X).size,6);
 for(const map of ["forts","canyon","hollow"]){
  const grid=generate(map,909);
  for(let slot=1;slot<=6;slot++){
   const red=spawn(grid,0,slot,map),blue=spawn(grid,1,slot,map);
   assert.equal(red.x+blue.x,WIDTH);
   assert.ok(Math.abs(red.y-blue.y)<=CELL+4,`Uneven ${map} slot ${slot}: ${red.y} vs ${blue.y}`);
  }
  for(let i=0;i<6;i++)for(let j=i+1;j<6;j++){
   const a=spawn(grid,0,i+1,map),b=spawn(grid,0,j+1,map);
   assert.ok(b.x-a.x>=80,`Crowded ${map} slots ${i+1}/${j+1}`);
  }
 }
});

test("Napalm creates a visible pool along the surface, blocked by concrete",()=>{
 const grid=flat();
 for(let row=149;row<CH;row++)grid[row*CW+66]=3; // barrier at x264
 const points=napalmPool(grid,230,600);
 assert.ok(points.length>8);
 assert.ok(points.some(p=>p.x<230));
 assert.ok(points.some(p=>p.x>230));
 assert.ok(points.every(p=>p.x<264),"Napalm cannot pass a concrete border");
 const result=shoot(flat(),[tank("shooter",0,150),tank("target",1,255)],"napalm");
 const pool=result.events.find(e=>e.type==="pool");
 assert.ok(pool?.points?.length>10);
 assert.ok(result.players.find(p=>p.id==="target").hp<120);
});

test("Dirt Ball can bury a tank, prevent its movement, allow firing and Excavator can rescue it",()=>{
 const grid=flat(),players=[tank("shooter",0,150),tank("target",1,255)];
 const buried=shoot(grid,players,"dirt");
 const target=buried.players.find(p=>p.id==="target");
 assert.equal(target.buried,true);
 assert.equal(moveTank(buried.grid,buried.players,"target",8,60).moved,0);
 const rescue=shoot(buried.grid,buried.players,"excavator");
 assert.equal(rescue.players.find(p=>p.id==="target").buried,false);
 assert.ok(rescue.events.some(e=>e.kind==="excavator"));
 const fire=simulateVolley({grid:buried.grid,players:buried.players,shots:[{playerId:"target",angle:135,power:65,weapon:"single"}],seed:1,wind:0});
 assert.ok(fire.trace.length>0,"The buried tank must still launch a projectile");
});

test("Earthquake follows unbroken surface, but a concrete segment cuts propagation",()=>{
 const grid=flat(),full=quakePath(grid,230,600);
 assert.ok(full.some(p=>p.x>320));
 for(let row=149;row<CH;row++)grid[row*CW+70]=3; // x280
 const stopped=quakePath(grid,230,600);
 assert.ok(stopped.length<full.length);
 assert.ok(!stopped.some(p=>p.x>280));
 const damage=shoot(flat(),[tank("shooter",0,150),tank("target",1,255)],"quake");
 assert.equal(damage.players.find(p=>p.id==="target").hp,100);
});

test("a clamped movement request does not consume 8px fuel without travelling",()=>{
 const grid=flat(),players=[tank("shooter",0,35)];
 assert.equal(moveTank(grid,players,"shooter",-8,60).moved,0);
});

test("kills belong only to the projectile that eliminated a tank",()=>{
 const result=shoot(flat(),[tank("shooter",0,150),tank("target",1,255,10)],"bertha");
 assert.equal(result.players.find(p=>p.id==="target").alive,false);
 assert.equal(result.killsBy.shooter,1);
});

test("the actual 120 Hz simulator lands the 45-degree/60-power drag-free anchor at 980 ± 2%",()=>{
 const grid=flat(),old=WEAPONS.single.drag;
 try{
  WEAPONS.single.drag=0;
  // Start muzzle almost on the flat surface: tests the simulated flight,
  // rather than only the analytic formula or the tank's barrel elevation.
  const sx=30+26*Math.cos(Math.PI/4);
  const result=simulateVolley({grid,players:[{...tank("shooter",0,30),y:617},tank("target",1,1240)],shots:[{playerId:"shooter",angle:45,power:60,weapon:"single"}],wind:0,seed:1});
  assert.equal(result.events.length,1);
  const distance=result.events[0].x-sx;
  assert.ok(Math.abs(distance-980)<=19.6,"Simulated anchor was "+distance+"px");
 }finally{WEAPONS.single.drag=old;}
});
