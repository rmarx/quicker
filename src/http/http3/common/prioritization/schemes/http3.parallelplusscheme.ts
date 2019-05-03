import { Http3PriorityScheme } from "./http3.priorityscheme";
import { QuicStream } from "../../../../../quicker/quic.stream";
import { Bignum } from "../../../../../types/bignum";
import { Http3NodeEvent } from "../http3.nodeevent";
import { Http3PrioritisedElementNode } from "../http3.prioritisedelementnode";
import { Http3RequestNode } from "../http3.requestnode";

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
    
    public constructor() {
        super();
        this.highPriorityPlaceholderID = this.dependencyTree.addPlaceholderToRoot(256);
        this.normalPriorityPlaceholderID = this.dependencyTree.addPlaceholderToRoot(256);
        // Weight of normalpriorityplaceholder changes to 1 when highpriority non-empty and back to 256 when empty
        this.lowPriorityPlaceholderID = this.dependencyTree.addPlaceholderToRoot(1);
        
        // Make sure highPriorityTailID always points to the last element of the chain
        this.dependencyTree.on(Http3NodeEvent.NODE_REMOVED, (node: Http3PrioritisedElementNode) => {
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

    public addStream(requestStream: QuicStream, fileExtension: string): void {
        switch(this.getFileExtensionPriority(fileExtension)) {
            case PriorityGroup.HIGH:
                if (this.highPriorityTailID !== undefined) {
                    this.dependencyTree.addRequestStreamToRequest(requestStream, this.highPriorityTailID, 256);
                } else {
                    this.dependencyTree.addRequestStreamToPlaceholder(requestStream, this.highPriorityPlaceholderID, 256);
                    this.dependencyTree.setPlaceholderWeight(this.normalPriorityPlaceholderID, 1);
                }
                this.highPriorityTailID = requestStream.getStreamId();
                break;
            case PriorityGroup.NORMAL:
                this.dependencyTree.addRequestStreamToPlaceholder(requestStream, this.normalPriorityPlaceholderID, 183);
                break;
            case PriorityGroup.LOW:
                this.dependencyTree.addRequestStreamToPlaceholder(requestStream, this.lowPriorityPlaceholderID, 110);
                break;
        }
    }
    
    private getFileExtensionPriority(extension: string): PriorityGroup {
        switch(extension) {
            case "html":
            case "css":
            case "ttf": // TODO Fonts in general
            case "js": // TODO Prior to first image should be high, after should be normal -> no semantics for this yet
                return PriorityGroup.HIGH;
            default:
                return PriorityGroup.LOW;
        }
    }
}