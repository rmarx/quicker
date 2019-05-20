import { QuicStream } from "../../../../quicker/quic.stream";
import { Bignum } from "../../../../types/bignum";
import { Http3DependencyTreeRoot } from "./http3.deptreeroot";
import { Http3RequestNode } from "./http3.requestnode";
import { Http3PlaceholderNode } from "./http3.placeholdernode";
import { Http3PrioritisedElementNode } from "./http3.prioritisedelementnode";
import { Http3PriorityFrame, PrioritizedElementType, ElementDependencyType } from "../frames";
import { Http3Error, Http3ErrorCode } from "../errors/http3.error";
import { VerboseLogging } from "../../../../utilities/logging/verbose.logging";
import { Http3NodeEvent } from "./http3.nodeevent";
import { EventEmitter } from "events";

export class Http3DependencyTree extends EventEmitter {
    private root: Http3DependencyTreeRoot = new Http3DependencyTreeRoot();
    // Map request stream IDs to nodes
    private requestStreams: Map<string, Http3RequestNode> = new Map<string, Http3RequestNode>();
    // Map placeholder IDs to nodes
    private placeholders: Map<number, Http3PlaceholderNode> = new Map<number, Http3PlaceholderNode>();
    private placeholderCount: number = 0;

    public constructor() {
        super();
    }

    public handlePriorityFrame(frame: Http3PriorityFrame, currentStreamID: Bignum) {
        const prioritisedNode: Http3PrioritisedElementNode | undefined = this.getPrioritisedNodeFromFrame(frame, currentStreamID);
        const dependencyNode: Http3PrioritisedElementNode | undefined = this.getDependencyNodeFromFrame(frame);

        if (prioritisedNode !== undefined && dependencyNode !== undefined) {
            prioritisedNode.setWeight(frame.getWeight());
            prioritisedNode.setParent(dependencyNode);
            if (prioritisedNode.isActive()) {
                dependencyNode.activateChild(prioritisedNode);
            }
        } else {
            VerboseLogging.warn("Problem occurred during handling of HTTP/3 priority frame: the prioritised node and/or the dependency node were undefined");
        }
    }

    private getPrioritisedNodeFromFrame(frame: Http3PriorityFrame, currentStreamID: Bignum): Http3PrioritisedElementNode | undefined {
        let prioritisedNode: Http3PrioritisedElementNode | undefined;
        const PEID = frame.getPEID();

        switch (frame.getPET()) {
            case PrioritizedElementType.REQUEST_STREAM:
                if (PEID !== undefined) {
                    prioritisedNode = this.requestStreams.get(PEID.toString());
                } else {
                    throw new Http3Error(Http3ErrorCode.HTTP3_MALFORMED_FRAME, "Expected HTTP/3 priority frame to contain a PEID if PET is of type REQUEST_STREAM");
                }
                break;
            case PrioritizedElementType.PUSH_STREAM:
                // TODO after implementing server push
                break;
            case PrioritizedElementType.PLACEHOLDER:
                if (PEID !== undefined) {
                    prioritisedNode = this.placeholders.get(PEID.toNumber());
                } else {
                    throw new Http3Error(Http3ErrorCode.HTTP3_MALFORMED_FRAME, "Expected HTTP/3 priority frame to contain a PEID if PET is of type PLACEHOLDER");
                }
                break;
            case PrioritizedElementType.CURRENT_STREAM:
                prioritisedNode = this.requestStreams.get(currentStreamID.toString());
                break;
        }
        return prioritisedNode;
    }

    private getDependencyNodeFromFrame(frame: Http3PriorityFrame): Http3PrioritisedElementNode | undefined {
        let dependencyNode: Http3PrioritisedElementNode | undefined;
        const EDID = frame.getEDID();

        switch (frame.getEDT()) {
            case ElementDependencyType.REQUEST_STREAM:
                if (EDID !== undefined) {
                    dependencyNode = this.requestStreams.get(EDID.toString());
                } else {
                    throw new Http3Error(Http3ErrorCode.HTTP3_MALFORMED_FRAME, "Expected HTTP/3 priority frame to contain a PEID if PET is of type REQUEST_STREAM");
                }
                break;
            case ElementDependencyType.PUSH_STREAM:
                // TODO after implementing server push
                break;
            case ElementDependencyType.PLACEHOLDER:
                if (EDID !== undefined) {
                    dependencyNode = this.placeholders.get(EDID.toNumber());
                } else {
                    throw new Http3Error(Http3ErrorCode.HTTP3_MALFORMED_FRAME, "Expected HTTP/3 priority frame to contain a PEID if PET is of type PLACEHOLDER");
                }
                break;
            case ElementDependencyType.ROOT:
                dependencyNode = this.root;
                break;
        }
        return dependencyNode;
    }

