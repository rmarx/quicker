import { Http3DepNodePQueue } from "./http3.priorityqueue";
export class Http3PrioritisedElementNode {
    static readonly MAX_BYTES_SENT = 100;
    private parent: Http3PrioritisedElementNode | null;
    protected activeChildrenPQueue: Http3DepNodePQueue = new Http3DepNodePQueue([]);
    protected children: Http3PrioritisedElementNode[] = [];
    protected weight: number;
    protected pseudoTime: number = 0;
    protected lastPseudoTime: number = 0;

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
        const child: Http3PrioritisedElementNode | undefined = this.activeChildrenPQueue.pop();
        if (child !== undefined) {
            this.lastPseudoTime = child.pseudoTime;
            child.schedule();
            if (child.isActive()) {
                // K = 256 -> constant to compensate the lost bits by integer division (e.g., 256).
                child.pseudoTime = this.lastPseudoTime + child.getBytesSent() * 256 / child.weight;
                this.activeChildrenPQueue.push(child);
            }
        }
    }

    public getBytesSent(): number {
        // TODO?
        return Http3PrioritisedElementNode.MAX_BYTES_SENT;
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
            return value !== child;
        });
    }

    public activateChild(child: Http3PrioritisedElementNode) {
        if (this.activeChildrenPQueue.includes(child)) {
            return;
        }

        const childIndex: number = this.children.indexOf(child);
        if (childIndex !== -1) {
            // K = 256 -> constant to compensate the lost bits by integer division (e.g., 256).
            // TODO bytessent is hardcoded to MAX_BYTES_SENT as placeholders dont have a bytessent property
            child.pseudoTime = this.pseudoTime + child.getBytesSent() * 256 / child.weight;
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
            parent.removeChild(this);
            this.parent = null;
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