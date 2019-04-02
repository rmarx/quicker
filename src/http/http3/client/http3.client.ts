import { Client } from "../../../quicker/client";
import { StreamType } from "../../../quicker/stream";
import { Http3Request } from "../common/http3.request";
import { QuicStream } from "../../../quicker/quic.stream";
import { QuickerEvent } from "../../../quicker/quicker.event";
import { EventEmitter } from "events";
import { Http3ClientEvent as Http3ClientEvent } from "./http3.client.events";
import { Http3Error, Http3ErrorCode } from "../common/errors/http3.error";
import { Http3UniStreamType } from "../common/frames/streamtypes/http3.unistreamtypeframe";
import { VLIEOffset, VLIE } from "../../../types/vlie";
import { Bignum } from "../../../types/bignum";
import { Http3ReceivingControlStream as Http3ReceivingControlStream, Http3EndpointType, Http3ControlStreamEvent } from "../common/http3.receivingcontrolstream";
import { Http3SendingControlStream } from "../common/http3.sendingcontrolstream";
import { VerboseLogging } from "../../../utilities/logging/verbose.logging";
import { EndpointType } from "../../../types/endpoint.type";
import { Http3SettingsFrame, Http3PriorityFrame, Http3CancelPushFrame, Http3GoAwayFrame, Http3MaxPushIDFrame } from "../common/frames";
import { Http3QPackEncoder } from "../common/qpack/http3.qpackencoder";
import { Http3QPackDecoder } from "../common/qpack/http3.qpackdecoder";
import { Http3Header } from "../common/qpack/types/http3.header";
import { Http3FrameParser } from "../common/parsers/http3.frame.parser";
import { QlogWrapper } from "../../../utilities/logging/qlog.wrapper";
import { Http3StreamState } from "../common/types/http3.streamstate";

export class Http3Client extends EventEmitter {
    private quickerClient: Client;
    private sendingControlStream?: Http3SendingControlStream; // Client initiated
    private receivingControlStream?: Http3ReceivingControlStream; // Server initiated

    private clientQPackEncoder?: Http3QPackEncoder; // Connects to decoder on server side
    private clientQPackDecoder?: Http3QPackDecoder; // Connects to encoder on server side

    // For server side goaways
    private terminateConnection: boolean = false;
    // Used to keep track of what requests will still be handled by a server after a goaway frame
    private lastStreamID: Bignum = new Bignum(0);

    private pendingRequestStreams: QuicStream[] = [];

    private http3FrameParser: Http3FrameParser;
    
    private logger?: QlogWrapper;

    public constructor(hostname: string, port: number) {
        super();
        this.onNewStream = this.onNewStream.bind(this);
        this.quickerClient = Client.connect(hostname, port);
        this.http3FrameParser = new Http3FrameParser();

        this.quickerClient.on(QuickerEvent.CLIENT_CONNECTED, () => {
            this.logger = this.quickerClient.getConnection().getQlogger();

            
            // Create control stream
            const controlStream: QuicStream = this.quickerClient.createStream(StreamType.ClientUni);
            this.sendingControlStream = new Http3SendingControlStream(EndpointType.Client, controlStream, this.logger);
            this.logger.onHTTPStreamStateChanged(controlStream.getStreamId(), Http3StreamState.OPENED, "CONTROL");

            // Create encoder and decoder stream for QPack
            const clientQPackEncoder: QuicStream = this.quickerClient.createStream(StreamType.ClientUni);
            this.logger.onHTTPStreamStateChanged(clientQPackEncoder.getStreamId(), Http3StreamState.OPENED, "QPACK_ENCODE");
            const clientQPackDecoder: QuicStream = this.quickerClient.createStream(StreamType.ClientUni);
            this.logger.onHTTPStreamStateChanged(clientQPackDecoder.getStreamId(), Http3StreamState.OPENED, "QPACK_DECODE");
            this.clientQPackEncoder = new Http3QPackEncoder(clientQPackEncoder, false, this.logger);
            this.clientQPackDecoder = new Http3QPackDecoder(clientQPackDecoder, this.logger);
            this.http3FrameParser.setEncoder(this.clientQPackEncoder);
            this.http3FrameParser.setDecoder(this.clientQPackDecoder);

            this.emit(Http3ClientEvent.CLIENT_CONNECTED);
        });

        this.quickerClient.on(QuickerEvent.NEW_STREAM, this.onNewStream);
    }