    // Add with dependency on root node
    public addRequestStreamToRoot(stream: QuicStream, weight: number = 16) {
        if (this.requestStreams.has(stream.getStreamId().toString())) {
            // TODO implement appropriate error
            throw new Error("Tried adding a request stream to the HTTP/3 dependency tree while it was already in the tree");
        }

        const node: Http3RequestNode = new Http3RequestNode(stream, this.root, weight);
        this.requestStreams.set(stream.getStreamId().toString(), node);

        node.on(Http3NodeEvent.NODE_REMOVED, (node: Http3PrioritisedElementNode) => {
            // Notify listeners of this dependency tree that a node was removed
            this.emit(Http3NodeEvent.NODE_REMOVED, node);
        });
    }

    // Add with dependency on request stream
    public addRequestStreamToRequest(stream: QuicStream, dependencyStreamID: Bignum, weight: number = 16) {
        if (this.requestStreams.has(stream.getStreamId().toString())) {
            // TODO implement appropriate error
            throw new Error("Tried adding a request stream to the HTTP/3 dependency tree while it was already in the tree");
        }

        const parent: Http3PrioritisedElementNode | undefined = this.requestStreams.get(dependencyStreamID.toString());

        if (parent === undefined) {
            // TODO implement appropriate error
            throw new Error("Tried adding a request stream to a stream which was not in the dependency tree");
        } else {
            const node: Http3RequestNode = new Http3RequestNode(stream, parent, weight);
            this.requestStreams.set(stream.getStreamId().toString(), node);

            node.on(Http3NodeEvent.NODE_REMOVED, (node: Http3PrioritisedElementNode) => {
                // Notify listeners of this dependency tree that a node was removed
                this.emit(Http3NodeEvent.NODE_REMOVED, node);
            });
        }
    }

    // Add with dependency on placeholder
    public addRequestStreamToPlaceholder(stream: QuicStream, placeholderID: number, weight: number = 16) {
        if (this.requestStreams.has(stream.getStreamId().toString())) {
            // TODO implement appropriate error
            throw new Error("Tried adding a request stream to the HTTP/3 dependency tree while it was already in the tree");
        }

        const parent: Http3PrioritisedElementNode | undefined = this.placeholders.get(placeholderID);

        if (parent === undefined) {
            // TODO implement appropriate error
            throw new Error("Tried adding a request stream to a placheoldeer which was not in the dependency tree");
        } else {
            const node: Http3RequestNode = new Http3RequestNode(stream, parent, weight);
            this.requestStreams.set(stream.getStreamId().toString(), node);

            node.on(Http3NodeEvent.NODE_REMOVED, (node: Http3PrioritisedElementNode) => {
                // Notify listeners of this dependency tree that a node was removed
                this.emit(Http3NodeEvent.NODE_REMOVED, node);
            });
        }
    }

    // Add with dependency on root node
    public addPlaceholderToRoot(weight: number = 16): number {
        const placeholderID: number = this.placeholderCount++;
        const node: Http3PlaceholderNode = new Http3PlaceholderNode(this.root, weight);
        this.placeholders.set(placeholderID, node);

        node.on(Http3NodeEvent.NODE_REMOVED, (node: Http3PrioritisedElementNode) => {
            // Notify listeners of this dependency tree that a node was removed
            this.emit(Http3NodeEvent.NODE_REMOVED, node);
        });

        return placeholderID;
    }

