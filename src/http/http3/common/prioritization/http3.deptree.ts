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
import { QlogWrapper } from "../../../../utilities/logging/qlog.wrapper";

export enum DependencyTreeNodeType {
    REQUEST = "Request",
    PLACEHOLDER = "Placeholder",
    ROOT = "Root",
}

// Interface for converting to JSON
export interface DependencyTree {
    type?: DependencyTreeNodeType,
    id: string,
    weight: number,
    children: DependencyTree[],
}

export class Http3DependencyTree extends EventEmitter {
    private root: Http3DependencyTreeRoot = new Http3DependencyTreeRoot();
    // Map request stream IDs to nodes
    private requestStreams: Map<string, Http3RequestNode> = new Map<string, Http3RequestNode>();
    // Map placeholder IDs to nodes
    private placeholders: Map<number, Http3PlaceholderNode> = new Map<number, Http3PlaceholderNode>();
    private placeholderCount: number = 0;

    private logger?: QlogWrapper;

    public constructor(placeholderCount: number, logger?: QlogWrapper) {
        super();
        this.logger = logger;

        // Create initial placeholder nodes
        for (let i = 0; i < placeholderCount; ++i) {
            this.addPlaceholderToRoot();
        }

        // Log tree changes
        this.on(Http3NodeEvent.NODE_REMOVED, (node: Http3PrioritisedElementNode) => {
            if (this.logger !== undefined) {
                this.logger.onHTTPDependencyTreeChange(this.toJSON(), "REMOVED");
                if (node instanceof(Http3RequestNode)) {
                    this.requestStreams.delete(node.getStreamID().toString());
                } else if (node instanceof(Http3PlaceholderNode)) {
                    this.placeholders.delete(node.getPlaceholderID());
                }
            };
        });
    }

    public setLogger(logger: QlogWrapper) {
        this.logger = logger;
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
            if (this.logger !== undefined) {
                this.logger.onHTTPDependencyTreeChange(this.toJSON(), "MOVED");
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
        node.on(Http3NodeEvent.REMOVING_NODE, (node: Http3PrioritisedElementNode) => {
            // Notify listeners of this dependency tree that a node is going to be removed
            this.emit(Http3NodeEvent.REMOVING_NODE, node);
        });
        if (this.logger !== undefined) {
            this.logger.onHTTPDependencyTreeChange(this.toJSON(), "NEW");
        }
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
            node.on(Http3NodeEvent.REMOVING_NODE, (node: Http3PrioritisedElementNode) => {
                // Notify listeners of this dependency tree that a node is going to be removed
                this.emit(Http3NodeEvent.REMOVING_NODE, node);
            });
        }
        if (this.logger !== undefined) {
            this.logger.onHTTPDependencyTreeChange(this.toJSON(), "NEW");
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
            node.on(Http3NodeEvent.REMOVING_NODE, (node: Http3PrioritisedElementNode) => {
                // Notify listeners of this dependency tree that a node is going to be removed
                this.emit(Http3NodeEvent.REMOVING_NODE, node);
            });
        }
        if (this.logger !== undefined) {
            this.logger.onHTTPDependencyTreeChange(this.toJSON(), "NEW");
        }
    }

