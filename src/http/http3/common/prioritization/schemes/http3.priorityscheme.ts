import { Http3DependencyTree } from "../http3.deptree";
import { QuicStream } from "../../../../../quicker/quic.stream";
import { Bignum } from "../../../../../types/bignum";

export abstract class Http3PriorityScheme {
    protected dependencyTree: Http3DependencyTree;

    public constructor() {
        this.dependencyTree = new Http3DependencyTree();
    }

    // TODO Possibly use a class/interface with request metadata instead of just extension
    // Could contain if request was made prior to first image, if pushed, etc
    public abstract addStream(requestStream: QuicStream, fileExtension: string): void;
    
    public addData(streamID: Bignum, buffer: Buffer) {
        this.dependencyTree.addData(streamID, buffer);
    }
    
    public schedule() {
        this.dependencyTree.schedule();
    }
    
    public finishStream(requestStreamID: Bignum) {
        this.dependencyTree.finishStream(requestStreamID);
    }
}