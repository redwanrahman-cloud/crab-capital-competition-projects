/** Project-only editor mouse adaptation. No SIK state writes or synthetic events.
 * Real event rays are copied immediately, resolved with public Physics in LateUpdate.
 * Unhandled gestures wait until a later frame so bound SIK targets get first refusal.
 */
export type MouseTarget = "practice"|"reset"|0|1|2;
export type Point = {x:number,y:number};
export interface MouseGesture {
  serial:number; generation:number; touchId:number; start:Point; end:Point;
  startTime:number; endTime:number|null; maxMove:number; normal:boolean;
  consumed:boolean; cancelled:boolean;
}
export function inScreen(p:Point):boolean {
  return Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1;
}
/** Exact nearest-hit policy. An unmapped occluder or tied competing collider abstains. */
export function exactMouseHit(hits:{target:MouseTarget|null,distance:number}[]):MouseTarget|null {
  if(!hits.length||!Number.isFinite(hits[0].distance)||hits[0].target===null)return null;
  const first=hits[0];
  if(hits.some(h=>Math.abs(h.distance-first.distance)<0.001&&h.target!==first.target))return null;
  return first.target;
}
export class MouseGestureGate {
  generation=0; private serial=0; active:MouseGesture=null; private dead=false;
  begin(p:Point,time:number,touchId:number):MouseGesture {
    // Lens vec2 exposes native getters, not enumerable JS properties.
    this.active={serial:++this.serial,generation:this.generation,touchId,start:{x:p.x,y:p.y},end:{x:p.x,y:p.y},
      startTime:time,endTime:null,maxMove:0,normal:false,consumed:false,cancelled:!inScreen(p)||this.dead};
    return this.active;
  }
  move(g:MouseGesture,p:Point,touchId:number):void {
    if(!this.current(g)||touchId!==g.touchId||g.endTime!==null)return;
    g.end={x:p.x,y:p.y};g.maxMove=Math.max(g.maxMove,Math.hypot(p.x-g.start.x,p.y-g.start.y));
    if(!inScreen(p))g.cancelled=true;
  }
  end(g:MouseGesture,p:Point,time:number,touchId:number,cancelled:boolean):void {
    this.move(g,p,touchId);if(!this.current(g)||touchId!==g.touchId||g.endTime!==null)return;
    g.endTime=time;g.cancelled=g.cancelled||cancelled;
  }
  current(g:MouseGesture):boolean {return !!g&&!this.dead&&g===this.active&&g.generation===this.generation;}
  observeNormal():void {if(this.current(this.active))this.active.normal=true;}
  consumeNormal(expected:MouseGesture=this.active):boolean {
    const g=this.active;
    if(expected!==g)return false;
    if(!g)return true; // LEAF/hands without a captured real mouse gesture
    if(!this.current(g)||g.consumed)return false;
    g.normal=true;g.consumed=true;return true;
  }
  eligible(g:MouseGesture,now:number,target:MouseTarget|null,endTarget:MouseTarget|null,
      practice:boolean,locked:boolean,unchanged:boolean,normalPartCommit=false):boolean {
    if(normalPartCommit&&typeof target!=="number")return false;
    if(!this.current(g)||g.consumed||(g.normal&&!normalPartCommit)||g.cancelled||g.endTime===null||
       now<=g.endTime||!Number.isFinite(g.startTime)||!Number.isFinite(g.endTime)||
       g.endTime<g.startTime||!unchanged||target===null)return false;
    if(typeof target==="number")return practice&&!locked;
    // 0.003 normalized travel is a tap slop, never a target rectangle or snap threshold.
    return g.maxMove<=0.003&&target===endTarget;
  }
  consumeFallback(g:MouseGesture,normalPartCommit=false):boolean {
    if(!this.current(g)||g.consumed||(g.normal&&!normalPartCommit))return false;g.consumed=true;return true;
  }
  invalidate():void {this.generation++;}
  destroy():void {this.invalidate();this.dead=true;}
}
export interface MouseBinding {target:MouseTarget;object:SceneObject;stabilityObject?:SceneObject;}
type Ray={a:vec3,b:vec3};
type Pose={position:vec3;rotation:quat;scale:vec3};
type Snapshot=Pose&{binding:MouseBinding;normal:vec3;parent:SceneObject;parentPose:Pose};
type Capture={gesture:MouseGesture;startRay:Ray;endRay:Ray;startTarget:MouseTarget;normalTarget:MouseTarget;snapshots:Snapshot[]};
/** Bounded ray/actual-plane intersection; no socket identity or target assignment. */
export function mousePlanePoint(a:vec3,b:vec3,p:vec3,n:vec3):vec3|null {
  const d=b.sub(a),den=n.dot(d);
  if(!Number.isFinite(den)||Math.abs(den)<1e-6)return null;
  const t=n.dot(p.sub(a))/den;
  if(!Number.isFinite(t)||t<0||t>1)return null;
  return a.add(d.uniformScale(t));
}
export class BoltBackMouseAdapter {
  readonly gate=new MouseGestureGate();
  private probe:Probe;private capture:Capture=null;private dead=false;
  private colliders:{collider:ColliderComponent,target:MouseTarget}[]=[];
  constructor(private owner:BaseScriptComponent,private camera:Camera,private bindings:MouseBinding[],
      private isPractice:()=>boolean,private locked:(i:number)=>boolean,
      private button:(intent:"practice"|"reset")=>void,private release:(i:number,p:vec3)=>void,
      private trace:(event:string,data:unknown)=>void) {
    this.probe=Physics.createGlobalProbe();
    this.probe.filter=Physics.Filter.create();this.probe.filter.includeIntangible=true;
    bindings.forEach(binding=>{
      const walk=(o:SceneObject):void=>{
        o.getComponents("Physics.ColliderComponent").forEach(c=>this.colliders.push({collider:c,target:binding.target}));
        for(let i=0;i<o.getChildrenCount();i++)walk(o.getChild(i));
      };walk(binding.object);
    });
    // Scope the pick query to actual project targets; SIK has its own broad interaction-plane collider.
    this.probe.filter.onlyColliders=this.colliders.map(b=>b.collider);
    owner.createEvent("TouchStartEvent").bind(e=>{
      if(this.dead||!owner.enabled)return;
      const p=e.getTouchPosition(),g=this.gate.begin(p,getTime(),e.getTouchId()),ray=this.ray(p);
      this.capture={gesture:g,startRay:ray,endRay:ray,startTarget:this.hit(ray),normalTarget:null,snapshots:bindings.map(binding=>{
        const t=(binding.stabilityObject??binding.object).getTransform(),parent=binding.object.getParent();return {binding,...this.pose(t),
          normal:t.forward,parent,parentPose:parent?this.pose(parent.getTransform()):null};
      })};
      trace("adapter.start",{serial:g.serial,position:g.start,colliders:this.colliders.length});
    });
    owner.createEvent("TouchMoveEvent").bind(e=>{
      const c=this.capture;if(this.dead||!c)return;
      this.gate.move(c.gesture,e.getTouchPosition(),e.getTouchId());
    });
    owner.createEvent("TouchEndEvent").bind(e=>{
      const c=this.capture;if(this.dead||!c||c.gesture.endTime!==null||e.getTouchId()!==c.gesture.touchId)return;
      const p=e.getTouchPosition();c.endRay=this.ray(p);
      this.gate.end(c.gesture,p,getTime(),e.getTouchId(),e.isCancelled());
      trace("adapter.end",{serial:c.gesture.serial,position:c.gesture.end,cancelled:c.gesture.cancelled});
    });
    // Main calls normalStart only for a bound button/part's real trigger start.
    // A global mouse press with no target did not handle this gesture.
    owner.createEvent("LateUpdateEvent").bind(()=>this.flush());
    owner.createEvent("OnDisableEvent").bind(()=>this.invalidate());
    owner.createEvent("OnDestroyEvent").bind(()=>{this.dead=true;this.capture=null;this.gate.destroy();});
    trace("adapter.ready",{bindings:bindings.map(b=>({target:b.target,name:b.object.name})),colliders:this.colliders.length});
  }
  invalidate():void {this.gate.invalidate();this.capture=null;}
  hasRealGesture():boolean {return this.gate.current(this.gate.active);}
  normalStart(object:SceneObject):MouseGesture {
    const c=this.capture,binding=this.bindings.find(b=>b.object.isSame(object));
    if(!c||!binding||!this.gate.current(c.gesture)||c.startTarget!==binding.target)return null;
    c.normalTarget=binding.target;
    this.gate.observeNormal();return this.gate.active;
  }
  normalDispatch(expected:MouseGesture=this.gate.active):boolean {return this.gate.consumeNormal(expected);}
  private ray(p:vec2):Ray {
    return {a:this.camera.screenSpaceToWorldSpace(new vec2(p.x,p.y),0),
      b:this.camera.screenSpaceToWorldSpace(new vec2(p.x,p.y),this.camera.far-this.camera.near)};
  }
  private hit(ray:Ray):MouseTarget|null {
    const hits=this.probe.rayCastAllSync(ray.a,ray.b);
    return exactMouseHit(hits.map(h=>({distance:h.distance,
      target:this.colliders.find(b=>b.collider.isSame(h.collider))?.target??null})));
  }
  private pose(t:Transform):Pose {return {position:t.getWorldPosition(),rotation:t.getWorldRotation(),scale:t.getWorldScale()};}
  private samePose(t:Transform,s:Pose,allowTranslation=false):boolean {
    const q=t.getWorldRotation(),r=s.rotation;
    return (allowTranslation||t.getWorldPosition().distance(s.position)<0.0001)&&t.getWorldScale().distance(s.scale)<0.0001&&
      Math.abs(q.x-r.x)+Math.abs(q.y-r.y)+Math.abs(q.z-r.z)+Math.abs(q.w-r.w)<0.0001;
  }
  private unchanged(s:Snapshot,normalPartCommit=false):boolean {
    const t=(s.binding.stabilityObject??s.binding.object).getTransform(),q=t.getWorldRotation(),r=s.rotation;
    return this.samePose(t,s,normalPartCommit)&&(!normalPartCommit||(!s.parent&&!s.binding.object.getParent())||
      (!!s.parent&&s.binding.object.getParent()?.isSame(s.parent)&&this.samePose(s.parent.getTransform(),s.parentPose)));
  }
  private flush():void {
    if(!this.owner.enabled){this.invalidate();return;}
    const c=this.capture;if(this.dead||!c||c.gesture.endTime===null||getTime()<=c.gesture.endTime)return;
    this.capture=null;const g=c.gesture;if(!this.gate.current(g))return;
    const start=c.startTarget,end=this.hit(c.endRay);
    const snapshot=c.snapshots.find(s=>s.binding.target===start);
    const normalPartCommit=typeof start==="number"&&c.normalTarget===start&&g.normal;
    const unchanged=!!snapshot&&this.unchanged(snapshot,normalPartCommit);
    const eligible=this.gate.eligible(g,getTime(),start,end,this.isPractice(),
      typeof start==="number"&&this.locked(start),unchanged,normalPartCommit);
    this.trace("adapter.settled",{serial:g.serial,start,end,normal:g.normal,consumed:g.consumed,
      sameFrame:g.startTime===g.endTime,maxMove:g.maxMove,unchanged,eligible});
    if(!eligible)return;
    if(typeof start==="number"){
      const from=mousePlanePoint(c.startRay.a,c.startRay.b,snapshot.position,snapshot.normal);
      const to=mousePlanePoint(c.endRay.a,c.endRay.b,snapshot.position,snapshot.normal);
      if(!from||!to||!this.gate.consumeFallback(g,normalPartCommit))return;
      const position=to.add(snapshot.position.sub(from));
      this.trace("adapter.dispatch.part",{serial:g.serial,part:start+1,position:{x:position.x,y:position.y,z:position.z}});
      this.release(start,position);
    }else if(this.gate.consumeFallback(g)){
      this.trace("adapter.dispatch.button",{serial:g.serial,intent:start});this.button(start);
    }
  }
}
