import { Http3Response } from "../common/http3.response";
import { Http3Request } from "../common/http3.request";
import { Server as QuicServer } from "../../../quicker/server";
import { QuickerEvent } from "../../../quicker/quicker.event";
import { Connection } from "../../../quicker/connection";
import { QuicStream } from "../../../quicker/quic.stream";
import { VerboseLogging } from "../../../utilities/logging/verbose.logging";
import { readFileSync } from "fs";
import { parseHttp3Message } from "../common/parsers/http3.message.parser";
import { StreamType } from "../../../quicker/stream";
import { Http3UniStreamType } from "../common/frames/streamtypes/http3.unistreamtypeframe";
import { Http3ReceivingControlStream, Http3EndpointType, Http3ControlStreamEvent } from "../common/http3.receivingcontrolstream";
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
import { Http3DependencyTree } from "../common/prioritization/http3.deptree";
import { Http3BaseFrame, Http3FrameType } from "../common/frames/http3.baseframe";
import { Http3PriorityFrame, Http3SettingsFrame } from "../common/frames";
import { Http3PriorityScheme, Http3DynamicFifoScheme, Http3FIFOScheme, Http3RoundRobinScheme, Http3WeightedRoundRobinScheme, Http3ParallelPlusScheme, Http3SerialPlusScheme, Http3FirefoxScheme, Http3ClientSidedScheme, Http3PMeenanScheme, Http3PmeenanHtmlScheme, Http3SpeedyRRScheme } from "../common/prioritization/schemes/index"
import { Http3Setting } from "../common/frames/http3.settingsframe";
import { Http3RequestMetadata } from "../client/http3.requestmetadata";
import { Constants } from "../../../utilities/constants";
import { HttpHelper } from "../../http0.9/http.helper";
import { QuicError } from "../../../utilities/errors/connection.error";
import { ConnectionErrorCodes } from "../../../utilities/errors/quic.codes";

class ClientState {
    private logger: QlogWrapper;
    private prioritiser: Http3PriorityScheme;
    private scheduleTimer: NodeJS.Timer;
    private sendingControlStream: Http3SendingControlStream;
    private receivingControlStream?: Http3ReceivingControlStream;
    private lastUsedStreamID: Bignum;
    private qpackEncoder: Http3QPackEncoder;
    private qpackDecoder: Http3QPackDecoder;
    private frameParser: Http3FrameParser;

    public constructor(logger: QlogWrapper, sendingControlStream: Http3SendingControlStream, lastUsedStreamID: Bignum, qpackEncoder: Http3QPackEncoder, qpackDecoder: Http3QPackDecoder, frameParser: Http3FrameParser, receivingControlStream?: Http3ReceivingControlStream, scheme: string = "client") {
        // TODO make scheme easily swappable without changing actual server code
        this.logger = logger;
        this.prioritiser = this.stringToScheme(scheme, logger);
        this.sendingControlStream = sendingControlStream;
        this.receivingControlStream = receivingControlStream;
        this.lastUsedStreamID = lastUsedStreamID;
        this.qpackEncoder = qpackEncoder;
        this.qpackDecoder = qpackDecoder;
        this.frameParser = frameParser;

        // Sets up the tree according to the scheme's requirements
        // E.g. moving or setting weights of placeholders
        // Returns frames which are not needed for server-sided prioritization
        this.prioritiser.initialSetup();

        // Schedule 1 chunk of 1000 bytes every 30ms
        // TODO tweak numbers
        // TODO Listen to congestion control events instead
        this.scheduleTimer = setInterval(() => {
            this.prioritiser.schedule();
        }, 10);
    }

    public getLogger(): QlogWrapper {
        return this.logger;
    }

    public getPrioritiser(): Http3PriorityScheme {
        return this.prioritiser;
    }

    public stopScheduler() {
        clearInterval(this.scheduleTimer);
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

    private stringToScheme(schemename: string, logger?: QlogWrapper): Http3PriorityScheme {
        switch(schemename) {
            case "rr":
                return new Http3RoundRobinScheme(logger);
            case "wrr":
                return new Http3WeightedRoundRobinScheme(logger);
            case "fifo":
                return new Http3FIFOScheme(logger);
            case "dfifo":
                return new Http3DynamicFifoScheme(logger);
            case "firefox":
                return new Http3FirefoxScheme(logger);
            case "p+":
                return new Http3ParallelPlusScheme(logger);
            case "s+":
                return new Http3SerialPlusScheme(logger);
            case "pmeenan":
                return new Http3PMeenanScheme(logger);
            case "pmeenanhtml":
                return new Http3PmeenanHtmlScheme(logger);
            case "spdyrr":
                return new Http3SpeedyRRScheme(logger);
            case "client":
                return new Http3ClientSidedScheme(logger);
            default:
                // TODO create appropriate error type
                throw new Error("HTTP/3 scheme type unknown. Type give: " + schemename);
        }
    }
}

export class ClientState09{
    private logger: QlogWrapper;
    private helper: HttpHelper;

