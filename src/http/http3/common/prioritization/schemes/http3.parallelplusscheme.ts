import { Http3PriorityScheme } from "./http3.priorityscheme";
import { QuicStream } from "../../../../../quicker/quic.stream";
import { Bignum } from "../../../../../types/bignum";
import { Http3NodeEvent } from "../http3.nodeevent";
import { Http3PrioritisedElementNode } from "../http3.prioritisedelementnode";
import { Http3RequestNode } from "../http3.requestnode";
import { Http3PriorityFrame } from "../../frames";
import { QlogWrapper } from "../../../../../utilities/logging/qlog.wrapper";
import { Http3RequestMetadata } from "../../../client/http3.requestmetadata";

enum PriorityGroup {
    HIGH,
    NORMAL,
    LOW,
}

export class Http3ParallelPlusScheme extends Http3PriorityScheme {
    private highPriorityPlaceholderID: number;
    private highPriorityTailID?: Bignum;
    private normalPriorityPlaceholderID: number;
    private lowPriorityPlaceholderID: number;

    public constructor(logger?: QlogWrapper) {
        super(logger);
        this.highPriorityPlaceholderID = this.dependencyTree.addPlaceholderToRoot(256);
        this.normalPriorityPlaceholderID = this.dependencyTree.addPlaceholderToRoot(256);
        // Weight of normalpriorityplaceholder changes to 1 when highpriority non-empty and back to 256 when empty
        this.lowPriorityPlaceholderID = this.dependencyTree.addPlaceholderToRoot(1);

        // Make sure highPriorityTailID always points to the last element of the chain
        this.dependencyTree.on(Http3NodeEvent.REMOVING_NODE, (node: Http3PrioritisedElementNode) => {
            if (node instanceof Http3RequestNode) {
                if (node.getStreamID() === this.highPriorityTailID) {
                    const parent: Http3PrioritisedElementNode | null = node.getParent();
                    if (parent !== null && parent instanceof Http3RequestNode) {
                        this.highPriorityTailID = parent.getStreamID();
                    } else {
                        this.highPriorityTailID = undefined;
                        this.dependencyTree.setPlaceholderWeight(this.normalPriorityPlaceholderID, 256);
                    }
                }
            } else {
                // TODO Implement appropriate error
                throw new Error("A non request node was removed from HTTP/3 dependency tree while it should contain only request streams!");
            }
        });
    }

    // Does not work client-sided as multiple frames might be needed for a single action
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
        // TODO missing XHR -> should be HIGH
        // TODO missing server push -> should be LOWEST
        if (metadata.extension === "js") {
            if (metadata.isAsync === true || metadata.isDefer === true) {
                return PriorityGroup.LOW;
            }
            else if (metadata.isBeforeFirstImage === true) {
                return PriorityGroup.HIGH;
            } else {
                return PriorityGroup.NORMAL;
            }
        }
        switch(metadata.extension) {
            case "html":
            case "css":
            case "ttf": // TODO Fonts in general
            case "woff":
                return PriorityGroup.HIGH;
            default:
                return PriorityGroup.LOW;
        }
    }
}