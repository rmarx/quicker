import { Http3DepNodePQueue } from "./http3.priorityqueue";
import { EventEmitter } from "events";
import { Http3NodeEvent } from "./http3.nodeevent";
import { DependencyTree } from "./http3.deptree";

export class Http3PrioritisedElementNode extends EventEmitter {
    public static readonly CHUNK_SIZE = 1400;
    private parent: Http3PrioritisedElementNode | null;
    protected activeChildrenPQueue: Http3DepNodePQueue = new Http3DepNodePQueue([]);
    protected children: Http3PrioritisedElementNode[] = [];
    protected weight: number;
    protected pseudoTime: number = 0;
    protected lastPseudoTime: number = 0;

    // Parent should be root by default
    public constructor(parent: Http3PrioritisedElementNode | null, weight: number = 16) {
        super();
        this.parent = parent;
        this.weight = weight;
        // if (parent !== null) {
        //     this.setParent(parent);
        // }
        // this.parent = parent;
        // if (this.parent !== null) {
        //     this.parent.children.push(this);
        // }
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
        return Http3PrioritisedElementNode.CHUNK_SIZE;
    }

    // If node has active children, it is considered active
    public isActive(): boolean {
        return this.activeChildrenPQueue.size() > 0;
    }

    public hasChild(child: Http3PrioritisedElementNode): boolean {
        // FIXME -> slow, swap out with specialised data structure
        return this.children.indexOf(child) >= 0;
    }

    private removeChild(child: Http3PrioritisedElementNode) {
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

        if (this.hasChild(child) === true) {
            // K = 256 -> constant to compensate the lost bits by integer division (e.g., 256).
            // TODO bytessent is hardcoded to MAX_BYTES_SENT as placeholders dont have a bytessent property
            child.pseudoTime = this.lastPseudoTime + child.getBytesSent() * 256 / child.weight;
            this.activeChildrenPQueue.push(child);
            if (this.parent !== null) {
                this.parent.activateChild(this);
            }
        }
    }

    public passChildren(targetNode: Http3PrioritisedElementNode) {
        for (const child of this.children) {
            if (child !== targetNode) {
                child.setParent(targetNode);
            }
        }
        this.children = [];
        this.activeChildrenPQueue.clear();
    }

    // Moves all children to the node's parent, if it exists
    // If the node has no parent, all children are kept
    // Returns true if succesful, false if not
    public moveChildrenUp(): boolean {
        const parent: Http3PrioritisedElementNode | null = this.getParent();
        if (parent !== null) {
            this.passChildren(parent);
            return true;
        }
        return false;
    }

    // Adds the child as an exclusive child of this node
    // All previously attached children will be set as children of the new child
    public addExclusiveChild(child: Http3PrioritisedElementNode) {
        this.passChildren(child);
        child.setParent(this);
    }

    // Removes itself from the tree, passing children to its parent
    // Active children will remain active
    public removeSelf() {
        // Emit a node removed event so listeners know when a node is removed from the tree and which node that was
        this.emit(Http3NodeEvent.REMOVING_NODE, this);
        this.moveChildrenUp();

        const parent: Http3PrioritisedElementNode | null = this.getParent();
        if (parent !== null) {
            parent.removeChild(this);
            this.parent = null;
        }
        this.emit(Http3NodeEvent.NODE_REMOVED, this);
    }

    public getParent(): Http3PrioritisedElementNode | null {
        return this.parent;
    }

    // Changes the parent of the node
    // The node is added as a child of the parent and the parent of this node is set
    // If this node is active, it will be pushed into the active queue of the new parent
    public setParent(parent: Http3PrioritisedElementNode) {
        if (this.parent !== null) {
            this.parent.removeChild(this);
        }
        this.parent = parent;
        this.parent.children.push(this);
        if (this.isActive() === true) {
            parent.activateChild(this);
        }
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

    public toJSON(): DependencyTree {
        return {
            id: "-1",
            weight: -1,
            children: this.children.map((child: Http3PrioritisedElementNode) => {
                return child.toJSON();
            }),
        }
    }
}