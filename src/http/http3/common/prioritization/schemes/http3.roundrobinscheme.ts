import { Http3PriorityScheme } from "./http3.priorityscheme";
import { QuicStream } from "../../../../../quicker/quic.stream";

export class Http3RoundRobinScheme extends Http3PriorityScheme {
    public constructor() {
        super();
    }

    public addStream(requestStream: QuicStream, fileExtension: string): void {
        this.dependencyTree.addRequestStreamToRoot(requestStream);
    }
}