import { Http3PriorityScheme } from "./http3.priorityscheme";
import { QuicStream } from "../../../../../quicker/quic.stream";
import { Http3PriorityFrame, PrioritizedElementType, ElementDependencyType } from "../../frames";
import { Bignum } from "../../../../../types/bignum";
import { QlogWrapper } from "../../../../../utilities/logging/qlog.wrapper";
import { Http3RequestMetadata } from "../../../client/http3.requestmetadata";

export class Http3FirefoxScheme extends Http3PriorityScheme {
    private leadersPlaceholderID: number = 0;
    private followersPlaceholderID: number = 1;
    private unblockedPlaceholderID: number = 2;
    private backgroundPlaceholderID: number = 3;
    private speculativePlaceholderID: number = 4;

    public constructor(logger?: QlogWrapper) {
        super(5, logger);
    }

    public initialSetup(): Http3PriorityFrame[] {
        this.dependencyTree.setPlaceholderWeight(this.leadersPlaceholderID, 201);
        this.dependencyTree.setPlaceholderWeight(this.followersPlaceholderID, 1);
        this.dependencyTree.movePlaceholderToPlaceholder(this.followersPlaceholderID, this.leadersPlaceholderID);
        this.dependencyTree.setPlaceholderWeight(this.unblockedPlaceholderID, 101);
        this.dependencyTree.setPlaceholderWeight(this.backgroundPlaceholderID, 1);
        this.dependencyTree.setPlaceholderWeight(this.speculativePlaceholderID, 1);
        this.dependencyTree.movePlaceholderToPlaceholder(this.speculativePlaceholderID, this.backgroundPlaceholderID);

        // Create frames
        const frames: Http3PriorityFrame[] = [];
        frames.push(new Http3PriorityFrame(
            PrioritizedElementType.PLACEHOLDER,
            ElementDependencyType.ROOT,
            this.leadersPlaceholderID,
            undefined,
            201)
        );
        frames.push(new Http3PriorityFrame(
            PrioritizedElementType.PLACEHOLDER,
            ElementDependencyType.PLACEHOLDER,
            this.followersPlaceholderID,
            this.leadersPlaceholderID,
            1)
        );
        frames.push(new Http3PriorityFrame(
            PrioritizedElementType.PLACEHOLDER,
            ElementDependencyType.ROOT,
            this.unblockedPlaceholderID,
            undefined,
            101)
        );
        frames.push(new Http3PriorityFrame(
            PrioritizedElementType.PLACEHOLDER,
            ElementDependencyType.ROOT,
            this.backgroundPlaceholderID,
            undefined,
            1)
        );
        frames.push(new Http3PriorityFrame(
            PrioritizedElementType.PLACEHOLDER,
            ElementDependencyType.PLACEHOLDER,
            this.speculativePlaceholderID,
            this.backgroundPlaceholderID,
            1)
        );

        return frames;
    }

    public applyScheme(streamID: Bignum, metadata: Http3RequestMetadata): Http3PriorityFrame | null {
        const placeholderID: number = this.getPlaceholderID(metadata);
        const weight: number = this.getWeight(metadata);
        this.dependencyTree.moveStreamToPlaceholder(streamID, placeholderID);
        this.dependencyTree.setStreamWeight(streamID, weight);
        return new Http3PriorityFrame(PrioritizedElementType.CURRENT_STREAM, ElementDependencyType.PLACEHOLDER, undefined, placeholderID, weight);
    }

    public handlePriorityFrame(priorityFrame: Http3PriorityFrame, currentStreamID: Bignum): void {}

    private getPlaceholderID(metadata: Http3RequestMetadata): number {
        if (metadata.mimeType.search("javascript") > -1) {
            if (metadata.inHead === true) {
                return this.leadersPlaceholderID;
            } else if (metadata.isDefer === true || metadata.isAsync === true) {
                return this.unblockedPlaceholderID;
            } else {
                return this.leadersPlaceholderID;
            }
        } else if (metadata.isPreload === true) {
            return this.speculativePlaceholderID;
        } else if (metadata.mimeType === "text/html") {
            return this.followersPlaceholderID;
        } else if (metadata.mimeType.search("xml") > -1 || metadata.mimeType.search("json") > -1) {
            return this.unblockedPlaceholderID;
        } else if (metadata.mimeType.search("image") > -1) {
            return this.followersPlaceholderID;
        } else if (metadata.mimeType.search("font") > -1) {
            return this.followersPlaceholderID;
        } else if (metadata.mimeType === "text/css") {
            return this.leadersPlaceholderID;
        } else {
            return this.backgroundPlaceholderID;
        }
    }

    private getWeight(metadata: Http3RequestMetadata): number {
        // TODO Push should be weight 2
        // XHR should be weight 32
        if (metadata.mimeType.search("image") > -1) {
            return 22;
        } else if (metadata.mimeType.search("json") > -1 || metadata.mimeType.search("xml") > -1) {
            return 32;
        } else if (metadata.mimeType.search("javascript") || metadata.mimeType === "text/html" || metadata.mimeType === "text/css") {
            return 32;
        } else if (metadata.mimeType.search("font") > -1) {
            return 42;
        } else {
            return 16;
        }
    }
}