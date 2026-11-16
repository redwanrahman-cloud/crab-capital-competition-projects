import {InteractorTriggerType,InteractorInputType} from "SpectaclesInteractionKit.lspkg/Core/Interactor/Interactor";
import {InteractorEvent} from "SpectaclesInteractionKit.lspkg/Core/Interactor/InteractorEvent";
import "./BoltBackScenarioIndex";
import {BoltBackMouseAdapter,MouseGesture} from "./BoltBackMouseAdapter";
/** Owns scene coordination. Inputs are authored parts, socket/tray anchors, indicators and passive UI.
 * Uses SIK held visuals plus captured-ray editor mouse releases. No real repair claim.
 */
import {Interactable} from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable";
import {InteractableManipulation} from "SpectaclesInteractionKit.lspkg/Components/Interaction/InteractableManipulation/InteractableManipulation";
import {BoltBackControlsUI} from "./BoltBackControlsUI";
import {BoltBackState} from "./BoltBackState";
@component
export class BoltBackMain extends BaseScriptComponent {
  @ui.label("Bolt Back - abstract virtual practice")
  @input @hint("Passive controls and status") controls:BoltBackControlsUI;
  @input @hint("Numbered fastener 1") part1:SceneObject;
  @input @hint("Numbered fastener 2") part2:SceneObject;
  @input @hint("Numbered fastener 3") part3:SceneObject;
  @input @hint("Matching socket 1") socket1:SceneObject;
  @input @hint("Matching socket 2") socket2:SceneObject;
  @input @hint("Matching socket 3") socket3:SceneObject;
  @input @hint("Tray position 1") tray1:SceneObject;
  @input @hint("Tray position 2") tray2:SceneObject;
  @input @hint("Tray position 3") tray3:SceneObject;
  @input @hint("Study hint 1") hint1:SceneObject;
  @input @hint("Study hint 2") hint2:SceneObject;
  @input @hint("Study hint 3") hint3:SceneObject;
  @input @hint("Progress light 1") light1:SceneObject;
  @input @hint("Progress light 2") light2:SceneObject;
  @input @hint("Progress light 3") light3:SceneObject;
  @input @hint("Socket feedback 1") feedback1:SceneObject;
  @input @hint("Socket feedback 2") feedback2:SceneObject;
  @input @hint("Socket feedback 3") feedback3:SceneObject;
  @input @hint("Show collider outlines") debugColliders:boolean=false;
  readonly state=new BoltBackState();
  private parts:SceneObject[]=[];
  private sockets:SceneObject[]=[];
  private trays:SceneObject[]=[];
  private hints:SceneObject[]=[];
  private lights:SceneObject[]=[];
  private feedback:SceneObject[]=[];
  private interactables:Interactable[]=[];
  private manipulations:InteractableManipulation[]=[];
  private releases:number[]=[];
  private mouseAdapter:BoltBackMouseAdapter=null;
  private partMouse:boolean[]=[false,false,false];
  private partMouseTokens:MouseGesture[]=[null,null,null];
  private buttonMouseTokens=new Map<string,MouseGesture>();
  private hintUntil=0;
  onAwake():void {
    this.createEvent("OnStartEvent").bind(()=>this.start());
    this.createEvent("LateUpdateEvent").bind(()=>{
      if(global.deviceInfoSystem.isEditor()&&!this.mouseAdapter)this.installEditorMouse();
      const pending=this.releases.splice(0);pending.forEach(i=>this.release(i));
      this.parts.forEach((p,i)=>{if(this.state.has(i))p.getTransform().setWorldPosition(this.sockets[i].getTransform().getWorldPosition());});
      if(this.hintUntil>0&&getTime()>this.hintUntil){this.hintUntil=0;this.feedback.forEach(f=>f.enabled=false);this.show();}
    });
  }
  private start():void {
    this.parts=[this.part1,this.part2,this.part3];this.sockets=[this.socket1,this.socket2,this.socket3];
    this.trays=[this.tray1,this.tray2,this.tray3];this.hints=[this.hint1,this.hint2,this.hint3];
    this.lights=[this.light1,this.light2,this.light3];this.feedback=[this.feedback1,this.feedback2,this.feedback3];
    if(!this.controls||[...this.parts,...this.sockets,...this.trays,...this.hints,...this.lights,...this.feedback].some(x=>!x))throw new Error("BoltBack authored references missing");
    this.parts.forEach((p,i)=>{
      const visual=p.getChild(0).getComponent("Component.RenderMeshVisual"); visual.mainMaterial=visual.mainMaterial.clone();
      const c=p.createComponent("Physics.ColliderComponent");const shape=Shape.createBoxShape();shape.size=new vec3(5,5,2);c.shape=shape;c.fitVisual=false;c.debugDrawEnabled=this.debugColliders;
      const a=p.createComponent(Interactable.getTypeName());this.interactables.push(a);
      const manipulation=p.createComponent(InteractableManipulation.getTypeName());manipulation.setCanRotate(false);manipulation.setCanScale(false);manipulation.useFilter=false;manipulation.enableStretchZ=false;
      this.manipulations.push(manipulation);
      let staleMousePress=false;
      let staleMouseInteractor:InteractorEvent["interactor"]=null;
      a.onTriggerStart.add(e=>{
        if(e.propagationPhase!=="Target"||!e.target?.sceneObject.isSame(p))return;
        this.partMouse[i]=e.interactor.inputType===InteractorInputType.Mouse;
        if(this.partMouse[i]){
          this.partMouseTokens[i]=this.mouseAdapter?.normalStart(p)??null;
          staleMousePress=!!this.mouseAdapter?.hasRealGesture()&&!this.partMouseTokens[i];
          staleMouseInteractor=staleMousePress?e.interactor:null;
          if(staleMousePress)manipulation.setCanTranslate(false);
        }
      });
      // Restore only after the stored mouse interactor is idle and real input is ended/invalidated.
      // This also cleans up superseded/cancelled tokens without trusting another hand's end event.
      this.createEvent("LateUpdateEvent").bind(()=>{
        const g=this.mouseAdapter?.gate.active;
        if(staleMousePress&&staleMouseInteractor?.currentTrigger===InteractorTriggerType.None&&
           (!this.mouseAdapter?.hasRealGesture()||g?.endTime!==null)){
          staleMousePress=false;staleMouseInteractor=null;
          manipulation.setCanTranslate(this.state.phase==="Practice"&&!this.state.has(i));
        }
      });
      manipulation.onManipulationEnd.add(()=>{
        // Real editor mouse releases commit from captured end rays, not SIK's last sampled pose.
        if(this.partMouse[i]&&this.mouseAdapter?.hasRealGesture())return;
        if(!this.partMouse[i]||!this.mouseAdapter||this.mouseAdapter.normalDispatch(this.partMouseTokens[i]))this.releases.push(i);
      });
      a.onHoverEnter.add(()=>{const v=p.getChild(0).getComponent("Component.RenderMeshVisual");if(v)v.mainMaterial.mainPass.baseColor=new vec4(1,1,0.55,1);});
      a.onHoverExit.add(()=>this.color(i));
    });
    this.sockets.forEach(s=>{const v=s.getChild(0).getComponent("Component.RenderMeshVisual");v.mainMaterial=v.mainMaterial.clone();});
    this.controls.onPractice.add(()=>this.practice());this.controls.onReset.add(()=>this.reset());this.reset();
    console.log("[BoltBack] READY Study; 3 parts; 4cm release threshold");
  }
  practice():void {
    if(this.state.phase!=="Study")return;this.state.practice();this.releases=[];
    this.parts.forEach((p,i)=>{p.getTransform().setWorldPosition(this.trays[i].getTransform().getWorldPosition());this.manipulations[i].setCanTranslate(true);});
    this.hints.forEach(h=>h.enabled=false);this.show();
  }
  reset():void {
    this.mouseAdapter?.invalidate();
    this.state.reset();this.releases=[];this.hintUntil=0;
    this.parts.forEach((p,i)=>{this.manipulations[i].setCanTranslate(false);p.getTransform().setWorldPosition(this.sockets[i].getTransform().getWorldPosition());this.color(i);});
    this.sockets.forEach(s=>{const v=s.getChild(0).getComponent("Component.RenderMeshVisual");v.mainMaterial.mainPass.baseColor=new vec4(0.55,0.7,0.75,1);});
    this.hints.forEach(h=>h.enabled=true);this.lights.forEach(l=>l.enabled=false);this.feedback.forEach(f=>f.enabled=false);this.show();
  }
  private color(i:number):void {
    const palette=[new vec4(0.25,0.75,1,1),new vec4(1,0.65,0.2,1),new vec4(0.7,0.45,1,1)];
    const v=this.parts[i].getChild(0).getComponent("Component.RenderMeshVisual");if(v)v.mainMaterial.mainPass.baseColor=palette[i];
  }
  private release(i:number):void {
    if(this.state.phase!=="Practice"||this.state.has(i))return;
    const pos=this.parts[i].getTransform().getWorldPosition();
    const distance=pos.distance(this.sockets[i].getTransform().getWorldPosition());
    if(this.state.accept(i,distance)){
      this.parts[i].getTransform().setWorldPosition(this.sockets[i].getTransform().getWorldPosition());
      this.manipulations[i].setCanTranslate(false);this.lights[i].enabled=true;this.sockets[i].getChild(0).getComponent("Component.RenderMeshVisual").mainMaterial.mainPass.baseColor=new vec4(0.35,1,0.5,1);this.show();
      console.log("[BoltBack] accepted "+(i+1)+" count="+this.state.count);
    }else{
      const nearest=this.sockets.map(s=>pos.distance(s.getTransform().getWorldPosition())).reduce((best,d,j,arr)=>d<arr[best]?j:best,0);
      this.feedback.forEach((f,j)=>f.enabled=j===nearest);this.hintUntil=getTime()+1.5;
      this.show("Wrong place. Match the original socket.");
      console.log("[BoltBack] rejected "+(i+1)+" distance="+distance.toFixed(2)+" count="+this.state.count);
    }
  }
  private show(message?:string):void {this.controls.setState(this.state.phase,this.state.count,message);}

