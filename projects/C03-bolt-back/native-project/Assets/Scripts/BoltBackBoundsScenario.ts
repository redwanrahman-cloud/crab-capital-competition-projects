import WorldCameraFinderProvider from "SpectaclesInteractionKit.lspkg/Providers/CameraProvider/WorldCameraFinderProvider";
import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario";
import {DefaultLeafInteractor} from "Leaf.lspkg/Interactors/interactor/DefaultLeafInteractor";
import {nextFrame,sleep} from "Leaf.lspkg/Utils/common/Utils";
import {check,main,target,PlacementInteractor} from "./BoltBackTestHelpers";
@component
export class BoltBackBoundsScenario extends Scenario {
 async run():Promise<void>{
  const m=main();const hand=new DefaultLeafInteractor("BoltBackBoundsHand");await hand.trigger(target("BoltBackReset"));await nextFrame();
  const original=m.part1.getTransform().getWorldPosition();await sleep(500);
  check(original.distance(m.part1.getTransform().getWorldPosition())<0.01,"World-fixed part stays at authored socket over time");
  check(m.socket1.getTransform().getWorldPosition().distance(m.socket2.getTransform().getWorldPosition())===8,"Socket spacing 8cm");
  check(m.socket2.getTransform().getWorldPosition().distance(m.socket3.getTransform().getWorldPosition())===8,"Second spacing 8cm");
  const camera=WorldCameraFinderProvider.getInstance().getComponent();
  for(const name of ["BoltBackPractice","BoltBackReset","BoltBackPart1","BoltBackPart2","BoltBackPart3"]){const a=target(name);const screen=camera.worldSpaceToScreenSpace(a.getTransform().getWorldPosition());console.log("[BoltBackProjection] "+name+" "+screen);check(screen.x>0&&screen.x<1&&screen.y>0&&screen.y<1,name+" center inside designated view");}
  console.log("[BoltBackProjection] socket1 "+camera.worldSpaceToScreenSpace(m.socket1.getTransform().getWorldPosition()));
 }
}
