import { Http3PriorityScheme } from "./http3.priorityscheme";
import { QuicStream } from "../../../../../quicker/quic.stream";
import { Http3PriorityFrame, PrioritizedElementType, ElementDependencyType } from "../../frames";
import { Bignum } from "../../../../../types/bignum";
import { QlogWrapper } from "../../../../../utilities/logging/qlog.wrapper";
import { Http3RequestMetadata } from "../../../client/http3.requestmetadata";

export class Http3WeightedRoundRobinScheme extends Http3PriorityScheme {
    public constructor(logger?: QlogWrapper) {
        super(logger);
    }

    public applyScheme(streamID: Bignum, metadata: Http3RequestMetadata): Http3PriorityFrame | null {
        const weight = this.fileExtensionToWeight(metadata);
        this.dependencyTree.setStreamWeight(streamID, weight);
        return new Http3PriorityFrame(PrioritizedElementType.REQUEST_STREAM, ElementDependencyType.ROOT, streamID, undefined, weight);
    }

    public handlePriorityFrame(priorityFrame: Http3PriorityFrame, currentStreamID: Bignum) {}

    private fileExtensionToWeight(metadata: Http3RequestMetadata): number {
        // TODO differentiate pushed resources from requests
        switch(metadata.extension) {
            case "htm":
            case "html":
                return 256;
            case "js":
            case "css":
                return 24;
            case "ttf":
            case "woff":
                return 16; // TODO XHR should also be here
            case "png":
            case "jpg":
            case "jpeg":
            case "gif":
                return 8;
            default:
                return 8;
        }
    }
}