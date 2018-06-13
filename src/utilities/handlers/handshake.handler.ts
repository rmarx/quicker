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

    // this should be called first before startHandshake 
    // this should be done on stream 0 
    // https://tools.ietf.org/html/draft-ietf-quic-transport#section-4.4.1
    public setHandshakeStream(stream: Stream) {
        this.stream = stream;
        // all other streams are handled through QuicStream
        // this is stream 0 though, only in use for these exact messages, and so we can intercept these directly and handle them ourselves
        this.stream.on(StreamEvent.DATA, (data: Buffer) => {
            this.handle(data);
        });
    }

    public startHandshake(): void {
        if (this.connection.getEndpointType() === EndpointType.Server) {
            throw new QuicError(ConnectionErrorCodes.INTERNAL_ERROR, "HandshakeHandler:startHandshake: We are server, cannot start handshake");
        }
        if ( !this.stream ) {
            throw new QuicError(ConnectionErrorCodes.INTERNAL_ERROR, "HandshakeHandler:startHandshake: Handshake stream not set, has to be done externally!");
        }
        // TEST TODO: what if handshakeEmitted is true here? 
        this.handshakeEmitted = false;

        var clientInitial = this.connection.getQuicTLS().getClientInitial(true); // REFACTOR TODO: pass quicTLS in as parameter instead of full connection?
        this.stream.addData(clientInitial);
    }

    public handle(data: Buffer) {
        // VERIFY TODO: called first at the server (in response to the client's ClientInitial packet), then on the client (in response to the server's Handshake packet)
        this.connection.getQuicTLS().writeHandshake(data); // VERIFY TODO: put handshake data in a buffer for decoding by TLS?
        if (this.connection.getEndpointType() === EndpointType.Server) {
            this.connection.getQuicTLS().readEarlyData();
        }
        var readData = this.connection.getQuicTLS().readHandshake(); // VERIFY TODO: read the decoded handshake data from TLS 
        if (readData !== undefined && readData.byteLength > 0) {
            this.stream.addData(readData); // put it on the stream for further processing
        }

        if (this.connection.getQuicTLS().getHandshakeState() === HandshakeState.CLIENT_COMPLETED && this.connection.getEndpointType() === EndpointType.Client && !this.handshakeEmitted) {
            this.handshakeEmitted = true;
            this.connection.emit(ConnectionEvent.HANDSHAKE_DONE);
        }
        //this.connection.sendPackets();
        // To process NewSessionTicket
        // VERIFY TODO: why is this needed? clear some leftover buffers? 
        this.connection.getQuicTLS().readSSL();
    }
}