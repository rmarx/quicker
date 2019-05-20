

import { HandshakeValidation } from '../utilities/validation/handshake.validation';
import { Bignum } from '../types/bignum';
import { Constants } from '../utilities/constants';
import { Connection } from '../quicker/connection';
import { TransportParameters, TransportParameterId } from './transport.parameters';
import { QuicTLS } from "qtls_wrap";
import { Cipher } from './cipher';
import { EventEmitter } from 'events';
import { QuicError } from '../utilities/errors/connection.error';
import { TlsErrorCodes } from '../utilities/errors/quic.codes';
import { EndpointType } from '../types/endpoint.type';
import { VerboseLogging } from '../utilities/logging/verbose.logging';

enum NodeQTLSEvent {
    HANDSHAKE_DONE = "handshakedone",
    ERROR = "error",
    NEW_SESSION = "newsession",
    NEW_KEY = "onnewkey",
	NEW_TLS_MESSAGE = "onnewtlsmessage"
}

export enum TLSMessageType {
    // see openssl/include/openssl/ssl3.h
    SSL3_MT_HELLO_REQUEST = 0,
    SSL3_MT_CLIENT_HELLO = 1,
    SSL3_MT_SERVER_HELLO = 2,
    SSL3_MT_NEWSESSION_TICKET = 4,
    SSL3_MT_END_OF_EARLY_DATA = 5,
    SSL3_MT_ENCRYPTED_EXTENSIONS = 8,
    SSL3_MT_CERTIFICATE = 11,
    SSL3_MT_SERVER_KEY_EXCHANGE = 12,
    SSL3_MT_CERTIFICATE_REQUEST = 13,
    SSL3_MT_SERVER_DONE = 14,
    SSL3_MT_CERTIFICATE_VERIFY = 15,
    SSL3_MT_CLIENT_KEY_EXCHANGE = 16,
    SSL3_MT_FINISHED = 20,
    SSL3_MT_CERTIFICATE_URL = 21,
    SSL3_MT_CERTIFICATE_STATUS = 22,
    SSL3_MT_SUPPLEMENTAL_DATA = 23,
    SSL3_MT_KEY_UPDATE = 24,
    SSL3_MT_NEXT_PROTO = 67,
    SSL3_MT_MESSAGE_HASH = 254 
}

export enum TLSKeyType{
    // see openssl/include/openssl/ssl.h (draft-13 version by Tatsuhiro)
    SSL_KEY_CLIENT_EARLY_TRAFFIC = 0,
    SSL_KEY_CLIENT_HANDSHAKE_TRAFFIC = 1,
    SSL_KEY_CLIENT_APPLICATION_TRAFFIC = 2,
    SSL_KEY_SERVER_HANDSHAKE_TRAFFIC = 3,
    SSL_KEY_SERVER_APPLICATION_TRAFFIC = 4,
    
    NONE = 666
}

/**
 * QuicTLS Wrapper
 */
export class QTLS extends EventEmitter{
    private handshakeState: HandshakeState;
    private qtlsHelper!: QuicTLS;
    private isServer: boolean;
    private options: any;
    private transportParameters!: TransportParameters;

    private cipher!: Cipher;
    private connection: Connection;

    private TLSMessageCallback?:(type: TLSMessageType, message: Buffer) => void;
    private TLSKeyCallback?:(keytype: TLSKeyType, secret: Buffer/*, key: Buffer, iv: Buffer*/) => void;

    public constructor(isServer: boolean, options: any = {}, connection: Connection) {
        super();
        this.isServer = isServer;
        this.options = options === undefined ? {} : options;
        this.connection = connection;
        if (this.isServer) {
            this.handshakeState = HandshakeState.SERVER_HELLO;
        } else {
            this.handshakeState = HandshakeState.CLIENT_HELLO;
        }
    }

    public init() {
        if (this.options.alpnProtocol === undefined) {
            this.options.alpnProtocols = Constants.ALPN_LABELS;
        }
        if (this.options.transportparameters !== undefined) {
            this.emit(QuicTLSEvents.REMOTE_TRANSPORTPARAM_AVAILABLE, TransportParameters.fromBuffer(this.isServer, this.options.transportparameters));
            this.emit(QuicTLSEvents.LOCAL_TRANSPORTPARAM_AVAILABLE, TransportParameters.getDefaultTransportParameters(this.isServer));
        }
        // for the client, we create this in getClientInitial, see comments there 
        if (this.isServer) {
            this.qtlsHelper = this.createQtlsHelper();
        }
    }

