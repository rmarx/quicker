import { Http3PriorityScheme } from "./http3.priorityscheme";
import { QuicStream } from "../../../../../quicker/quic.stream";
import { Bignum } from "../../../../../types/bignum";
import { Http3NodeEvent } from "../http3.nodeevent";
import { Http3PrioritisedElementNode } from "../http3.prioritisedelementnode";
import { Http3RequestNode } from "../http3.requestnode";
import { Http3PriorityFrame, PrioritizedElementType, ElementDependencyType } from "../../frames";
import { VerboseLogging } from "../../../../../utilities/logging/verbose.logging";

enum PriorityGroup {
    HIGHEST,
    HIGH,
    NORMAL,
    LOW,
    LOWEST,
}

export class Http3DynamicFifoScheme extends Http3PriorityScheme {
    private highestPriorityTail?: Bignum;
    private highPriorityTail?: Bignum;
    private normalPriorityTail?: Bignum;
    private lowPriorityTail?: Bignum;
    private lowestPriorityTail?: Bignum;

    public constructor() {
        super();

        // Make sure each tail always points to the last element of its chain
        this.dependencyTree.on(Http3NodeEvent.NODE_REMOVED, (node: Http3PrioritisedElementNode) => {
            if (node instanceof Http3RequestNode) {
                const parent: Http3PrioritisedElementNode | null = node.getParent();
                const streamID: Bignum = node.getStreamID();
                if (streamID === this.lowestPriorityTail) {
                    if (parent !== null && parent instanceof Http3RequestNode) {
                        this.lowestPriorityTail = parent.getStreamID();
                    } else {
                        this.lowestPriorityTail = undefined;
                    }
                }
                if (streamID === this.lowPriorityTail) {
                    if (parent !== null && parent instanceof Http3RequestNode) {
                        this.lowPriorityTail = parent.getStreamID();
                    } else {
                        this.lowPriorityTail = undefined;
                    }
                }
                if (streamID === this.normalPriorityTail) {
                    if (parent !== null && parent instanceof Http3RequestNode) {
                        this.normalPriorityTail = parent.getStreamID();
                    } else {
                        this.normalPriorityTail = undefined;
                    }
                }
                if (streamID === this.highPriorityTail) {
                    if (parent !== null && parent instanceof Http3RequestNode) {
                        this.highPriorityTail = parent.getStreamID();
                    } else {
                        this.highPriorityTail = undefined;
                    }
                }
                if (streamID === this.highestPriorityTail) {
                    if (parent !== null && parent instanceof Http3RequestNode) {
                        this.highestPriorityTail = parent.getStreamID();
                    } else {
                        this.highestPriorityTail = undefined;
                    }
                }
            } else {
                // TODO Implement appropriate error
                throw new Error("A non request node was removed from HTTP/3 dependency tree while it should contain only request streams!");
            }
        });
    }

    public addStream(requestStream: QuicStream, fileExtension: string): void {
        const priority: PriorityGroup = this.getFileExtensionPriority(fileExtension);
        const priorityGroupTail: Bignum | undefined = this.getPriorityGroupTail(priority);
        const weight: number = this.getPriorityGroupWeight(priority);

        if (priorityGroupTail !== undefined) {
            this.dependencyTree.addExclusiveStreamToStream(requestStream, priorityGroupTail, weight);
        } else {
            this.dependencyTree.addRequestStreamToRoot(requestStream, weight);
        }

        this.setPriorityGroupTail(priority, requestStream.getStreamId());
    }

    private getPriorityGroupTail(priority: PriorityGroup): Bignum | undefined {
        switch(priority) {
            case PriorityGroup.HIGHEST:
                return this.highestPriorityTail;
            case PriorityGroup.HIGH:
                return this.highPriorityTail;
            case PriorityGroup.NORMAL:
                return this.normalPriorityTail;
            case PriorityGroup.LOW:
                return this.lowPriorityTail;
            case PriorityGroup.LOWEST:
                return this.lowestPriorityTail;
        }
    }

    // Note that this only sets the pointer to the tail stored in this object, this function does not change the underlying dependency tree
    private setPriorityGroupTail(priority: PriorityGroup, streamID: Bignum): void {
        switch(priority) {
            case PriorityGroup.HIGHEST:
                this.highestPriorityTail = streamID;
                if (this.highPriorityTail !== undefined) {
                    break;
                }
            case PriorityGroup.HIGH:
                this.highPriorityTail = streamID;
                if (this.normalPriorityTail !== undefined) {
                    break;
                }
            case PriorityGroup.NORMAL:
                this.normalPriorityTail = streamID;
                if (this.lowPriorityTail !== undefined) {
                    break;
                }
            case PriorityGroup.LOW:
                this.lowPriorityTail = streamID;
                if (this.lowestPriorityTail !== undefined) {
                    break;
                }
            case PriorityGroup.LOWEST:
                this.lowestPriorityTail = streamID;
        }
    }

    private getFileExtensionPriority(extension: string): PriorityGroup {
        switch(extension) {
            case "html":
            case "css":
            case "ttf": // TODO Fonts in general
                return PriorityGroup.HIGHEST;
            case "js": // TODO Prior to first image should be high, after should be normal -> no semantics for this yet
                return PriorityGroup.HIGH;
            case "png":
            case "jpg":
            case "gif":
                return PriorityGroup.LOW;
            default:
                return PriorityGroup.LOWEST;
        }
    }

    private getPriorityGroupWeight(priority: PriorityGroup): number {
        switch(priority) {
            case PriorityGroup.HIGHEST:
                return 256;
            case PriorityGroup.HIGH:
                return 220;
            case PriorityGroup.NORMAL:
                return 183;
            case PriorityGroup.LOW:
                return 147;
            case PriorityGroup.LOWEST:
                return 110;
        }
    }
}