    public constructor(logger: QlogWrapper) {
        this.logger = logger;
        this.helper = new HttpHelper();
    }

    public getLogger(): QlogWrapper {
        return this.logger;
    }

    public getHttpHelper(): HttpHelper{
        return this.helper;
    }
}

export class Http3Server {
    private readonly quickerServer: QuicServer;
    private prioritizationSchemeName?: string;

    // GET Paths that have a user function mapped to them
    private handledGetPaths: { [path: string]: (req: Http3Request, res: Http3Response) => Promise<void>; } = {};
    // private staticDirs: string[] = [];

    private connectionStates: Map<string, ClientState|ClientState09> = new Map<string, ClientState|ClientState09>();

    private resourceList?: {[path: string]: Http3RequestMetadata};

    // Separate from connectionState as they are kept for 0RTT connections
    // private connectionSettings: Map<string, Http3Setting[]> = new Map<string, Http3Setting[]>();
    // Tracks for each connection if the 
    // private areSettingsSet: Map<string, boolean> = new Map<string, boolean>();

    public constructor(keyFilepath?: string, certFilepath?: string, prioritizationSchemeName?: string, resourceList?: {[path: string]: Http3RequestMetadata}) {
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
        this.prioritizationSchemeName = prioritizationSchemeName;
        this.resourceList = resourceList;

        this.quickerServer.on(QuickerEvent.NEW_STREAM, this.onNewStream);
        this.quickerServer.on(QuickerEvent.CONNECTION_CLOSE, this.closeConnection);
    }

    public listen(port: number, host: string = '127.0.0.1') {
        this.quickerServer.listen(port, host);
        // Note: CONNECTION_CREATED is done immediately after receivign the first INITIAL packet
        // however, at that time, we don't know the ALPN yet...
        // so to support http3 and 0.9 at the same time, we only create the connection when we receive the first request stream
        // TODO: FIXME: can probably change the behaviour once we only support h3 (or if we have a decent callback that only fires after ALPN is available....)
        //this.quickerServer.on(QuickerEvent.CONNECTION_CREATED, this.onNewConnection);
        this.quickerServer.on(QuickerEvent.ERROR, this.onQuicServerError);
    }

