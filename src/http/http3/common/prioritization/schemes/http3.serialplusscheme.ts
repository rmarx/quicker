import { Http3PriorityScheme } from "./http3.priorityscheme";
import { QuicStream } from "../../../../../quicker/quic.stream";
import { Bignum } from "../../../../../types/bignum";
import { Http3NodeEvent } from "../http3.nodeevent";
import { Http3PrioritisedElementNode } from "../http3.prioritisedelementnode";
import { Http3RequestNode } from "../http3.requestnode";

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
    
    public constructor() {
        super();
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
        this.dependencyTree.on(Http3NodeEvent.NODE_REMOVED, (node: Http3PrioritisedElementNode) => {
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

    public addStream(requestStream: QuicStream, fileExtension: string): void {
        switch(this.getPriorityGroup(fileExtension)) {
            case PriorityGroup.HIGH:
                if (this.highPriorityTailID !== undefined) {
                    this.dependencyTree.addRequestStreamToRequest(requestStream, this.highPriorityTailID);
                } else {
                    this.dependencyTree.addRequestStreamToPlaceholder(requestStream, this.highPriorityPlaceholderID);
                    this.dependencyTree.setPlaceholderWeight(this.mediumPriorityPlaceholderID, 1);
                }
                this.highPriorityTailID = requestStream.getStreamId();
                break;
            case PriorityGroup.MEDIUM:
                if (this.mediumPriorityTailID !== undefined) {
                    this.dependencyTree.addRequestStreamToRequest(requestStream, this.mediumPriorityTailID);
                } else {
                    this.dependencyTree.addRequestStreamToPlaceholder(requestStream, this.mediumPriorityPlaceholderID, 256);
                }
                this.mediumPriorityTailID = requestStream.getStreamId();
                break;
            case PriorityGroup.LOW:
                this.dependencyTree.addRequestStreamToPlaceholder(requestStream, this.getLowPriorityPlaceholderID(fileExtension));
        }
    }
    
    private getPriorityGroup(extension: string): PriorityGroup {
        // TODO incomplete
        switch(extension) {
            case "html":
            case "ttf": // TODO Fonts in general
            case "ccs":
            case "js": // TODO Differentiate between head and body js
                return PriorityGroup.HIGH;
            default:
                return PriorityGroup.LOW;
        }
    }
    
    private getLowPriorityPlaceholderID(extension: string): number {
        // TODO incomplete
        switch(extension) {
            case "png":
            case "jpg":
            case "jpeg":
            case "ico":
            case "gif":
                return this.followersPlaceholderID;
            default:
                return this.backgroundPlaceholderID;
        }
    }
}