    // Add with dependency on root node
    public addPlaceholderToRoot(weight: number = 16): number {
        const placeholderID: number = this.placeholderCount++;
        const node: Http3PlaceholderNode = new Http3PlaceholderNode(this.root, placeholderID, weight);
        this.placeholders.set(placeholderID, node);

        node.on(Http3NodeEvent.NODE_REMOVED, (node: Http3PrioritisedElementNode) => {
            // Notify listeners of this dependency tree that a node was removed
            this.emit(Http3NodeEvent.NODE_REMOVED, node);
        });
        node.on(Http3NodeEvent.REMOVING_NODE, (node: Http3PrioritisedElementNode) => {
            // Notify listeners of this dependency tree that a node is going to be removed
            this.emit(Http3NodeEvent.REMOVING_NODE, node);
        });

        if (this.logger !== undefined) {
            this.logger.onHTTPDependencyTreeChange(this.toJSON(), "NEW");
        }

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
            const node: Http3PlaceholderNode = new Http3PlaceholderNode(parent, placeholderID, weight);
            this.placeholders.set(placeholderID, node);

            node.on(Http3NodeEvent.NODE_REMOVED, (node: Http3PrioritisedElementNode) => {
                // Notify listeners of this dependency tree that a node was removed
                this.emit(Http3NodeEvent.NODE_REMOVED, node);
            });
            node.on(Http3NodeEvent.REMOVING_NODE, (node: Http3PrioritisedElementNode) => {
                // Notify listeners of this dependency tree that a node is going to be removed
                this.emit(Http3NodeEvent.REMOVING_NODE, node);
            });
        }

        if (this.logger !== undefined) {
            this.logger.onHTTPDependencyTreeChange(this.toJSON(), "NEW");
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
            const node: Http3PlaceholderNode = new Http3PlaceholderNode(parent, newPlaceholderID, weight);
            this.placeholders.set(newPlaceholderID, node);

            node.on(Http3NodeEvent.NODE_REMOVED, (node: Http3PrioritisedElementNode) => {
                // Notify listeners of this dependency tree that a node was removed
                this.emit(Http3NodeEvent.NODE_REMOVED, node);
            });
            node.on(Http3NodeEvent.REMOVING_NODE, (node: Http3PrioritisedElementNode) => {
                // Notify listeners of this dependency tree that a node is going to be removed
                this.emit(Http3NodeEvent.REMOVING_NODE, node);
            });
        }

        if (this.logger !== undefined) {
            this.logger.onHTTPDependencyTreeChange(this.toJSON(), "NEW");
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
            // node.removeSelf();
            parent.addExclusiveChild(node);
            this.requestStreams.set(stream.getStreamId().toString(), node);

            node.on(Http3NodeEvent.NODE_REMOVED, (node: Http3PrioritisedElementNode) => {
                // Notify listeners of this dependency tree that a node was removed
                this.emit(Http3NodeEvent.NODE_REMOVED, node);
            });
            node.on(Http3NodeEvent.REMOVING_NODE, (node: Http3PrioritisedElementNode) => {
                // Notify listeners of this dependency tree that a node is going to be removed
                this.emit(Http3NodeEvent.REMOVING_NODE, node);
            });
        }

