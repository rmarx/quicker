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

export class Http3Server {
    private readonly quickerServer: QuicServer;
    private handledGetPaths: { [path: string]: (req: Http3Request, res: Http3Response) => Promise<void>; } = {};
    
    // Map conn_ids to connections and their control streams
    // TODO Reconsider if this is necessary
    private connections: Map<string, Connection> = new Map<string, Connection>();
    private sendingControlStreams: Map<string, Http3SendingControlStream> = new Map<string, Http3SendingControlStream>();
    private receivingControlStreams: Map<string, Http3ReceivingControlStream> = new Map<string, Http3ReceivingControlStream>();

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
        const controlHttp3Stream: Http3SendingControlStream = new Http3SendingControlStream(controlQuicStream);
        this.sendingControlStreams.set(connection.getDestConnectionID().toString(), controlHttp3Stream);
        this.connections.set(connection.getDestConnectionID().toString(), connection);

        this.quickerServer.on(QuickerEvent.NEW_STREAM, this.onNewStream);
        this.quickerServer.on(QuickerEvent.CONNECTION_CLOSE, this.closeConnection);
        
        VerboseLogging.info("DEBUG: A new HTTP/3 client has connected!");
    }
    
    private setupControlStreamEvents(controlStream: Http3ReceivingControlStream) {
        // TODO Hook up all events and handle them
        // controlStream.on()
    }
    
    private async onNewStream(quicStream: QuicStream) {
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
                        if (streamTypeBignum.equals(Http3UniStreamType.CONTROL)) {
                            const controlStream: Http3ReceivingControlStream = new Http3ReceivingControlStream(quicStream, Http3EndpointType.SERVER, bufferedData.slice(vlieOffset.offset));
                            this.setupControlStreamEvents(controlStream);
                            this.receivingControlStreams.set(quicStream.getConnection().getDestConnectionID().toString(), controlStream);
                        } else if (streamTypeBignum.equals(Http3UniStreamType.PUSH)) {
                            // Server shouldn't receive push streams
                            quicStream.end();
                            throw new Http3Error(Http3ErrorCode.HTTP_WRONG_STREAM_DIRECTION, "A push stream was initialized towards the server. This is not allowed");
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
                quicStream.getConnection().sendPackets(); // we force trigger sending here because it's not yet done anywhere else. FIXME: THIS SHOULDN'T BE NEEDED!
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
        let req: Http3Request = parseHttp3Message(bufferedData);
        let res: Http3Response = new Http3Response();
        const reqPath: string | undefined = req.getHeaderValue("path");
        // TODO log if request arrives for unhandled path?
        if (reqPath !== undefined && this.handledGetPaths[reqPath] !== undefined) {
            // Call user function to fill response
            this.handledGetPaths[reqPath](req, res);

            // Respond and close stream
            VerboseLogging.debug("Handling HTTP/3 Request");
            quicStream.end(res.toBuffer());
        } else {
            quicStream.end();
        }
    }

    private async closeConnection(conId: string) {
        // TODO: Terminate http connection
        this.connections.delete(conId);
        this.receivingControlStreams.delete(conId);
        this.sendingControlStreams.delete(conId);
    }

    private async onQuicServerError(error: Error) {
        VerboseLogging.error("main:onError : " + error.message + " -- " + JSON.stringify(error) );
        console.log(error.stack);
    }
}
