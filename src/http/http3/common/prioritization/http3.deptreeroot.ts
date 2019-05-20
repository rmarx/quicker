import { Http3PrioritisedElementNode } from "./http3.prioritisedelementnode";
import { DependencyTree, DependencyTreeNodeType } from "./http3.deptree";

export class Http3DependencyTreeRoot extends Http3PrioritisedElementNode {
    // Parent should be root by default
    // FIXME Root has default weight while roots in theory don't have a weight
    public constructor() {
        super(null);
    }

    public toJSON(): DependencyTree {
        return {
            type: DependencyTreeNodeType.ROOT,
            id: "ROOT",
            weight: this.weight,
            children: this.children.map((child: Http3PrioritisedElementNode) => {
                return child.toJSON();
            }),
        }
    }
}