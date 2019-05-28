import { Http3PriorityScheme } from "./http3.priorityscheme";
import { QuicStream } from "../../../../../quicker/quic.stream";
import { Http3PriorityFrame, PrioritizedElementType, ElementDependencyType } from "../../frames";
import { Bignum } from "../../../../../types/bignum";
import { QlogWrapper } from "../../../../../utilities/logging/qlog.wrapper";
import { Http3RequestMetadata } from "../../../client/http3.requestmetadata";

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
    public applyScheme(streamID: Bignum, metadata: Http3RequestMetadata): Http3PriorityFrame | null {
        const placeholderID: number = this.getPlaceholderID(metadata);
        const weight: number = this.getWeight(metadata);
        this.dependencyTree.moveStreamToPlaceholder(streamID, placeholderID);
        this.dependencyTree.setStreamWeight(streamID, weight);
        return new Http3PriorityFrame(PrioritizedElementType.REQUEST_STREAM, ElementDependencyType.PLACEHOLDER, streamID, placeholderID, weight);
    }

    public handlePriorityFrame(priorityFrame: Http3PriorityFrame, currentStreamID: Bignum): void {}

    private getPlaceholderID(metadata: Http3RequestMetadata): number {
        if (metadata.extension === "js") {
            if (metadata.isDefer === true || metadata.isAsync === true) {
                return this.unblockedPlaceholderID;
            } else {
                return this.leadersPlaceholderID;
            }
        } else if (metadata.isPreload === true) {
            return this.speculativePlaceholderID;
        }
        switch(metadata.extension) {
            case "html":
            case "png":
            case "jpg":
            case "jpeg":
            case "ico":
            case "ttf": // TODO Fonts in general
            case "woff":
                return this.followersPlaceholderID;
            case "ccs":
                return this.leadersPlaceholderID;
            default:
                return this.backgroundPlaceholderID;
        }
    }

    private getWeight(metadata: Http3RequestMetadata): number {
        // TODO Push should be weight 2
        // XHR should be weight 32
        switch(metadata.extension) {
            case "png":
            case "jpeg":
            case "jpg":
            case "gif":
            case "ico":
                return 22;
            case "html":
            case "js":
            case "css":
                return 32;
            case "woff":
            case "ttf":
                return 42;
            default:
                return 16;
        }
    }
}