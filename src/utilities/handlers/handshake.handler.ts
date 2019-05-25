import { Connection, ConnectionEvent } from "../../quicker/connection";
import { Bignum } from "../../types/bignum";
import { EndpointType } from "../../types/endpoint.type";
import { QTLS, HandshakeState, TLSMessageType, TLSKeyType } from "../../crypto/qtls";
import { EncryptionLevel } from "../../crypto/crypto.context";
import { CryptoStream, CryptoStreamEvent } from "../../crypto/crypto.stream";
import { QuicError } from "../errors/connection.error";
import { ConnectionErrorCodes, TlsErrorCodes } from "../errors/quic.codes";
import { EventEmitter } from "events";
import { VerboseLogging } from "../logging/verbose.logging";
import { AEAD } from '../../crypto/aead';
import { SecurityEventTrigger } from "@quictools/qlog-schema/draft-16/QLog";



export enum HandshakeHandlerEvents {
    ClientHandshakeDone = "client-handshake-done",
    NewDecryptionKeyAvailable = "new-encryption-key-available"
}

export class HandshakeHandler extends EventEmitter{

    private qtls: QTLS;
    private aead: AEAD;
    private isServer: boolean
    private streams: Map<string, CryptoStream>; // TypeSCript Map can't properly deal with Enum keys, so use strings...
    private currentSendingCryptoStream!:CryptoStream; // latest active crypto stream for which we've received keys (so we know what to send new TLSMessages on)

    private handshakeEmitted: boolean;

    public constructor(qtls: QTLS, aead: AEAD, isServer: boolean) {
        super();

        this.qtls = qtls;
        this.aead = aead;
        this.isServer = isServer;
        this.streams = new Map<string, CryptoStream>();

        this.handshakeEmitted = false;

        this.qtls.setTLSMessageCallback( (messagetype:TLSMessageType, message:Buffer) => { this.OnNewTLSMessage(messagetype, message); } );
        this.qtls.setTLSKeyCallback( (keytype, secret/*, key, iv*/) => {this.OnNewTLSKey(keytype, secret/*, key, iv*/); } );
    }

    // this should be called first before startHandshake!
    // should be called with 4 different streams, 1 for each in EncryptionLevel
    public registerCryptoStream(stream: CryptoStream) {

        if( this.streams.has("" + stream.getCryptoLevel()) ){
            VerboseLogging.error("HandshakeHandler:registerCryptoStream : attempting to register an already registered cryptoLevel! " + EncryptionLevel[stream.getCryptoLevel()] );
            return; // TODO: bubble this up? 
        }

        this.streams.set( "" + stream.getCryptoLevel(), stream );
        if( stream.getCryptoLevel() == EncryptionLevel.INITIAL )
            this.currentSendingCryptoStream = stream;

        // listen for received CRYPTO data 
        stream.on(CryptoStreamEvent.DATA, (data: Buffer) => {
            this.handle(data); 
        });
    }

    public startHandshake(): void {

        if (this.isServer) {
            throw new QuicError(ConnectionErrorCodes.INTERNAL_ERROR, "HandshakeHandler:startHandshake: We are server, cannot start handshake");
        }
        if ( this.streams.size == 0 ) {
            throw new QuicError(ConnectionErrorCodes.INTERNAL_ERROR, "HandshakeHandler:startHandshake: CryptoStreams not set, has to be done externally!");
        }
 
        this.handshakeEmitted = false;

        this.qtls.getClientInitial(); // this will trigger callback calls to OnNewTLSMessage and OnNewTLSKey
    }

