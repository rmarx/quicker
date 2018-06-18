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

        // first step in handshake process from client to server is get TLS ClientHello information
        // see https://tools.ietf.org/html/draft-ietf-quic-tls#section-4.2.1
        var clientInitial = this.connection.getQuicTLS().getClientInitial(true); // REFACTOR TODO: pass quicTLS in as parameter instead of full connection?
        this.stream.addData(clientInitial); // put it on the stream for sending (taken out in Flow control)
    }

    /**
     * Complex flow
     *  Client -> Server
     *  -> ClientHello 
	    <- ServerHello
	    -> Finished
        <- SessionTicket 
     * For everything after ClientHello, this function is called
     * If something isn't expected (e.g., SessionTicket), the corresponding call to openSSL is just a no-op
     * REFACTOR TODO: PicoTLS sends ServerHello and SessionTicket at the same time, we cannot deal with that at this time 
     */
    public handle(data: Buffer) {
        // called first at the server (in response to the client's ClientInitial packet), then on the client (in response to the server's Handshake packet)
        this.connection.getQuicTLS().writeHandshake(data); // put handshake data in a buffer for decoding by TLS

        if (this.connection.getEndpointType() === EndpointType.Server) {
            this.connection.getQuicTLS().readEarlyData(); // doesn't really read it (is in separate 0-RTT packet), just needs to be done to set the correct encryption keys in SSL context
            
            // TODO: we should support address validation (server sends token, client echos, server accepts token etc.)
            // https://tools.ietf.org/html/draft-ietf-quic-transport#section-6.6
        }

        var readData = this.connection.getQuicTLS().readHandshake(); //read the decoded handshake data from TLS : ServerHello + SessionTickets at server, Finished at client
        if (readData !== undefined && readData.byteLength > 0) {
            this.stream.addData(readData); // put it on the stream for further processing (taken out in Flow control)
        }

        if (this.connection.getQuicTLS().getHandshakeState() === HandshakeState.CLIENT_COMPLETED && this.connection.getEndpointType() === EndpointType.Client && !this.handshakeEmitted) {
            this.handshakeEmitted = true;
            this.connection.emit(ConnectionEvent.HANDSHAKE_DONE);
        }

        // To process NewSessionTicket
        this.connection.getQuicTLS().readSSL(); // needed for NewSessionTicket : this triggers openSSL to read it, which emits an event to us
    }
}