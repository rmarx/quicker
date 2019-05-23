import { QuicStream } from "../../../../../quicker/quic.stream";
import { Http3PMeenanNode, Http3PMeenanNodeEvent } from "./http3.pmeenannode";
import { EventEmitter } from "events";
import { Bignum } from "../../../../../types/bignum";

export class Http3PMeenanBucket extends EventEmitter {
    private priority: number;
    private exclusiveSequentialBucket: Http3PMeenanNode[] = [];
    private sharedSequentialBucket: Http3PMeenanNode[] = [];
    private sharedBucket: Http3PMeenanNode[] = [];
    private sharedFlipBit: boolean = false; // false means sharedSequential should be scheduled next, true means shared should be scheduled next
    private sharedBucketIndex: number = 0;

    private streamIdToConcurrencyMap: Map<string, number> = new Map<string, number>();

    public constructor(priority: number) {
        super();
        this.priority = priority;
    }

    public addStream(requestStream: QuicStream, priority: number, concurrency: number) {
        const node: Http3PMeenanNode = new Http3PMeenanNode(requestStream, priority, concurrency);
        this.streamIdToConcurrencyMap.set(requestStream.getStreamId().toString(), concurrency);
        switch(concurrency) {
            case 3:
                this.exclusiveSequentialBucket.push(node);
                break;
            case 2:
                this.sharedSequentialBucket.push(node);
                break;
            case 1:
                this.sharedBucket.push(node);
                break;
            default:
                throw new Error("PMeenanScheme: concurrency level + " + concurrency + " + is undefined");
        }

        const self: Http3PMeenanBucket = this;
        node.on(Http3PMeenanNodeEvent.NODE_FINISHED, (removedNode: Http3PMeenanNode, removedNodePriority: number, removedNodeConcurrency: number) => {
            self.removeStream(removedNode.getStreamID());
            self.emit(Http3PMeenanNodeEvent.NODE_FINISHED, removedNode, removedNodePriority, removedNodeConcurrency);
        });
    }

    public addData(requestStreamID: Bignum, data: Buffer) {
        const concurrency: number | undefined = this.streamIdToConcurrencyMap.get(requestStreamID.toString());
        switch(concurrency) {
            case 3:
                for (const node of this.exclusiveSequentialBucket) {
                    if (node.getStreamID().equals(requestStreamID)) {
                        node.addData(data);
                    }
                }
                break;
            case 2:
                for (const node of this.sharedSequentialBucket) {
                    if (node.getStreamID().equals(requestStreamID)) {
                        node.addData(data);
                    }
                }
                break;
            case 1:
                for (const node of this.sharedBucket) {
                    if (node.getStreamID().equals(requestStreamID)) {
                        node.addData(data);
                    }
                }
                break;
            case undefined:
                throw new Error("Tried adding data to a stream which was not in the bucket");
            default:
                throw new Error("PMeenanScheme: concurrency level + " + concurrency + " + is undefined");
        }
    }

    public finishStream(streamID: Bignum) {
        const concurrency: number | undefined = this.streamIdToConcurrencyMap.get(streamID.toString());
        switch(concurrency) {
            case 3:
                for (const node of this.exclusiveSequentialBucket) {
                    if (node.getStreamID().equals(streamID)) {
                        node.finishStream();
                    }
                }
                break;
            case 2:
                for (const node of this.sharedSequentialBucket) {
                    if (node.getStreamID().equals(streamID)) {
                        node.finishStream();
                    }
                }
                break;
            case 1:
                for (const node of this.sharedBucket) {
                    if (node.getStreamID().equals(streamID)) {
                        node.finishStream();
                    }
                }
                break;
            case undefined:
                throw new Error("Tried finishing a stream which was not in the bucket");
            default:
                throw new Error("PMeenanScheme: concurrency level + " + concurrency + " + is undefined");
        }
    }

    public removeStream(streamID: Bignum) {
        const concurrency: number | undefined = this.streamIdToConcurrencyMap.get(streamID.toString());
        this.streamIdToConcurrencyMap.delete(streamID.toString());
        switch(concurrency) {
            case 3:
                this.exclusiveSequentialBucket = this.exclusiveSequentialBucket.filter((node: Http3PMeenanNode) => {
                    return node.getStreamID().equals(streamID) === false;
                });
                break;
            case 2:
                this.sharedSequentialBucket = this.sharedSequentialBucket.filter((node: Http3PMeenanNode) => {
                    return node.getStreamID().equals(streamID) === false;
                });
                break;
            case 1:
                this.sharedBucket = this.sharedBucket.filter((node: Http3PMeenanNode) => {
                    return node.getStreamID().equals(streamID) === false;
                });
                break;
            case undefined:
                throw new Error("Tried removing a stream which was not in the bucket");
            default:
                throw new Error("PMeenanScheme: concurrency level + " + concurrency + " + is undefined");
        }
    }

