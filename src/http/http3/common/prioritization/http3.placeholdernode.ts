import { Http3PrioritisedElementNode } from "./http3.prioritisedelementnode";

export class Http3PlaceholderNode extends Http3PrioritisedElementNode {
    // Parent should be root by default
    public constructor(parent: Http3PrioritisedElementNode, weight: number = 16) {
        super(parent, weight);
    }
}