  private installEditorMouse():void {
    if(this.mouseAdapter||!this.controls||this.parts.length!==3)return;
    const buttons=this.controls.mouseButtons();
    if(buttons.length!==2)return;
    const hasCollider=(o:SceneObject):boolean=>{
      if(o.getComponents("Physics.ColliderComponent").length)return true;
      for(let i=0;i<o.getChildrenCount();i++)if(hasCollider(o.getChild(i)))return true;
      return false;
    };
    if(buttons.some(b=>!b.object.getComponent(Interactable.getTypeName())||!hasCollider(b.object)))return;
    let camera:Camera=null;
    const findCamera=(o:SceneObject):void=>{
      if(!camera)camera=o.getComponent("Component.Camera");
      for(let i=0;i<o.getChildrenCount()&&!camera;i++)findCamera(o.getChild(i));
    };
    for(let i=0;i<global.scene.getRootObjectsCount()&&!camera;i++)findCamera(global.scene.getRootObject(i));
    if(!camera)return;
    const bindings=buttons.concat(this.parts.map((object,i)=>({object,target:i as 0|1|2})));
    this.mouseAdapter=new BoltBackMouseAdapter(this,camera,bindings,
      ()=>this.state.phase==="Practice",i=>this.state.has(i),
      intent=>this.controls.dispatchMouseIntent(intent),
      (i,position)=>{this.parts[i].getTransform().setWorldPosition(position);this.release(i);},()=>{});
    this.controls.mouseDispatchGuard=object=>this.mouseAdapter.normalDispatch(this.buttonMouseTokens.get(object.uniqueIdentifier)??null);
    buttons.forEach(({object:o})=>{
      const a=o.getComponent(Interactable.getTypeName());
      a.onTriggerStart.add(e=>{
        if(e.propagationPhase==="Target"&&e.target?.sceneObject.isSame(o)&&e.interactor.inputType===InteractorInputType.Mouse)
          this.buttonMouseTokens.set(o.uniqueIdentifier,this.mouseAdapter.normalStart(o));
      });
    });
    console.log("[BoltBack] editor mouse ready; five project-only pick targets");
  }
}