    private debugLogMap:Map<string, EncryptionLevel> = new Map<string, EncryptionLevel>();
    private debugLogTLSMessage(type:TLSMessageType, actualLevel:EncryptionLevel){
        if( this.debugLogMap.size == 0 ){
            // MessageType -> expected encryption level for that type 
            this.debugLogMap.set( "" + TLSMessageType.SSL3_MT_CLIENT_HELLO,         EncryptionLevel.INITIAL );
            this.debugLogMap.set( "" + TLSMessageType.SSL3_MT_SERVER_HELLO,         EncryptionLevel.INITIAL );

            this.debugLogMap.set( "" + TLSMessageType.SSL3_MT_END_OF_EARLY_DATA,    EncryptionLevel.ZERO_RTT );

            this.debugLogMap.set( "" + TLSMessageType.SSL3_MT_ENCRYPTED_EXTENSIONS, EncryptionLevel.HANDSHAKE );
            this.debugLogMap.set( "" + TLSMessageType.SSL3_MT_CERTIFICATE,          EncryptionLevel.HANDSHAKE );
            this.debugLogMap.set( "" + TLSMessageType.SSL3_MT_CERTIFICATE_REQUEST,  EncryptionLevel.HANDSHAKE );
            this.debugLogMap.set( "" + TLSMessageType.SSL3_MT_CERTIFICATE_STATUS,   EncryptionLevel.HANDSHAKE );
            this.debugLogMap.set( "" + TLSMessageType.SSL3_MT_CERTIFICATE_URL,      EncryptionLevel.HANDSHAKE );
            this.debugLogMap.set( "" + TLSMessageType.SSL3_MT_CERTIFICATE_VERIFY,   EncryptionLevel.HANDSHAKE );
            this.debugLogMap.set( "" + TLSMessageType.SSL3_MT_FINISHED,             EncryptionLevel.HANDSHAKE );
            
            this.debugLogMap.set( "" + TLSMessageType.SSL3_MT_NEWSESSION_TICKET,    EncryptionLevel.ONE_RTT );
        }

        let expectedLevel:EncryptionLevel|undefined = this.debugLogMap.get( "" + type );
        if( expectedLevel === undefined ){
            VerboseLogging.error("HandshakeHandler:debugLogTLSMessage : TLSMessageType was unknown! " + TLSMessageType[type] + " // " + type );
        }
        else{
            if( expectedLevel != actualLevel ){
                VerboseLogging.error("HandshakeHandler:debugLogTLSMessage : unexpected EncryptionLevel : " + TLSMessageType[type] + " expects " + EncryptionLevel[expectedLevel] + " but we have " + EncryptionLevel[actualLevel] );
            }
            else{
                VerboseLogging.debug("HandshakeHandler:debugLogTLSMessage : TLS Message " + TLSMessageType[type] + " will be sent at correct encryption level " + EncryptionLevel[actualLevel] );
            }
        }
    }

    private OnNewTLSMessage(type:TLSMessageType, message: Buffer){
        this.currentSendingCryptoStream.addData(message);

        this.debugLogTLSMessage( type, this.currentSendingCryptoStream.getCryptoLevel() );
    }

