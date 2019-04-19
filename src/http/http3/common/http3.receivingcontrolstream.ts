import { QuicStream } from "../../../quicker/quic.stream";
import { Http3BaseFrame, Http3FrameType } from "./frames/http3.baseframe";
import { Http3Error, Http3ErrorCode } from "./errors/http3.error";
import { EventEmitter } from "events";
import { Http3FrameParser } from "./parsers/http3.frame.parser";
import { QuickerEvent } from "../../../quicker/quicker.event";
import { Http3PriorityFrame, Http3SettingsFrame, Http3CancelPushFrame, Http3GoAwayFrame, Http3MaxPushIDFrame } from "./frames";
import { Bignum } from "../../../types/bignum";
import { QlogWrapper } from "../../../utilities/logging/qlog.wrapper";

export enum Http3EndpointType {
    CLIENT,
    SERVER,
}

export enum Http3ControlStreamEvent {
    HTTP3_PRIORITY_FRAME = "priority",
    HTTP3_CANCEL_PUSH_FRAME = "cancel push",
    HTTP3_SETTINGS_FRAME = "settings",
    HTTP3_GOAWAY_FRAME = "goaway",
    HTTP3_MAX_PUSH_ID = "max push id",
}

export class Http3ReceivingControlStream extends EventEmitter {
    private quicControlStream: QuicStream;
    private endpointType: Http3EndpointType;
    private frameParser: Http3FrameParser;
    private bufferedData: Buffer;
    private firstFrameHandled: boolean = false;
    private logger: QlogWrapper;

    // Initial buffer contains data already buffered after the StreamType frame if there is any
    public constructor(quicControlStream: QuicStream, endpointType: Http3EndpointType, frameParser: Http3FrameParser, logger: QlogWrapper, initialBuffer?: Buffer) {
        super();
        if (quicControlStream.isUniStream() === false) {
            throw new Http3Error(Http3ErrorCode.HTTP3_INCORRECT_STREAMTYPE, "HTTP/3 Control streams can only be unidirectional.");
        }
        this.quicControlStream = quicControlStream;
        this.endpointType = endpointType;
        this.frameParser = frameParser;
        this.logger = logger;
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
            // quicControlStream.getConnection().sendPackets(); // TODO we force trigger sending here because it's not yet done anywhere else. FIXME: THIS SHOULDN'T BE NEEDED!
            quicControlStream.end();
        });
    }

    public getStreamID(): Bignum {
        return this.quicControlStream.getStreamId();
    }

    public getStream(): QuicStream {
        return this.quicControlStream;
    }

    private parseCurrentBuffer() {
        const [frames, offset] = this.frameParser.parse(this.bufferedData, this.getStreamID());
        for (let frame of frames) {
            this.handleFrame(frame);
        }
        this.bufferedData = this.bufferedData.slice(offset);
    }

    private handleFrame(frame: Http3BaseFrame) {
        if (this.firstFrameHandled === false && frame.getFrameType() !== Http3FrameType.SETTINGS) {
            throw new Http3Error(Http3ErrorCode.HTTP_UNEXPECTED_FRAME, "First frame received on HTTP/3 control stream was not a settings frame. This is not allowed. StreamID: " + this.quicControlStream.getStreamId().toDecimalString());
        } else {
            this.firstFrameHandled = true;
        }

        // Handle different types of frames differently
        switch(frame.getFrameType()) {
            case Http3FrameType.PRIORITY:
                this.emit(Http3ControlStreamEvent.HTTP3_PRIORITY_FRAME, frame as Http3PriorityFrame);
                break;
            case Http3FrameType.CANCEL_PUSH:
                this.emit(Http3ControlStreamEvent.HTTP3_CANCEL_PUSH_FRAME, frame as Http3CancelPushFrame);
                break;
            case Http3FrameType.SETTINGS: // First frame only
                this.emit(Http3ControlStreamEvent.HTTP3_SETTINGS_FRAME, frame as Http3SettingsFrame);
                break;
            case Http3FrameType.GOAWAY:
                this.emit(Http3ControlStreamEvent.HTTP3_GOAWAY_FRAME, frame as Http3GoAwayFrame);
                break;
            case Http3FrameType.MAX_PUSH_ID:
                this.emit(Http3ControlStreamEvent.HTTP3_MAX_PUSH_ID, frame as Http3MaxPushIDFrame);
                break;
            default:
                // Frametype not handled by control stream
                throw new Http3Error(Http3ErrorCode.HTTP3_UNEXPECTED_FRAME)
        }
    }

    // Only servers can explicitly stop a connection
    // Clients can just stop sending requests to shutdown connection
    public close() {
        if (this.endpointType === Http3EndpointType.SERVER) {
            this.quicControlStream.end();
        }
    }
}