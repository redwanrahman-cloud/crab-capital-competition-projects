/** Passive single-label view on authored fastener/socket/frame roots. No exercise state. */
import {FlexLayout} from "SpectaclesUIKit.lspkg/Scripts/Components/Layout2D/Flex/FlexLayout";
import {FlexItem} from "SpectaclesUIKit.lspkg/Scripts/Components/Layout2D/Flex/FlexItem";
import {FlexDirection, FlexAlign} from "SpectaclesUIKit.lspkg/Scripts/Components/Layout2D/Flex/FlexTypes";
@component
export class BoltBackLabelUI extends BaseScriptComponent {
  @ui.label("Bolt Back label")
  @input @hint("Visible number or caption") label: string = "1";
  @input @hint("Label width in cm") @widget(new SliderWidget(2,30,1)) width: number = 5;
  private textView: Text;
  onAwake(): void {
    this.sceneObject.createComponent("Component.Canvas");
    const flex = this.sceneObject.createComponent(FlexLayout.getTypeName());
    flex.autoDiscoverItemsOnStart=false; flex.width = this.width; flex.height = 2; flex.direction = FlexDirection.Row; flex.alignItems = FlexAlign.Center;
    const child = global.scene.createSceneObject("Label"); child.setParent(this.sceneObject);
    const item=child.createComponent(FlexItem.getTypeName()); item.overrideWidth=this.width; item.overrideHeight=2;
    this.textView=child.createComponent("Component.Text");
    this.textView.text=this.label; this.textView.size=48*75/110;
    (this.textView as Text & {weight?:number}).weight=700;
    this.textView.depthTest=true;
    this.textView.horizontalAlignment=HorizontalAlignment.Center;
    this.textView.verticalAlignment=VerticalAlignment.Center;
    this.textView.horizontalOverflow=HorizontalOverflow.Overflow;
    this.textView.layoutRect=Rect.create(-this.width/2,this.width/2,-1,1);
    this.textView.textFill.color=new vec4(1,1,1,1); flex.addItems([item]);
  }
}