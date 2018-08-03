import { Connection, ConnectionEvent } from "../../quicker/connection";
import { StreamEvent, Stream } from "../../quicker/stream";
import { Bignum } from "../../types/bignum";
import { EndpointType } from "../../types/endpoint.type";
import { HandshakeState, TLSMessageType, TLSKeyType } from "../../crypto/qtls";
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

    private currentClientKeyLevel: TLSKeyType;
    private currentServerKeyLevel: TLSKeyType;

    public constructor(connection: Connection) {
        this.connection = connection;
        this.handshakeEmitted = false;
        this.currentClientKeyLevel = TLSKeyType.NONE;
        this.currentServerKeyLevel = TLSKeyType.NONE;

        this.connection.getQuicTLS().setTLSMessageCallback( (messagetype:TLSMessageType, message:Buffer) => { this.OnNewTLSMessage(messagetype, message); } );
        this.connection.getQuicTLS().setTLSKeyCallback( (keytype, secret, key, iv) => {this.OnNewTLSKey(keytype, secret, key, iv); } )
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
 
        this.handshakeEmitted = false;

        this.connection.getQuicTLS().getClientInitial(); // REFACTOR TODO: pass quicTLS in as parameter instead of full connection?
    }

    private OnNewTLSMessage(type:TLSMessageType, message: Buffer){
		console.log("HandshakeHandler: OnNewTLSMessage", TLSMessageType[type]);
        this.stream.addData(message);

        if( this.connection.getEndpointType() == EndpointType.Client ){
            if( this.currentClientKeyLevel == TLSKeyType.NONE )
                console.log("\tMessage would be in INITIAL packet (ClientHello)");
            else if( this.currentClientKeyLevel == TLSKeyType.SSL_KEY_CLIENT_EARLY_TRAFFIC )
                console.log("\tMessage would be in Protected0RTT packet (early data)");
            else if( this.currentClientKeyLevel == TLSKeyType.SSL_KEY_CLIENT_HANDSHAKE_TRAFFIC )
                console.log("\tMessage would be in HANDSHAKE packet (Finished)");
            else if( this.currentClientKeyLevel == TLSKeyType.SSL_KEY_CLIENT_APPLICATION_TRAFFIC )
                console.log("\tMessage would be in Protected1RTT packet (normal data)");
            else
                console.log("\tERROR: unknown TLSKeyType!", TLSKeyType[this.currentClientKeyLevel]);
        }
        else{
            if( this.currentServerKeyLevel == TLSKeyType.NONE )
                console.log("\tMessage would be in INITIAL packet (ServerHello)");
            else if( this.currentServerKeyLevel == TLSKeyType.SSL_KEY_SERVER_HANDSHAKE_TRAFFIC)
                console.log("\tMessage would be in HANDSHAKE packet (EE, CERT, CERTVER, Finished)");
            else if( this.currentServerKeyLevel == TLSKeyType.SSL_KEY_SERVER_APPLICATION_TRAFFIC)
                console.log("\tMessage would be in Protected1RTT packet (NewSessionTicket, normal data)");
            else
                console.log("\tERROR: unknown TLSKeyType!", TLSKeyType[this.currentClientKeyLevel]);
        }
    }

    private OnNewTLSKey(type:TLSKeyType, key:Buffer, secret:Buffer, iv:Buffer ){
        console.log("HandshakeHandler: OnNewTLSKey", TLSKeyType[type]);
        if( TLSKeyType[type].indexOf("CLIENT") >= 0 )
            this.currentClientKeyLevel = type;
        else
            this.currentServerKeyLevel = type;
    }

    public handle(data: Buffer) {

        // TODO: we should support address validation (server sends token, client echos, server accepts token etc.)
        // https://tools.ietf.org/html/draft-ietf-quic-transport#section-6.6

        this.connection.getQuicTLS().processReceivedCryptoData(data); 
         
        if (    !this.handshakeEmitted &&
                this.connection.getQuicTLS().getHandshakeState() === HandshakeState.CLIENT_COMPLETED && 
                this.connection.getEndpointType() === EndpointType.Client ) {

            this.handshakeEmitted = true;
            this.emit(HandshakeHandlerEvents.ClientHandshakeDone);
        }
    }
}
