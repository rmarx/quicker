import { Http3PriorityScheme } from "./http3.priorityscheme";
import { QuicStream } from "../../../../../quicker/quic.stream";
import { Http3PriorityFrame, PrioritizedElementType, ElementDependencyType } from "../../frames";
import { Bignum } from "../../../../../types/bignum";
import { QlogWrapper } from "../../../../../utilities/logging/qlog.wrapper";

export class Http3WeightedRoundRobinScheme extends Http3PriorityScheme {
    public constructor(logger?: QlogWrapper) {
        super(logger);
    }

    public applyScheme(streamID: Bignum, fileExtension: string): Http3PriorityFrame | null {
        const weight = this.fileExtensionToWeight(fileExtension);
        this.dependencyTree.setStreamWeight(streamID, weight);
        return new Http3PriorityFrame(PrioritizedElementType.REQUEST_STREAM, ElementDependencyType.ROOT, streamID, undefined, weight);
    }

    public handlePriorityFrame(priorityFrame: Http3PriorityFrame, currentStreamID: Bignum) {}

    private fileExtensionToWeight(fileExtension: string): number {
        // TODO not complete + for example pushed resource should receive different priorities from requested resources
        switch(fileExtension) {
            case "htm":
            case "html":
                return 256;
            case "js":
            case "css":
                return 24;
            case "ttf":
                return 16;
            case "png":
            case "jpg":
            case "jpeg":
                return 8;
            default:
                return 8;
        }
    }
}