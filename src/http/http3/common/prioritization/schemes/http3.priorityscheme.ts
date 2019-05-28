import { Http3DependencyTree } from "../http3.deptree";
import { QuicStream } from "../../../../../quicker/quic.stream";
import { Bignum } from "../../../../../types/bignum";
import { Http3PriorityFrame } from "../../frames";
import { QlogWrapper } from "../../../../../utilities/logging/qlog.wrapper";
import { Http3RequestMetadata } from "../../../client/http3.requestmetadata";

export abstract class Http3PriorityScheme {
    protected dependencyTree: Http3DependencyTree;

    public constructor(logger?: QlogWrapper) {
        this.dependencyTree = new Http3DependencyTree(logger);
    }

    public setLogger(logger: QlogWrapper) {
        this.dependencyTree.setLogger(logger);
    }

    // TODO Possibly use a class/interface with request metadata instead of just extension
    // Could contain if request was made prior to first image, if pushed, etc
    // Priority frame can be used by schemes that still take it into consideration
    public addStream(requestStream: QuicStream): void {
        this.dependencyTree.addRequestStreamToRoot(requestStream); // Default behaviour, RR weight 16 at root
    }

    // TODO expand to be more than just extension and mimetype rather than filetype
    // Null if multiple priority frames would be needed -> Can not be used over the wire e.g. exclusive prioritization emulation
    // Returns the Priorityframe that should be sent to the server if using client-sided prioritization
    public abstract applyScheme(streamID: Bignum, metadata: Http3RequestMetadata): Http3PriorityFrame | null;

    public abstract handlePriorityFrame(priorityFrame: Http3PriorityFrame, currentStreamID: Bignum): void;

    public addData(streamID: Bignum, buffer: Buffer) {
        this.dependencyTree.addData(streamID, buffer);
    }

    public schedule() {
        this.dependencyTree.schedule();
    }

    public finishStream(requestStreamID: Bignum) {
        this.dependencyTree.finishStream(requestStreamID);
    }

    public removeRequestStream(requestStreamID: Bignum) {
        this.dependencyTree.removeRequestStream(requestStreamID);
    }
}