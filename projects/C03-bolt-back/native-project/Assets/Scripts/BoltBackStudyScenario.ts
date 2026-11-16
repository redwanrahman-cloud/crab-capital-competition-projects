import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario";
import {DefaultLeafInteractor} from "Leaf.lspkg/Interactors/interactor/DefaultLeafInteractor";
import {nextFrame,sleep} from "Leaf.lspkg/Utils/common/Utils";
import {check,main,target,PlacementInteractor} from "./BoltBackTestHelpers";
@component
export class BoltBackStudyScenario extends Scenario {
 async run():Promise<void>{
   const m=main();const hand=new DefaultLeafInteractor("BoltBackTestHand");
   await hand.trigger(target("BoltBackReset"));await nextFrame();
   check(m.state.phase==="Study"&&m.state.count===0,"Reset -> Study with zero progress");
   const parts=[m.part1,m.part2,m.part3],sockets=[m.socket1,m.socket2,m.socket3];
   parts.forEach((p,i)=>check(p.getTransform().getWorldPosition().distance(sockets[i].getTransform().getWorldPosition())<0.01,"Study part "+(i+1)+" seated"));
   check([m.hint1,m.hint2,m.hint3].every(h=>h.enabled),"Study hints visible");
   await hand.trigger(target("BoltBackPractice"));await nextFrame();
   check(m.state.phase==="Practice"&&m.state.count===0,"Practice starts with zero");
   check([m.hint1,m.hint2,m.hint3].every(h=>!h.enabled),"Practice hides hints");
   [m.tray1,m.tray2,m.tray3].forEach((t,i)=>check(parts[i].getTransform().getWorldPosition().distance(t.getTransform().getWorldPosition())<0.01,"Part "+(i+1)+" moved to tray"));
   await hand.trigger(target("BoltBackReset"));await nextFrame();check(m.state.phase==="Study","Reset from Practice");
 }
}
