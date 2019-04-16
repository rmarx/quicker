import { QuicStream } from "../../../../quicker/quic.stream";
import { Bignum } from "../../../../types/bignum";
import { Http3PrioritisedElementNode } from "./http3.prioritisedelementnode";

export class Http3RequestNode extends Http3PrioritisedElementNode {
    static readonly MAX_BYTES_SENT = 100;
    private bufferedData: Buffer = Buffer.alloc(0);
    private stream: QuicStream;
    private bytesSent: number = 0;

    // Parent should be root by default
    public constructor(stream: QuicStream, parent: Http3PrioritisedElementNode, weight: number = 16) {
        super(parent, weight);
        this.stream = stream;
    }

    public schedule() {
        // TODO possibly set a threshold minimum amount of data so that it doesn't send, for example, a single byte
        if (this.bufferedData.byteLength > 0) {
            this.stream.write(this.popData(Http3RequestNode.MAX_BYTES_SENT));
            this.stream.getConnection().sendPackets(); // Force sending packets
            this.bytesSent = Http3RequestNode.MAX_BYTES_SENT;
        } else {
            // Schedule children
            super.schedule();
        }
    }

    public hasData(): boolean {
        return this.bufferedData.byteLength > 0;
    }

    public addData(newData: Buffer) {
        if (newData.byteLength > 0) {
            this.bufferedData = Buffer.concat([this.bufferedData, newData]);
            const parent: Http3PrioritisedElementNode | null = this.getParent();
            if (parent !== null) {
                parent.activateChild(this);
            }
        }
    }

    // If node itself is active (has buffered data it wants to put on its stream)
    // or has active children, it is considered active
    public isActive(): boolean {
        return this.hasData() || super.isActive();
    }

    // Consumes <bytecount> amount of data from the buffer and returns it
    // If the bytecount is greater than the amount of bytes left in the buffer, the full buffer is consumed
    public popData(bytecount: number): Buffer {
        let popped: Buffer;
        if (bytecount > this.bufferedData.byteLength) {
            popped = this.bufferedData;
            this.bufferedData = Buffer.alloc(0);
        } else {
            popped = this.bufferedData.slice(0, bytecount-1);
            this.bufferedData = this.bufferedData.slice(bytecount);
        }
        return popped;
    }

    // Closes stream and removes itself from the tree, passing children to its parent
    // Active children will remain active
    public removeSelf() {
        this.stream.end();
        super.removeSelf();
    }

    public getStreamID(): Bignum {
        return this.stream.getStreamId();
    }
}