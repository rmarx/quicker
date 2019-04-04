import { Http3Response } from "../common/http3.response";
import { Http3Request } from "../common/http3.request";
import { Server as QuicServer } from "../../../quicker/server";
import { QuickerEvent } from "../../../quicker/quicker.event";
import { Connection } from "../../../quicker/connection";
import { QuicStream } from "../../../quicker/quic.stream";
import { VerboseLogging } from "../../../utilities/logging/verbose.logging";
import { readFileSync } from "fs";
import { parseHttp3Message } from "../common/parsers/http3.request.parser";
import { StreamType } from "../../../quicker/stream";
import { Http3UniStreamType } from "../common/frames/streamtypes/http3.unistreamtypeframe";
import { Http3ReceivingControlStream, Http3EndpointType } from "../common/http3.receivingcontrolstream";
import { Http3SendingControlStream } from "../common/http3.sendingcontrolstream";
import { VLIE, VLIEOffset } from "../../../types/vlie";
import { Bignum } from "../../../types/bignum";
import { Http3Error, Http3ErrorCode } from "../common/errors/http3.error";
import { EndpointType } from "../../../types/endpoint.type";
import { Http3FrameParser } from "../common/parsers/http3.frame.parser";
import { Http3QPackEncoder } from "../common/qpack/http3.qpackencoder";
import { Http3QPackDecoder } from "../common/qpack/http3.qpackdecoder";
import { QlogWrapper } from "../../../utilities/logging/qlog.wrapper";
import { Http3StreamState } from "../common/types/http3.streamstate";

class ClientState {
    private sendingControlStream: Http3SendingControlStream;
    private receivingControlStream?: Http3ReceivingControlStream;
    private lastUsedStreamID: Bignum;
    private qpackEncoder: Http3QPackEncoder;
    private qpackDecoder: Http3QPackDecoder;
    private frameParser: Http3FrameParser;
    
    public constructor(sendingControlStream: Http3SendingControlStream, lastUsedStreamID: Bignum, qpackEncoder: Http3QPackEncoder, qpackDecoder: Http3QPackDecoder, frameParser: Http3FrameParser, receivingControlStream?: Http3ReceivingControlStream) {
        this.sendingControlStream = sendingControlStream;
        this.receivingControlStream = receivingControlStream;
        this.lastUsedStreamID = lastUsedStreamID;
        this.qpackEncoder = qpackEncoder;
        this.qpackDecoder = qpackDecoder;
        this.frameParser = frameParser;
    }
    
    public setReceivingControlStream(receivingControlStream: Http3ReceivingControlStream) {
        this.receivingControlStream = receivingControlStream;
    }
    
    public setLastUsedStreamID(lastUsedStreamID: Bignum) {
        this.lastUsedStreamID = lastUsedStreamID;
    }
    
    public getSendingControlStream(): Http3SendingControlStream {
        return this.sendingControlStream;
    }
    
    public getReceivingControlStream(): Http3ReceivingControlStream | undefined {
        return this.receivingControlStream;
    }
    
    public getLastUsedStreamID(): Bignum {
        return this.lastUsedStreamID;
    }
    
    public getQPackEncoder(): Http3QPackEncoder {
        return this.qpackEncoder;
    }
    
    public getQPackDecoder(): Http3QPackDecoder {
        return this.qpackDecoder;
    }
    
    public getFrameParser(): Http3FrameParser {
        return this.frameParser;
    }
}

export class Http3Server {
    private readonly quickerServer: QuicServer;
    
    // GET Paths that have a user function mapped to them
    private handledGetPaths: { [path: string]: (req: Http3Request, res: Http3Response) => Promise<void>; } = {};
    
    private connectionStates: Map<string, ClientState> = new Map<string, ClientState>();
    
    public constructor(keyFilepath?: string, certFilepath?: string) {
        this.onNewConnection = this.onNewConnection.bind(this);
        this.onNewStream = this.onNewStream.bind(this);
        this.handleRequest = this.handleRequest.bind(this);
        this.closeConnection = this.closeConnection.bind(this);
        if (keyFilepath === undefined || certFilepath === undefined) {
            this.quickerServer = QuicServer.createServer({});
        } else {
            let options: {} = {
                key: readFileSync(keyFilepath),
                cert: readFileSync(certFilepath),
            };
            this.quickerServer = QuicServer.createServer(options);
        }
    }

    public listen(port: number, host: string = '127.0.0.1') {
        this.quickerServer.listen(port, host);
        this.quickerServer.on(QuickerEvent.CONNECTION_CREATED, this.onNewConnection);
        this.quickerServer.on(QuickerEvent.ERROR, this.onQuicServerError);
    }

    public static(staticDir: string) {
        // Expose files in static dir
    }

