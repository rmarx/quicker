import { Http3PriorityScheme } from "./http3.priorityscheme";
import { QuicStream } from "../../../../../quicker/quic.stream";
import { Bignum } from "../../../../../types/bignum";
import { Http3NodeEvent } from "../http3.nodeevent";
import { Http3PrioritisedElementNode } from "../http3.prioritisedelementnode";
import { Http3RequestNode } from "../http3.requestnode";
import { Http3PriorityFrame, PrioritizedElementType, ElementDependencyType } from "../../frames";
import { VerboseLogging } from "../../../../../utilities/logging/verbose.logging";
import { QlogWrapper } from "../../../../../utilities/logging/qlog.wrapper";
import { Http3RequestMetadata } from "../../../client/http3.requestmetadata";

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

    public constructor(logger?: QlogWrapper) {
        super(0, logger);

        // Make sure each tail always points to the last element of its chain
        this.dependencyTree.on(Http3NodeEvent.REMOVING_NODE, (node: Http3PrioritisedElementNode) => {
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

    public initialSetup(): Http3PriorityFrame[] {
        return [];
    }

    // Does not work for client-sided prioritization!
    public applyScheme(streamID: Bignum, metadata: Http3RequestMetadata): Http3PriorityFrame | null {
        const priority: PriorityGroup = this.getPriorityGroup(metadata);
        const priorityGroupTail: Bignum | undefined = this.getPriorityGroupTail(priority);
        const weight: number = this.getPriorityGroupWeight(priority);

        if (priorityGroupTail !== undefined) {
            this.dependencyTree.moveStreamToStreamExclusive(streamID, priorityGroupTail);
        } else {
            this.dependencyTree.moveStreamToRootExclusive(streamID);
        }
        this.dependencyTree.setStreamWeight(streamID, weight);
        this.setPriorityGroupTail(priority, streamID);

        return null;
    }

    public handlePriorityFrame(priorityFrame: Http3PriorityFrame, currentStreamID: Bignum): void {}

    private getPriorityGroupTail(priority: PriorityGroup): Bignum | undefined {
        switch(priority) {
            case PriorityGroup.LOWEST:
                if (this.lowestPriorityTail !== undefined) {
                    return this.lowestPriorityTail
                } // Else fall through
            case PriorityGroup.LOW:
                if (this.lowPriorityTail !== undefined) {
                    return this.lowPriorityTail;
                }
            case PriorityGroup.NORMAL:
                if (this.normalPriorityTail !== undefined) {
                    return this.normalPriorityTail;
                }
            case PriorityGroup.HIGH:
                if (this.highPriorityTail !== undefined) {
                    return this.highPriorityTail;
                }
            case PriorityGroup.HIGHEST:
                if (this.highestPriorityTail !== undefined) {
                    return this.highestPriorityTail;
                } else {
                    return undefined;
                }
        }
    }

    // Note that this only sets the pointer to the tail stored in this object, this function does not change the underlying dependency tree
    private setPriorityGroupTail(priority: PriorityGroup, streamID: Bignum): void {
        switch(priority) {
            case PriorityGroup.HIGHEST:
                this.highestPriorityTail = streamID;
                break;
            case PriorityGroup.HIGH:
                this.highPriorityTail = streamID;
                break;
            case PriorityGroup.NORMAL:
                this.normalPriorityTail = streamID;
                break;
            case PriorityGroup.LOW:
                this.lowPriorityTail = streamID;
                break;
            case PriorityGroup.LOWEST:
                this.lowestPriorityTail = streamID;
        }
    }

    private getPriorityGroup(metadata: Http3RequestMetadata): PriorityGroup {
        // TODO missing server push -> should be LOWEST
        if (metadata.mimeType.search("javascript") > -1) {
            if (metadata.isAsync === true || metadata.isDefer === true) {
                return PriorityGroup.LOW;
            }
            else if (metadata.isAfterFirstImage === true) {
                return PriorityGroup.NORMAL;
            } else {
                return PriorityGroup.HIGH;
            }
        } else if (metadata.mimeType === "text/html" || metadata.mimeType === "text/css") {
            return PriorityGroup.HIGHEST;
        } else if (metadata.mimeType.search("xml") > -1 || metadata.mimeType.search("json") > -1) {
            return PriorityGroup.HIGH;
        } else if (metadata.mimeType.search("font") > -1) {
            return PriorityGroup.HIGHEST;
        } else if (metadata.mimeType.search("image") > -1) {
            return PriorityGroup.LOW;
        } else {
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