        if (this.logger !== undefined) {
            this.logger.onHTTPDependencyTreeChange(this.toJSON(), "NEW");
        }
    }

    public moveStreamToStream(requestStreamID: Bignum, dependencyStreamID: Bignum) {
        const node: Http3PrioritisedElementNode | undefined = this.requestStreams.get(requestStreamID.toString());
        const parent: Http3PrioritisedElementNode | undefined = this.requestStreams.get(dependencyStreamID.toString());

        if (node === undefined) {
            // TODO implement appropriate error
            throw new Error("Tried moving a request stream of the HTTP/3 dependency tree while it was not yet in the tree");
        }
        else if (parent === undefined) {
            // TODO implement appropriate error
            throw new Error("Tried moving a request stream to a stream which was not in the dependency tree");
        } else {
            // node.removeSelf();
            node.setParent(parent);
        }

        if (this.logger !== undefined) {
            this.logger.onHTTPDependencyTreeChange(this.toJSON(), "MOVED");
        }
    }

    public moveStreamToRoot(requestStreamID: Bignum) {
        const node: Http3PrioritisedElementNode | undefined = this.requestStreams.get(requestStreamID.toString());

        if (node === undefined) {
            // TODO implement appropriate error
            throw new Error("Tried moving a request stream of the HTTP/3 dependency tree while it was not yet in the tree");
        } else {
            // node.removeSelf();
            node.setParent(this.root);
        }

        if (this.logger !== undefined) {
            this.logger.onHTTPDependencyTreeChange(this.toJSON(), "MOVED");
        }
    }

    public moveStreamToPlaceholder(requestStreamID: Bignum, placeholderID: number) {
        const node: Http3PrioritisedElementNode | undefined = this.requestStreams.get(requestStreamID.toString());
        const placeholder: Http3PlaceholderNode | undefined = this.placeholders.get(placeholderID);

        if (node === undefined) {
            // TODO implement appropriate error
            throw new Error("Tried moving a request stream of the HTTP/3 dependency tree while it was not yet in the tree");
        } else if (placeholder === undefined) {
            // TODO implement appropriate error
            throw new Error("Tried moving a request stream to a placeholder which was not in the dependency tree");
        } else {
            // node.removeSelf();
            node.setParent(placeholder);
        }

        if (this.logger !== undefined) {
            this.logger.onHTTPDependencyTreeChange(this.toJSON(), "MOVED");
        }
    }

    public moveStreamToStreamExclusive(requestStreamID: Bignum, dependencyStreamID: Bignum) {
        const node: Http3PrioritisedElementNode | undefined = this.requestStreams.get(requestStreamID.toString());
        const parent: Http3PrioritisedElementNode | undefined = this.requestStreams.get(dependencyStreamID.toString());

        if (node === undefined) {
            // TODO implement appropriate error
            throw new Error("Tried moving a request stream of the HTTP/3 dependency tree while it was not yet in the tree");
        }
        else if (parent === undefined) {
            // TODO implement appropriate error
            throw new Error("Tried moving a request stream to a stream which was not in the dependency tree");
        } else {
            // node.removeSelf();
            parent.addExclusiveChild(node);
        }

        if (this.logger !== undefined) {
            this.logger.onHTTPDependencyTreeChange(this.toJSON(), "MOVED");
        }
    }

    public moveStreamToRootExclusive(requestStreamID: Bignum) {
        const node: Http3PrioritisedElementNode | undefined = this.requestStreams.get(requestStreamID.toString());

        if (node === undefined) {
            // TODO implement appropriate error
            throw new Error("Tried moving a request stream of the HTTP/3 dependency tree while it was not yet in the tree");
        } else {
            this.root.addExclusiveChild(node);
        }

        if (this.logger !== undefined) {
            this.logger.onHTTPDependencyTreeChange(this.toJSON(), "MOVED");
        }
    }

    public movePlaceholderToPlaceholder(placeholderID: number, targetPlaceholderID: number) {
        const placeholder: Http3PlaceholderNode | undefined = this.placeholders.get(placeholderID);
        const target: Http3PlaceholderNode | undefined = this.placeholders.get(targetPlaceholderID);

        if (placeholder === undefined) {
            throw new Error("Tried moving a placeholder which was not in the dependency tree. ID: " + placeholderID);
        } else if (target === undefined) {
            throw new Error("Tried moving a placeholder to a placeholder which was not in the dependency tree. TargetID: " + targetPlaceholderID);
        } else {
            placeholder.setParent(target);
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

    public setStreamWeight(requestStreamID: Bignum, weight: number) {
        const requestnode: Http3RequestNode | undefined = this.requestStreams.get(requestStreamID.toString());
        if (requestnode === undefined) {
            throw new Error("Tried changing weight of a requeststream not in the dependency tree!");
        } else {
            requestnode.setWeight(weight);
        }
    }

    // Removes the given request stream from the tree, ends the stream and passes its children to the request's parent
    // CAUTION: Any buffered but untransmitted data will be lost!
    public removeRequestStream(requestStreamID: Bignum) {
        const node: Http3RequestNode | undefined = this.requestStreams.get(requestStreamID.toString());
        if (node !== undefined) {
            node.finish();
            node.removeSelf();
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

    public toJSON(): DependencyTree {
        return this.root.toJSON();
    }
}
