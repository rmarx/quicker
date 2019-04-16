import { Http3PrioritisedElementNode } from "./http3.prioritisedelementnode";

export class Http3DependencyTreeRoot extends Http3PrioritisedElementNode {
    // Parent should be root by default
    // FIXME Root has default weight while roots in theory don't have a weight
    public constructor() {
        super(null);
    }
}