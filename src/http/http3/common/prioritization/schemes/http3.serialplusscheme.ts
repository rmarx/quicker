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
    MEDIUM,
    LOW
}

export class Http3SerialPlusScheme extends Http3PriorityScheme {
    private highPriorityPlaceholderID: number = 0;
    private highPriorityTailID?: Bignum;
    private mediumPriorityPlaceholderID: number = 1;
    private mediumPriorityTailID?: Bignum;
    private lowPriorityPlaceholderID: number = 2;
    private leadersPlaceholderID: number = 3;
    private followersPlaceholderID: number = 4;
    private unblockedPlaceholderID: number = 5;
    private backgroundPlaceholderID: number = 6;
    private speculativePlaceholderID: number = 7;

    // TODO communicate placeholders with server when using client-sided prioritization
    // Maybe using events?
    public constructor(logger?: QlogWrapper) {
        super(8, logger);

        // Make sure highPriorityTailID and mediumPriorityTailID always points to the last element of the chain
        this.dependencyTree.on(Http3NodeEvent.REMOVING_NODE, (node: Http3PrioritisedElementNode) => {
            if (node instanceof Http3RequestNode) {
                if (node.getStreamID() === this.highPriorityTailID) {
                    const parent: Http3PrioritisedElementNode | null = node.getParent();
                    if (parent !== null && parent instanceof Http3RequestNode) {
                        this.highPriorityTailID = parent.getStreamID();
                    } else {
                        this.highPriorityTailID = undefined;
                        // Would need to send a frame to communicate to other endpoint weight has changed
                        this.dependencyTree.setPlaceholderWeight(this.mediumPriorityPlaceholderID, 256);
                    }
                } else if (node.getStreamID() === this.mediumPriorityTailID) {
                    const parent: Http3PrioritisedElementNode | null = node.getParent();
                    if (parent !== null && parent instanceof Http3RequestNode) {
                        this.mediumPriorityTailID = parent.getStreamID();
                    } else {
                        this.mediumPriorityTailID = undefined;
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
        this.dependencyTree.setPlaceholderWeight(this.mediumPriorityPlaceholderID, 256);
        // Weight of mediumPriorityPlaceholder changes to 1 when highpriority non-empty and back to 256 when empty
        this.dependencyTree.setPlaceholderWeight(this.lowPriorityPlaceholderID, 1);

        this.dependencyTree.movePlaceholderToPlaceholder(this.leadersPlaceholderID, this.lowPriorityPlaceholderID);
        this.dependencyTree.setPlaceholderWeight(this.leadersPlaceholderID, 201);

        this.dependencyTree.movePlaceholderToPlaceholder(this.followersPlaceholderID, this.leadersPlaceholderID);
        this.dependencyTree.setPlaceholderWeight(this.followersPlaceholderID, 1);

        this.dependencyTree.movePlaceholderToPlaceholder(this.unblockedPlaceholderID, this.lowPriorityPlaceholderID);
        this.dependencyTree.setPlaceholderWeight(this.unblockedPlaceholderID, 101);

        this.dependencyTree.movePlaceholderToPlaceholder(this.backgroundPlaceholderID, this.lowPriorityPlaceholderID);
        this.dependencyTree.setPlaceholderWeight(this.backgroundPlaceholderID, 1);

        this.dependencyTree.movePlaceholderToPlaceholder(this.speculativePlaceholderID, this.backgroundPlaceholderID);
        this.dependencyTree.setPlaceholderWeight(this.speculativePlaceholderID, 1);

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
            this.mediumPriorityPlaceholderID,
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
        frames.push(new Http3PriorityFrame(
            PrioritizedElementType.PLACEHOLDER,
            ElementDependencyType.PLACEHOLDER,
            this.leadersPlaceholderID,
            this.lowPriorityPlaceholderID,
            201)
        );
        frames.push(new Http3PriorityFrame(
            PrioritizedElementType.PLACEHOLDER,
            ElementDependencyType.PLACEHOLDER,
            this.followersPlaceholderID,
            this.leadersPlaceholderID,
            1)
        );
        frames.push(new Http3PriorityFrame(
            PrioritizedElementType.PLACEHOLDER,
            ElementDependencyType.PLACEHOLDER,
            this.unblockedPlaceholderID,
            this.lowPriorityPlaceholderID,
            101)
        );
        frames.push(new Http3PriorityFrame(
            PrioritizedElementType.PLACEHOLDER,
            ElementDependencyType.PLACEHOLDER,
            this.backgroundPlaceholderID,
            this.lowPriorityPlaceholderID,
            1)
        ); 
        frames.push(new Http3PriorityFrame(
            PrioritizedElementType.PLACEHOLDER,
            ElementDependencyType.PLACEHOLDER,
            this.speculativePlaceholderID,
            this.backgroundPlaceholderID,
            1)
        );
        return frames;
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
        } else if (metadata.mimeType.search("image") > -1) {
            return this.followersPlaceholderID;
        } else if (metadata.mimeType === "text/html") {
            return this.followersPlaceholderID;
        } else if (metadata.mimeType.search("font") > -1) {
            return this.followersPlaceholderID;
        } else {
            return this.backgroundPlaceholderID;
        }
    }

    private getPriorityGroup(metadata: Http3RequestMetadata): PriorityGroup {
        if (metadata.mimeType.search("javascript") > -1) {
            if (metadata.isDefer === true || metadata.isAsync === true || metadata.inHead !== true) {
                return PriorityGroup.MEDIUM;
            } else {
                return PriorityGroup.HIGH;
            }
        } else if (metadata.isPreload === true) {
            return PriorityGroup.LOW;
        } else if (metadata.mimeType === "text/html") {
            return PriorityGroup.LOW;
        } else if (metadata.mimeType.search("xml") > -1 || metadata.mimeType.search("json") > -1) {
            return PriorityGroup.MEDIUM;
        } else if (metadata.mimeType.search("image") > -1) {
            return PriorityGroup.LOW;
        } else if (metadata.mimeType.search("font") > -1) {
            return PriorityGroup.LOW;
        } else if (metadata.mimeType === "text/css") {
            return PriorityGroup.HIGH;
        } else {
            return PriorityGroup.LOW;
        }
    }
}