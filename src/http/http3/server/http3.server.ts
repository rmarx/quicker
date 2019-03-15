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

export class Http3Server {
    private readonly quicServer: QuicServer;
    private handledGetPaths: { [path: string]: (req: Http3Request, res: Http3Response) => Promise<void>; } = {};

    // Map conn_ids to connections and their control streams
    // TODO Reconsider if this is necessary
    private connections: Map<string, Connection> = new Map<string, Connection>();
    private controlStreams: Map<string, QuicStream> = new Map<string, QuicStream>();

    public constructor(keyFilepath?: string, certFilepath?: string) {
        this.onNewConnection = this.onNewConnection.bind(this);
        this.onNewStream = this.onNewStream.bind(this);
        this.handleRequest = this.handleRequest.bind(this);
        if (keyFilepath === undefined || certFilepath === undefined) {
            this.quicServer = QuicServer.createServer({});
        } else {
            let options: {} = {
                key: readFileSync(keyFilepath),
                cert: readFileSync(certFilepath),
            };
            this.quicServer = QuicServer.createServer(options);
        }
    }

    public listen(port: number, host: string = '127.0.0.1') {
        this.quicServer.listen(port, host);
        this.quicServer.on(QuickerEvent.CONNECTION_CREATED, this.onNewConnection);
        this.quicServer.on(QuickerEvent.ERROR, this.onQuicServerError);
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

    // Add post/put/delete

    private async onNewConnection(connection: Connection) {
        // Create control stream to client on connect
        //const controlStream: QuicStream = this.quicServer.createStream(connection, StreamType.ServerUni);
        //this.controlStreams.set(connection.getDestConnectionID().toString(), controlStream);
        this.connections.set(connection.getDestConnectionID().toString(), connection);

        this.quicServer.on(QuickerEvent.NEW_STREAM, this.onNewStream);
        this.quicServer.on(QuickerEvent.CONNECTION_CLOSE, this.closeConnection);
        
        VerboseLogging.info("DEBUG: A new HTTP/3 client has connected!");
    }

    private async onNewStream(quicStream: QuicStream) {
        // TODO HTTP request data should be handled from the moment enough has been received, not just on stream end
        
        var bufferedData: Buffer = Buffer.alloc(0);

        quicStream.on(QuickerEvent.STREAM_DATA_AVAILABLE, (data: Buffer) => {
            bufferedData = Buffer.concat([bufferedData, data]);
        });

        quicStream.on(QuickerEvent.STREAM_END, () => {
            // TODO: Handle data
            this.handleRequest(quicStream, bufferedData);
            quicStream.getConnection().sendPackets(); // we force trigger sending here because it's not yet done anywhere else. FIXME: THIS SHOULDN'T BE NEEDED!
        });
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
            quicStream.end(res.toBuffer());
        } else {
            quicStream.end();
        }
    }

    private async closeConnection(connection: Connection) {
        // TODO: Terminate http connection
        this.connections.delete(connection.getDestConnectionID().toString());
    }

    private async onQuicServerError(error: Error) {
        VerboseLogging.error("main:onError : " + error.message + " -- " + JSON.stringify(error) );
        console.log(error.stack);
    }
}
