import { Http3PriorityScheme } from ".";
import { QlogWrapper } from "../../../../../utilities/logging/qlog.wrapper";
import { Http3PMeenanBucket } from "./http3.pmeenanbucket";
import { QuicStream } from "../../../../../quicker/quic.stream";
import { Bignum } from "../../../../../types/bignum";
import { Http3PriorityFrame, PrioritizedElementType, ElementDependencyType } from "../../frames";
import { Http3PMeenanNode, Http3PMeenanNodeEvent } from "./http3.pmeenannode";
import { VerboseLogging } from "../../../../../utilities/logging/verbose.logging";
import { Http3RequestMetadata } from "../../../client/http3.requestmetadata";

export class Http3PMeenanScheme extends Http3PriorityScheme {
    private static readonly BUCKET_COUNT: number = 64;
    private buckets: Http3PMeenanBucket[] = [];

    private unprioritisedStreams: Map<string, QuicStream> = new Map<string, QuicStream>();
    private streamIdToBucketMap: Map<string, number> = new Map<string, number>();
    private activeBuckets: number[] = [];
    private bucketActivityMap: Map<number, boolean> = new Map<number, boolean>();

    public constructor(logger?: QlogWrapper) {
        super(0, logger);
        // Create the buckets for each priority level
        for (let i = 0; i < Http3PMeenanScheme.BUCKET_COUNT; ++i) {
            this.buckets.push(new Http3PMeenanBucket(i));
            this.bucketActivityMap.set(i, false);

            const self: Http3PMeenanScheme = this;
            this.buckets[i].on(Http3PMeenanNodeEvent.NODE_FINISHED, (node: Http3PMeenanNode, priority: number, concurrency: number) => {
                self.streamIdToBucketMap.delete(node.getStreamID().toString());

                // Set bucket as inactive if it is empty
                if (self.buckets[priority].isEmpty() === true) {
                    self.deactivateBucket(priority);
                }
            });
        }
    }

    public initialSetup(): Http3PriorityFrame[] {
        return [];
    }

    public addStream(requestStream: QuicStream): void {
        this.unprioritisedStreams.set(requestStream.getStreamId().toString(), requestStream);
    }

    public applyScheme(streamID: Bignum, metadata: Http3RequestMetadata): Http3PriorityFrame | null {
        const requestStream: QuicStream | undefined = this.unprioritisedStreams.get(streamID.toString());
        if (requestStream !== undefined) {
            this.unprioritisedStreams.delete(streamID.toString());
            const [priority, concurrency]: [number, number] = this.metadataToBucket(metadata);
            
            this.buckets[priority].addStream(requestStream, priority, concurrency);
            this.streamIdToBucketMap.set(streamID.toString(), priority);
            this.activateBucket(priority);

            const weight: number = (priority << 2) | concurrency;
            VerboseLogging.info("Creating PMeenan priority frame with priority: " + priority + " and concurrency: " + concurrency + ". Resulting weight: " + weight);
            return new Http3PriorityFrame(PrioritizedElementType.CURRENT_STREAM, ElementDependencyType.ROOT, undefined, undefined, weight);
        } else {
            throw new Error("Tried applying a scheme to a stream which was not in the data structure");
        }
    }

    public handlePriorityFrame(priorityFrame: Http3PriorityFrame, currentStreamID: Bignum): void {
        // const weight: number = priorityFrame.getWeight();
        // const streamID: Bignum | undefined = priorityFrame.getPEID();
        // const priority: number = weight >> 2;
        // const concurrency: number = weight & 0x3 // 0000 0011
        
        // if (streamID === undefined) {
        //     throw new Error("Priority frame did not contain a streamID. Could not process it.");
        // }
        // const requestStream: QuicStream | undefined = this.unprioritisedStreams.get(streamID.toString());
        // const bucket: number | undefined = this.streamIdToBucketMap.get(streamID.toString());

        // if (requestStream !== undefined) {
        //     this.buckets[priority].addStream(requestStream, priority, concurrency);
        //     this.streamIdToBucketMap.set(streamID.toString(), priority);
        //     if (this.bucketActivityMap.get(priority) === false) {
        //         this.bucketActivityMap.set(priority, true);
        //     }
        // } else if (bucket !== undefined) {
        //     const node: Http3PMeenanNode | null = this.buckets[bucket].popNode(streamID);
        //     if (this.buckets[bucket].isEmpty() === true) {
        //         this.deactiveBucket(bucket);
        //     }

        //     if (node !== null) {
        //         this.buckets[priority].pushNode(node, concurrency);
        //         this.activeBucket(priority);
        //     } else {
        //         throw new Error("Priority frame referenced a stream which was not present in its bucket.");
        //     }
        // } else {
        //     throw new Error("Priority frame referenced a stream which was not present in the data structure.");
        // }
    }

