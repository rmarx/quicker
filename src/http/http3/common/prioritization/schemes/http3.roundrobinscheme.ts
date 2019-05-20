import { Http3PriorityScheme } from "./http3.priorityscheme";
import { QuicStream } from "../../../../../quicker/quic.stream";
import { Http3PriorityFrame, PrioritizedElementType, ElementDependencyType } from "../../frames";
import { Bignum } from "../../../../../types/bignum";
import { QlogWrapper } from "../../../../../utilities/logging/qlog.wrapper";

export class Http3RoundRobinScheme extends Http3PriorityScheme {
    public constructor(logger?: QlogWrapper) {
        super(logger);
    }

    public applyScheme(streamID: Bignum, fileExtension: string): Http3PriorityFrame | null {
        return null;
    }

    public handlePriorityFrame(priorityFrame: Http3PriorityFrame, currentStreamID: Bignum): void {}
}