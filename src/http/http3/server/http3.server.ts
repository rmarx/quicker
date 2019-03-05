import { Http3Response } from "../common/http3.response";
import { Http3Request } from "../common/http3.request";
import { Server as QuicServer } from "../../../quicker/server";
import { QuickerEvent } from "../../../quicker/quicker.event";
import { Connection } from "../../../quicker/connection";
import { QuicStream } from "../../../quicker/quic.stream";
import { VerboseLogging } from "../../../utilities/logging/verbose.logging";
import { StreamType } from "../../../quicker/stream";

export class Http3Server {
    private readonly quicServer: QuicServer;

    // Map conn_ids to connections
    // TODO Reconsider if this is necessary
    private connections: Map<string, Connection> = new Map<string, Connection>();

    public constructor(keyFilepath?: string, certFilepath?: string) {
        let options: {} = {
            key: keyFilepath,
            cert: certFilepath,
        };
        this.quicServer = QuicServer.createServer(options);
    }

    public listen(port: number, host: string = 'localhost') {
        this.quicServer.listen(port, host);
        this.quicServer.on(QuickerEvent.CONNECTION_CREATED, this.acceptConnection);
        this.quicServer.on(QuickerEvent.ERROR, this.quicServerError);
    }

    public static(staticDir: string) {
        // Expose files in static dir
    }

    public get(path: string, callback: (req: Http3Request, res: Http3Response) => Promise<void>) {
        // Add to a list of subscriped paths to look out for and refer that path to given callback function
    }

    // Add post/put/delete

    private async acceptConnection(connection: Connection) {
        // Create control stream to client on connect
        this.quicServer.createStream(connection, StreamType.ServerUni);

        this.connections.set(connection.getDestConnectionID().toString(), connection);
        connection.on(QuickerEvent.NEW_STREAM, this.newStream);
        connection.on(QuickerEvent.CONNECTION_CLOSE, this.closeConnection);
    }

    private async newStream(quicStream: QuicStream) {
        var bufferedData: Buffer = Buffer.alloc(0);

        quicStream.on(QuickerEvent.STREAM_DATA_AVAILABLE, (data: Buffer) => {
            bufferedData = Buffer.concat([bufferedData, data]);
        });

        quicStream.on(QuickerEvent.STREAM_END, () => {
            // TODO: Handle data
            quicStream.end(/* Send any last data if needed */);
            quicStream.getConnection().sendPackets(); // we force trigger sending here because it's not yet done anywhere else. FIXME: THIS SHOULDN'T BE NEEDED!
        });
    }

    private async closeConnection(connection: Connection) {
        // TODO: Terminate http connection
        this.connections.delete(connection.getDestConnectionID().toString());
    }

    private async quicServerError(error: Error) {
        VerboseLogging.error("main:onError : " + error.message + " -- " + JSON.stringify(error) );
        console.log(error.stack);
    }
}