    private createQtlsHelper(): QuicTLS {
        this.options.logLevel = VerboseLogging.getLogLevel();
        this.options.logger = VerboseLogging.getInternalLogger();

        var qtlsHelper = new QuicTLS(this.isServer, this.options);
        qtlsHelper.on(NodeQTLSEvent.HANDSHAKE_DONE, () => {
            this.handleHandshakeDone();
        });
        qtlsHelper.on(NodeQTLSEvent.ERROR, (error: Error) => {
            throw new QuicError(TlsErrorCodes.TLS_HANDSHAKE_FAILED, error.message);
        });
        qtlsHelper.on(NodeQTLSEvent.NEW_SESSION, () => {
            this.handleNewSession();
        });
        qtlsHelper.on(NodeQTLSEvent.NEW_KEY, (keytype: number, secret: Buffer, secretLength: number, key: Buffer, keyLength: number, iv: Buffer, ivLength: number, arg: number) => {
            this.handleNewKey(keytype, secret, secretLength, key, keyLength, iv, ivLength, arg);
        });
        qtlsHelper.on(NodeQTLSEvent.NEW_TLS_MESSAGE, (message: Buffer, length: number) => {
            this.handleNewTLSMessage(message, length);
        });
        return qtlsHelper;
    }

    public getExtensionData(): Buffer {
        return this.qtlsHelper.getTransportParameters();
    }

    public getClientInitial(): Buffer {
        
        // in the case of Version Negotiation (server sends us allowed versions after our initial packet), we are forced to create a new TLS context
        // since the old one cannot be re-used. getClientInitial() is called when starting the handshake, which is done in connection.start() which is re-called after connection.reset() in response to a Version Negotation. This is why we cannot simply do this in the init() method like for the server 
        this.qtlsHelper = this.createQtlsHelper();
        this.setLocalTransportParameters();

        if (this.isEarlyDataAllowed()) {
            // OpenSSL requires we write some early data first if we want to use it, but cannot write the real early data yet (QUIC uses 0-RTT packet logic), 
            // so write an empty string for now, this triggers the necessary internal state changes 
            // "When called by a client, SSL_write_early_data() must be the first IO function called on a new connection" 
            //  => https://www.openssl.org/docs/man1.1.1/man3/SSL_write_early_data.html 
            // REFACTOR TODO: if this is just an anomaly of OpenSSL, move it to the C++ side?
            this.qtlsHelper.writeEarlyData(Buffer.from(""));
        }

        // this will call SSL_do_handshake internally, which generates the ClientHello message (containing the LocalTransportParameters)
        var clientInitialBuffer = this.qtlsHelper.getClientInitial();
        return clientInitialBuffer;
    }

    public readHandshake(): Buffer {
        var handshakeBuffer = this.qtlsHelper.readHandshakeData();

        if (this.isEarlyDataAllowed() && this.isSessionReused()) {
            this.emit(QuicTLSEvents.EARLY_DATA_ALLOWED);
        }

        var extensionData = this.getExtensionData();
        if (extensionData.byteLength > 0) {
            var transportParameters: TransportParameters = HandshakeValidation.validateExtensionData(this.isServer, extensionData);
            this.emit(QuicTLSEvents.REMOTE_TRANSPORTPARAM_AVAILABLE, transportParameters);
        }
        return handshakeBuffer;
    }

    public readEarlyData(): Buffer {
        return this.qtlsHelper.readEarlyData();
    }

    public processReceivedCryptoData(receivedData: Buffer): void {
        if (this.handshakeState !== HandshakeState.COMPLETED) {
            if(this.handshakeState !== HandshakeState.CLIENT_COMPLETED){
                this.handshakeState = HandshakeState.HANDSHAKE;
                if (this.isServer) {
                    this.setLocalTransportParameters();
                }
            }
        }
        
        // this writes and processes the data, leading to TLSMessageCallback and TLSKeyCallback to be called
        this.qtlsHelper.writeHandshakeData(receivedData); 


        if (this.isEarlyDataAllowed() && this.isSessionReused()) {
            this.emit(QuicTLSEvents.EARLY_DATA_ALLOWED);
        }

        var extensionData = this.getExtensionData();
        if (extensionData.byteLength > 0) {
            var transportParameters: TransportParameters = HandshakeValidation.validateExtensionData(this.isServer, extensionData);
            this.emit(QuicTLSEvents.REMOTE_TRANSPORTPARAM_AVAILABLE, transportParameters);
        }
    }

    public getHandshakeState(): HandshakeState {
        return this.handshakeState;
    }

    public exportKeyingMaterial(label: string): Buffer {
        return this.qtlsHelper.exportKeyingMaterial(Buffer.from(label), this.cipher.getHashLength());
    }

