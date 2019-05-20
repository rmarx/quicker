import { Http3PriorityScheme } from "./http3.priorityscheme";
import { QuicStream } from "../../../../../quicker/quic.stream";
import { Bignum } from "../../../../../types/bignum";
import { Http3NodeEvent } from "../http3.nodeevent";
import { Http3PrioritisedElementNode } from "../http3.prioritisedelementnode";
import { Http3RequestNode } from "../http3.requestnode";

export class Http3FIFOScheme extends Http3PriorityScheme {
    private tailStreamID?: Bignum;

    public constructor() {
        super();

        // Make sure tailStreamID always points to the last element of the chain
        this.dependencyTree.on(Http3NodeEvent.NODE_REMOVED, (node: Http3PrioritisedElementNode) => {
            if (node instanceof Http3RequestNode) {
                if (node.getStreamID() === this.tailStreamID) {
                    const parent: Http3PrioritisedElementNode | null = node.getParent();
                    if (parent !== null && parent instanceof Http3RequestNode) {
                        this.tailStreamID = parent.getStreamID();
                    } else {
                        this.tailStreamID = undefined;
                    }
                }
            } else {
                // TODO Implement appropriate error
                throw new Error("A non request node was removed from HTTP/3 dependency tree while it should contain only request streams!");
            }
        });
    }

    public addStream(requestStream: QuicStream, fileExtension: string): void {
        if (this.tailStreamID === undefined) {
            this.dependencyTree.addRequestStreamToRoot(requestStream);
        } else {
            this.dependencyTree.addRequestStreamToRequest(requestStream, this.tailStreamID);
        }
        this.tailStreamID = requestStream.getStreamId();
    }
}