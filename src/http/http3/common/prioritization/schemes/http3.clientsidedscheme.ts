import { Http3DependencyTree } from "../http3.deptree";
import { QuicStream } from "../../../../../quicker/quic.stream";
import { Bignum } from "../../../../../types/bignum";
import { Http3PriorityFrame } from "../../frames";
import { Http3PriorityScheme } from ".";
import { QlogWrapper } from "../../../../../utilities/logging/qlog.wrapper";

export class Http3ClientSidedScheme extends Http3PriorityScheme {
    public constructor(logger?: QlogWrapper) {
        super(logger);
    }

    // This scheme does not do its own prioritization
    public applyScheme(streamID: Bignum, fileExtension: string): Http3PriorityFrame | null {
        return null;
    }

    public handlePriorityFrame(priorityFrame: Http3PriorityFrame, currentStreamID: Bignum) {
        this.dependencyTree.handlePriorityFrame(priorityFrame, currentStreamID);
    }
}