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
import { Http3ReceivingControlStream as Http3ReceivingControlStream, Http3EndpointType } from "../common/http3.receivingcontrolstream";
import { Http3SendingControlStream } from "../common/http3.sendingcontrolstream";
import { VerboseLogging } from "../../../utilities/logging/verbose.logging";

export class Http3Client extends EventEmitter {
    private quickerClient: Client;
    private sendingControlStream?: Http3SendingControlStream; // Client initiated
    private receivingControlStream?: Http3ReceivingControlStream; // Server initiated
    
    public constructor(hostname: string, port: number) {
        super();
        this.onNewStream = this.onNewStream.bind(this);
        this.quickerClient = Client.connect(hostname, port);
        
        this.quickerClient.on(QuickerEvent.CLIENT_CONNECTED, () => {
            // Create control stream
            const controlStream: QuicStream = this.quickerClient.createStream(StreamType.ClientUni);
            this.sendingControlStream = new Http3SendingControlStream(controlStream);
            
            this.emit(Http3ClientEvent.CLIENT_CONNECTED);
        });

        this.quickerClient.on(QuickerEvent.NEW_STREAM, this.onNewStream);
    }

    private async onNewStream(quicStream: QuicStream) {
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
                            const controlStream: Http3ReceivingControlStream = new Http3ReceivingControlStream(quicStream, Http3EndpointType.CLIENT, bufferedData.slice(vlieOffset.offset));
                            this.setupControlStreamEvents(controlStream);
                        } else if (streamTypeBignum.equals(Http3UniStreamType.PUSH)) {
                            // Server shouldn't receive push streams
                            quicStream.end();
                            throw new Http3Error(Http3ErrorCode.HTTP_WRONG_STREAM_DIRECTION, "A push stream was initialized towards the server. This is not allowed");
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
        const req: Http3Request = new Http3Request({path});
        const stream: QuicStream = this.quickerClient.request(req.toBuffer(), StreamType.ClientBidi);
        VerboseLogging.info("Created new stream for HTTP/3 GET request. StreamID: " + stream.getStreamId());
        stream.end();
        
        let bufferedData: Buffer = new Buffer(0);
        
        stream.on(QuickerEvent.STREAM_DATA_AVAILABLE, (data: Buffer) => {
            bufferedData = Buffer.concat([bufferedData, data]);
        });
        stream.on(QuickerEvent.STREAM_END, () => {
            // TODO Temporary for debugging, function should return data instead
            console.log(bufferedData.toString());
            this.emit(Http3ClientEvent.RESPONSE_RECEIVED, path, bufferedData)
        })
    }

    public close() {
        this.quickerClient.close();
    }

    private setupControlStreamEvents(controlStream: Http3ReceivingControlStream) {
       // TODO Hook up all events and handle them
        // controlStream.on()
    }
}