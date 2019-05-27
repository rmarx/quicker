import { Http3PrioritisedElementNode } from "./http3.prioritisedelementnode";
import { DependencyTree, DependencyTreeNodeType } from "./http3.deptree";

export class Http3PlaceholderNode extends Http3PrioritisedElementNode {
    private placeholderID: number;
    // Parent should be root by default
    public constructor(parent: Http3PrioritisedElementNode, placeholderID: number, weight: number = 16) {
        super(parent, weight);
        this.placeholderID = placeholderID;
        this.setParent(parent);
    }

    public toJSON(): DependencyTree {
        return {
            type: DependencyTreeNodeType.PLACEHOLDER,
            id: this.placeholderID.toString(),
            weight: this.weight,
            children: this.children.map((child: Http3PrioritisedElementNode) => {
                return child.toJSON();
            }),
        }
    }

    public getPlaceholderID(): number {
        return this.placeholderID;
    }
}