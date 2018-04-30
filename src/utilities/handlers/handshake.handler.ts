import { Connection, ConnectionEvent } from "../../quicker/connection";
import { StreamEvent, Stream } from "../../quicker/stream";
import { Bignum } from "../../types/bignum";
import { EndpointType } from "../../types/endpoint.type";
import { HandshakeState } from "../../crypto/qtls";
import { QuicError } from "../errors/connection.error";
import { ConnectionErrorCodes, TlsErrorCodes } from "../errors/quic.codes";


/**
 * TODO: deal better with handshake data in the correct packets
 */
export class HandshakeHandler {

    private connection: Connection;
    private stream!: Stream;
    private handshakeEmitted: boolean;

    public constructor(connection: Connection) {
        this.connection = connection;
        this.handshakeEmitted = false;
    }

    public startHandshake(): void {
        if (this.connection.getEndpointType() === EndpointType.Server) {
            throw new QuicError(ConnectionErrorCodes.INTERNAL_ERROR);
        }
        var clientInitial = this.connection.getQuicTLS().getClientInitial(true);
        this.handshakeEmitted = false;
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
        var readData = this.connection.getQuicTLS().readHandshake();
        if (readData !== undefined && readData.byteLength > 0) {
            this.stream.addData(readData);
        }
        if (this.connection.getQuicTLS().getHandshakeState() === HandshakeState.CLIENT_COMPLETED && this.connection.getEndpointType() === EndpointType.Client && !this.handshakeEmitted) {
            this.handshakeEmitted = true;
            this.connection.emit(ConnectionEvent.HANDSHAKE_DONE);
        }
        //this.connection.sendPackets();
        // To process NewSessionTicket
        this.connection.getQuicTLS().readSSL();
    }
}