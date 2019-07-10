import { QuicStream } from "../../../../quicker/quic.stream";
import { Bignum } from "../../../../types/bignum";
import { Http3PrioritisedElementNode } from "./http3.prioritisedelementnode";
import { Http3DataFrame } from "../frames";
import { Http3StreamState } from "../types/http3.streamstate";
import { Http3Error, Http3ErrorCode } from "../errors/http3.error";
import { VerboseLogging } from "../../../../utilities/logging/verbose.logging";
import { DependencyTree, DependencyTreeNodeType } from "./http3.deptree";

export class Http3RequestNode extends Http3PrioritisedElementNode {
    private bufferedData: Buffer = Buffer.alloc(0);
    private stream: QuicStream;
    private bytesSent: number = Http3PrioritisedElementNode.CHUNK_SIZE;
    private allDataBuffered: boolean = false; // Set to true if all data has been received and stream can be closed

    // Parent should be root by default
    public constructor(stream: QuicStream, parent: Http3PrioritisedElementNode, weight: number = 16) {
        super(parent, weight);
        this.stream = stream;
        this.setParent(parent);
    }

    public schedule() {
        // TODO possibly set a threshold minimum amount of data so that it doesn't send, for example, a single byte
        // But make sure all buffers are emptied eventually
        if (this.bufferedData.byteLength > 0) {
            const sendBuffer: Buffer = this.popData(Http3RequestNode.CHUNK_SIZE);
            if (this.allDataBuffered === true && this.bufferedData.byteLength === 0) {
                this.stream.end(sendBuffer);
            } else {
                this.stream.write(sendBuffer);
            }
            this.stream.getConnection().sendPackets(); // Force sending packets
            this.bytesSent = sendBuffer.byteLength;
            this.stream.getConnection().getQlogger().onHTTPDataChunk(this.stream.getStreamId(), this.bytesSent, this.weight, "TX");
            VerboseLogging.info("Scheduled " + this.bytesSent + " bytes to be sent on stream " + this.stream.getStreamId().toString());
            if (this.allDataBuffered === true && this.bufferedData.byteLength === 0) {
                this.stream.getConnection().getQlogger().onHTTPStreamStateChanged(this.stream.getStreamId(), Http3StreamState.MODIFIED, "HALF_CLOSED");
                VerboseLogging.info("Closed stream " + this.stream.getStreamId().toString() + ", all data transmitted");
                setTimeout(() => {
                    this.terminate(); // FIXME This pruning is way too aggressive and not spec compliant (should wait at least 2 RTT)
                }, 500);
            }
        } else {
            // Schedule children
            super.schedule();
        }
    }

    public getBytesSent(): number {
        return this.bytesSent;
    }

    public hasData(): boolean {
        return this.bufferedData.byteLength > 0;
    }

    // Set done to true if this was last data
    // Can only add data if stream has not yet been marked as finished
    public addData(newData: Buffer, done: boolean = false) {
        if (this.allDataBuffered === true) {
            // TODO implement appropriate error
            throw new Error("Can not add new data to request node if it has already been marked as finished");
        }
        if (newData.byteLength > 0) {
            this.bufferedData = Buffer.concat([this.bufferedData, newData]);
            const parent: Http3PrioritisedElementNode | null = this.getParent();
            if (parent !== null) {
                parent.activateChild(this);
            }
        }
        this.allDataBuffered = done;
    }

    // Blocks new data from being passed to the stream
    // When all currently buffered data has been transmitted, stream will be closed and
    // children of this node will be passed to this node's parent
    public finish() {
        this.allDataBuffered = true;
        if (this.bufferedData.byteLength === 0) {
            this.stream.end();
            this.removeSelf();
            this.stream.getConnection().sendPackets(); // Force sending packets FIXME QUICker cannot send empty frames yet
            this.stream.getConnection().getQlogger().onHTTPStreamStateChanged(this.stream.getStreamId(), Http3StreamState.MODIFIED, "HALF_CLOSED");
        }
    }
    
    // Closes its stream and removes itself from the tree
    // CAUTION: untransmitted data will be lost!
    public terminate() {
        this.stream.end();
        this.removeSelf();
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
            popped = this.bufferedData.slice(0, bytecount);
            this.bufferedData = this.bufferedData.slice(bytecount);
        }
        return popped;
    }

    public getStreamID(): Bignum {
        return this.stream.getStreamId();
    }

    public toJSON(): DependencyTree {
        return {
            type: DependencyTreeNodeType.REQUEST,
            id: this.stream.getStreamId().toDecimalString(),
            weight: this.weight,
            children: this.children.map((child: Http3PrioritisedElementNode) => {
                return child.toJSON();
            }),
        }
    }
}