import { Http3PriorityScheme } from "./http3.priorityscheme";
import { QuicStream } from "../../../../../quicker/quic.stream";

export class Http3WeightedRoundRobinScheme extends Http3PriorityScheme {
    public constructor() {
        super();
    }

    public addStream(requestStream: QuicStream, fileExtension: string): void {
        this.dependencyTree.addRequestStreamToRoot(requestStream, this.fileExtensionToWeight(fileExtension));
    }

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