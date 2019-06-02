import { Http3PriorityScheme } from "./http3.priorityscheme";
import { QuicStream } from "../../../../../quicker/quic.stream";
import { Bignum } from "../../../../../types/bignum";
import { Http3NodeEvent } from "../nodes/http3.nodeevent";
import { Http3PrioritisedElementNode } from "../nodes/index";
import { Http3RequestNode } from "../nodes/http3.requestnode";
import { Http3PriorityFrame, PrioritizedElementType, ElementDependencyType } from "../../frames";
import { QlogWrapper } from "../../../../../utilities/logging/qlog.wrapper";
import { Http3RequestMetadata } from "../../../client/http3.requestmetadata";

enum PriorityGroup {
    HIGH,
    MEDIUM,
    LOW
}

export class Http3SerialPlusScheme extends Http3PriorityScheme {
    private highPriorityPlaceholderID: number;
    private highPriorityTailID?: Bignum;
    private mediumPriorityPlaceholderID: number;
    private mediumPriorityTailID?: Bignum;
    private lowPriorityPlaceholderID: number;
    private leadersPlaceholderID: number;
    private followersPlaceholderID: number;
    private unblockedPlaceholderID: number;
    private backgroundPlaceholderID: number;
    private speculativePlaceholderID: number;

    // TODO communicate placeholders with server when using client-sided prioritization
    // Maybe using events?
    public constructor(logger?: QlogWrapper) {
        super(logger);
        this.highPriorityPlaceholderID = this.dependencyTree.addPlaceholderToRoot(256);
        this.mediumPriorityPlaceholderID = this.dependencyTree.addPlaceholderToRoot(256);
        // Weight of mediumPriorityPlaceholder changes to 1 when highpriority non-empty and back to 256 when empty
        this.lowPriorityPlaceholderID = this.dependencyTree.addPlaceholderToRoot(1);
        this.leadersPlaceholderID = this.dependencyTree.addPlaceholderToPlaceholder(this.lowPriorityPlaceholderID, 201);
        this.followersPlaceholderID = this.dependencyTree.addPlaceholderToPlaceholder(this.leadersPlaceholderID, 1);
        this.unblockedPlaceholderID = this.dependencyTree.addPlaceholderToPlaceholder(this.lowPriorityPlaceholderID, 101);
        this.backgroundPlaceholderID = this.dependencyTree.addPlaceholderToPlaceholder(this.lowPriorityPlaceholderID, 1);
        this.speculativePlaceholderID = this.dependencyTree.addPlaceholderToPlaceholder(this.backgroundPlaceholderID, 1);

        // Make sure highPriorityTailID and mediumPriorityTailID always points to the last element of the chain
        this.dependencyTree.on(Http3NodeEvent.REMOVING_NODE, (node: Http3PrioritisedElementNode) => {
            if (node instanceof Http3RequestNode) {
                if (node.getStreamID() === this.highPriorityTailID) {
                    const parent: Http3PrioritisedElementNode | null = node.getParent();
                    if (parent !== null && parent instanceof Http3RequestNode) {
                        this.highPriorityTailID = parent.getStreamID();
                    } else {
                        this.highPriorityTailID = undefined;
                        this.dependencyTree.setPlaceholderWeight(this.mediumPriorityPlaceholderID, 256);
                    }
                }
            } else {
                // TODO Implement appropriate error
                throw new Error("A non request node was removed from HTTP/3 dependency tree while it should contain only request streams!");
            }
        });
    }

    // Does not work client-sided, requires multiple frames as the weight the medium priority branch sometimes has to be changed
    public applyScheme(streamID: Bignum, metadata: Http3RequestMetadata): Http3PriorityFrame | null {
        switch(this.getPriorityGroup(metadata)) {
            case PriorityGroup.HIGH:
                if (this.highPriorityTailID !== undefined) {
                    this.dependencyTree.moveStreamToStream(streamID, this.highPriorityTailID);
                } else {
                    this.dependencyTree.moveStreamToPlaceholder(streamID, this.highPriorityPlaceholderID);
                    this.dependencyTree.setPlaceholderWeight(this.mediumPriorityPlaceholderID, 1);
                }
                this.highPriorityTailID = streamID;
                break;
            case PriorityGroup.MEDIUM:
                if (this.mediumPriorityTailID !== undefined) {
                    this.dependencyTree.moveStreamToStream(streamID, this.mediumPriorityTailID);
                } else {
                    this.dependencyTree.moveStreamToPlaceholder(streamID, this.mediumPriorityPlaceholderID);
                }
                this.mediumPriorityTailID = streamID;
                break;
            case PriorityGroup.LOW:
                this.dependencyTree.moveStreamToPlaceholder(streamID, this.getLowPriorityPlaceholderID(metadata));
        }
        return null;
    }

    public handlePriorityFrame(priorityFrame: Http3PriorityFrame, currentStreamID: Bignum) {}

    private getLowPriorityPlaceholderID(metadata: Http3RequestMetadata): number {
        if (metadata.isPreload === true) {
            return this.speculativePlaceholderID;
        } else if (metadata.mimetype.search("image") > -1) {
            return this.followersPlaceholderID;
        } else if (metadata.mimetype === "text/html") {
            return this.followersPlaceholderID;
        } else if (metadata.mimetype.search("font") > -1) {
            return this.followersPlaceholderID;
        } else {
            return this.backgroundPlaceholderID;
        }
    }

    private getPriorityGroup(metadata: Http3RequestMetadata): PriorityGroup {
        if (metadata.mimetype.search("javascript") > -1) {
            if (metadata.isDefer === true || metadata.isAsync === true) {
                return PriorityGroup.MEDIUM;
            } else {
                return PriorityGroup.HIGH;
            }
        } else if (metadata.isPreload === true) {
            return PriorityGroup.LOW;
        } else if (metadata.mimetype === "text/html") {
            return PriorityGroup.LOW;
        } else if (metadata.mimetype.search("image") > -1) {
            return PriorityGroup.LOW;
        } else if (metadata.mimetype.search("font") > -1) {
            return PriorityGroup.LOW;
        } else if (metadata.mimetype === "text/css") {
            return PriorityGroup.HIGH;
        } else {
            return PriorityGroup.LOW;
        }
    }
}