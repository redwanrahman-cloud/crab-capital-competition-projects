/** Passive UIKit controls/status. Emits user intent; Main owns phase and progress. */
import {InteractorInputType} from "SpectaclesInteractionKit.lspkg/Core/Interactor/Interactor";
import {MouseBinding} from "./BoltBackMouseAdapter";
import Event from "SpectaclesInteractionKit.lspkg/Utils/Event";
import {BackPlate} from "SpectaclesUIKit.lspkg/Scripts/BackPlate";
import {Button} from "SpectaclesUIKit.lspkg/Scripts/Components/Button/Button";
import {ElementContent} from "SpectaclesUIKit.lspkg/Scripts/Components/Content/ElementContent";
import {FlexLayout} from "SpectaclesUIKit.lspkg/Scripts/Components/Layout2D/Flex/FlexLayout";
import {FlexItem} from "SpectaclesUIKit.lspkg/Scripts/Components/Layout2D/Flex/FlexItem";
import {FlexDirection, FlexAlign, FlexJustify} from "SpectaclesUIKit.lspkg/Scripts/Components/Layout2D/Flex/FlexTypes";
const TYPE_SCALE={Body:{size:39,weight:500},Subheadline:{size:41,weight:700}};
function applyTextRole(t:Text,role:keyof typeof TYPE_SCALE):void {
 t.size=TYPE_SCALE[role].size*75/110; (t as Text & {weight?:number}).weight=TYPE_SCALE[role].weight;
}
@component
export class BoltBackControlsUI extends BaseScriptComponent {
  @ui.label("Bolt Back controls")
  @input @hint("Panel width in cm") @widget(new SliderWidget(24,36,1)) width:number=30;
  @input @hint("Practice action label") practiceLabel:string="Practice";
  @input @hint("Reset action label") resetLabel:string="Reset";
  readonly onPractice=new Event<void>();
  readonly onReset=new Event<void>();
  /** Production mouse dispatch arbitration; hand and LEAF input bypass it. */
  mouseDispatchGuard:(object:SceneObject)=>boolean=null;
  private mouseButtonBindings:MouseBinding[]=[];
  mouseButtons():MouseBinding[] {return this.mouseButtonBindings.slice();}
  dispatchMouseIntent(intent:"practice"|"reset"):void {
    if(intent==="practice")this.onPractice.invoke();else this.onReset.invoke();
  }
  private status:Text;
  private instruction:Text;
  private phaseButton:Button;
  private phaseContent:Text;
  onAwake():void {
    this.sceneObject.createComponent("Component.Canvas");
    const plate=this.sceneObject.createComponent(BackPlate.getTypeName()); plate.size=new vec2(this.width,10);
    const content=this.obj(this.sceneObject,"Content"); content.getTransform().setLocalPosition(new vec3(0,0,0.6));
    const column=this.layout(content,this.width,9,FlexDirection.Column);
    column.rowGap=0.5; column.paddingTop=0.5; column.paddingBottom=0.5;
    this.status=this.textRow(content,column,"Study - 0 / 3 returned",2,"Subheadline");
    this.instruction=this.textRow(content,column,"Study the numbers, then Practice",1.8,"Body");
    const row=this.obj(content,"Actions");
    const ri=row.createComponent(FlexItem.getTypeName());ri.overrideWidth=this.width-2;ri.overrideHeight=4;
    column.addItems([ri]); const flex=this.layout(row,this.width-2,4,FlexDirection.Row);flex.columnGap=2;flex.justifyContent=FlexJustify.Center;
    const p=this.button(row,flex,"BoltBackPractice",this.practiceLabel,()=>this.onPractice.invoke());
    this.phaseButton=p.button;this.phaseContent=p.content;
    this.button(row,flex,"BoltBackReset",this.resetLabel,()=>this.onReset.invoke());
  }
  setState(phase:string,count:number,message?:string):void {
    this.status.text=phase==="Complete"?"3 returned":phase+" - "+count+" / 3 returned";
    this.instruction.text=message ?? (phase==="Study"?"Study the numbers, then Practice":phase==="Practice"?"Grab, move, and release at the matching socket":"All three returned. Reset to study again.");
    this.phaseContent.text=phase==="Study"?this.practiceLabel:phase==="Practice"?"Practicing":"Complete";
  }
  private obj(parent:SceneObject,name:string):SceneObject {const o=global.scene.createSceneObject(name);o.setParent(parent);return o;}
  private layout(o:SceneObject,w:number,h:number,d:FlexDirection):FlexLayout {
    const f=o.createComponent(FlexLayout.getTypeName());f.autoDiscoverItemsOnStart=false;f.width=w;f.height=h;f.direction=d;f.alignItems=FlexAlign.Center;f.justifyContent=FlexJustify.Center;return f;
  }
  private textRow(p:SceneObject,f:FlexLayout,label:string,h:number,role:keyof typeof TYPE_SCALE):Text {
    const o=this.obj(p,"Status");const i=o.createComponent(FlexItem.getTypeName());i.overrideWidth=this.width-2;i.overrideHeight=h;
    const t=o.createComponent("Component.Text");t.text=label;applyTextRole(t,role);t.depthTest=true;
    t.horizontalAlignment=HorizontalAlignment.Center;t.verticalAlignment=VerticalAlignment.Center;t.horizontalOverflow=HorizontalOverflow.Overflow;
    t.layoutRect=Rect.create(-(this.width-2)/2,(this.width-2)/2,-h/2,h/2);t.textFill.color=new vec4(1,1,1,1);f.addItems([i]);return t;
  }
  private button(p:SceneObject,f:FlexLayout,name:string,label:string,action:()=>void):{button:Button,content:Text} {
    const o=this.obj(p,name);const item=o.createComponent(FlexItem.getTypeName());item.overrideWidth=11;item.overrideHeight=4;
    const b=o.createComponent(Button.getTypeName());b.size=new vec3(11,4,1);
    // UIKit animates each button in depth; validate the stable panel separately.
    this.mouseButtonBindings.push({object:o,stabilityObject:this.sceneObject,target:name==="BoltBackPractice"?"practice":"reset"});
    b.onTriggerUp.add(e=>{
      if(e.interactor.inputType!==InteractorInputType.Mouse||!this.mouseDispatchGuard||this.mouseDispatchGuard(o))action();
    });
    const labelObject=this.obj(o,"ButtonLabel");labelObject.getTransform().setLocalPosition(new vec3(0,0,0.08));
    const labelLayout=this.layout(o,11,4,FlexDirection.Row); const labelItem=labelObject.createComponent(FlexItem.getTypeName());labelItem.overrideWidth=11;labelItem.overrideHeight=4; const ec=labelObject.createComponent("Component.Text");ec.text=label;applyTextRole(ec,"Body");ec.depthTest=true;ec.horizontalAlignment=HorizontalAlignment.Center;ec.verticalAlignment=VerticalAlignment.Center;ec.horizontalOverflow=HorizontalOverflow.Overflow;ec.layoutRect=Rect.create(-5.5,5.5,-2,2);ec.textFill.color=new vec4(1,1,1,1);labelLayout.addItems([labelItem]);
    f.addItems([item]);return {button:b,content:ec};
  }
}