    /**
     * Hooks up a user function that handles a given path for the GET method based on an Http3Request
     * The user's function fills the Http3Response which will be sent to clients requesting the given path
     * @param path The url where the function will be available via the GET method
     * @param callback
     */
    public get(path: string, callback: (req: Http3Request, res: Http3Response) => Promise<void>) {
        this.handledGetPaths[path] = callback;
    }

    // TODO Add post/put/delete
    // TODO Method for server pushes

    private async onNewConnection(connection: Connection) {
        // Create control stream to client on connect
        const controlQuicStream: QuicStream = this.quickerServer.createStream(connection, StreamType.ServerUni);
        const controlHttp3Stream: Http3SendingControlStream = new Http3SendingControlStream(EndpointType.Server, controlQuicStream, connection.getQlogger());
        connection.getQlogger().onHTTPStreamStateChanged(controlQuicStream.getStreamId(), Http3StreamState.OPENED, "CONTROL");
        
        // QPack streams
        const qpackEncoderStream: QuicStream = this.quickerServer.createStream(connection, StreamType.ServerUni);
        const qpackEncoder: Http3QPackEncoder = new Http3QPackEncoder(qpackEncoderStream, true, connection.getQlogger());
        connection.getQlogger().onHTTPStreamStateChanged(qpackEncoderStream.getStreamId(), Http3StreamState.OPENED, "QPACK_ENCODE");
        const qpackDecoderStream: QuicStream = this.quickerServer.createStream(connection, StreamType.ServerUni);
        const qpackDecoder: Http3QPackDecoder = new Http3QPackDecoder(qpackDecoderStream, connection.getQlogger());
        connection.getQlogger().onHTTPStreamStateChanged(qpackDecoderStream.getStreamId(), Http3StreamState.OPENED, "QPACK_DECODE");
        
        this.connectionStates.set(connection.getSrcConnectionID().toString(), new ClientState(
            controlHttp3Stream,
            controlQuicStream.getStreamId(),
            qpackEncoder,
            qpackDecoder,
            new Http3FrameParser(qpackEncoder, qpackDecoder, connection.getQlogger()),
        ));

        this.quickerServer.on(QuickerEvent.NEW_STREAM, this.onNewStream);
        this.quickerServer.on(QuickerEvent.CONNECTION_CLOSE, this.closeConnection);
        
        VerboseLogging.info("DEBUG: A new HTTP/3 client has connected!");
    }
    
    private setupControlStreamEvents(controlStream: Http3ReceivingControlStream) {
        // TODO Hook up all events and handle them
        // controlStream.on()
    }
    