    // Expose files in static dir
    // TODO check to make sure its a local dir
    public static(staticDir: string) {
        // if (existsSync(staticDir) === true && statSync(staticDir).isDirectory() === true) {
        //     this.staticDirs.push(staticDir);
        // }
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

        // even though this is an HTTP3 server, we still want to support clients that talk HTTP 0.9 (for QUIC interop testing)
        let ALPN = connection.getALPN();
        if( ALPN && Constants.ALPN_VALID_HTTP3.indexOf(ALPN) >= 0 ){
            // Create control stream to client on connect
            const controlQuicStream: QuicStream = this.quickerServer.createStream(connection, StreamType.ServerUni);
            const controlHttp3Stream: Http3SendingControlStream = new Http3SendingControlStream(EndpointType.Server, controlQuicStream, connection.getQlogger());
            connection.getQlogger().onHTTPStreamStateChanged(controlQuicStream.getStreamId(), Http3StreamState.LOCALLY_OPENED, "CONTROL");

            // QPack streams
            const qpackEncoderStream: QuicStream = this.quickerServer.createStream(connection, StreamType.ServerUni);
            const qpackEncoder: Http3QPackEncoder = new Http3QPackEncoder(qpackEncoderStream, true, connection.getQlogger());
            connection.getQlogger().onHTTPStreamStateChanged(qpackEncoderStream.getStreamId(), Http3StreamState.LOCALLY_OPENED, "QPACK_ENCODE");
            const qpackDecoderStream: QuicStream = this.quickerServer.createStream(connection, StreamType.ServerUni);
            const qpackDecoder: Http3QPackDecoder = new Http3QPackDecoder(qpackDecoderStream, connection.getQlogger());
            connection.getQlogger().onHTTPStreamStateChanged(qpackDecoderStream.getStreamId(), Http3StreamState.LOCALLY_OPENED, "QPACK_DECODE");

            this.connectionStates.set(connection.getSrcConnectionID().toString(), new ClientState(
                connection.getQlogger(),
                controlHttp3Stream,
                controlQuicStream.getStreamId(),
                qpackEncoder,
                qpackDecoder,
                new Http3FrameParser(qpackEncoder, qpackDecoder, connection.getQlogger()),
                undefined,
                this.prioritizationSchemeName,
            ));

            let clientState: ClientState | ClientState09 | undefined = this.connectionStates.get(connection.getSrcConnectionID().toString());
            if (clientState !== undefined) {
                clientState = clientState as ClientState;
                // Send SETTINGS frame to communicate that the server supports up to 8 placeholders (number of PH used by serialplus)
                clientState.getSendingControlStream().sendFrame(new Http3SettingsFrame([{
                    identifier: new Bignum(0x9),
                    value: new Bignum(8),
                }]));
            } else {
                throw new Error("Client state could not succesfully be created or added to the clientstate map!");
            }

            VerboseLogging.info("DEBUG: A new HTTP/3 client has connected!");
        }
        else if(ALPN && Constants.ALPN_VALID_HTTP09.indexOf(ALPN) >= 0 ){

            this.connectionStates.set(connection.getSrcConnectionID().toString(), new ClientState09(
                connection.getQlogger()
            ));


            VerboseLogging.info("@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@");
            VerboseLogging.info("@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@");
            VerboseLogging.info("@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@");
            VerboseLogging.info("@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@");
            VerboseLogging.info("DEBUG: A new HTTP/0.9 client has connected!");
            VerboseLogging.info("@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@");
            VerboseLogging.info("@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@");
            VerboseLogging.info("@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@");
            VerboseLogging.info("@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@");
        }    
        else{
            // invalid ALPN: shutting down
            VerboseLogging.error("Received an unsupported ALPN, shutting down... "  + ALPN);
            this.quickerServer.closeConnection(connection, new QuicError(ConnectionErrorCodes.INTERNAL_ERROR, "Unsupported ALPN " + ALPN + ". Use one of " + Constants.ALPN_LABELS.join(",")) );
        }
    }

    private setupControlStreamEvents(controlStream: Http3ReceivingControlStream) {
        // TODO Hook up all events and handle them
        const connectionID: string = controlStream.getStream().getConnection().getSrcConnectionID().toString();
        const logger: QlogWrapper = controlStream.getStream().getConnection().getQlogger();
        let state: ClientState | ClientState09 | undefined = this.connectionStates.get(connectionID);

        if (state === undefined) {
            throw new Http3Error(Http3ErrorCode.HTTP3_UNTRACKED_CONNECTION, "Received a new stream on the server from an untracked connection (no state found for this connection).\nConnectionID: <" + connectionID + ">\nStreamID <" + controlStream.getStreamID().toDecimalString() + ">");
        }

        let h3State = state as ClientState;

        controlStream.on(Http3ControlStreamEvent.HTTP3_PRIORITY_FRAME, (frame: Http3PriorityFrame) => {
            logger.onHTTPFrame_Priority(frame, "RX");
            h3State.getPrioritiser().handlePriorityFrame(frame, controlStream.getStreamID());
            VerboseLogging.info("HTTP/3: priority frame received on client-sided control stream. ControlStreamID: " + controlStream.getStreamID().toDecimalString());
        });
    }

