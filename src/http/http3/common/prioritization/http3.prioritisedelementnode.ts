import { Http3DepNodePQueue } from "./http3.priorityqueue";
import { Http3RequestNode } from "./http3.requestnode";

export class Http3PrioritisedElementNode {
    private parent: Http3PrioritisedElementNode | null;
    protected activeChildrenPQueue: Http3DepNodePQueue = new Http3DepNodePQueue([]);
    protected children: Http3PrioritisedElementNode[] = [];
    protected weight: number;
    protected pseudoTime: number = 0;

    // Parent should be root by default
    public constructor(parent: Http3PrioritisedElementNode | null, weight: number = 16) {
        this.parent = parent;
        this.weight = weight;
        if (this.parent !== null) {
            this.parent.addChild(this);
        }
    }

    // Do one (recursive) pass starting from this node
    public schedule() {
        while (this.activeChildrenPQueue.size() > 0) {
            const node: Http3PrioritisedElementNode | undefined = this.activeChildrenPQueue.pop();
            if (node !== undefined) {
                this.pseudoTime = node.pseudoTime;
                node.schedule();
                if (node.isActive()) {
                    // K = 256 -> constant to compensate the lost bits by integer division (e.g., 256).
                    // TODO bytessent is hardcoded to 100 as placeholders dont have a bytessent property
                    node.pseudoTime = this.pseudoTime + 100 * 256 / node.weight;
                    this.activeChildrenPQueue.push(node);
                }
            }
        }
    }

    // If node has active children, it is considered active
    public isActive(): boolean {
        return this.activeChildrenPQueue.size() > 0;
    }

    public addChild(child: Http3PrioritisedElementNode) {
        this.children.push(child);
    }

    public removeChild(child: Http3PrioritisedElementNode) {
        this.activeChildrenPQueue.delete(child);
        // FIXME -> slow, swap out with specialised data structure
        this.children = this.children.filter((value) => {
            return value === child;
        });
    }

    public activateChild(child: Http3PrioritisedElementNode) {
        const childIndex: number = this.children.indexOf(child);
        if (childIndex !== -1) {
            // K = 256 -> constant to compensate the lost bits by integer division (e.g., 256).
            // TODO bytessent is hardcoded to 100 as placeholders dont have a bytessent property
            child.pseudoTime = this.pseudoTime + 100 * 256 / child.weight;
            this.activeChildrenPQueue.push(child);
            if (this.parent !== null) {
                this.parent.activateChild(this);
            }
        }
    }

    // Removes itself from the tree, passing children to its parent
    // Active children will remain active
    public removeSelf() {
        const parent: Http3PrioritisedElementNode | null = this.getParent();
        if (parent !== null) {
            for (const child of this.children) {
                parent.addChild(child);
                if (this.activeChildrenPQueue.includes(child)) {
                    parent.activateChild(child);
                }
            }
        }
    }

    public getParent(): Http3PrioritisedElementNode | null {
        return this.parent;
    }

    public setParent(parent: Http3PrioritisedElementNode) {
        if (this.parent !== null) {
            this.parent.removeChild(this);
        }
        this.parent = parent;
        this.parent.addChild(this);
    }

    public getWeight(): number {
        return this.weight;
    }

    public setWeight(weight: number) {
        this.weight = weight;
    }

    public getPseudoTime(): number {
        return this.pseudoTime;
    }
}