    private async onNewStream(quicStream: QuicStream) {
        const connectionID: string = quicStream.getConnection().getSrcConnectionID().toString();
        const state: ClientState | undefined = this.connectionStates.get(connectionID);
        const logger: QlogWrapper = quicStream.getConnection().getQlogger();
        
        if (state === undefined) {
            throw new Http3Error(Http3ErrorCode.HTTP3_UNTRACKED_CONNECTION, "Received a new stream on the server from an untracked connection (no state found for this connection).\nConnectionID: <" + connectionID + ">\nStreamID <" + quicStream.getStreamId().toDecimalString() + ">");
        }
        state.setLastUsedStreamID(quicStream.getStreamId());

        // Check what type of stream it is: 
        //  Bidi -> Request stream
        //  Uni -> Control or push stream based on first frame

        // TODO HTTP request data should be handled from the moment enough has been received, not just on stream end
        if (quicStream.isBidiStream()) {
            // Handle as a request stream
            let bufferedData: Buffer = Buffer.alloc(0);
    
            quicStream.on(QuickerEvent.STREAM_DATA_AVAILABLE, (data: Buffer) => {
                bufferedData = Buffer.concat([bufferedData, data]);
            });
    
            quicStream.on(QuickerEvent.STREAM_END, () => {
                this.handleRequest(quicStream, bufferedData);
                //quicStream.getConnection().sendPackets(); // we force trigger sending here because it's not yet done anywhere else. FIXME: THIS SHOULDN'T BE NEEDED!
            });
        } else {
            let streamType: Http3UniStreamType | undefined = undefined;
            let bufferedData: Buffer = Buffer.alloc(0);

            quicStream.on(QuickerEvent.STREAM_DATA_AVAILABLE, (data: Buffer) => {
                if (streamType === undefined) {
                    bufferedData = Buffer.concat([bufferedData, data]);
                    try {
                        const vlieOffset: VLIEOffset = VLIE.decode(bufferedData);
                        const streamTypeBignum: Bignum = vlieOffset.value;
                        bufferedData = bufferedData.slice(vlieOffset.offset);
                        if (streamTypeBignum.equals(Http3UniStreamType.CONTROL)) {
                            const controlStream: Http3ReceivingControlStream = new Http3ReceivingControlStream(quicStream, Http3EndpointType.SERVER, state.getFrameParser(), logger, bufferedData.slice(vlieOffset.offset));
                            this.setupControlStreamEvents(controlStream);
                            state.setReceivingControlStream(controlStream);
                        } else if (streamTypeBignum.equals(Http3UniStreamType.PUSH)) {
                            // Server shouldn't receive push streams
                            quicStream.end();
                            throw new Http3Error(Http3ErrorCode.HTTP_WRONG_STREAM_DIRECTION, "A push stream was initialized towards the server. This is not allowed");
                        } else if (streamTypeBignum.equals(Http3UniStreamType.ENCODER)) {
                            state.getQPackDecoder().setPeerEncoderStream(quicStream, bufferedData);
                        } else if (streamTypeBignum.equals(Http3UniStreamType.DECODER)) {
                            state.getQPackEncoder().setPeerDecoderStream(quicStream, bufferedData);
                        } else {
                            quicStream.end();
                            throw new Http3Error(Http3ErrorCode.HTTP3_UNKNOWN_FRAMETYPE, "Unexpected first frame on new stream. The unidirectional stream was not recognized as a control stream or a push stream");
                        }
                    } catch(error) {
                        // Do nothing if there was not enough data to decode the StreamType
                        if (error instanceof RangeError) {
                            VerboseLogging.info("Not enough data buffered to decode StreamType. Waiting until more data arrives.");
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
                // quicStream.getConnection().sendPackets(); // we force trigger sending here because it's not yet done anywhere else. FIXME: THIS SHOULDN'T BE NEEDED!
            });
        }
    }
    
    /**
     * Handles http requests
     * @param quicStream The stream on which to send a response
     * @param bufferedData a buffer containing a full HTTP/3 message
     * An Http/3 request is derived from this buffer and will be passed to user functions for the path specified in the request
     */
    private handleRequest(quicStream: QuicStream, bufferedData: Buffer) {
        const connectionID: string = quicStream.getConnection().getSrcConnectionID().toString();
        const state: ClientState | undefined = this.connectionStates.get(connectionID);
        const logger: QlogWrapper = quicStream.getConnection().getQlogger();
        
        if (state === undefined) {
            throw new Http3Error(Http3ErrorCode.HTTP3_UNTRACKED_CONNECTION, "Handling request for on the server for an untracked connection (no state found for this connection).\nConnectionID: <" + connectionID + ">\nStreamID <" + quicStream.getStreamId().toDecimalString() + ">");
        }
        const frameParser: Http3FrameParser = state.getFrameParser();
        const encoder: Http3QPackEncoder = state.getQPackEncoder();
        const decoder: Http3QPackDecoder = state.getQPackDecoder();
        
        let req: Http3Request = parseHttp3Message(bufferedData, quicStream.getStreamId(), frameParser, encoder);
        let res: Http3Response = new Http3Response([], quicStream.getStreamId(), encoder, decoder);
        const requestPath: string | undefined = req.getHeaderValue(":path");
        const method: string | undefined = req.getHeaderValue(":method");
        
        if (requestPath !== undefined && method !== undefined && method === "GET") {
            quicStream.getConnection().getQlogger().onHTTPGet(requestPath, "RX");
        }
        
        if (requestPath === undefined || method === undefined) {
            quicStream.end();
        } else {
            let methodHandled: boolean = false;
            // TODO implement other methods
            switch(method) {
                case "GET":
                    if (this.handledGetPaths[requestPath] !== undefined) {
                        // Call user function to fill response
                        this.handledGetPaths[requestPath](req, res);
                        methodHandled = true;
                    }
                    break;
                default:
                    break;
            }

            if (methodHandled) {
                // Respond and close stream
                VerboseLogging.debug("Handling HTTP/3 Request");
                quicStream.end(res.toBuffer());
            }
            else {
                // Close stream
                VerboseLogging.warn("Received HTTP/3 request with method " + method + ". This method is currently not handled.");
                quicStream.end();
            }   
        }
    }

    private async closeConnection(connectionID: string) {
        const state: ClientState | undefined = this.connectionStates.get(connectionID);
        
        if (state === undefined) {
            throw new Http3Error(Http3ErrorCode.HTTP3_UNTRACKED_CONNECTION, "Tried closing connection of an untracked connection on the server (no state found for this connection).\nConnectionID: <" + connectionID + ">");
        }
        
        state.getQPackEncoder().close();
        state.getQPackDecoder().close();
        const sendingControlStream: Http3SendingControlStream = state.getSendingControlStream();
        const receivingControlStream: Http3ReceivingControlStream | undefined = state.getReceivingControlStream();
        const lastUsedStreamID: Bignum = state.getLastUsedStreamID();
        
        sendingControlStream.close(lastUsedStreamID); // Lets client know what the streamID is of the last stream that might be handled
        if (receivingControlStream !== undefined) {
            receivingControlStream.close();
        }
        
        this.connectionStates.delete(connectionID);
    }

    private async onQuicServerError(error: Error) {
        VerboseLogging.error("main:onError : " + error.message + " -- " + JSON.stringify(error) );
        console.log(error.stack);
    }
}