    public addData(requestStreamID: Bignum, buffer: Buffer) {
        const priority: number | undefined = this.streamIdToBucketMap.get(requestStreamID.toString());
        if (priority !== undefined) {
            this.buckets[priority].addData(requestStreamID, buffer);
        } else {
            throw new Error("Tried adding data to stream which was not in the data structure");
        }
    }

    public finishStream(requestStreamID: Bignum) {
        const priority: number | undefined = this.streamIdToBucketMap.get(requestStreamID.toString());
        if (priority !== undefined) {
            this.buckets[priority].finishStream(requestStreamID);
        } else {
            throw new Error("Tried finishing a stream which was not in the data structure");
        }
    }

    public removeRequestStream(requestStreamID: Bignum)  {
        const priority: number | undefined = this.streamIdToBucketMap.get(requestStreamID.toString());
        if (priority !== undefined) {
            this.buckets[priority].removeStream(requestStreamID);
            this.streamIdToBucketMap.delete(requestStreamID.toString());

            // Set bucket as inactive if it is empty
            if (this.buckets[priority].isEmpty() === true) {
                this.deactivateBucket(priority);
            }
        } else {
            throw new Error("Tried finishing a stream which was not in the data structure");
        }
    }

    public schedule() {
        let iter: number = 0;
        while(iter < this.activeBuckets.length && this.buckets[this.activeBuckets[iter]].schedule() === false) {
            ++iter;
        }
    }

    private metadataToBucket(metadata: Http3RequestMetadata): [number, number] {
        if (metadata.isDefer === true || metadata.isAsync) {
            return [31, 2];
        } else if (metadata.mimeType.search("javascript") > -1) {
            if (metadata.inHead === true || metadata.isCritical === true) {
                return [63, 3];
            } else {
                return [31, 3];
            }
        } else if (metadata.mimeType.search("xml") > -1 || metadata.mimeType.search("json") > -1) {
            return [31, 3];
        } else if (metadata.mimeType.search("font") > -1) {
            if (metadata.isPreload === true) {
                return [31, 2];
            } else {
                return [63, 2];
            }
        } else if (metadata.mimeType === "text/html") {
            return [31, 2];
        } else if (metadata.mimeType === "text/css") {
            if (metadata.inHead === true || metadata.isCritical === true) {
                return [63, 3];
            } else {
                return [31, 3];
            }
        } else if (metadata.mimeType.search("image") > -1) {
            if (metadata.isAboveTheFold === true) {
                return [63, 1]; // Visible
            } else {
                return [31, 1];
            }
        } else if (metadata.mimeType.search("video") > -1) {
            return [31, 1];
        } else {
            return [0, 2];
        }
    }

    private activateBucket(bucketNr: number) {
        if (this.bucketActivityMap.get(bucketNr) === false) {
            this.bucketActivityMap.set(bucketNr, true);
            this.activeBuckets.push(bucketNr);
            this.activeBuckets.sort((a, b) => b - a); // Sort descending
        }
    }
     
    private deactivateBucket(bucketNr: number) {
        if (this.bucketActivityMap.get(bucketNr) === true) {
            this.bucketActivityMap.set(bucketNr, false);
            this.activeBuckets = this.activeBuckets.filter((bucket: number) => {
                return bucket !== bucketNr;
            });
        }
    }
}