    private onNewStream(quicStream: QuicStream) {
        const connectionID: string = quicStream.getConnection().getSrcConnectionID().toString();
        let clientState: ClientState | ClientState09 | undefined = this.connectionStates.get(connectionID);
        const logger: QlogWrapper = quicStream.getConnection().getQlogger();

        if (clientState === undefined) {
            this.onNewConnection(quicStream.getConnection());
            clientState = this.connectionStates.get(connectionID);

            if(clientState === undefined) {
                throw new Http3Error(Http3ErrorCode.HTTP3_UNTRACKED_CONNECTION, "Received a new stream on the server from an untracked connection (no state found for this connection).\nConnectionID: <" + connectionID + ">\nStreamID <" + quicStream.getStreamId().toDecimalString() + ">");
            }
        }

        if( clientState instanceof ClientState ){

            const state = clientState as ClientState;
            state.setLastUsedStreamID(quicStream.getStreamId());

            // Check what type of stream it is:
            //  Bidi -> Request stream
            //  Uni -> Control or push stream based on first frame

            // TODO HTTP request data should be handled from the moment enough has been received, not just on stream end
            if (quicStream.isBidiStream()) {
                // Handle as a request stream
                let bufferedData: Buffer = Buffer.alloc(0);
                let bufferedFrames: Http3BaseFrame[] = [];

                state.getPrioritiser().addStream(quicStream);

                quicStream.on(QuickerEvent.STREAM_DATA_AVAILABLE, (data: Buffer) => {
                    bufferedData = Buffer.concat([bufferedData, data]);
                    const [frames, offset]: [Http3BaseFrame[], number] = state.getFrameParser().parse(bufferedData, quicStream.getStreamId());
                    // TODO priority frame should only be used if no other priority frames have arrived on the control stream for this request stream
                    if (frames.length > 0 && frames[0].getFrameType() === Http3FrameType.PRIORITY) {
                        state.getPrioritiser().handlePriorityFrame(frames[0] as Http3PriorityFrame, quicStream.getStreamId());
                        quicStream.getConnection().getQlogger().onHTTPFrame_Priority(frames[0] as Http3PriorityFrame, "RX");
                        frames.splice(0, 1);
                    }
                    bufferedFrames = bufferedFrames.concat(frames);
                    bufferedData = bufferedData.slice(offset);
                });

                quicStream.on(QuickerEvent.STREAM_END, () => {
                    this.handleRequest(quicStream, bufferedFrames);
                    quicStream.removeAllListeners();
                });
            } else if (quicStream.isUniStream()) {
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
                                streamType = Http3UniStreamType.CONTROL;
                                const controlStream: Http3ReceivingControlStream = new Http3ReceivingControlStream(quicStream, Http3EndpointType.SERVER, state.getFrameParser(), logger, bufferedData);
                                this.setupControlStreamEvents(controlStream);
                                state.setReceivingControlStream(controlStream);
                            } else if (streamTypeBignum.equals(Http3UniStreamType.PUSH)) {
                                streamType = Http3UniStreamType.PUSH;
                                // Server shouldn't receive push streams
                                quicStream.end();
                                quicStream.getConnection().sendPackets(); // we force trigger sending here because it's not yet done anywhere else. FIXME: This should be moved into stream prioritization scheduler later
                                throw new Http3Error(Http3ErrorCode.HTTP_WRONG_STREAM_DIRECTION, "A push stream was initialized towards the server. This is not allowed");
                            } else if (streamTypeBignum.equals(Http3UniStreamType.ENCODER)) {
                                streamType = Http3UniStreamType.ENCODER;
                                state.getQPackDecoder().setPeerEncoderStream(quicStream, bufferedData);
                                logger.onHTTPStreamStateChanged(quicStream.getStreamId(), Http3StreamState.REMOTELY_OPENED, "QPACK_ENCODE");
                            } else if (streamTypeBignum.equals(Http3UniStreamType.DECODER)) {
                                streamType = Http3UniStreamType.DECODER;
                                state.getQPackEncoder().setPeerDecoderStream(quicStream, bufferedData);
                                logger.onHTTPStreamStateChanged(quicStream.getStreamId(), Http3StreamState.REMOTELY_OPENED, "QPACK_DECODE");
                            } else {
                                quicStream.end();
                                quicStream.getConnection().sendPackets(); // we force trigger sending here because it's not yet done anywhere else. FIXME: This should be moved into stream prioritization scheduler later
                                throw new Http3Error(Http3ErrorCode.HTTP3_UNKNOWN_FRAMETYPE, "Unexpected first frame on new stream. The unidirectional stream was not recognized as a control, push, encoder or decoder stream. Stream Type: " + streamType + ", StreamID: " + quicStream.getStreamId().toDecimalString());
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
                    quicStream.getConnection().sendPackets(); // we force trigger sending here because it's not yet done anywhere else. FIXME: This should be moved into stream prioritization scheduler later
                    if (streamType === undefined) {
                        throw new Http3Error(Http3ErrorCode.HTTP3_UNEXPECTED_STREAM_END, "New HTTP/3 stream ended before streamtype could be decoded");
                    }
                    quicStream.removeAllListeners();
                });
            } else {
                throw new Http3Error(Http3ErrorCode.HTTP3_UNKNOWN_STREAMTYPE, "Stream is neither unidirectional nor bidirectional. This should not be possible!");
            }
        }
        else{ 
            // HTTP 0.9
            const state = clientState as ClientState09;
            let bufferedData: Buffer = Buffer.alloc(0);
        
            quicStream.on(QuickerEvent.STREAM_DATA_AVAILABLE, (data: Buffer) => {
                bufferedData = Buffer.concat([bufferedData, data]);
            });
        
            quicStream.on(QuickerEvent.STREAM_END, () => {
                var output = state.getHttpHelper().handleRequest(bufferedData);
                quicStream.end(output);
                quicStream.getConnection().sendPackets(); // we force trigger sending here because it's not yet done anywhere else. FIXME: THIS SHOULDN'T BE NEEDED!
            });
        }
    }

    /**
     * Handles http requests
     * @param quicStream The stream on which to send a response
     * @param bufferedFrames a buffer containing a full HTTP/3 message
     * An Http/3 request is derived from this buffer and will be passed to user functions for the path specified in the request
     */
    private handleRequest(quicStream: QuicStream, bufferedFrames: Http3BaseFrame[]) {
        const connectionID: string = quicStream.getConnection().getSrcConnectionID().toString();
        let state: ClientState | ClientState09 | undefined = this.connectionStates.get(connectionID);
        const logger: QlogWrapper = quicStream.getConnection().getQlogger();

        if (state === undefined) {
            throw new Http3Error(Http3ErrorCode.HTTP3_UNTRACKED_CONNECTION, "Handling request for on the server for an untracked connection (no state found for this connection).\nConnectionID: <" + connectionID + ">\nStreamID <" + quicStream.getStreamId().toDecimalString() + ">");
        }

        state = state as ClientState;

        const encoder: Http3QPackEncoder = state.getQPackEncoder();
        const decoder: Http3QPackDecoder = state.getQPackDecoder();

        let req: Http3Request = parseHttp3Message(bufferedFrames).toRequest(quicStream.getStreamId(), encoder);
        let res: Http3Response = new Http3Response([], quicStream.getStreamId(), encoder, decoder);
        const requestPath: string | undefined = req.getHeaderValue(":path");
        const method: string | undefined = req.getHeaderValue(":method");

        if (requestPath !== undefined && method !== undefined && method === "GET") {
            logger.onHTTPGet(requestPath, quicStream.getStreamId(), "RX");
        }

        if (requestPath === undefined || method === undefined) {
            VerboseLogging.info("Received HTTP/3 request with no path and/or method");
            state.getPrioritiser().finishStream(quicStream.getStreamId());
        } else {
            let methodHandled: boolean = false;
            // TODO implement other methods
            switch(method) {
                case "GET":
                    methodHandled = true;
                    if (this.handledGetPaths[requestPath] !== undefined) {
                        // Call user function to fill response
                        this.handledGetPaths[requestPath](req, res);
                        VerboseLogging.info("Request was handled by the server. Responding to HTTP/3 Request.");
                    } else {
                        VerboseLogging.info("Requested path '" + requestPath + "' has no specific handler. Trying to respond with requested file...");
                        res.sendFile(requestPath);
                    }
                    break;
                default:
                    break;
            }

            if (methodHandled) {
                // Respond and close stream
                const metadata: Http3RequestMetadata = this.resourceList === undefined ? {mimeType: res.getMimeType(requestPath)} : this.resourceList[requestPath];
                state.getPrioritiser().applyScheme(quicStream.getStreamId(), metadata);
                state.getPrioritiser().addData(quicStream.getStreamId(), res.toBuffer());
                state.getPrioritiser().finishStream(quicStream.getStreamId());
            }
            else {
                // Close stream
                VerboseLogging.warn("Received HTTP/3 request with method " + method + ". This method is currently not handled.");
                state.getPrioritiser().finishStream(quicStream.getStreamId());
            }
        }
    }

    private closeConnection(connectionID: string) {
        VerboseLogging.info("Closing HTTP/3 connection with id <" + connectionID + ">");
        let state: ClientState | ClientState09 | undefined = this.connectionStates.get(connectionID);

        if (state === undefined) {
            // throw new Http3Error : TODO: atm, we can get the closeConnection callback multiple times. Once this is properly fixed, makes this a throw again
            VerboseLogging.error("Tried closing connection of an untracked connection on the server (no state found for this connection).\nConnectionID: <" + connectionID + ">");
            return;
        }

        if( state instanceof ClientState ){
            state.stopScheduler(); // Immediately stops pushing new data over connection
            VerboseLogging.info("Stopping server scheduler...");
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
        else if( state instanceof ClientState09 ){
            this.connectionStates.delete(connectionID);
        }
    }

    private onQuicServerError(error: Error) {
        VerboseLogging.error("main:onError : " + error.message + " -- " + JSON.stringify(error));
        console.error(error.stack);
    }
}