    private OnNewTLSKey(type:TLSKeyType, secret:Buffer/*, key:Buffer, iv:Buffer*/ ){

        let previousLevel:EncryptionLevel = this.currentSendingCryptoStream.getCryptoLevel();

        // note: EncryptionLevel.INITIAL is the original currentSendingCryptoStream, set in registerCryptoStream
        if( this.isServer ){
            switch(type){
                case TLSKeyType.SSL_KEY_SERVER_HANDSHAKE_TRAFFIC:
                    this.currentSendingCryptoStream = this.streams.get( "" + EncryptionLevel.HANDSHAKE ) as CryptoStream;
                    this.aead.setProtectedHandshakeSecrets( EndpointType.Server, secret );
                    break;
                case TLSKeyType.SSL_KEY_SERVER_APPLICATION_TRAFFIC:
                    this.currentSendingCryptoStream = this.streams.get( "" + EncryptionLevel.ONE_RTT ) as CryptoStream;
                    this.aead.setProtected1RTTSecrets( EndpointType.Server, secret );
                    break;

                case TLSKeyType.SSL_KEY_CLIENT_EARLY_TRAFFIC:
                    this.aead.setProtected0TTSecrets( EndpointType.Client, secret );
                    this.emit( HandshakeHandlerEvents.NewDecryptionKeyAvailable, EncryptionLevel.ZERO_RTT );
                    break;
                case TLSKeyType.SSL_KEY_CLIENT_HANDSHAKE_TRAFFIC:
                    this.aead.setProtectedHandshakeSecrets( EndpointType.Client, secret );
                    this.emit( HandshakeHandlerEvents.NewDecryptionKeyAvailable, EncryptionLevel.HANDSHAKE );
                    break;
                case TLSKeyType.SSL_KEY_CLIENT_APPLICATION_TRAFFIC:
                    this.aead.setProtected1RTTSecrets( EndpointType.Client, secret );
                    this.emit( HandshakeHandlerEvents.NewDecryptionKeyAvailable, EncryptionLevel.ONE_RTT );
                    break;
            }
        }
        else{ // this.isClient
            switch(type){
                case TLSKeyType.SSL_KEY_CLIENT_EARLY_TRAFFIC:
                    this.currentSendingCryptoStream = this.streams.get( "" + EncryptionLevel.ZERO_RTT ) as CryptoStream;
                    this.aead.setProtected0TTSecrets( EndpointType.Client, secret );
                    break;
                case TLSKeyType.SSL_KEY_CLIENT_HANDSHAKE_TRAFFIC:
                    this.currentSendingCryptoStream = this.streams.get( "" + EncryptionLevel.HANDSHAKE ) as CryptoStream;
                    this.aead.setProtectedHandshakeSecrets( EndpointType.Client, secret );
                    break;
                case TLSKeyType.SSL_KEY_CLIENT_APPLICATION_TRAFFIC:
                    this.currentSendingCryptoStream = this.streams.get( "" + EncryptionLevel.ONE_RTT ) as CryptoStream;
                    this.aead.setProtected1RTTSecrets( EndpointType.Client, secret );
                    break;
                
                case TLSKeyType.SSL_KEY_SERVER_HANDSHAKE_TRAFFIC:
                    this.aead.setProtectedHandshakeSecrets( EndpointType.Server, secret );
                    this.emit( HandshakeHandlerEvents.NewDecryptionKeyAvailable, EncryptionLevel.HANDSHAKE );
                    break;
                case TLSKeyType.SSL_KEY_SERVER_APPLICATION_TRAFFIC:
                    this.aead.setProtected1RTTSecrets( EndpointType.Server, secret );
                    this.emit( HandshakeHandlerEvents.NewDecryptionKeyAvailable, EncryptionLevel.ONE_RTT );
                    break;
            }
        }

        if( this.currentSendingCryptoStream === undefined ){
            VerboseLogging.error("HandshakeHandler:OnNewTLSKey : no cryptoStream found for " + TLSKeyType[type] ); 
            throw new QuicError(ConnectionErrorCodes.INTERNAL_ERROR, "HandshakeHandler:OnNewTLSKey : no cryptoStream found for " + TLSKeyType[type]);
        }
        else{
            if( (this.isServer  && ("" + TLSKeyType[type]).indexOf("SERVER") >= 0) ||
                (!this.isServer && ("" + TLSKeyType[type]).indexOf("CLIENT") >= 0) ){
                VerboseLogging.info("HandshakeHandler: OnNewTLSKey : " + TLSKeyType[type] + " changed sending/encryption level from " + EncryptionLevel[previousLevel] + " to " + EncryptionLevel[this.currentSendingCryptoStream.getCryptoLevel()] );
            }
            else
                VerboseLogging.info("HandshakeHandler: OnNewTLSKey : got decryption key of the other side : " + TLSKeyType[type] );
        }
        
        //VerboseLogging.error("HandshakeHandler: OnNewTLSKey : actually set these keys on the encryption handlers!!!");
        //VerboseLogging.info("NewTLSKey: secret : " + secret.toString('hex'));
        //VerboseLogging.info("NewTLSKey: key    : " + key.toString('hex'));
        //VerboseLogging.info("NewTLSKey: iv     : " + iv.toString('hex'));
    }

    public handle(data: Buffer) {

        // TODO: we should support address validation (server sends token, client echos, server accepts token etc.)
        // https://tools.ietf.org/html/draft-ietf-quic-transport#section-6.6

        this.qtls.processReceivedCryptoData(data); 
         
        if (    !this.handshakeEmitted &&
                this.qtls.getHandshakeState() === HandshakeState.CLIENT_COMPLETED && 
                !this.isServer ) {

            this.handshakeEmitted = true;
            this.emit(HandshakeHandlerEvents.ClientHandshakeDone);
        }
    }
}