    // Pops a node so that it can be pushed to another bucket
    public popNode(streamID: Bignum): Http3PMeenanNode | null {
        this.streamIdToConcurrencyMap.delete(streamID.toString());
        let index: number = this.exclusiveSequentialBucket.findIndex((node: Http3PMeenanNode) => {
            return node.getStreamID().equals(streamID);
        });
        if (index > 0) {
            const node: Http3PMeenanNode = this.exclusiveSequentialBucket[index];
            this.exclusiveSequentialBucket.splice(index, 1);
            node.removeAllListeners();
            return node;
        }
        index = this.sharedSequentialBucket.findIndex((node: Http3PMeenanNode) => {
            return node.getStreamID().equals(streamID);
        });
        if (index > 0) {
            const node: Http3PMeenanNode = this.sharedSequentialBucket[index];
            this.sharedSequentialBucket.splice(index, 1);
            node.removeAllListeners();
            return node;
        }
        index = this.sharedBucket.findIndex((node: Http3PMeenanNode) => {
            return node.getStreamID().equals(streamID);
        });
        if (index > 0) {
            const node: Http3PMeenanNode = this.sharedBucket[index];
            this.sharedBucket.splice(index, 1);
            node.removeAllListeners();
            return node;
        } else {
            return null;
        }
    }

    // Pushes a node from another bucket
    public pushNode(node: Http3PMeenanNode, concurrency: number) {
        node.setPriority(this.priority);
        node.setConcurrency(concurrency);
        this.streamIdToConcurrencyMap.set(node.getStreamID().toString(), concurrency);

        const self: Http3PMeenanBucket = this;
        node.on(Http3PMeenanNodeEvent.NODE_FINISHED, (removedNode: Http3PMeenanNode, removedNodePriority: number, removedNodeConcurrency: number) => {
            self.removeStream(removedNode.getStreamID());
            self.emit(Http3PMeenanNodeEvent.NODE_FINISHED, removedNode, removedNodePriority, removedNodeConcurrency);
        });

        switch(concurrency) {
            case 3:
                this.exclusiveSequentialBucket.push(node);
                break;
            case 2:
                this.sharedSequentialBucket.push(node);
                break;
            case 1:
                this.sharedBucket.push(node);
                break;
            default:
                throw new Error("PMeenanScheme: concurrency level + " + concurrency + " + is undefined");
        }
    }

    public isEmpty(): boolean {
        return this.exclusiveSequentialBucket.length === 0 && this.sharedSequentialBucket.length === 0 && this.sharedBucket.length === 0;
    }

    // Returns false if the bucket is empty
    public schedule(): boolean {
        for (const node of this.exclusiveSequentialBucket) {
            if (node.schedule() === true) {
                return true;
            }
        }
        // First check sharedSequential bucket before sharedbucket
        if (this.sharedFlipBit === false) {
            for (const node of this.sharedSequentialBucket) {
                if (node.schedule() === true) {
                    this.sharedFlipBit = true;
                    return true;
                }
            }
            if (this.sharedBucket.length > 0) {
                // Index for iterating over shared bucket in RR fashion
                let index: number = this.sharedBucketIndex;
                do {
                    // Wrap around index when reaching the end
                    index %= this.sharedBucket.length;
                    if (this.sharedBucket[index].schedule() === true) {
                        ++(this.sharedBucketIndex);
                        this.sharedFlipBit = false
                        return true;
                    }
                    ++index;
                } while (index !== this.sharedBucketIndex);
            }
        } else { // First check sharedbucket before sharedSequentialbucket
            if (this.sharedBucket.length > 0) {
                // Index for iterating over shared bucket in RR fashion
                let index: number = this.sharedBucketIndex;
                do {
                    // Wrap around index when reaching the end
                    index %= this.sharedBucket.length;
                    if (this.sharedBucket[index].schedule() === true) {
                        ++(this.sharedBucketIndex);
                        this.sharedFlipBit = false
                        return true;
                    }
                    ++index;
                } while (index !== this.sharedBucketIndex);
            }
            for (const node of this.sharedSequentialBucket) {
                if (node.schedule() === true) {
                    this.sharedFlipBit = true;
                    return true;
                }
            }
        }
        return false;
    }
}