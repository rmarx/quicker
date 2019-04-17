import { QuicStream } from "../../../../quicker/quic.stream";
import { Bignum } from "../../../../types/bignum";
import { Http3DependencyTreeRoot } from "./http3.deptreeroot";
import { Http3RequestNode } from "./http3.requestnode";
import { Http3PlaceholderNode } from "./http3.placeholdernode";
import { Http3PrioritisedElementNode } from "./http3.prioritisedelementnode";

export class Http3DependencyTree {
    private root: Http3DependencyTreeRoot = new Http3DependencyTreeRoot();
    // Map request stream IDs to nodes
    private requestStreams: Map<string, Http3RequestNode> = new Map<string, Http3RequestNode>();
    // Map placeholder IDs to nodes
    private placeholders: Map<number, Http3PlaceholderNode> = new Map<number, Http3PlaceholderNode>();

    public constructor() {}

    // Add with dependency on root node
    public addRequestStreamToRoot(stream: QuicStream, weight: number = 16) {
        if (this.requestStreams.has(stream.getStreamId().toString())) {
            // TODO implement appropriate error
            throw new Error();
        }

        const node: Http3RequestNode = new Http3RequestNode(stream, this.root, weight);
        this.requestStreams.set(stream.getStreamId().toString(), node);
    }

    // Add with dependency on request stream
    public addRequestStreamToRequest(stream: QuicStream, dependencyStreamID: Bignum, weight: number = 16) {
        if (this.requestStreams.has(stream.getStreamId().toString())) {
            // TODO implement appropriate error
            throw new Error();
        }

        const parent: Http3PrioritisedElementNode | undefined = this.requestStreams.get(dependencyStreamID.toString());

        if (parent === undefined) {
            // TODO implement appropriate error
            throw new Error();
        } else {
            const node: Http3RequestNode = new Http3RequestNode(stream, parent, weight);
            this.requestStreams.set(stream.getStreamId().toString(), node);
        }
    }

    // Add with dependency on placeholder
    public addRequestStreamToPlaceholder(stream: QuicStream, placeholderID: number, weight: number = 16) {
        if (this.requestStreams.has(stream.getStreamId().toString())) {
            // TODO implement appropriate error
            throw new Error();
        }

        const parent: Http3PrioritisedElementNode | undefined = this.placeholders.get(placeholderID);

        if (parent === undefined) {
            // TODO implement appropriate error
            throw new Error();
        } else {
            const node: Http3RequestNode = new Http3RequestNode(stream, parent, weight);
            this.requestStreams.set(stream.getStreamId().toString(), node);
        }
    }

    // Add with dependency on root node
    public addPlaceholderToRoot(placeholderID: number, weight: number = 16) {
        if (this.placeholders.has(placeholderID)) {
            // TODO implement appropriate error
            throw new Error();
        }

        const node: Http3PlaceholderNode = new Http3PlaceholderNode(this.root, weight);
        this.placeholders.set(placeholderID, node);
    }

    // Add with dependency on request stream
    public addPlaceholderToRequest(placeholderID: number, dependencyStreamID: Bignum, weight: number = 16) {
        if (this.placeholders.has(placeholderID)) {
            // TODO implement appropriate error
            throw new Error();
        }

        const parent: Http3PrioritisedElementNode | undefined = this.requestStreams.get(dependencyStreamID.toString());

        if (parent === undefined) {
            // TODO implement appropriate error
            throw new Error();
        } else {
            const node: Http3PlaceholderNode = new Http3PlaceholderNode(parent, weight);
            this.placeholders.set(placeholderID, node);
        }
    }

    // Add with dependency on placeholder
    public addPlaceholderToPlaceholder(newPlaceholderID: number, parentPlaceholderID: number, weight: number = 16) {
        if (this.placeholders.has(newPlaceholderID)) {
            // TODO implement appropriate error
            throw new Error();
        }

        const parent: Http3PrioritisedElementNode | undefined = this.placeholders.get(parentPlaceholderID);

        if (parent === undefined) {
            // TODO implement appropriate error
            throw new Error();
        } else {
            const node: Http3PlaceholderNode = new Http3PlaceholderNode(parent, weight);
            this.placeholders.set(newPlaceholderID, node);
        }
    }

    public removeRequestStream(requestStreamID: Bignum) {
        const node: Http3RequestNode | undefined = this.requestStreams.get(requestStreamID.toString());
        if (node !== undefined) {
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

    // Do one pass starting from root
    public schedule() {
        this.root.schedule();
    }
}
