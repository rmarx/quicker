import { Http3DependencyTree } from "../http3.deptree";
import { QuicStream } from "../../../../../quicker/quic.stream";
import { Bignum } from "../../../../../types/bignum";
import { Http3PriorityFrame } from "../../frames";
import { QlogWrapper } from "../../../../../utilities/logging/qlog.wrapper";
import { Http3RequestMetadata } from "../../../client/http3.requestmetadata";

export abstract class Http3PriorityScheme {
    protected dependencyTree: Http3DependencyTree;

    public constructor(placeholderCount: number, logger?: QlogWrapper) {
        this.dependencyTree = new Http3DependencyTree(placeholderCount, logger);
    }

    public setLogger(logger: QlogWrapper) {
        this.dependencyTree.setLogger(logger);
    }

    public addStream(requestStream: QuicStream): void {
        this.dependencyTree.addRequestStreamToRoot(requestStream); // Default behaviour, RR weight 16 at root
    }

    // Creates a set of frames for initial setup if neede
    // E.g. Set up dependency tree with placeholders and their weights
    public abstract initialSetup(): Http3PriorityFrame[];

    // Null if priority frame not possible, for example when multiple priority frames would be needed -> Can not be used over the wire e.g. exclusive prioritization emulation
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