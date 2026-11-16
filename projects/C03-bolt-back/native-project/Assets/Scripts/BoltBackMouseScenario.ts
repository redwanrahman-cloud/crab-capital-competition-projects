/** Deterministic adapter policy/geometry regressions, not physical Windows input proof. */
import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario";
import {MouseGestureGate,MouseGesture,MouseTarget,exactMouseHit,mousePlanePoint} from "./BoltBackMouseAdapter";
import {nextFrame} from "Leaf.lspkg/Utils/common/Utils";
import {check,main} from "./BoltBackTestHelpers";
@component
export class BoltBackMouseScenario extends Scenario {
 async run():Promise<void>{
  let assertionCount=0;const assert=(ok:boolean,message:string):void=>{check(ok,message);assertionCount++;};
  const gate=new MouseGestureGate(),p={x:0.4,y:0.5};
  const nativeGate=new MouseGestureGate(),nativeGesture=nativeGate.begin(new vec2(0.4,0.5),30,0);
  assert(Math.abs(nativeGesture.start.x-0.4)<0.000001&&nativeGesture.start.y===0.5,"Native vec2 start coordinates are copied explicitly");
  nativeGate.end(nativeGesture,new vec2(0.4,0.5),30,0,false);
  assert(Number.isFinite(nativeGesture.maxMove)&&nativeGesture.maxMove===0,"Native vec2 endpoint preserves finite movement");
  assert(nativeGate.eligible(nativeGesture,31,"practice","practice",false,false,true),"Real native vec2 quick tap remains eligible");
  const quick=(end=p):MouseGesture=>{const g=gate.begin(p,10,0);gate.end(g,end,10,0,false);return g;};
  const eligible=(g:MouseGesture,t:MouseTarget|null="practice",end:MouseTarget|null=t,
    practice=true,locked=false,unchanged=true)=>gate.eligible(g,Math.max(11,(g.endTime??10)+1),t,end,practice,locked,unchanged);
  let g=quick();assert(!gate.eligible(g,10,"practice","practice",false,false,true),"Mouse waits a later frame for normal SIK");
  assert(eligible(g),"Same-frame exact-button tap eligible");
  assert(gate.consumeFallback(g)&&!gate.consumeFallback(g),"Fallback consumes before dispatch exactly once");
  assert(!gate.consumeNormal(g),"Late normal dispatch cannot duplicate fallback");
  g=quick();assert(eligible(g,"reset"),"Same-frame Reset exact-button tap eligible");
  g=quick({x:0.6,y:0.55});assert(eligible(g,0,null),"Same-frame short part drag eligible without end target assignment");
  assert(!eligible(g,0,null,false),"Part drag requires Practice");
  assert(!eligible(g,0,null,true,true),"Locked part cannot fallback");
  assert(!eligible(g,0,null,true,false,false),"Moved start target abstains");
  g=quick();gate.observeNormal();assert(!eligible(g),"Normal SIK trigger suppresses fallback");
  assert(gate.consumeNormal(g)&&!gate.consumeNormal(g),"Normal dispatch consumes once");
  g=gate.begin(p,20,0);gate.end(g,p,21,0,false);
  assert(eligible(g),"Unhandled cross-frame cold click can fall back after target acquisition");
  gate.observeNormal();assert(!eligible(g),"Bound normal cross-frame gesture has no fallback");
  assert(gate.eligible(g,22,0,null,true,false,true,true),"Bound normal mouse drag commits from captured end ray");
  assert(!gate.eligible(g,22,0,null,false,false,true,true),"Normal mouse release still requires Practice");
  assert(!gate.eligible(g,22,0,null,true,true,true,true),"Normal mouse release cannot move locked part");
  assert(!gate.eligible(g,22,0,null,true,false,false,true),"Normal release rejects changed parent/rotation/scale");
  assert(!gate.eligible(g,22,"practice","practice",false,false,true,true),"Normal part commit cannot authorize a button");
  assert(gate.consumeFallback(g,true)&&!gate.consumeFallback(g,true),"Captured normal mouse release commits exactly once");
  g=quick();assert(!eligible(g,null),"Missing or wrong start target abstains");
  assert(!eligible(g,"practice","reset"),"Different actual end button abstains");
  g=quick({x:0.41,y:0.5});assert(!eligible(g),"Moved button gesture is not a tap");
  g=gate.begin(p,10,0);gate.move(g,{x:0.7,y:0.5},0);gate.end(g,p,10,0,false);
  assert(!eligible(g),"Move-away-and-return cannot become a tap");
  g=quick();const old=g;g=quick();assert(!eligible(old)&&!gate.consumeNormal(old),"New gesture invalidates old fallback and normal token");
  assert(eligible(g),"Newest real gesture remains eligible");
  g=quick();gate.invalidate();assert(!eligible(g)&&!gate.consumeNormal(g),"Reset generation invalidates both dispatch paths");
  g=quick({x:1.1,y:0.5});assert(!eligible(g,0),"Out-of-bounds endpoint abstains");
  g=gate.begin(p,10,0);gate.move(g,{x:-0.1,y:0.5},0);gate.end(g,p,10,0,false);
  assert(!eligible(g,0),"Out-of-bounds excursion cannot return into eligibility");
  g=gate.begin(p,10,0);gate.end(g,p,10,1,false);assert(!eligible(g),"Wrong touch ID cannot end captured gesture");
  g=gate.begin(p,10,0);gate.end(g,p,10,0,true);assert(!eligible(g),"Cancelled gesture abstains");
  assert(exactMouseHit([])===null,"Empty physics ray abstains");
  assert(exactMouseHit([{target:null,distance:1},{target:0,distance:2}])===null,"Unbound nearest collider blocks target behind it");
  assert(exactMouseHit([{target:0,distance:2},{target:1,distance:2.0001}])===null,"Ambiguous tied target colliders abstain");
  assert(exactMouseHit([{target:0,distance:2},{target:1,distance:5}])===0,"Exact nearest collider binds start part");
  const a=new vec3(2,3,0),b=new vec3(2,3,-100),plane=new vec3(0,0,-72),n=new vec3(0,0,1);
  const q=mousePlanePoint(a,b,plane,n);
  assert(!!q&&q.distance(new vec3(2,3,-72))<0.001,"Captured end ray intersects actual plane without socket assignment");
  assert(mousePlanePoint(a,new vec3(3,3,0),plane,n)===null,"Parallel ray abstains");
  assert(mousePlanePoint(a,new vec3(2,3,-10),plane,n)===null,"Intersection beyond captured ray abstains");
  g=quick();gate.destroy();assert(!eligible(g)&&!gate.consumeNormal(g),"Destroy invalidates pending dispatch");
  // Read-only native raycasts at the real targets; no input injection or Main intent/release calls.
  await nextFrame();await nextFrame();
  const m=main(),bindings=m.controls.mouseButtons().concat([m.part1,m.part2,m.part3].map((object,i)=>({object,target:i as 0|1|2})));
  assert(bindings.filter(b=>typeof b.target==="string").every(b=>b.stabilityObject===m.controls.sceneObject),"UI buttons explicitly use stable controls panel anchor");
  assert(bindings.filter(b=>typeof b.target==="number").every(b=>!b.stabilityObject),"Parts retain strict own-transform stability");
  let camera:Camera=null;
  const walk=(o:SceneObject):void=>{if(!camera)camera=o.getComponent("Component.Camera");for(let j=0;j<o.getChildrenCount();j++)walk(o.getChild(j));};
  for(let j=0;j<global.scene.getRootObjectsCount();j++)walk(global.scene.getRootObject(j));
  const probe=Physics.createGlobalProbe();probe.filter=Physics.Filter.create();probe.filter.includeIntangible=true;
  const known:{collider:ColliderComponent,target:MouseTarget}[]=[];
  bindings.forEach(binding=>{const collect=(o:SceneObject):void=>{
    o.getComponents("Physics.ColliderComponent").forEach(collider=>known.push({collider,target:binding.target}));
    for(let j=0;j<o.getChildrenCount();j++)collect(o.getChild(j));
  };collect(binding.object);});
  probe.filter.onlyColliders=known.map(k=>k.collider);
  bindings.forEach(binding=>{
    const screen=camera.worldSpaceToScreenSpace(binding.object.getTransform().getWorldPosition());
    const hits=probe.rayCastAllSync(camera.screenSpaceToWorldSpace(screen,0),
      camera.screenSpaceToWorldSpace(screen,camera.far-camera.near));
    const resolved=exactMouseHit(hits.map(h=>({distance:h.distance,target:known.find(k=>k.collider.isSame(h.collider))?.target??null})));
    assert(resolved===binding.target,"Native captured-ray exact collider: "+binding.object.name);
  });
  console.log("[BoltBackMouseTest] PASS "+assertionCount+" assertions including native vectors, policy, anchor wiring and five collider raycasts; Windows proof recorded separately");
 }
}
