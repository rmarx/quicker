import { Connection, ConnectionEvent } from "../../quicker/connection";
import { StreamEvent, Stream } from "../../quicker/stream";
import { Bignum } from "../../types/bignum";
import { EndpointType } from "../../types/endpoint.type";
import { HandshakeState } from "../../crypto/qtls";
import { QuicError } from "../errors/connection.error";
import { ConnectionErrorCodes, TlsErrorCodes } from "../errors/quic.codes";



export class HandshakeHandler {

    private connection: Connection;
    private stream!: Stream;

    public constructor(connection: Connection) {
        this.connection = connection;
    }

    public startHandshake(): void {
        if (this.connection.getEndpointType() === EndpointType.Server) {
            throw new QuicError(ConnectionErrorCodes.INTERNAL_ERROR);
        }
        var clientInitial = this.connection.getQuicTLS().getClientInitial(true);
        this.stream.addData(clientInitial);
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
        if (data === undefined) {
            // TODO: Find TLS error better (add callback in node)
            throw new QuicError(TlsErrorCodes.TLS_HANDSHAKE_FAILED);
        }
        if (data.byteLength > 0) {
            this.stream.addData(data);
        } else if (this.connection.getQuicTLS().getHandshakeState() === HandshakeState.CLIENT_COMPLETED && this.connection.getEndpointType() === EndpointType.Client) {
            // To process NewSessionTicket
            this.connection.getQuicTLS().readSSL();
            this.connection.emit(ConnectionEvent.HANDSHAKE_DONE);
        }
    }
}