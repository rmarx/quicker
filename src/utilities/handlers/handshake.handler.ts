import { Connection, ConnectionEvent } from "../../quicker/connection";
import { StreamEvent, Stream } from "../../quicker/stream";
import { Bignum } from "../../types/bignum";
import { EndpointType } from "../../types/endpoint.type";
import { HandshakeState, QTLS } from "../../crypto/qtls";
import { QuicError } from "../errors/connection.error";
import { ConnectionErrorCodes, TlsErrorCodes } from "../errors/quic.codes";
import { EventEmitter } from "events";



export enum HandshakeHandlerEvents {
    ClientHandshakeDone = "client-handshake-done"
}

export class HandshakeHandler extends EventEmitter{

    private qtls: QTLS;
    private isServer: boolean
    private stream!: Stream;
    private handshakeEmitted: boolean;

    public constructor(qtls: QTLS, isServer: boolean) {
        super();
        this.qtls = qtls;
        this.isServer = isServer;
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
        if (this.isServer) {
            throw new QuicError(ConnectionErrorCodes.INTERNAL_ERROR, "HandshakeHandler:startHandshake: We are server, cannot start handshake");
        }
        if ( !this.stream ) {
            throw new QuicError(ConnectionErrorCodes.INTERNAL_ERROR, "HandshakeHandler:startHandshake: Handshake stream not set, has to be done externally!");
        }
        // TEST TODO: what if handshakeEmitted is true here? 
        this.handshakeEmitted = false;

        var clientInitial = this.qtls.getClientInitial(); 
        this.stream.addData(clientInitial);
    }

    public handle(data: Buffer) {
        // VERIFY TODO: called first at the server (in response to the client's ClientInitial packet), then on the client (in response to the server's Handshake packet)
        this.qtls.writeHandshake(data); // VERIFY TODO: put handshake data in a buffer for decoding by TLS?
        if (this.isServer) {
            this.qtls.readEarlyData();
            
            // TODO: we should support address validation (server sends token, client echos, server accepts token etc.)
            // https://tools.ietf.org/html/draft-ietf-quic-transport#section-6.6
        }
        var readData = this.qtls.readHandshake(); // VERIFY TODO: read the decoded handshake data from TLS 
        if (readData !== undefined && readData.byteLength > 0) {
            this.stream.addData(readData); // put it on the stream for further processing
        }

        if (this.qtls.getHandshakeState() === HandshakeState.CLIENT_COMPLETED && !this.isServer && !this.handshakeEmitted) {
            this.handshakeEmitted = true;
            this.emit(HandshakeHandlerEvents.ClientHandshakeDone);
        }
        // To process NewSessionTicket
        this.qtls.readSSL();
    }
}