    public exportEarlyKeyingMaterial(label: string): Buffer {
        return this.qtlsHelper.exportEarlyKeyingMaterial(Buffer.from(label), this.cipher.getHashLength());
    }

    public getCipher(): Cipher {
        if (this.cipher === undefined) {
            this.cipher = new Cipher(this.qtlsHelper.getNegotiatedCipher());
        }
        return this.cipher;
    }

    public getSession(): Buffer {
        return this.qtlsHelper.getSession();
    }

    public getNegotiatedALPN():string {
        return this.qtlsHelper.getNegotiatedALPN().toString();
    }

    public readSSL(): Buffer {
        return this.qtlsHelper.readSSL();
    }

    public setSession(buffer: Buffer): void {
        this.qtlsHelper.setSession(buffer);
    }

    public isSessionReused(): boolean {
        return this.qtlsHelper.isSessionReused();
    }

    public isEarlyDataAllowed(): boolean {
        return this.qtlsHelper.isEarlyDataAllowed();
    }

    private handleHandshakeDone(): void {
        // this function is called multiple times, both on server and client:
        // client: after ClientFinished is generated, after reception of each NewSessionTicket
        // server: after reception of ClientFinished, after creation of each NewSessionTicket
        // Get 1-RTT Negotiated Cipher
        this.cipher = new Cipher(this.qtlsHelper.getNegotiatedCipher());

        // the alpn string will be plain text, e.g., just == "h3-20"
        VerboseLogging.info("qtls:handleHandshakeDone : negotiated ALPN is " + this.qtlsHelper.getNegotiatedALPN().toString() + " // " + (this.qtlsHelper.getNegotiatedALPN().toString() === "h3-20"));

        if (this.handshakeState >= HandshakeState.CLIENT_COMPLETED) {
            return;
        }
        // Set handshake state
        if (this.isServer) {
            this.handshakeState = HandshakeState.SERVER_COMPLETED;
        } else {
            this.handshakeState = HandshakeState.CLIENT_COMPLETED;
        }

        this.emit(QuicTLSEvents.HANDSHAKE_DONE);
    }

    private handleNewSession(): void {
        this.handshakeState = HandshakeState.COMPLETED;
    }

    private handleNewKey(keytype: number, secret: Buffer, secretLength: number, key: Buffer, keyLength: number, iv: Buffer, ivLength: number, arg: number):void {

        //console.log( secret.length + " == " + secretLength + " // " + key.length + " == " + keyLength + " // " + iv.length + " == " + ivLength );
        //console.log("QTLS: handleNewKey:", TLSMessageType[keytype], secret, secretLength, key, keyLength, iv, ivLength, arg );
        if( this.TLSKeyCallback )
            this.TLSKeyCallback( keytype, secret);//, key, iv);
    }

    public setTLSKeyCallback(cb:(keytype: TLSKeyType, secret: Buffer/*, key: Buffer, iv: Buffer*/) => void){
		this.TLSKeyCallback = cb;
    }

    private handleNewTLSMessage(message: Buffer, length: number){

        //console.log("QTLS: handleNewTLSMessage:", length, message[0], TLSMessageType[message[0]], message);
        
        // first byte of the TLS message indicates its type
        if( this.TLSMessageCallback )
			this.TLSMessageCallback(message[0], message);
	}

    public setTLSMessageCallback(cb:(type: TLSMessageType, message: Buffer) => void){
		this.TLSMessageCallback = cb;
    }

    private setLocalTransportParameters() {
        this.transportParameters = TransportParameters.getDefaultTransportParameters(this.isServer);
        /*
        var version = this.connection.getVersion();
        if (this.connection.getEndpointType() === EndpointType.Client) {
            version = this.connection.getInitialVersion();
        }
        */
        var transportParams = this.transportParameters.toExtensionDataBuffer(this.handshakeState);
        this.qtlsHelper.setTransportParameters(transportParams);
        this.emit(QuicTLSEvents.LOCAL_TRANSPORTPARAM_AVAILABLE, this.transportParameters);
    }
}

export enum HandshakeState {
    CLIENT_HELLO,
    SERVER_HELLO,
    HANDSHAKE,
    CLIENT_COMPLETED,
    SERVER_COMPLETED,
    COMPLETED
};

export enum QuicTLSEvents {
    EARLY_DATA_ALLOWED = "qtls-early-data-allowed",
    REMOTE_TRANSPORTPARAM_AVAILABLE = "qtls-remote-transportparam-available",
    LOCAL_TRANSPORTPARAM_AVAILABLE = "qtls-local-transportparam-available",
    HANDSHAKE_DONE = "qtls-handshake-done"
}
