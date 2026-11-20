
import test from "node:test";
import assert from "node:assert/strict";
import {generate,spawn,simulateVolley} from "../shared/engine.js";
import {cameraTargetForTrace} from "../frontend/camera.js";

function lob(angle,power,side=0){
 const grid=generate("forts",17);
 const p=spawn(grid,side,1,"forts"),op=spawn(grid,1-side,1,"forts");
 return simulateVolley({
  grid,players:[
   {...p,id:"shooter",team:side,alive:true,hp:120},
   {...op,id:"enemy",team:1-side,alive:true,hp:120}
  ],shots:[{playerId:"shooter",weapon:"single",angle,power}],
  wind:0,seed:17
 });
}

for(const [angle,power] of [[60,100],[80,100],[70,80],[90,100]]){
 test(`steep lob ${angle}° / ${power} power survives above screen and lands exactly once`,()=>{
  const result=lob(angle,power);
  const booms=result.events.filter(e=>e.type==="boom");
  assert.equal(booms.length,1,`${angle}/${power} should result in one detonation rather than vanish`);
  assert.ok(booms[0].t>.5,"The shell must not immediately explode at launch");
  assert.ok(booms[0].x>=0&&booms[0].x<1280);
  assert.ok(booms[0].y>=0&&booms[0].y<=720);
  const offscreen=result.trace.filter(pt=>pt[3]<0);
  assert.ok(offscreen.length>2,"The shell must visibly pass above the game viewport");
  assert.ok(result.trace.some(pt=>pt[0]>offscreen.at(-1)[0]&&pt[3]>=0),
   "It must re-enter the arena and fall back before detonating");
 });
}
test("off-screen sample translates TV world down to reveal the projectile",()=>{
 const points=[
  [0.0,0,100,400,"single"],
  [0.1,0,150,-200,"single"],
  [0.2,0,200,-300,"single"],
  [0.3,0,250,35,"single"]
 ];
 assert.equal(cameraTargetForTrace(points,.2),472);
 assert.equal(cameraTargetForTrace(points,.3),137);
 assert.equal(cameraTargetForTrace(points,1),0,"stale trail must not lock camera in sky");
 assert.equal(cameraTargetForTrace(points,0),0);
});
test("highest live projectile leads camera when volley shells are at different altitudes",()=>{
 const points=[[.2,1,230,-400,"single"],[.2,2,800,110,"bertha"]];
 assert.equal(cameraTargetForTrace(points,.2),572);
 assert.equal(cameraTargetForTrace(points,.5),0);
});
test("camera clamps extreme altitude and ignores missing or invalid traces",()=>{
 assert.equal(cameraTargetForTrace([[.1,0,500,-9000,"single"]],.1),800);
 assert.equal(cameraTargetForTrace(undefined,.1),0);
 assert.equal(cameraTargetForTrace([],Number.NaN),0);
});
