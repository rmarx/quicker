import { Http3PriorityScheme } from "./http3.priorityscheme";
import { QuicStream } from "../../../../../quicker/quic.stream";
import { Http3PriorityFrame, PrioritizedElementType, ElementDependencyType } from "../../frames";
import { Bignum } from "../../../../../types/bignum";
import { QlogWrapper } from "../../../../../utilities/logging/qlog.wrapper";
import { Http3RequestMetadata } from "../../../client/http3.requestmetadata";

export class Http3WeightedRoundRobinScheme extends Http3PriorityScheme {
    public constructor(logger?: QlogWrapper) {
        super(0, logger);
    }

    public initialSetup(): Http3PriorityFrame[] {
        return [];
    }

    public applyScheme(streamID: Bignum, metadata: Http3RequestMetadata): Http3PriorityFrame | null {
        const weight = this.getWeight(metadata);
        this.dependencyTree.setStreamWeight(streamID, weight);
        return new Http3PriorityFrame(PrioritizedElementType.CURRENT_STREAM, ElementDependencyType.ROOT, undefined, undefined, weight);
    }

    public handlePriorityFrame(priorityFrame: Http3PriorityFrame, currentStreamID: Bignum) {}

    private getWeight(metadata: Http3RequestMetadata): number {
        if (metadata.mimeType === "text/html" || metadata.mimeType === "text/css") {
            return 256;
        } else if (metadata.mimeType.search("javascript") > -1) {
            return 24;
        } else if (metadata.mimeType.search("font") > -1) {
            return 16;
        } else if (metadata.mimeType.search("image") > -1) {
            return 8;
        } else {
            return 8;
        }
    }
}