    private async onNewStream(quicStream: QuicStream) {
        const logger: QlogWrapper = quicStream.getConnection().getQlogger();
        
        // Check what type of stream it is:
        //  Bidi -> Request stream
        //  Uni -> Control or push stream based on first frame

        // TODO HTTP request data should be handled from the moment enough has been received, not just on stream end
        if (quicStream.isBidiStream()) {
            // A client should not receive requests
            throw new Http3Error(Http3ErrorCode.HTTP_WRONG_STREAM_DIRECTION, "Bidirectional stream arrived on HTTP/3 client. Clients only accept unidirectional control streams and push streams. StreamID: " + quicStream.getStreamId().toDecimalString());
        } else {
            let streamType: Http3UniStreamType | undefined = undefined;
            let bufferedData: Buffer = Buffer.alloc(0);

            quicStream.on(QuickerEvent.STREAM_DATA_AVAILABLE, (data: Buffer) => {
                // Try to find out what the streamtype is as soon as enough data has arrived
                if (streamType === undefined) {
                    bufferedData = Buffer.concat([bufferedData, data]);
                    try {
                        const vlieOffset: VLIEOffset = VLIE.decode(bufferedData);
                        const streamTypeBignum: Bignum = vlieOffset.value;
                        if (streamTypeBignum.equals(Http3UniStreamType.CONTROL)) {
                            const controlStream: Http3ReceivingControlStream = new Http3ReceivingControlStream(quicStream, Http3EndpointType.CLIENT, this.http3FrameParser, logger, bufferedData.slice(vlieOffset.offset));
                            this.setupControlStreamEvents(controlStream);
                        } else if (streamTypeBignum.equals(Http3UniStreamType.PUSH)) {
                            // Server shouldn't receive push streams
                            quicStream.end();
                            throw new Http3Error(Http3ErrorCode.HTTP_WRONG_STREAM_DIRECTION, "A push stream was initialized towards the server. This is not allowed");
                        } else if (streamTypeBignum.equals(Http3UniStreamType.ENCODER)) {
                            this.setupServerEncoderStream(quicStream, bufferedData);
                        } else if (streamTypeBignum.equals(Http3UniStreamType.DECODER)) {
                            this.setupServerDecoderStream(quicStream, bufferedData);
                        } else {
                            // TODO
                        }
                    } catch(error) {
                        // Do nothing if there was not enough data to decode the StreamType
                        if (error instanceof RangeError) {
                            VerboseLogging.info("Not enough data buffered to decode HTTP/3 StreamType. Waiting until more data arrives.");
                        } else {
                            throw error;
                        }
                    }
                }
            });

            quicStream.on(QuickerEvent.STREAM_END, () => {
                quicStream.end();
                if (streamType === undefined) {
                    throw new Http3Error(Http3ErrorCode.HTTP3_UNEXPECTED_STREAM_END, "New HTTP/3 stream ended before streamtype could be decoded");
                }
                quicStream.getConnection().sendPackets(); // we force trigger sending here because it's not yet done anywhere else. FIXME: THIS SHOULDN'T BE NEEDED!
            });
        }
    }

    public get(path: string) {
        if (this.terminateConnection === true) {
            throw new Http3Error(Http3ErrorCode.HTTP3_SERVER_CLOSED, "Can not send request, server has requested that the connection be closed");
        }
        if (this.clientQPackEncoder === undefined) {
            throw new Http3Error(Http3ErrorCode.HTTP3_UNINITIALISED_ENCODER);
        }
        if (this.clientQPackDecoder === undefined) {
            throw new Http3Error(Http3ErrorCode.HTTP3_UNINITIALISED_DECODER);
        }

        const stream: QuicStream = this.quickerClient.createStream(StreamType.ClientBidi);
        const req: Http3Request = new Http3Request(stream.getStreamId(), this.clientQPackEncoder);
        req.setHeader(":path", path);
        req.setHeader(":method", "GET");

        this.lastStreamID = stream.getStreamId();
        this.pendingRequestStreams.push(stream);
        VerboseLogging.info("Created new stream for HTTP/3 GET request. StreamID: " + stream.getStreamId());
        
        if (this.logger !== undefined) {
            this.logger.onHTTPStreamStateChanged(stream.getStreamId(), Http3StreamState.OPENED, "GET");
            this.logger.onHTTPGet(path, "TX");
            this.logger.onHTTPFrame_Headers(req.getHeaderFrame(), "TX");    
        }
        
        stream.end(req.toBuffer()); // Send request
        
        if (this.logger !== undefined) {
            this.logger.onHTTPStreamStateChanged(stream.getStreamId(), Http3StreamState.MODIFIED, "HALF_CLOSED");
        }

        let bufferedData: Buffer = new Buffer(0);

        stream.on(QuickerEvent.STREAM_DATA_AVAILABLE, (data: Buffer) => {
            bufferedData = Buffer.concat([bufferedData, data]);
        });
        stream.on(QuickerEvent.STREAM_END, () => {
            if (this.logger !== undefined) {
                this.logger.onHTTPStreamStateChanged(stream.getStreamId(), Http3StreamState.CLOSED, "FIN");
            }
            
            // Send out event that the response has been received
            this.emit(Http3ClientEvent.RESPONSE_RECEIVED, path, bufferedData)

            // Mark request as completed
            this.pendingRequestStreams.filter((requestStream) => {
                return requestStream !== stream;
            });

            if (this.pendingRequestStreams.length === 0) {
                this.emit(Http3ClientEvent.ALL_REQUESTS_FINISHED);
            }
        })
    }

