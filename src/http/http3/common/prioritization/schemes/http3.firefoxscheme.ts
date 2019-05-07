import { Http3PriorityScheme } from "./http3.priorityscheme";
import { QuicStream } from "../../../../../quicker/quic.stream";

export class Http3FirefoxScheme extends Http3PriorityScheme {
    private leadersPlaceholderID: number;
    private followersPlaceholderID: number;
    private unblockedPlaceholderID: number;
    private backgroundPlaceholderID: number;
    private speculativePlaceholderID: number;

    public constructor() {
        super();
        this.leadersPlaceholderID = this.dependencyTree.addPlaceholderToRoot(201);
        this.followersPlaceholderID = this.dependencyTree.addPlaceholderToPlaceholder(this.leadersPlaceholderID, 1);
        this.unblockedPlaceholderID = this.dependencyTree.addPlaceholderToRoot(101);
        this.backgroundPlaceholderID = this.dependencyTree.addPlaceholderToRoot(1);
        this.speculativePlaceholderID = this.dependencyTree.addPlaceholderToPlaceholder(this.backgroundPlaceholderID, 1);
    }

    public addStream(requestStream: QuicStream, fileExtension: string): void {
        this.dependencyTree.addRequestStreamToPlaceholder(requestStream, this.getPlaceholderID(fileExtension));
    }

    private getPlaceholderID(extension: string): number {
        // TODO incomplete
        switch(extension) {
            case "html":
            case "png":
            case "ttf": // TODO Fonts in general
            case "ico":
                return this.followersPlaceholderID;
            case "ccs":
            case "js": // TODO Differentiate between head and body js
                return this.leadersPlaceholderID;
            default:
                return this.backgroundPlaceholderID;
        }
    }
}