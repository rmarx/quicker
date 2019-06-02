import { Http3PrioritisedElementNode, Http3RequestNode, Http3PlaceholderNode } from "./nodes/index";

export class Http3DepNodePQueue {
    private heap: Http3PrioritisedElementNode[] = [];
    // Are processed before heap (weights 255) in order of (ascending) stream or placeholder id
    private infWeights: Http3PrioritisedElementNode[] = [];
    // Are processed after heap (weights 0) in order of (ascending) stream or placeholder id
    private zeroWeights: Http3PrioritisedElementNode[] = [];

    public constructor(nodes: Http3PrioritisedElementNode[]) {
        for (const node of nodes) {
            this.push(node);
        }
    }

    public push(node: Http3PrioritisedElementNode) {
        if (node.getWeight() === 0) {
            this.insertZeroWeight(node);
        } else if (node.getWeight() === 255) {
            this.insertInfWeight(node);
        } else {
            // Else push to heap as usual
            const newSize = this.heap.push(node);
            this.siftUp(newSize - 1);
        }
    }

    public pop(): Http3PrioritisedElementNode | undefined {
        if (this.infWeights.length > 0) {
            return this.infWeights.shift();
        } else if (this.heap.length > 0) {
            const top: Http3PrioritisedElementNode = this.heap[0];
            const bottom: Http3PrioritisedElementNode | undefined = this.heap.pop();
            if (bottom !== undefined && this.heap.length > 0) {
                this.heap[0] = bottom;
                this.siftDown(0);
            }

            return top;
        } else if (this.zeroWeights.length > 0) {
            return this.zeroWeights.shift();
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

    private insertZeroWeight(node: Http3PrioritisedElementNode) {
        let nodeIsRequest: boolean = false;
        let id: number;
        if (node instanceof Http3RequestNode) {
            nodeIsRequest = true;
            id = node.getStreamID().toNumber();
        } else if (node instanceof Http3PlaceholderNode) {
            id = node.getPlaceholderID();
        } else {
            throw new Error("Tried pushing a node which was neither a request nor a placeholder node!");
        }

        if (this.zeroWeights.length === 0) {
            this.zeroWeights.push(node);
        } else {
            // Insert node in sorted order by stream id (in case of a tie between stream and placeholder id, the stream is inserted first)
            for (let i = this.zeroWeights.length - 1; i >= 0; --i) {
                const nodeAtIndex: Http3PrioritisedElementNode = this.zeroWeights[i];
                let nodeAtIndexID: number;
                if (nodeAtIndex instanceof Http3RequestNode) {
                    nodeAtIndexID = nodeAtIndex.getStreamID().toNumber();
                } else if (nodeAtIndex instanceof Http3PlaceholderNode) {
                    nodeAtIndexID = nodeAtIndex.getPlaceholderID();
                } else {
                    throw new Error("Node at index was neither a request nor a placeholder node!");
                }

                if (nodeAtIndexID === id) {
                    // Cover edge case where stream id === placeholder id
                    if (nodeIsRequest === true) {
                        this.zeroWeights.splice(i, 0, node);
                    } else {
                        this.zeroWeights.splice(i+1, 0, node);
                    }
                    break;
                } else if (nodeAtIndexID < id) {
                    this.zeroWeights.splice(i+1, 0, node);
                    break;
                } else if (i === 0) {
                    // Edge case were streamid is the lowest of the list
                    this.zeroWeights.unshift(node);
                    break;
                }
            }
        }
    }

    private insertInfWeight(node: Http3PrioritisedElementNode) {
        let nodeIsRequest: boolean = false;
        let id: number;
        if (node instanceof Http3RequestNode) {
            nodeIsRequest = true;
            id = node.getStreamID().toNumber();
        } else if (node instanceof Http3PlaceholderNode) {
            id = node.getPlaceholderID();
        } else {
            throw new Error("Tried pushing a node which was neither a request nor a placeholder node!");
        }

        if (this.infWeights.length === 0) {
            this.infWeights.push(node);
        } else {
            // Insert node in sorted order by stream id (in case of a tie between stream and placeholder id, the stream is inserted first)
            for (let i = this.infWeights.length - 1; i >= 0; --i) {
                const nodeAtIndex: Http3PrioritisedElementNode = this.infWeights[i];
                let nodeAtIndexID: number;
                if (nodeAtIndex instanceof Http3RequestNode) {
                    nodeAtIndexID = nodeAtIndex.getStreamID().toNumber();
                } else if (nodeAtIndex instanceof Http3PlaceholderNode) {
                    nodeAtIndexID = nodeAtIndex.getPlaceholderID();
                } else {
                    throw new Error("Node at index was neither a request nor a placeholder node!");
                }

                if (nodeAtIndexID === id) {
                    // Cover edge case where stream id === placeholder id
                    if (nodeIsRequest === true) {
                        this.infWeights.splice(i, 0, node);
                    } else {
                        this.infWeights.splice(i+1, 0, node);
                    }
                    break;
                } else if (nodeAtIndexID < id) {
                    this.infWeights.splice(i+1, 0, node);
                    break;
                } else if (i === 0) {
                    // Edge case were streamid is the lowest of the list
                    this.infWeights.unshift(node);
                    break;
                }
            }
        }
    }
}
