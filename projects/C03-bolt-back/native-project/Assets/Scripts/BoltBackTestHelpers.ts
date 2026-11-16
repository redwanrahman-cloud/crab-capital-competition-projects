/** Native LEAF integration scenarios. Drives actual SIK controls and manipulation; never calls Main release.
 * Assertions read Main state/transforms. Not a hardware comfort or learning-effectiveness test.
 */
import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario";
import {DefaultLeafInteractor} from "Leaf.lspkg/Interactors/interactor/DefaultLeafInteractor";
import {findInteractableByName} from "Leaf.lspkg/Interactors/InteractableUtils";
import {nextFrame, sleep} from "Leaf.lspkg/Utils/common/Utils";
import {Interactable} from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable";
import {BoltBackMain} from "./BoltBackMain";
export function check(ok:boolean,message:string):void {if(!ok)throw new Error(message);console.log("[BoltBackTest] PASS "+message);}
export function main():BoltBackMain {
 function walk(o:SceneObject):BoltBackMain|null {const c=o.getComponent(BoltBackMain.getTypeName());if(c)return c;for(let i=0;i<o.getChildrenCount();i++){const found=walk(o.getChild(i));if(found)return found;}return null;}
 for(let i=0;i<global.scene.getRootObjectsCount();i++){const found=walk(global.scene.getRootObject(i));if(found)return found;}throw new Error("BoltBackMain missing");
}
export function target(name:string):Interactable {const a=findInteractableByName(name);if(!a)throw new Error("Missing interactable "+name);return a;}
export class PlacementInteractor extends DefaultLeafInteractor {
 async moveTo(a:Interactable,goal:vec3):Promise<void>{
   await this.enterHover(a);await nextFrame();this.startSelecting();await nextFrame();await nextFrame();
   const from=a.getTransform().getWorldPosition();const initialEnd=this.endPoint;const initialStart=this.startPoint;const delta=goal.sub(from);let previous=from;
   for(let k=1;k<=30;k++){const desired=vec3.lerp(from,goal,k/30);this.startPoint=initialStart.add(desired.sub(from));this.endPoint=initialEnd.add(desired.sub(from));this.overrideDragVector=desired.sub(previous);previous=desired;await nextFrame();}
   this.overrideDragVector=vec3.zero();await nextFrame();console.log("[BoltBackTest] pre-release actual="+a.getTransform().getWorldPosition()+" goal="+goal);check(a.getTransform().getWorldPosition().distance(goal)<1,"SIK drag reached intended test location within 1cm");this.stopSelecting();await nextFrame();await nextFrame();await nextFrame();
   this.overrideDragVector=undefined;await this.exitHover();await nextFrame();
 }
}
