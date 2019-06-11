import { QuicStream } from "../../../../../quicker/quic.stream";
import { VerboseLogging } from "../../../../../utilities/logging/verbose.logging";
import { Http3StreamState } from "../../types/http3.streamstate";
import { EventEmitter } from "events";
import { Bignum } from "../../../../../types/bignum";

export enum Http3PMeenanNodeEvent {
    NODE_FINISHED = "node finished",
}

export class Http3PMeenanNode extends EventEmitter {
    private static readonly CHUNK_SIZE: number = 1400;

    private bufferedData: Buffer = Buffer.alloc(0);
    private requestStream: QuicStream;
    private priority: number;
    private concurrency: number;
    private allDataBuffered: boolean = false; // Set to true if all data has been received and stream can be closed

    public constructor(requestStream: QuicStream, priority: number, concurrency: number) {
        super();
        this.requestStream = requestStream;
        this.priority = priority;
        this.concurrency = concurrency;
    }

    public addData(buffer: Buffer) {
        if (this.allDataBuffered === false) {
            this.bufferedData = Buffer.concat([this.bufferedData, buffer]);
        }
    }

    public getPriority(): number {
        return this.priority;
    }

    public setPriority(newPriority: number) {
        this.priority = newPriority;
    }

    public getConcurrency(): number {
        return this.concurrency;
    }

    public setConcurrency(newConcurrency: number) {
        this.concurrency = newConcurrency;
    }

    public finishStream() {
        this.allDataBuffered = true;
        if (this.bufferedData.byteLength === 0) {
            this.requestStream.end();
            this.requestStream.getConnection().sendPackets(); // Force sending packets FIXME QUICker cannot send empty frames yet
            this.requestStream.getConnection().getQlogger().onHTTPStreamStateChanged(this.requestStream.getStreamId(), Http3StreamState.MODIFIED, "HALF_CLOSED");
            this.emit(Http3PMeenanNodeEvent.NODE_FINISHED, this, this.priority, this.concurrency);
        }
    }

    public getStreamID(): Bignum {
        return this.requestStream.getStreamId();
    }

    // Returns true if it successfully scheduled a chunk, false otherwise
    public schedule(): boolean {
        // TODO possibly set a threshold minimum amount of data so that it doesn't send, for example, a single byte
        // But make sure all buffers are emptied eventually
        if (this.bufferedData.byteLength > 0) {
            const sendBuffer: Buffer = this.popData(Http3PMeenanNode.CHUNK_SIZE);
            if (this.allDataBuffered === true && this.bufferedData.byteLength === 0) {
                this.requestStream.end(sendBuffer);
            } else {
                this.requestStream.write(sendBuffer);
            }
            this.requestStream.getConnection().sendPackets(); // Force sending packets
            // 6 bits for priority, 2 bits for concurrency
            const weight: number = (this.priority << 2) | this.concurrency;
            // Weight is not traditional h3 weight
            this.requestStream.getConnection().getQlogger().onHTTPDataChunk(this.requestStream.getStreamId(), sendBuffer.byteLength, weight, "TX");
            VerboseLogging.info("Scheduled " + sendBuffer.byteLength + " bytes to be sent on stream " + this.requestStream.getStreamId().toString());
            if (this.allDataBuffered === true && this.bufferedData.byteLength === 0) {
                this.requestStream.getConnection().getQlogger().onHTTPStreamStateChanged(this.requestStream.getStreamId(), Http3StreamState.MODIFIED, "HALF_CLOSED");
                VerboseLogging.info("Closed stream " + this.requestStream.getStreamId().toString() + ", all data transmitted");
                this.emit(Http3PMeenanNodeEvent.NODE_FINISHED, this, this.priority, this.concurrency);
            }
            return true;
        } else {
            return false;
        }
    }

    // Consumes <bytecount> amount of data from the buffer and returns it
    // If the bytecount is greater than the amount of bytes left in the buffer, the full buffer is consumed
    private popData(bytecount: number): Buffer {
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
}