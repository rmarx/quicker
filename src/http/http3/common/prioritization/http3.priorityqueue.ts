import { Http3PrioritisedElementNode } from "./http3.prioritisedelementnode";

export class Http3DepNodePQueue {
    private heap: Http3PrioritisedElementNode[] = [];

    public constructor(nodes: Http3PrioritisedElementNode[]) {
        for (const node of nodes) {
            this.push(node);
        }
    }

    public push(node: Http3PrioritisedElementNode) {
        const newSize = this.heap.push(node);
        this.siftUp(newSize - 1);
    }

    public pop(): Http3PrioritisedElementNode | undefined {
        if (this.heap.length > 0) {
            const top: Http3PrioritisedElementNode = this.heap[0];
            const bottom: Http3PrioritisedElementNode | undefined = this.heap.pop();
            if (bottom !== undefined && this.heap.length > 0) {
                this.heap[0] = bottom;
                this.siftDown(0);
            }

            return top;
        } else {
            return undefined
        }
    }

    public clear() {
        this.heap = [];
    }

    // TODO O(n) time complexity, preferably implement priority search queue
    public includes(node: Http3PrioritisedElementNode) {
        return this.heap.indexOf(node) !== -1;
    }

    // TODO O(n) time complexity, preferably implement priority search queue
    // deletes first occurrence of the passed value, if it is in the heap
    public delete(node: Http3PrioritisedElementNode) {
        const index: number = this.heap.findIndex((val) => {
            return val === node; // FIXME? Comparison between objects is probably slow?
        });

        if (index !== -1) {
            // Swap with rightmost leaf
            this.swap(index, this.heap.length-1);
            this.heap.pop();
            // Resift the heap
            this.siftDown(index);
        }
    }

    public size(): number {
        return this.heap.length;
    }

    // Sifts up from given index in the heap array
    private siftUp(index: number) {
        if (index > 0) {
            const parentIndex: number = Math.floor((index-1)/2);
            if (this.heap[index].getPseudoTime() < this.heap[parentIndex].getPseudoTime()) {
                // Swap parent and child and sift from there
                this.swap(index, parentIndex);
                this.siftUp(parentIndex);
            }
        }
    }

    private siftDown(index: number) {
        const leftChildIndex: number = (2*index)+1;
        const rightChildIndex: number = (2*index)+2;
        // If leaf: stop
        if (leftChildIndex >= this.heap.length) {
            return;
        }
        // If only left child exists
        else if (rightChildIndex === this.heap.length) {
            const leftChild: number = this.heap[leftChildIndex].getPseudoTime();
            if (this.heap[index].getPseudoTime() > leftChild) {
                this.swap(index, leftChildIndex);
            }
        // If both children exist, compare which one is the smaller and swap
        } else {
            const leftChild: number = this.heap[leftChildIndex].getPseudoTime();
            const rightChild: number = this.heap[rightChildIndex].getPseudoTime();
            if (leftChild < rightChild) {
                if (leftChild < this.heap[index].getPseudoTime()) {
                    this.swap(leftChildIndex, index);
                    this.siftDown(leftChildIndex);
                }
            } else {
                if (rightChild < this.heap[index].getPseudoTime()) {
                    this.swap(rightChildIndex, index);
                    this.siftDown(rightChildIndex);
                }
            }
        }
    }

    private swap(indexA: number, indexB: number) {
        if (indexA < this.heap.length && indexB < this.heap.length) {
            const a: Http3PrioritisedElementNode = this.heap[indexA];
            this.heap[indexA] = this.heap[indexB];
            this.heap[indexB] = a;
        }
    }
}
