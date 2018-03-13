import { Connection, ConnectionEvent } from "../types/connection";
import { StreamEvent, Stream } from "../types/stream";
import { Bignum } from "../types/bignum";
import { EndpointType } from "../types/endpoint.type";
import { HandshakeState } from "../crypto/qtls";



export class HandshakeHandler {

    private connection: Connection;
    private stream!: Stream;

    public constructor(connection: Connection) {
        this.connection = connection;
    }

    public setHandshakeStream(stream: Stream) {
        this.stream = stream;
        this.stream.on(StreamEvent.DATA, (data: Buffer) => {
            this.handle(data);
        });
    }

    public handle(data: Buffer) {
        this.connection.getQuicTLS().writeHandshake(data);
        if (this.connection.getEndpointType() === EndpointType.Server) {
            this.connection.getQuicTLS().readEarlyData();
        }
        var data = this.connection.getQuicTLS().readHandshake();
        if (data.byteLength > 0) {
            this.stream.addData(data);
        } else if (this.connection.getQuicTLS().getHandshakeState() === HandshakeState.CLIENT_COMPLETED && this.connection.getEndpointType() === EndpointType.Client) {
            // To process NewSessionTicket
            this.connection.getQuicTLS().readSSL();
            this.connection.emit(ConnectionEvent.HANDSHAKE_DONE);
        }
    }
}