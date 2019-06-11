import { Http3PriorityScheme } from "./http3.priorityscheme";
import { QuicStream } from "../../../../../quicker/quic.stream";
import { Bignum } from "../../../../../types/bignum";
import { Http3NodeEvent } from "../http3.nodeevent";
import { Http3PrioritisedElementNode } from "../http3.prioritisedelementnode";
import { Http3RequestNode } from "../http3.requestnode";
import { Http3PriorityFrame, PrioritizedElementType, ElementDependencyType } from "../../frames";
import { QlogWrapper } from "../../../../../utilities/logging/qlog.wrapper";
import { Http3RequestMetadata } from "../../../client/http3.requestmetadata";

enum PriorityGroup {
    HIGH,
    NORMAL,
    LOW,
}

export class Http3ParallelPlusScheme extends Http3PriorityScheme {
    private highPriorityPlaceholderID: number = 0;
    private highPriorityTailID?: Bignum;
    private normalPriorityPlaceholderID: number = 1;
    private lowPriorityPlaceholderID: number = 2;

    public constructor(logger?: QlogWrapper) {
        super(3, logger);

        // Make sure highPriorityTailID always points to the last element of the chain
        this.dependencyTree.on(Http3NodeEvent.REMOVING_NODE, (node: Http3PrioritisedElementNode) => {
            if (node instanceof Http3RequestNode) {
                if (node.getStreamID() === this.highPriorityTailID) {
                    const parent: Http3PrioritisedElementNode | null = node.getParent();
                    if (parent !== null && parent instanceof Http3RequestNode) {
                        this.highPriorityTailID = parent.getStreamID();
                    } else {
                        this.highPriorityTailID = undefined;
                        // FIXME would need to send a frame to communicate with other endpoint
                        this.dependencyTree.setPlaceholderWeight(this.normalPriorityPlaceholderID, 256);
                    }
                }
            } else {
                // TODO Implement appropriate error
                throw new Error("A non request node was removed from HTTP/3 dependency tree while it should contain only request streams!");
            }
        });
    }

    public initialSetup(): Http3PriorityFrame[] {
        this.dependencyTree.setPlaceholderWeight(this.highPriorityPlaceholderID, 256);
        this.dependencyTree.setPlaceholderWeight(this.normalPriorityPlaceholderID, 256);
        // Weight of normalpriorityplaceholder changes to 1 when highpriority non-empty and back to 256 when empty
        this.dependencyTree.setPlaceholderWeight(this.lowPriorityPlaceholderID, 1);

        // Create frames
        const frames: Http3PriorityFrame[] = [];
        frames.push(new Http3PriorityFrame(
            PrioritizedElementType.PLACEHOLDER,
            ElementDependencyType.ROOT,
            this.highPriorityPlaceholderID,
            undefined,
            256)
        );
        frames.push(new Http3PriorityFrame(
            PrioritizedElementType.PLACEHOLDER,
            ElementDependencyType.ROOT,
            this.normalPriorityPlaceholderID,
            undefined,
            256)
        );
        frames.push(new Http3PriorityFrame(
            PrioritizedElementType.PLACEHOLDER,
            ElementDependencyType.ROOT,
            this.lowPriorityPlaceholderID,
            undefined,
            1)
        );

        return frames;
    }

    // Does not work client-sided as multiple frames might be needed for a single action
    // E.g. settings weight of normal priority subtree
    public applyScheme(streamID: Bignum, metadata: Http3RequestMetadata): Http3PriorityFrame | null {
        switch(this.getPriorityGroup(metadata)) {
            case PriorityGroup.HIGH:
                if (this.highPriorityTailID !== undefined) {
                    this.dependencyTree.moveStreamToStream(streamID, this.highPriorityTailID);
                } else {
                    this.dependencyTree.moveStreamToPlaceholder(streamID, this.highPriorityPlaceholderID);
                    this.dependencyTree.setPlaceholderWeight(this.normalPriorityPlaceholderID, 1);
                }
                this.dependencyTree.setStreamWeight(streamID, 256)
                this.highPriorityTailID = streamID;
                break;
            case PriorityGroup.NORMAL:
                this.dependencyTree.moveStreamToPlaceholder(streamID, this.normalPriorityPlaceholderID);
                this.dependencyTree.setStreamWeight(streamID, 183);
                break;
            case PriorityGroup.LOW:
                this.dependencyTree.moveStreamToPlaceholder(streamID, this.lowPriorityPlaceholderID);
                this.dependencyTree.setStreamWeight(streamID, 110);
                break;
        }
        return null;
    }

    public handlePriorityFrame(priorityFrame: Http3PriorityFrame, currentStreamID: Bignum): void {}

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
            return PriorityGroup.HIGH;
        } else if (metadata.mimeType.search("xml") > -1 || metadata.mimeType.search("json") > -1) {
            return PriorityGroup.HIGH;
        } else if (metadata.mimeType.search("font") > -1) {
            return PriorityGroup.HIGH;
        } else if (metadata.mimeType.search("image") > -1) {
            return PriorityGroup.LOW;
        } else {
            return PriorityGroup.LOW;
        }
    }
}