    public close() {
        // Wait for outbound requests to complete
        // TODO This will give problems if server doesn't respond to all requests. Use a timeout as alternative
        this.on(Http3ClientEvent.ALL_REQUESTS_FINISHED, () => {
            this.quickerClient.close();
        });
    }

    private setupControlStreamEvents(controlStream: Http3ReceivingControlStream) {
        controlStream.on(Http3ControlStreamEvent.HTTP3_PRIORITY_FRAME, (frame: Http3PriorityFrame) => {
            // TODO
            VerboseLogging.info("HTTP/3: priority frame received on client-sided control stream. ControlStreamID: " + controlStream.getStreamID().toDecimalString());
        });
        controlStream.on(Http3ControlStreamEvent.HTTP3_CANCEL_PUSH_FRAME, (frame: Http3CancelPushFrame) => {
            // TODO
            VerboseLogging.info("HTTP/3: cancel push frame received on client-sided control stream. ControlStreamID: " + controlStream.getStreamID().toDecimalString() + " - Cancelled PushID: " + frame.getPushID().toDecimalString());
        });
        controlStream.on(Http3ControlStreamEvent.HTTP3_SETTINGS_FRAME, (frame: Http3SettingsFrame) => {
            // TODO
            VerboseLogging.info("HTTP/3: settings frame received on client-sided control stream. ControlStreamID: " + controlStream.getStreamID().toDecimalString());
        });
        controlStream.on(Http3ControlStreamEvent.HTTP3_GOAWAY_FRAME, (frame: Http3GoAwayFrame) => {
            VerboseLogging.info("HTTP/3: goaway frame received on client-sided control stream. ControlStreamID: " + controlStream.getStreamID().toDecimalString() + " - MaxStreamID: " + frame.getStreamID().toDecimalString());
            this.terminateConnection = true;
            this.pendingRequestStreams.filter((stream) => {
                if (stream.getStreamId().greaterThanOrEqual(frame.getStreamID())) {
                    // Stop listening to stream and remove from pendingrequests
                    stream.removeAllListeners();
                    return false;
                }
                return true;
            });
        });
        controlStream.on(Http3ControlStreamEvent.HTTP3_MAX_PUSH_ID, (frame: Http3MaxPushIDFrame) => {
            VerboseLogging.info("HTTP/3: max push id frame received on client-sided control stream. ControlStreamID: " + controlStream.getStreamID().toDecimalString());
            throw new Http3Error(Http3ErrorCode.HTTP_UNEXPECTED_FRAME, "Received an HTTP/3 MAX_PUSH_ID frame on client control stream. This is not allowed. ControlStreamID: " + controlStream.getStreamID().toDecimalString());
        });
    }

    private setupServerEncoderStream(serverEncoderStream: QuicStream, bufferedStreamData: Buffer) {
        if (this.clientQPackDecoder === undefined) {
            VerboseLogging.warn("Tried adding server qpack encoder stream to client while client sided decoder stream was undefined. This should not happen! ConnectionID: " + this.quickerClient.getConnection().getSrcConnectionID().toString());
            return;
        }
        this.clientQPackDecoder.setPeerEncoderStream(serverEncoderStream, bufferedStreamData.byteLength === 0 ? undefined : bufferedStreamData);
    }

    private setupServerDecoderStream(serverDecoderStream: QuicStream, bufferedStreamData: Buffer) {
        if (this.clientQPackEncoder === undefined) {
            VerboseLogging.warn("Tried adding server qpack decoder stream to client while client sided encoder stream was undefined. This should not happen! ConnectionID: " + this.quickerClient.getConnection().getSrcConnectionID().toString());
            return;
        }
        this.clientQPackEncoder.setPeerDecoderStream(serverDecoderStream, bufferedStreamData.byteLength === 0 ? undefined : bufferedStreamData);
    }
}