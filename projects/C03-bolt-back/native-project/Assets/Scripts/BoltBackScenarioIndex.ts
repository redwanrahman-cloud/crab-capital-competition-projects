import {scenariosIndex} from "Leaf.lspkg/Scenarios/decorator/ScenarioIndexDecorator";
import {ScenarioMetadata} from "Leaf.lspkg/Scenarios/scenario/ScenarioMetadata";
import {BoltBackStudyScenario} from "./BoltBackStudyScenario";
import {BoltBackPlacementScenario} from "./BoltBackPlacementScenario";
import {BoltBackBoundsScenario} from "./BoltBackBoundsScenario";
import {BoltBackMouseScenario} from "./BoltBackMouseScenario";
@component
export class BoltBackScenarioIndex extends BaseScriptComponent {
 @scenariosIndex static readonly scenarios:ScenarioMetadata[]=[
 {id:"boltback_editor_mouse_regressions",typename:BoltBackMouseScenario.getTypeName()},
 {id:"boltback_study_practice_reset",typename:BoltBackStudyScenario.getTypeName()},
 {id:"boltback_placement_complete_reset",typename:BoltBackPlacementScenario.getTypeName(),parameters:{resetAtEnd:"true"}},
 {id:"boltback_world_stability_spacing",typename:BoltBackBoundsScenario.getTypeName()}
 ];
}