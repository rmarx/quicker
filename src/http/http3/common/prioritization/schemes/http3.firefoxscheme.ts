import { Http3PriorityScheme } from "./http3.priorityscheme";
import { QuicStream } from "../../../../../quicker/quic.stream";
import { Http3PriorityFrame, PrioritizedElementType, ElementDependencyType } from "../../frames";
import { Bignum } from "../../../../../types/bignum";
import { QlogWrapper } from "../../../../../utilities/logging/qlog.wrapper";

export class Http3FirefoxScheme extends Http3PriorityScheme {
    private leadersPlaceholderID: number;
    private followersPlaceholderID: number;
    private unblockedPlaceholderID: number;
    private backgroundPlaceholderID: number;
    private speculativePlaceholderID: number;

    // TODO Placeholders should be communicated to server!
    public constructor(logger?: QlogWrapper) {
        super(logger);
        this.leadersPlaceholderID = this.dependencyTree.addPlaceholderToRoot(201);
        this.followersPlaceholderID = this.dependencyTree.addPlaceholderToPlaceholder(this.leadersPlaceholderID, 1);
        this.unblockedPlaceholderID = this.dependencyTree.addPlaceholderToRoot(101);
        this.backgroundPlaceholderID = this.dependencyTree.addPlaceholderToRoot(1);
        this.speculativePlaceholderID = this.dependencyTree.addPlaceholderToPlaceholder(this.backgroundPlaceholderID, 1);
    }

    // FIXME placeholders are not yet created server side
    public applyScheme(streamID: Bignum, fileExtension: string): Http3PriorityFrame | null {
        const placeholderID: number = this.getPlaceholderID(fileExtension);
        this.dependencyTree.moveStreamToPlaceholder(streamID, placeholderID);
        return new Http3PriorityFrame(PrioritizedElementType.REQUEST_STREAM, ElementDependencyType.PLACEHOLDER, streamID, placeholderID);
    }

    public handlePriorityFrame(priorityFrame: Http3PriorityFrame, currentStreamID: Bignum): void {}

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