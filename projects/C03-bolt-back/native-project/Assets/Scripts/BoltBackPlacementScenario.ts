import {ScenarioConfig} from "Leaf.lspkg/Scenarios/scenario/ScenarioConfig";
import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario";
import {DefaultLeafInteractor} from "Leaf.lspkg/Interactors/interactor/DefaultLeafInteractor";
import {nextFrame,sleep} from "Leaf.lspkg/Utils/common/Utils";
import {check,main,target,PlacementInteractor} from "./BoltBackTestHelpers";
@component
export class BoltBackPlacementScenario extends Scenario {
 async run(config?:ScenarioConfig):Promise<void>{
   const m=main();const hand=new PlacementInteractor("BoltBackPlacementHand");
   await hand.trigger(target("BoltBackReset"));await hand.trigger(target("BoltBackPractice"));await nextFrame();
   await hand.moveTo(target("BoltBackPart1"),m.socket2.getTransform().getWorldPosition());
   check(m.state.count===0&&!m.state.has(0)&&m.state.phase==="Practice","Wrong socket never advances or locks");
   await hand.moveTo(target("BoltBackPart1"),m.socket3.getTransform().getWorldPosition());
   check(m.state.count===0&&!m.state.has(0),"Other wrong socket never advances");
   await hand.moveTo(target("BoltBackPart1"),m.socket1.getTransform().getWorldPosition().add(new vec3(0,0,6)));
   check(m.state.count===0&&!m.state.has(0),"Outside 4cm never advances");
   for(let i=0;i<3;i++){
     const s=[m.socket1,m.socket2,m.socket3][i];const p=[m.part1,m.part2,m.part3][i];
     await hand.moveTo(target("BoltBackPart"+(i+1)),s.getTransform().getWorldPosition());
     check(m.state.count===i+1&&m.state.has(i),"Matching release "+(i+1)+" increments once");
     check(p.getTransform().getWorldPosition().distance(s.getTransform().getWorldPosition())<0.01,"Part "+(i+1)+" snaps");
   }
   check(m.state.phase==="Complete"&&m.state.count===3,"Complete exactly at three");
   await hand.trigger(target("BoltBackPart1"));await nextFrame();check(m.state.count===3,"Repeated release cannot add fourth");
   if(config?.get("resetAtEnd")!=="false"){await hand.trigger(target("BoltBackReset"));await nextFrame();
   check(m.state.phase==="Study"&&m.state.count===0,"Reset from Complete");}
 }
}