    // Add with dependency on request stream
    public addPlaceholderToRequest(dependencyStreamID: Bignum, weight: number = 16): number {
        const placeholderID: number = this.placeholderCount++;

        const parent: Http3PrioritisedElementNode | undefined = this.requestStreams.get(dependencyStreamID.toString());

        if (parent === undefined) {
            // TODO implement appropriate error
            throw new Error("Tried adding a placeholder node to a request stream which was not in the dependency tree");
        } else {
            const node: Http3PlaceholderNode = new Http3PlaceholderNode(parent, weight);
            this.placeholders.set(placeholderID, node);

            node.on(Http3NodeEvent.NODE_REMOVED, (node: Http3PrioritisedElementNode) => {
                // Notify listeners of this dependency tree that a node was removed
                this.emit(Http3NodeEvent.NODE_REMOVED, node);
            });
        }

        return placeholderID;
    }

    // Add with dependency on placeholder
    public addPlaceholderToPlaceholder(parentPlaceholderID: number, weight: number = 16): number {
        const newPlaceholderID: number = this.placeholderCount++;

        const parent: Http3PrioritisedElementNode | undefined = this.placeholders.get(parentPlaceholderID);

        if (parent === undefined) {
            // TODO implement appropriate error
            throw new Error("Tried adding a placeholder node to another placeholder node which was not in the dependency tree");
        } else {
            const node: Http3PlaceholderNode = new Http3PlaceholderNode(parent, weight);
            this.placeholders.set(newPlaceholderID, node);

            node.on(Http3NodeEvent.NODE_REMOVED, (node: Http3PrioritisedElementNode) => {
                // Notify listeners of this dependency tree that a node was removed
                this.emit(Http3NodeEvent.NODE_REMOVED, node);
            });
        }

        return newPlaceholderID
    }

    public addExclusiveStreamToStream(stream: QuicStream, dependencyStreamID: Bignum, weight: number = 16) {
        if (this.requestStreams.has(stream.getStreamId().toString())) {
            // TODO implement appropriate error
            throw new Error("Tried adding a request stream to the HTTP/3 dependency tree while it was already in the tree");
        }

        const parent: Http3PrioritisedElementNode | undefined = this.requestStreams.get(dependencyStreamID.toString());

        if (parent === undefined) {
            // TODO implement appropriate error
            throw new Error("Tried adding a request stream to a stream which was not in the dependency tree");
        } else {
            const node: Http3RequestNode = new Http3RequestNode(stream, parent, weight);
            node.removeSelf();
            parent.addExclusiveChild(node);
            this.requestStreams.set(stream.getStreamId().toString(), node);

            node.on(Http3NodeEvent.NODE_REMOVED, (node: Http3PrioritisedElementNode) => {
                // Notify listeners of this dependency tree that a node was removed
                this.emit(Http3NodeEvent.NODE_REMOVED, node);
            });
        }
    }

    public setPlaceholderWeight(placeholderID: number, weight: number) {
        const placeholderNode: Http3PlaceholderNode | undefined = this.placeholders.get(placeholderID);
        if (placeholderNode === undefined) {
            throw new Error("Tried changing weight of a placeholder not in the dependency tree!");
        } else {
            placeholderNode.setWeight(weight);
        }
    }

    // Removes the given request stream from the tree, ends the stream and passes its children to the request's parent
    // CAUTION: Any buffered but untransmitted data will be lost!
    public removeRequestStream(requestStreamID: Bignum) {
        const node: Http3RequestNode | undefined = this.requestStreams.get(requestStreamID.toString());
        if (node !== undefined) {
            node.removeSelf();
            node.finish();
            this.requestStreams.delete(requestStreamID.toString());
        }
    }

    public addData(streamID: Bignum, buffer: Buffer) {
        const node: Http3RequestNode | undefined = this.requestStreams.get(streamID.toString());
        if (node !== undefined) {
            node.addData(buffer);
        }
    }

    // Marks a stream as finished -> No new data can be added.
    // Currently buffered data will still be transmitted
    // Stream will be closed when all data has been consumed
    // Children of this node will be passed to this node's parent
    public finishStream(requestStreamID: Bignum) {
        const node: Http3RequestNode | undefined = this.requestStreams.get(requestStreamID.toString());
        if (node !== undefined) {
            node.finish();
        }
    }

    // Do one pass starting from root
    public schedule() {
        this.root.schedule();
    }
}
