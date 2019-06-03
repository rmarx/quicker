import { Http3DependencyTree } from "../http3.deptree";
import { QuicStream } from "../../../../../quicker/quic.stream";
import { Bignum } from "../../../../../types/bignum";
import { Http3PriorityFrame } from "../../frames";
import { Http3PriorityScheme } from ".";
import { QlogWrapper } from "../../../../../utilities/logging/qlog.wrapper";
import { Http3RequestMetadata } from "../../../client/http3.requestmetadata";

export class Http3ClientSidedScheme extends Http3PriorityScheme {
    public constructor(logger?: QlogWrapper) {
        // FIXME should be communicated using settings frame instead of hardcoded
        super(20, logger);
    }

    // This scheme does not do its own prioritization
    public applyScheme(streamID: Bignum, metadata: Http3RequestMetadata): Http3PriorityFrame | null {
        return null;
    }

    public initialSetup(): Http3PriorityFrame[] {
        return [];
    }

    public handlePriorityFrame(priorityFrame: Http3PriorityFrame, currentStreamID: Bignum) {
        this.dependencyTree.handlePriorityFrame(priorityFrame, currentStreamID);
    }
}