import { QuicStream } from "../../../quicker/quic.stream";
import { Http3BaseFrame, Http3FrameType } from "./frames/http3.baseframe";
import { Http3Error, Http3ErrorCode } from "./errors/http3.error";
import { EventEmitter } from "events";
import { parse as parseFrame } from "./parsers/http3.frame.parser";
import { QuickerEvent } from "../../../quicker/quicker.event";

export enum Http3EndpointType {
    CLIENT,
    SERVER,
}

export class Http3ReceivingControlStream extends EventEmitter {
    private quicControlStream: QuicStream;
    private endpointType: Http3EndpointType;
    private bufferedData: Buffer;
    
    // Initial buffer contains data already buffered after the StreamType frame if there is any
    public constructor(quicControlStream: QuicStream, endpointType: Http3EndpointType, initialBuffer?: Buffer) {
        if (quicControlStream.isUniStream() === false) {
            throw new Http3Error(Http3ErrorCode.HTTP3_INCORRECT_STREAMTYPE, "HTTP/3 Control streams can only be unidirectional.");
        }
        super();
        this.quicControlStream = quicControlStream;
        this.endpointType = endpointType;
        if (initialBuffer === undefined) {
            this.bufferedData = Buffer.alloc(0);
        } else {
            this.bufferedData = initialBuffer;
            this.parseCurrentBuffer();
        }
        
        quicControlStream.on(QuickerEvent.STREAM_DATA_AVAILABLE, (data: Buffer) => {
            this.bufferedData = Buffer.concat([this.bufferedData, data]);
            this.parseCurrentBuffer();
        });

        quicControlStream.on(QuickerEvent.STREAM_END, () => {
            this.parseCurrentBuffer();
            // TODO check if unparsed data leftover before ending stream
            quicControlStream.getConnection().sendPackets(); // TODO we force trigger sending here because it's not yet done anywhere else. FIXME: THIS SHOULDN'T BE NEEDED!
        });
    }
    
    private parseCurrentBuffer() {
        const [frames, offset] = parseFrame(this.bufferedData);
        for (let frame of frames) {
            this.handleFrame(frame);
        }
        this.bufferedData = this.bufferedData.slice(offset);
    }

    private handleFrame(frame: Http3BaseFrame) {
        // Handle different types of frames differently
        switch(frame.getFrameType()) {
            case Http3FrameType.PRIORITY:
            case Http3FrameType.CANCEL_PUSH:
            case Http3FrameType.SETTINGS: // First frame only
            case Http3FrameType.GOAWAY:
            case Http3FrameType.MAX_PUSH_ID:
            default:
                // Frametype not handled by control stream
                // throw new Http3Error(Http3ErrorCode.HTTP3_UNEXPECTED_FRAME)
        }
    }
}